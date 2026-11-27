/* ------------------------------------------------------------------
   Server-only Gemini REST helper with model fallback.
   Models are tried in order; 429 (quota) / 503 (overloaded) / 404 (retired)
   move on to the next model. Never import from client components.
   ------------------------------------------------------------------ */

export const DEFAULT_MODEL_CHAIN = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];

export function modelChain(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return preferred ? [preferred, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== preferred)] : DEFAULT_MODEL_CHAIN;
}

export interface GeminiResult {
  model: string;
  text: string;
  groundingMetadata?: {
    webSearchQueries?: string[];
    groundingChunks?: { web?: { uri?: string; title?: string } }[];
  };
}

export class GeminiError extends Error {
  constructor(message: string, public readonly attempts: { model: string; status: number; message: string }[]) {
    super(message);
  }
}

const RETRYABLE = new Set([404, 429, 500, 503]);

export async function callGemini(apiKey: string, body: Record<string, unknown>, timeoutMs = 45000): Promise<GeminiResult> {
  const attempts: GeminiError['attempts'] = [];
  for (const model of modelChain()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: GeminiResult['groundingMetadata'] }[];
      };
      if (!res.ok) {
        attempts.push({ model, status: res.status, message: (json.error?.message ?? res.statusText).slice(0, 200) });
        if (RETRYABLE.has(res.status)) continue;
        break;
      }
      const cand = json.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) {
        attempts.push({ model, status: 200, message: 'empty response' });
        continue;
      }
      return { model, text, groundingMetadata: cand?.groundingMetadata };
    } catch (err) {
      attempts.push({ model, status: 0, message: err instanceof Error ? err.message : 'network error' });
    } finally {
      clearTimeout(timer);
    }
  }
  const quota = attempts.some((a) => a.status === 429);
  throw new GeminiError(
    quota
      ? 'Gemini quota exhausted for this API key (Search grounding usually requires billing to be enabled on the Google Cloud project).'
      : `Gemini unavailable (${attempts.map((a) => `${a.model}: ${a.status}`).join(', ')})`,
    attempts,
  );
}

/** Extracts the first JSON array/object from model text (tolerates ```json fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : text;
  const start = src.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in model output');
  const open = src[start];
  const close = open === '[' ? ']' : '}';
  const end = src.lastIndexOf(close);
  if (end <= start) throw new Error('Unterminated JSON in model output');
  return JSON.parse(src.slice(start, end + 1));
}
