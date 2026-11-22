/* ------------------------------------------------------------------
   Server-only Sarvam AI chat helper (Indian-language extraction).
   Model sarvam-105b with reasoning OFF: fast, and no tokens spent thinking.
   Reads SARVAM_API_KEY from the environment. Never import from client code.
   ------------------------------------------------------------------ */
import { SarvamAIClient } from 'sarvamai';

export const SARVAM_MODEL = process.env.SARVAM_MODEL?.trim() || 'sarvam-105b';

export function sarvamConfigured(): boolean {
  return !!process.env.SARVAM_API_KEY;
}

let client: SarvamAIClient | null = null;

const TERMINAL = new Set(['completed', 'partially_completed', 'failed', 'rejected']);

/**
 * Sarvam Vision OCR (Doc AI parse) for one page image — 22 Indian languages + English,
 * default Indic mode (also reads English). Returns the page text in reading order.
 */
export async function sarvamOcrImage(dataUrl: string, fileName: string, deadline = Date.now() + 25000): Promise<{ model: string; text: string }> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Sarvam OCR: invalid image data');
  client ??= new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });
  const file = new File([Buffer.from(m[2], 'base64')], fileName.replace(/\.[a-z0-9]+$/i, '') + (m[1] === 'image/png' ? '.png' : '.jpg'), { type: m[1] });
  const job = await client.docAi.parse({ file: [file], content_type: 'printed' }, { timeoutInSeconds: 15, maxRetries: 1 });
  let status = job.status;
  while (!TERMINAL.has(status)) {
    if (Date.now() > deadline) throw new Error('Sarvam OCR: timed out');
    await new Promise((r) => setTimeout(r, 700));
    status = (await client.docAi.getStatus(job.job_id)).status;
  }
  if (status === 'failed' || status === 'rejected') throw new Error(`Sarvam OCR job ${status}`);
  const res = (await client.docAi.getResults(job.job_id)) as unknown as {
    documents?: { pages?: { blocks?: { text?: string; reading_order?: number }[] }[] }[];
  };
  const text = (res.documents ?? [])
    .flatMap((d) => d.pages ?? [])
    .map((p) => [...(p.blocks ?? [])].sort((a, b) => (a.reading_order ?? 0) - (b.reading_order ?? 0)).map((b) => b.text ?? '').join('\n'))
    .join('\n\n')
    .trim();
  if (!text) throw new Error('Sarvam OCR returned no text');
  return { model: 'Sarvam Vision (Doc AI)', text };
}

export async function sarvamChat(system: string, user: string, deadline = Date.now() + 40000): Promise<{ model: string; text: string }> {
  const remaining = deadline - Date.now();
  if (remaining < 4000) throw new Error('Sarvam: time budget exhausted');
  client ??= new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });
  const res = await client.chat.completions(
    {
      model: SARVAM_MODEL as 'sarvam-105b',
      // The API disables reasoning with null (verified: 0 reasoning tokens); the SDK types omit null.
      reasoning_effort: null as unknown as undefined,
      temperature: 0,
      max_tokens: 4000, // Starter plan maximum is 4096
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
    { timeoutInSeconds: Math.max(5, Math.floor(remaining / 1000)), maxRetries: 1 },
  );
  const text = (res.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error(`Sarvam returned empty content (finish_reason: ${res.choices?.[0]?.finish_reason ?? 'unknown'})`);
  return { model: `Sarvam ${res.model ?? SARVAM_MODEL}`, text };
}
