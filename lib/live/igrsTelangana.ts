/* ------------------------------------------------------------------
   Telangana IGRS "Market Value Search" (registration.telangana.gov.in/UnitRateMV)
   — the published government market values. Public, no login, no captcha.
   Valuation Logic v2 §4: a small fixed set of reads per case, cached with the
   fetch date (rates change only on official revision). The page structure was
   confirmed against the live site on 28 Nov 2026:
     districts      <select id="districtCode"> on getDistrictList.htm
     mandals        GET getMandalListByDistCode?districtcode=…           → "01/NAME##…"
     villages       GET getVillageListByDistCode?districtcode&mandalcode&sType=U
     Hyderabad      GET getLocationDetails?codes=16_1~TEXT~$~$~DIVISION  (locality search)
     rates          POST unitRateMV (form fields + encodestr = base64(JSON of the form))
   Rows are parsed in code (no AI). Land values are per sq yd; apartment values per sqft.
   ------------------------------------------------------------------ */
import { kvGetJson, kvSetJson } from '@/lib/server/store';

const BASE = 'https://registration.telangana.gov.in/UnitRateMV';
export const IGRS_TS_URL = `${BASE}/getDistrictList.htm`;
const UA = 'Mozilla/5.0 (compatible; PRAMAAN-Prototype/1.0)';
/** Rates and lists are reused for this long before the portal is read again. */
const CACHE_MS = 30 * 24 * 3600 * 1000;
const TIMEOUT_MS = 20_000;

export const HYDERABAD = '16_1';
export const HYDERABAD_DIVISIONS = [
  { code: '1600001', name: 'HYDERABAD DIVISION' },
  { code: '1600002', name: 'SECUNDERABAD DIVISION' },
  { code: '1600003', name: 'SECUNDERABAD CANTONMENT BOARD' },
];

export interface IgrsOption {
  code: string;
  name: string;
}

export interface IgrsRow {
  sno: number;
  wardBlock: string;
  locality: string;
  /** Land value, Rs. per sq yd (search by land). */
  landPerSqYd: number | null;
  /** Apartment value, Rs. per sqft (search by apartment): ground / first / other floors. */
  apartmentPerSqft: { ground: number | null; first: number | null; other: number | null } | null;
  /** e.g. "01(Residential)", "02(Commercial)" — present in the page source. */
  classification: string | null;
  /** YYYY-MM-DD */
  effectiveDate: string | null;
}

export interface IgrsRateQuery {
  district: string;
  districtName: string;
  mandal?: string;
  mandalName?: string;
  village?: string;
  villageName?: string;
  /** Hyderabad only. */
  division?: string;
  locality?: string;
  localityName?: string;
  searchBy: 'L' | 'A';
}

export interface IgrsRateResult {
  query: IgrsRateQuery;
  /** "District : … Mandal : … Village : …" as printed. */
  header: string;
  rows: IgrsRow[];
  fetchedAt: string;
  cached: boolean;
  url: string;
}

export const CODE_RE = {
  district: /^\d{1,2}_\d$/,
  mandal: /^\d{1,3}$/,
  village: /^\d{3,10}$/,
  locality: /^\d{1,8}$/,
  division: /^16000\d{2}$/,
  text: /^[A-Za-z0-9 .\-&]{3,40}$/,
};

/* ---------------- HTTP ---------------- */

/** fetch with the network cause in the error ("fetch failed" alone says nothing). */
async function get(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const c = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`IGRS Telangana unreachable (${c?.code ?? c?.message ?? (err instanceof Error ? err.message : 'network error')}) — use the portal link and enter the rate manually`);
  }
}

async function openSession(): Promise<{ cookie: string; html: string }> {
  const res = await get(IGRS_TS_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) throw new Error(`IGRS Telangana HTTP ${res.status}`);
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw = h.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const cookie = raw
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
  return { cookie, html: await res.text() };
}

async function getText(path: string, params: Record<string, string>, cookie?: string): Promise<string> {
  const res = await get(`${BASE}/${path}?${new URLSearchParams(params)}`, { headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}), Referer: IGRS_TS_URL }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) throw new Error(`IGRS Telangana HTTP ${res.status}`);
  const t = (await res.text()).trim();
  if (t === 'Malicious' || t === 'Special') throw new Error('IGRS Telangana rejected the input');
  if (/^<!DOCTYPE|<html/i.test(t)) throw new Error('IGRS Telangana returned a page instead of a list');
  return t;
}

/** "01/ABDULLAPURMET##02/AMANGAL##" → options */
export function parseOptionList(t: string): IgrsOption[] {
  return t
    .split('##')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf('/');
      return i > 0 ? { code: x.slice(0, i).trim(), name: x.slice(i + 1).trim() } : null;
    })
    .filter((o): o is IgrsOption => !!o && !!o.code && !!o.name);
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ')
    .trim();

export function parseDistricts(html: string): IgrsOption[] {
  const sel = html.match(/<select[^>]*id="districtCode"[\s\S]*?<\/select>/i)?.[0] ?? '';
  return [...sel.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/gi)].map((m) => ({ code: m[1].trim(), name: decode(m[2]) })).filter((o) => CODE_RE.district.test(o.code));
}

const num = (s: string | undefined) => {
  const t = (s ?? '').replace(/[,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
const isoDate = (s: string | undefined) => {
  const m = (s ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

/** Rows of the result table. HTML comments hide the classification column: it is read from the raw row. */
export function parseRates(html: string, searchBy: 'L' | 'A'): { header: string; rows: IgrsRow[] } {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const visible = body.replace(/<!--[\s\S]*?-->/g, '');
  const text = decode(visible);
  const hi = text.indexOf('Unit Rates');
  const header = hi >= 0 ? text.slice(hi, text.indexOf('S.No.', hi) > 0 ? text.indexOf('S.No.', hi) : hi + 160).trim() : '';
  const table = body.match(/<table[^>]*>[\s\S]*?S\.No\.[\s\S]*?<\/table>/i)?.[0] ?? '';
  const rows: IgrsRow[] = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decode(m[1]));
    const sno = num(cells[0]?.replace(/\.$/, ''));
    if (sno === null || cells.length < 5) continue;
    const cls = tr.match(/(\d{2}\s*\(\s*[A-Za-z][A-Za-z ]*\))/)?.[1]?.replace(/\s+/g, '') ?? null;
    if (searchBy === 'L') rows.push({ sno, wardBlock: cells[1], locality: cells[2], landPerSqYd: num(cells[3]), apartmentPerSqft: null, classification: cls, effectiveDate: isoDate(cells[4]) });
    else rows.push({ sno, wardBlock: cells[1], locality: cells[2], landPerSqYd: null, apartmentPerSqft: { ground: num(cells[3]), first: num(cells[4]), other: num(cells[5]) }, classification: cls, effectiveDate: isoDate(cells[6]) });
  }
  return { header, rows };
}

/* ---------------- cached reads ---------------- */

const K = (k: string) => `pramaan3:igrs-ts:${k}`;

async function cached<T>(key: string, load: () => Promise<T>): Promise<{ value: T; fetchedAt: string; cached: boolean }> {
  const hit = await kvGetJson<{ value: T; fetchedAt: string }>(K(key)).catch(() => null);
  if (hit && Date.now() - Date.parse(hit.fetchedAt) < CACHE_MS) return { ...hit, cached: true };
  const value = await load();
  const fetchedAt = new Date().toISOString();
  await kvSetJson(K(key), { value, fetchedAt }).catch(() => undefined);
  return { value, fetchedAt, cached: false };
}

export async function igrsDistricts(): Promise<IgrsOption[]> {
  return (
    await cached('districts', async () => {
      const d = parseDistricts((await openSession()).html);
      if (!d.length) throw new Error('Could not read the district list from IGRS Telangana');
      return d;
    })
  ).value;
}

export async function igrsMandals(district: string): Promise<IgrsOption[]> {
  if (!CODE_RE.district.test(district)) throw new Error('Bad district');
  return (await cached(`m:${district}`, async () => parseOptionList(await getText('getMandalListByDistCode', { districtcode: district })))).value;
}

export async function igrsVillages(district: string, mandal: string): Promise<IgrsOption[]> {
  if (!CODE_RE.district.test(district) || !CODE_RE.mandal.test(mandal)) throw new Error('Bad district / mandal');
  return (await cached(`v:${district}:${mandal}`, async () => parseOptionList(await getText('getVillageListByDistCode', { districtcode: district, mandalcode: mandal, sType: 'U' })))).value;
}

/** Hyderabad district: localities matching at least 3 letters. */
export async function igrsLocalities(division: string, text: string): Promise<IgrsOption[]> {
  if (!CODE_RE.division.test(division) || !CODE_RE.text.test(text)) throw new Error('Enter at least 3 letters of the locality');
  const q = text.trim().toUpperCase();
  return (await cached(`l:${division}:${q}`, async () => parseOptionList(await getText('getLocationDetails', { codes: `${HYDERABAD}~${q}~$~$~${division}` })))).value;
}

function validQuery(q: IgrsRateQuery): string | null {
  if (!CODE_RE.district.test(q.district)) return 'Choose a district';
  if (q.searchBy !== 'L' && q.searchBy !== 'A') return 'Choose land or apartment value';
  if (q.district === HYDERABAD) {
    if (!q.division || !CODE_RE.division.test(q.division) || !q.locality || !CODE_RE.locality.test(q.locality)) return 'Choose the division and a locality';
  } else if (!q.mandal || !CODE_RE.mandal.test(q.mandal) || !q.village || !CODE_RE.village.test(q.village)) return 'Choose the mandal and the village';
  return null;
}

const cacheKey = (q: IgrsRateQuery) => `r:${q.searchBy}:${q.district}:${q.mandal ?? ''}:${q.village ?? ''}:${q.division ?? ''}:${q.locality ?? ''}`;

export async function igrsRates(q: IgrsRateQuery): Promise<IgrsRateResult> {
  const bad = validQuery(q);
  if (bad) throw new Error(bad);
  const hyd = q.district === HYDERABAD;
  const r = await cached(cacheKey(q), async () => {
    const { cookie } = await openSession();
    // Same fields, in the same order, as the portal's own form (jQuery serializeArray).
    const form: [string, string][] = [
      ['encodestr', ''],
      ['locName', hyd ? (q.localityName ?? '') : ''],
      ['rValue', 'U'],
      ['tFlag', hyd ? 'L' : ''],
      ['mndlName', hyd ? '' : (q.mandalName ?? '')],
      ['vlgName', hyd ? '' : (q.villageName ?? '')],
      ['RateType', 'U'],
      ['search_by', q.searchBy],
      ['districtId', q.district],
      ['mandalCode', hyd ? '' : q.mandal!],
      ['divCode', hyd ? q.division! : ''],
      ['villageCode', hyd ? '' : q.village!],
      ...(hyd ? ([['radio1', 'l']] as [string, string][]) : []),
      ['locality', hyd ? q.locality! : ''],
    ];
    const encodestr = Buffer.from(JSON.stringify(Object.fromEntries(form))).toString('base64');
    const body = new URLSearchParams([['encodestr', encodestr], ...form.filter(([k]) => k !== 'encodestr')]);
    const res = await get(`${BASE}/unitRateMV`, {
      method: 'POST',
      headers: { 'User-Agent': UA, Cookie: cookie, Referer: IGRS_TS_URL, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (res.status >= 300 && res.status < 400) throw new Error('IGRS Telangana refused the search (it may have changed its form) — use the portal link and enter the rate manually');
    if (!res.ok) throw new Error(`IGRS Telangana HTTP ${res.status}`);
    const parsed = parseRates(await res.text(), q.searchBy);
    if (!parsed.rows.length) throw new Error('No market value rows for this selection');
    return parsed;
  });
  return { query: q, header: r.value.header, rows: r.value.rows, fetchedAt: r.fetchedAt, cached: r.cached, url: IGRS_TS_URL };
}
