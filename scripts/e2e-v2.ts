/* npx tsx scripts/e2e-v2.ts [baseUrl] — end-to-end check of Valuation Logic v2 against a running server
   (use a memory-store server: SUPABASE_URL= npx next start). Creates a Telangana plot case, adopts the IGRS
   government value, records a purchase price, adds comparables, and prints the engine result. */
import type { Application } from '../lib/domain/types';
import { evaluate } from '../lib/engines/evaluate';

const base = process.argv[2] ?? 'http://localhost:3123';
let cookie = '';

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const j = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${j.error}`);
  return j;
}

async function main() {
  await call('/api/auth/bank', 'POST', { userId: 'e2e.tester', password: process.env.BANK_PW ?? 'Bank@2026' });
  const { app } = await call<{ app: Application }>('/api/applications', 'POST', {
    borrower: { name: 'E2E Test', mobile: '9876543210' },
    property: { type: 'PLOT', usage: 'RESIDENTIAL', address: 'Plot 12, Kokapet, Gandipet, Rangareddy, Telangana 500075', lat: 17.3936, lng: 78.3352, locality: 'Kokapet', city: 'Hyderabad', state: 'Telangana', plotAreaSqft: 1800 },
    ownership: { acquiredBy: 'PURCHASED', purchaseMonth: '2021-06', priceInr: 7200000, covered: 'PLOT', claimedValueInr: 12000000 },
  });
  console.log('created', app.ref, 'ownership', app.ownership);

  const d = (await call<{ options: { code: string; name: string }[] }>('/api/igrs/telangana?list=districts')).options.find((x) => x.name === 'RANGAREDDY')!;
  const m = (await call<{ options: { code: string; name: string }[] }>(`/api/igrs/telangana?list=mandals&district=${d.code}`)).options.find((x) => x.name === 'GANDIPET')!;
  const v = (await call<{ options: { code: string; name: string }[] }>(`/api/igrs/telangana?list=villages&district=${d.code}&mandal=${m.code}`)).options.find((x) => x.name === 'KOKAPET')!;
  const query = { district: d.code, districtName: d.name, mandal: m.code, mandalName: m.name, village: v.code, villageName: v.name, searchBy: 'L' };
  const rates = await call<{ rows: { sno: number; locality: string; landPerSqYd: number; classification: string }[] }>('/api/igrs/telangana', 'POST', query);
  const row = rates.rows.find((r) => /Residential/.test(r.classification ?? ''))!;
  console.log('IGRS row', row);
  let a = (await call<{ app: Application }>(`/api/applications/${app.id}/govvalue`, 'POST', { query, sno: row.sno })).app;
  console.log('official point', a.market.points.find((p) => p.origin === 'OFFICIAL')?.ratePerSqft, a.market.points.find((p) => p.origin === 'OFFICIAL')?.quote);

  // Comparables: listings in Kokapet (T1) and nearby (T2), one undated, one commercial (dropped by usage).
  const add = (p: object) => call<{ app: Application }>(`/api/applications/${app.id}`, 'PATCH', { op: 'addPoint', point: { origin: 'MANUAL', included: true, category: 'LAND', kind: 'LISTING', ...p } });
  await add({ ratePerSqft: 9500, locality: 'Kokapet', date: '2026-10', title: 'Residential plot, Kokapet', propertyType: 'residential plot', lat: 17.395, lng: 78.336 });
  await add({ ratePerSqft: 10200, locality: 'Kokapet', date: '2026-09', title: 'Residential plot, Kokapet', propertyType: 'residential plot', lat: 17.392, lng: 78.333 });
  await add({ ratePerSqft: 8900, locality: 'Narsingi', date: '2026-08', title: 'Residential plot, Narsingi', propertyType: 'residential plot', lat: 17.383, lng: 78.358 });
  await add({ ratePerSqft: 15000, locality: 'Kokapet', date: '2026-10', title: 'Commercial plot, Kokapet', propertyType: 'commercial plot', lat: 17.394, lng: 78.334 });
  a = (await add({ kind: 'SALE', priceInr: 16200000, areaSqft: 1800, locality: 'Kokapet', date: '2026-05', title: 'Registered sale, Kokapet', propertyType: 'residential plot', lat: 17.3945, lng: 78.3348 })).app;

  const e = evaluate(a, new Date());
  const L = e.evidence.land!;
  console.log('\npoints:', e.evidence.assessed.map((x) => `${x.point.title} → ${x.used ? `${x.tier} w${x.weight.toFixed(2)} τ${x.tau}` : `NOT USED: ${x.excludedReason}`}`).join('\n  '));
  console.log('\nmarket B:', { rate: L.rate, u: L.u.toFixed(4), low: L.low, high: L.high, nEff: L.nEff.toFixed(2), z: L.z.toFixed(2), score: L.score });
  const f = e.rates.LAND!;
  console.log('purchase C:', { rate: Math.round(e.rates.purchase!.rate), u: e.rates.purchase!.u.toFixed(3), years: e.rates.purchase!.years.toFixed(2) });
  console.log('final:', { rate: f.rate, low: f.low, high: f.high, wB: f.wMarket.toFixed(3), wC: f.wPurchase.toFixed(3), G: f.guideline?.rate, official: f.guideline?.official, floor: f.floorApplied });
  console.log('valuation:', { mv: e.valuation.mv, mvLow: e.valuation.mvLow, mvHigh: e.valuation.mvHigh, maxLoan: e.valuation.maxLoan, wide: e.valuation.wideRange });
  console.log('checks:', e.sanity.checks.filter((c) => ['T13', 'T14', 'T17', 'T18', 'T20', 'T21'].includes(c.id)).map((c) => `${c.id} ${c.status}: ${c.finding}`).join('\n  '));
}
main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
