/* ------------------------------------------------------------------
   Customer-link store (server only).
   Uses Upstash Redis / Vercel KV over REST when configured
   (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL +
   KV_REST_API_TOKEN). Otherwise falls back to process memory — fine for
   `npm run dev`, but on serverless hosting each instance has its own memory,
   so configure KV for a phone ↔ laptop demo on Vercel.
   ------------------------------------------------------------------ */
import type { CaptureSubmission, LinkPrefill, LinkStatus } from '@/lib/types';

export interface LinkRecord {
  prefill: LinkPrefill;
  status: LinkStatus;
  openedAt?: string;
  submission?: CaptureSubmission;
}

const TTL_SECONDS = 7 * 24 * 3600;
const key = (token: string) => `pramaan:link:${token}`;

const REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const storeMode: 'kv' | 'memory' = REST_URL && REST_TOKEN ? 'kv' : 'memory';

const g = globalThis as unknown as { __pramaanLinks?: Map<string, LinkRecord> };
const mem = (g.__pramaanLinks ??= new Map<string, LinkRecord>());

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const r = await fetch(REST_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  const j = (await r.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function getLink(token: string): Promise<LinkRecord | null> {
  if (storeMode === 'memory') return mem.get(token) ?? null;
  const raw = await redis(['GET', key(token)]);
  return typeof raw === 'string' ? (JSON.parse(raw) as LinkRecord) : null;
}

export async function putLink(token: string, rec: LinkRecord): Promise<void> {
  if (storeMode === 'memory') {
    mem.set(token, rec);
    return;
  }
  await redis(['SET', key(token), JSON.stringify(rec), 'EX', TTL_SECONDS]);
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
