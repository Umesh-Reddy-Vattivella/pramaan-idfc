/* ------------------------------------------------------------------
   Server-only Google Gemini client (extraction only — the model copies
   printed text; it never computes anything). Models are tried in order;
   429 / 5xx / 404 / empty answers move on to the next. Never import from
   client code: the key is a server secret (GEMINI_API_KEY).
   ------------------------------------------------------------------ */

/** Default: Gemini 4 Hydrogen (thinking model). Fallbacks are auto-updating Flash aliases. */
export const GEMINI_DEFAULT_MODEL = 'gemini-4-hydrogen';
export const GEMINI_CHAIN = [GEMINI_DEFAULT_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'];
/** Longest a single model attempt may run (thinking models need time on 20 search results). */
export const GEMINI_ATTEMPT_TIMEOUT_MS = 150_000;

export function geminiChain(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return preferred ? [preferred, ...GEMINI_CHAIN.filter((m) => m !== preferred)] : GEMINI_CHAIN;
}

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
  user: string,
  { json = false, deadline = Date.now() + 180_000, attemptTimeoutMs = GEMINI_ATTEMPT_TIMEOUT_MS, chain = geminiChain() }: { json?: boolean; deadline?: number; attemptTimeoutMs?: number; chain?: string[] } = {},
): Promise<{ model: string; text: string }> {
  const attempts: GeminiError['attempts'] = [];
  for (const model of chain) {
    const remaining = deadline - Date.now();
    if (remaining < 8000) {
      attempts.push({ model, status: 0, message: 'time budget exhausted' });
      break;
    }
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 32768, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }),
        signal: AbortSignal.timeout(Math.min(attemptTimeoutMs, remaining)),
      });
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
