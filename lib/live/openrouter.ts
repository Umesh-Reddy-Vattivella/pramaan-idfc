/* ------------------------------------------------------------------
   Server-only OpenRouter chat client for FREE models (extraction only).
   Free tier: ~50 free-model requests/day. Models are tried in order;
   429 / 5xx / 404 move on to the next. Never import from client code.
   ------------------------------------------------------------------ */

export const OPENROUTER_FREE_CHAIN = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
];

/** Free vision-language models (OCR of scanned documents / photos). */
export const OPENROUTER_FREE_VISION_CHAIN = [
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-31b-it:free',
  'inclusionai/ling-3.2-flash:free',
  'openrouter/free',
];

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export function openRouterChain(): string[] {
  const preferred = process.env.OPENROUTER_MODEL?.trim();
  return preferred ? [preferred, ...OPENROUTER_FREE_CHAIN.filter((m) => m !== preferred)] : OPENROUTER_FREE_CHAIN;
}

export class OpenRouterError extends Error {
  constructor(message: string, public readonly attempts: { model: string; status: number; message: string }[]) {
    super(message);
  }
}

/**
 * @param deadline epoch ms after which no further model is tried (keeps the route under the 60 s serverless limit).
 */
export async function openRouterChat(
  apiKey: string,
  system: string,
  user: string | ContentPart[],
  deadline = Date.now() + 35000,
  chain: string[] = openRouterChain(),
): Promise<{ model: string; text: string }> {
  const attempts: OpenRouterError['attempts'] = [];
  for (const model of chain) {
    const remaining = deadline - Date.now();
    if (remaining < 4000) {
      attempts.push({ model, status: 0, message: 'time budget exhausted' });
      break;
    }
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'PRAMAAN LAP valuation prototype',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 3000,
          // Reasoning models otherwise spend the whole token budget thinking and return empty content.
          reasoning: { enabled: false },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(Math.min(25000, remaining)),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number }; choices?: { message?: { content?: string } }[]; model?: string };
      if (!res.ok || j.error) {
        attempts.push({ model, status: res.ok ? (j.error?.code ?? 500) : res.status, message: String(j.error?.message ?? res.statusText).slice(0, 160) });
        continue;
      }
      const text = (j.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!text) {
        attempts.push({ model, status: 200, message: 'empty response' });
        continue;
      }
      return { model: j.model ?? model, text };
    } catch (err) {
      attempts.push({ model, status: 0, message: err instanceof Error ? err.message : 'network error' });
    }
  }
  throw new OpenRouterError(`Free extraction models unavailable (${attempts.map((a) => `${a.model.split('/').pop()}: ${a.status}`).join(', ')})`, attempts);
}
