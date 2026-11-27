/* ------------------------------------------------------------------
   Server-only Google Gemini client (extraction only — the model copies
   printed text; it never computes anything). Models are tried in order;
   429 / 5xx / 404 / empty answers move on to the next. Never import from
   client code: the key is a server secret (GEMINI_API_KEY).
   ------------------------------------------------------------------ */

/**
 * Default: Flash-Lite (lowest-cost tier — copying printed figures needs no reasoning); fallback: Flash.
 * Auto-updating aliases, so the chain does not break when Google retires a version. GEMINI_MODEL overrides.
 */
export const GEMINI_DEFAULT_MODEL = 'gemini-flash-lite-latest';
export const GEMINI_CHAIN = [GEMINI_DEFAULT_MODEL, 'gemini-flash-latest'];
/** Longest a single model attempt may run. */
export const GEMINI_ATTEMPT_TIMEOUT_MS = 40_000;
/** Output cap: extraction answers are short JSON. */
const MAX_OUTPUT_TOKENS = 8192;

/**
 * Reasoning switched off / to the minimum per model (billed "thinking" tokens buy nothing for copy-only
 * extraction). The parameter differs by model generation; if a model rejects it the call is retried without.
 */
const THINKING: Record<string, Record<string, unknown>> = {
  'gemini-flash-lite-latest': { thinkingLevel: 'minimal' },
  'gemini-flash-latest': { thinkingBudget: 0 },
};

export function geminiChain(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return preferred ? [preferred, ...GEMINI_CHAIN.filter((m) => m !== preferred)] : GEMINI_CHAIN;
}

/** A text part, or a file (image / PDF) sent inline as base64. */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export class GeminiError extends Error {
  constructor(message: string, public readonly attempts: { model: string; status: number; message: string }[]) {
    super(message);
  }
}

interface GeminiResponse {
  error?: { code?: number; message?: string };
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
}

/**
 * @param json ask for a JSON response (responseMimeType application/json).
 * @param deadline epoch ms after which no further model is tried (keeps the route under its serverless limit).
 */
export async function geminiChat(
  apiKey: string,
  system: string,
  user: string | GeminiPart[],
  { json = false, deadline = Date.now() + 60_000, attemptTimeoutMs = GEMINI_ATTEMPT_TIMEOUT_MS, chain = geminiChain() }: { json?: boolean; deadline?: number; attemptTimeoutMs?: number; chain?: string[] } = {},
): Promise<{ model: string; text: string }> {
  const attempts: GeminiError['attempts'] = [];
  const call = (model: string, thinking: Record<string, unknown> | undefined, remaining: number) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: typeof user === 'string' ? [{ text: user }] : user }],
        generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS, ...(json ? { responseMimeType: 'application/json' } : {}), ...(thinking ? { thinkingConfig: thinking } : {}) },
      }),
      signal: AbortSignal.timeout(Math.min(attemptTimeoutMs, remaining)),
    });

  for (const model of chain) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) {
      attempts.push({ model, status: 0, message: 'time budget exhausted' });
      break;
    }
    try {
      let res = await call(model, THINKING[model], remaining);
      // A model that does not accept the thinking setting answers 400: retry once without it.
      if (res.status === 400 && THINKING[model]) res = await call(model, undefined, deadline - Date.now());
      const j = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok || j.error) {
        attempts.push({ model, status: res.ok ? (j.error?.code ?? 500) : res.status, message: String(j.error?.message ?? res.statusText).slice(0, 160) });
        continue;
      }
      if (j.promptFeedback?.blockReason) {
        attempts.push({ model, status: 200, message: `blocked: ${j.promptFeedback.blockReason}` });
        continue;
      }
      const cand = j.candidates?.[0];
      const text = (cand?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
        .trim();
      if (!text) {
        attempts.push({ model, status: 200, message: `empty response${cand?.finishReason ? ` (${cand.finishReason})` : ''}` });
        continue;
      }
      return { model: j.modelVersion ?? model, text };
    } catch (err) {
      attempts.push({ model, status: 0, message: err instanceof Error ? err.message : 'network error' });
    }
  }
  throw new GeminiError(`Gemini extraction unavailable (${attempts.map((a) => `${a.model}: ${a.status || a.message}`).join(', ')})`, attempts);
}
