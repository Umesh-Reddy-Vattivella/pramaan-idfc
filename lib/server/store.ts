/* ------------------------------------------------------------------
   Server persistence. Picks the first configured backend:
     1. Supabase (free tier): Postgres table `pramaan_kv` (JSON documents) +
        Storage bucket for uploaded files — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
        Schema: supabase/schema.sql.
     2. Upstash Redis / Vercel KV over REST — KV_REST_API_URL + KV_REST_API_TOKEN.
     3. Process memory (local `npm run dev` only; lost on restart).
   Server-only: the service-role key never reaches the browser.
   ------------------------------------------------------------------ */

const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SB_BUCKET = process.env.SUPABASE_BUCKET ?? 'pramaan-files';
const REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export type StoreMode = 'supabase' | 'kv' | 'memory';
export const storeMode: StoreMode = SB_URL && SB_KEY ? 'supabase' : REST_URL && REST_TOKEN ? 'kv' : 'memory';

const TTL_SECONDS = 60 * 24 * 3600;
const g = globalThis as unknown as { __pramaanKv?: Map<string, string> };
const mem = (g.__pramaanKv ??= new Map<string, string>());

/* ---------------- Supabase ---------------- */

/** New-format keys (sb_secret_…) go in the apikey header only; legacy service_role JWTs also as Bearer. */
const sbHeaders = (extra: Record<string, string> = {}): Record<string, string> =>
  SB_KEY!.startsWith('sb_') ? { apikey: SB_KEY!, ...extra } : { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, ...extra };

if (SB_KEY?.startsWith('sb_publishable_')) {
  // The publishable key cannot read/write a table with RLS on and no policies — fail loudly instead of silently.
  console.error('[store] SUPABASE_SERVICE_ROLE_KEY is a publishable key. Use the SECRET key (sb_secret_…) from Supabase → Project Settings → API Keys.');
}

/*
 * Documents live in the `pramaan_kv` table (supabase/schema.sql). If that table has not been created yet,
 * they are stored as JSON objects in the private storage bucket instead, so the app works either way.
 */
let tableMissing = false;
const docPath = (key: string) => `${SB_URL}/storage/v1/object/${SB_BUCKET}/_docs/${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`;
const isMissingTable = (status: number, body: string) => status === 404 && body.includes('PGRST205');

async function sbGet(key: string): Promise<string | null> {
  if (!tableMissing) {
    const r = await fetch(`${SB_URL}/rest/v1/pramaan_kv?key=eq.${encodeURIComponent(key)}&select=value`, { headers: sbHeaders(), cache: 'no-store' });
    if (r.ok) {
      const rows = (await r.json()) as { value: unknown }[];
      return rows.length ? JSON.stringify(rows[0].value) : null;
    }
    const body = await r.text();
    if (!isMissingTable(r.status, body)) throw new Error(`DB read ${r.status}: ${body.slice(0, 120)}`);
    tableMissing = true;
    console.warn('[store] pramaan_kv table not found — storing documents in the storage bucket. Run supabase/schema.sql to use the table.');
  }
  const r = await fetch(docPath(key), { headers: sbHeaders(), cache: 'no-store' });
  if (r.status === 400 || r.status === 404) return null;
  if (!r.ok) throw new Error(`Doc read ${r.status}`);
  return r.text();
}

async function sbSet(key: string, value: string): Promise<void> {
  if (!tableMissing) {
    const r = await fetch(`${SB_URL}/rest/v1/pramaan_kv?on_conflict=key`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ key, value: JSON.parse(value), updated_at: new Date().toISOString() }),
    });
    if (r.ok) return;
    const body = await r.text();
    if (!isMissingTable(r.status, body)) throw new Error(`DB write ${r.status}: ${body.slice(0, 120)}`);
    tableMissing = true;
  }
  const r = await fetch(docPath(key), { method: 'POST', headers: sbHeaders({ 'Content-Type': 'application/json', 'x-upsert': 'true' }), body: value });
  if (!r.ok) throw new Error(`Doc write ${r.status}: ${(await r.text()).slice(0, 120)}`);
}

async function sbDel(key: string): Promise<void> {
  if (!tableMissing) await fetch(`${SB_URL}/rest/v1/pramaan_kv?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: sbHeaders() });
  else await fetch(docPath(key), { method: 'DELETE', headers: sbHeaders() });
}

/* ---------------- Upstash / Vercel KV ---------------- */

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

/* ---------------- documents ---------------- */

export async function kvGet(key: string): Promise<string | null> {
  if (storeMode === 'supabase') return sbGet(key);
  if (storeMode === 'kv') {
    const v = await redis(['GET', key]);
    return typeof v === 'string' ? v : null;
  }
  return mem.get(key) ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (storeMode === 'supabase') return sbSet(key, value);
  if (storeMode === 'kv') {
    await redis(['SET', key, value, 'EX', TTL_SECONDS]);
    return;
  }
  mem.set(key, value);
}

export async function kvDel(key: string): Promise<void> {
  if (storeMode === 'supabase') return sbDel(key);
  if (storeMode === 'kv') {
    await redis(['DEL', key]);
    return;
  }
  mem.delete(key);
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const v = await kvGet(key);
  return v ? (JSON.parse(v) as T) : null;
}

export const kvSetJson = (key: string, value: unknown) => kvSet(key, JSON.stringify(value));

/* ---------------- files (binary) ---------------- */

export interface StoredFile {
  caseId: string;
  mime: string;
  fileName: string;
  data: Buffer;
}

export async function putFile(id: string, f: StoredFile): Promise<void> {
  const meta = { caseId: f.caseId, mime: f.mime, fileName: f.fileName };
  if (storeMode === 'supabase') {
    const r = await fetch(`${SB_URL}/storage/v1/object/${SB_BUCKET}/${f.caseId}/${id}`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': f.mime, 'x-upsert': 'true' }),
      body: new Uint8Array(f.data),
    });
    if (!r.ok) throw new Error(`File storage ${r.status}: ${(await r.text()).slice(0, 120)}`);
    await kvSetJson(`pramaan:filemeta:${id}`, meta);
    return;
  }
  await kvSetJson(`pramaan:blob:${id}`, { ...meta, data: f.data.toString('base64') });
}

export async function getFile(id: string): Promise<StoredFile | null> {
  if (storeMode === 'supabase') {
    const meta = await kvGetJson<{ caseId: string; mime: string; fileName: string }>(`pramaan:filemeta:${id}`);
    if (!meta) return null;
    const r = await fetch(`${SB_URL}/storage/v1/object/${SB_BUCKET}/${meta.caseId}/${id}`, { headers: sbHeaders(), cache: 'no-store' });
    if (!r.ok) return null;
    return { ...meta, data: Buffer.from(await r.arrayBuffer()) };
  }
  const b = await kvGetJson<{ caseId: string; mime: string; fileName: string; data: string }>(`pramaan:blob:${id}`);
  return b ? { caseId: b.caseId, mime: b.mime, fileName: b.fileName, data: Buffer.from(b.data, 'base64') } : null;
}
