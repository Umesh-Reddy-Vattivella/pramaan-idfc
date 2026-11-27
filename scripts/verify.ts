/* npm run verify — deterministic engine checks for PRAMAAN v3 (hand-computed expected values). */
import type { Application, MarketPoint, Snapshot } from '../lib/domain/types';
import { checklistFor } from '../lib/domain/catalog';
import { evaluate, toCustomerView, toSummary } from '../lib/engines/evaluate';
import { auctionBenchmark, consensusFor, assessPoints, registrationCheck } from '../lib/engines/evidence';
import { toIndianRupeeWords } from '../lib/engines/format';
import { fencePoint } from '../lib/engines/geofence';
import { knownObjectLengthFt } from '../lib/engines/measure';
import { areaToSqft, parseAreaSqft, parseIndianDate, parseInrAmount, parseRatePerSqft, quoteInSource } from '../lib/engines/parse';
import { polygonAreaSqm, SQFT_PER_SQM } from '../lib/engines/stats';
import { depreciation, residualLife } from '../lib/engines/valuation';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const near = (a: number | null | undefined, b: number, tol = 0.5) => a !== null && a !== undefined && Math.abs(a - b) <= tol;

/* ---------- formatting & parsing ---------- */
ok('words 3,39,75,200', toIndianRupeeWords(33975200) === 'Three Crore Thirty Nine Lakh Seventy Five Thousand Two Hundred Rupees Only');
ok('words 1,03,33,920', toIndianRupeeWords(10333920) === 'One Crore Three Lakh Thirty Three Thousand Nine Hundred Twenty Rupees Only');
ok('parse ₹15 Lac', parseInrAmount('₹15 Lac') === 1500000);
ok('parse 1.14 Cr', parseInrAmount('₹1.14 Cr') === 11400000);
ok('parse 200 sq yd', parseAreaSqft('200 sq yd') === 1800);
ok('parse ₹4,500/sqft', parseRatePerSqft('₹4,500/sqft') === 4500);
ok('parse ₹45,000 per sq yd', parseRatePerSqft('₹45,000 per sq yd') === 5000);
ok('quote found despite ₹ / comma / spacing', quoteInSource('₹4,500/sqft', 'Plots at Rs 4500 /sqft in Dharampeth'));
ok('invented number rejected', !quoteInSource('₹5,500/sqft', 'Plots at Rs 4500 /sqft in Dharampeth'));

/* ---------- Index II / auction helpers ---------- */
ok('area 139.35 sq m → 1,499.95 sqft', areaToSqft(139.35, 'SQM') === 1499.95, String(areaToSqft(139.35, 'SQM')));
ok('area 2 guntha → 2,178 sqft', areaToSqft(2, 'GUNTHA') === 2178);
ok('area 0 rejected', areaToSqft(0, 'SQFT') === null);
ok('Index II area "१३९.३५ चौ.मी." parsed', near(parseAreaSqft('१३९.३५ चौ.मी.'), 1499.95, 0.01), String(parseAreaSqft('१३९.३५ चौ.मी.')));
ok('Index II amount "२५,००,०००" parsed', parseInrAmount('२५,००,०००') === 2500000);
ok('date 12/03/2025 → 2025-03-12', parseIndianDate('12/03/2025') === '2025-03-12');
ok('date Devanagari १२-०३-२०२५', parseIndianDate('१२-०३-२०२५') === '2025-03-12');
ok('date ISO kept', parseIndianDate('2026-11-05') === '2026-11-05');
ok('date 31/02/2025 rejected', parseIndianDate('31/02/2025') === null);
ok('date garbage rejected', parseIndianDate('N/A') === null);

/* ---------- geometry & measurement ---------- */
const M = 111320;
const lat0 = 21.1408;
const lng0 = 79.0604;
const off = (n: number, e: number): [number, number] => [lat0 + n / M, lng0 + e / (M * Math.cos((lat0 * Math.PI) / 180))];
const sq20 = [off(-10, -10), off(-10, 10), off(10, 10), off(10, -10)];
ok('polygon 20 m × 20 m ≈ 400 m²', near(polygonAreaSqm(sq20), 400, 2), String(polygonAreaSqm(sq20)));
ok('known-object 300px × 7ft / 100px = 21 ft', near(knownObjectLengthFt(300, 100, 7), 21, 1e-9));
ok('residual life RCC age 12 = 48', residualLife('RCC', 12).residual === 48);
ok('depreciation RCC age 12 = 18%', near(depreciation('RCC', 12), 0.18, 1e-9));
ok('depreciation capped at 85%', depreciation('STEEL_SHED', 80) === 0.85);
ok('fence inside 10 m', fencePoint({ ...{ lat: off(10, 0)[0], lng: off(10, 0)[1] }, accuracyM: 10 }, { lat: lat0, lng: lng0 }, []).status === 'INSIDE');
ok('fence near 70 m', fencePoint({ lat: off(70, 0)[0], lng: off(70, 0)[1], accuracyM: 10 }, { lat: lat0, lng: lng0 }, []).status === 'NEAR');
ok('fence outside 150 m', fencePoint({ lat: off(150, 0)[0], lng: off(150, 0)[1], accuracyM: 10 }, { lat: lat0, lng: lng0 }, []).status === 'OUTSIDE');
ok('fence inside polygon 30 m from pin', fencePoint({ lat: off(0, 30)[0], lng: off(0, 30)[1], accuracyM: 5 }, { lat: lat0, lng: lng0 }, [off(-40, -40), off(-40, 40), off(40, 40), off(40, -40)]).status === 'INSIDE');

/* ---------- evidence ---------- */
const now = new Date('2026-11-27T10:00:00Z');
const pt = (id: string, category: MarketPoint['category'], kind: MarketPoint['kind'], r: number, n = 200, e = 0, date = '2026-11'): MarketPoint => {
  const [lat, lng] = off(n, e);
  return { id, category, kind, ratePerSqft: r, lat, lng, date, origin: 'MANUAL', included: true, url: `https://example.org/${id}` };
};
const landSales = [pt('s1', 'LAND', 'SALE', 5000), pt('s2', 'LAND', 'SALE', 5200), pt('s3', 'LAND', 'SALE', 4800)];
{
  const c = consensusFor('LAND', assessPoints(landSales, { lat: lat0, lng: lng0 }, now));
  ok('sales-only consensus = median 5,000', c?.rate === 5000, String(c?.rate));
  ok('S: depth 3 → 4 pts', c?.score.depth === 4);
  ok('S: recency ≤ 3 mo → 20', near(c?.score.recency, 20, 1e-9));
  ok('S: spatial ≤ 1 km → 20', c?.score.spatial === 20);
}
{
  const mix = [...landSales, pt('l1', 'LAND', 'LISTING', 6000), pt('l2', 'LAND', 'LISTING', 6000)];
  const c = consensusFor('LAND', assessPoints(mix, { lat: lat0, lng: lng0 }, now));
  const w = c!.rows.reduce((s, r) => s + r.weight, 0);
  ok('weights sum to 1', near(w, 1, 1e-9));
  ok('listing corrected 6000 × 0.86 = 5160', near(c!.rows.find((r) => r.kind === 'LISTING')?.correctedRate, 5160, 1e-6));
  ok('consensus between 5000 and 5160', c!.rate >= 5000 && c!.rate <= 5160, String(c!.rate));
}
{
  const far = [pt('f1', 'LAND', 'SALE', 9000, 20000, 0)];
  const a = assessPoints(far, { lat: lat0, lng: lng0 }, now);
  ok('point 20 km away not used', !a[0].used && /10 km/.test(a[0].excludedReason ?? ''));
  const dup = assessPoints([landSales[0], { ...landSales[0], id: 'dup' }], { lat: lat0, lng: lng0 }, now);
  ok('duplicate removed', dup.filter((x) => x.used).length === 1);
}

{
  const pts = [pt('i1', 'BUILT', 'LISTING', 6667), pt('i2', 'BUILT', 'LISTING', 7245), pt('i3', 'BUILT', 'LISTING', 4566), pt('i4', 'BUILT', 'LISTING', 4397), pt('i5', 'BUILT', 'LISTING', 9500), pt('i6', 'BUILT', 'LISTING', 500)];
  const a = assessPoints(pts, { lat: lat0, lng: lng0 }, now);
  ok('₹500 among ~₹4,400–9,500 rejected as implausible', !a.find((x) => x.point.id === 'i6')!.used && /Implausible/.test(a.find((x) => x.point.id === 'i6')!.excludedReason ?? ''));
  ok('others kept', a.filter((x) => x.used).length === 5);
}

/* ---------- full application: independent house ---------- */
function baseApp(): Application {
  const t = '2026-11-27T09:00:00.000Z';
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ref: 'PRM-2611-0001',
    createdAt: t,
    updatedAt: t,
    rev: 1,
    createdBy: 'tester',
    borrower: { name: 'Test Borrower', mobile: '9876543210' },
    property: { type: 'HOUSE', usage: 'RESIDENTIAL', address: 'Test address, Nagpur', lat: lat0, lng: lng0, plotAreaSqft: 1500, builtUpSqft: 1900, floors: 2, ageYears: 12, structure: 'RCC', constructionRate: 1800 },
    plan: { approvedBuaSqft: 2000, approvedFloors: 2, permissibleFsi: 1.5 },
    title: { chainFromYear: 2010 },
    documents: checklistFor('HOUSE'),
    parcel: [],
    inspection: { snapshots: [], track: [], locationOn: true, observedFloors: 2, observedUsage: 'RESIDENTIAL', occupancy: 'SELF', calls: [] },
    rooms: [
      { id: 'r1', floor: 'Ground floor', name: 'Hall', lengthFt: 20, widthFt: 20, method: 'TAPE_ON_CALL' },
      { id: 'r2', floor: 'Ground floor', name: 'Bed', lengthFt: 20, widthFt: 20, method: 'TAPE_ON_CALL' },
      { id: 'r3', floor: 'First floor', name: 'Bed', lengthFt: 20, widthFt: 20, method: 'SNAPSHOT_SCALE' },
      { id: 'r4', floor: 'First floor', name: 'Bed', lengthFt: 20, widthFt: 20, method: 'TAPE_ON_CALL' },
    ],
    market: { fetchedAt: t, queries: [], points: landSales, rejected: [] },
    attestations: {},
    review: { status: 'OPEN', remarks: '' },
    events: [],
  };
}
const snap = (id: string, label: string, area: 'EXTERIOR' | 'INTERIOR', n: number): Snapshot => {
  const [lat, lng] = off(n, 0);
  return { id, label, area, fileId: id, thumb: '', lat, lng, accuracyM: 8, takenAt: '2026-11-27T09:30:00Z', hash: 'x', source: 'CUSTOMER_DEVICE' };
};
const fullSnaps = [snap('a', 'Front', 'EXTERIOR', 5), snap('b', 'Road', 'EXTERIOR', 8), snap('c', 'Left', 'EXTERIOR', 3), snap('d', 'Right', 'EXTERIOR', 4), snap('e', 'Inside — Ground floor', 'INTERIOR', 1)];

{
  const a = baseApp();
  a.inspection.snapshots = fullSnaps;
  a.parcel = [off(-6.5, -6.5), off(-6.5, 6.5), off(6.5, 6.5), off(6.5, -6.5)]; // 13 × 13 m ≈ 1,819 sqft > deed
  const e = evaluate(a, now);
  ok('satellite area ≈ 1,819 sqft', near(e.measure.satellitePlotSqft, 169 * SQFT_PER_SQM, 3), String(e.measure.satellitePlotSqft));
  ok('land area = min(deed, satellite) = 1,500', e.measure.landAreaSqft === 1500);
  ok('measured BUA = 1,600 × 1.2 = 1,920', near(e.measure.measuredBuaSqft, 1920, 1e-6));
  ok('deviation = −4%', near(e.measure.deviationPct, -4, 1e-6));
  ok('BUA valued = min(1,920, 2,000) = 1,920', near(e.measure.buaValuedSqft, 1920, 1e-6));
  ok('LV = 1,500 × 5,000 = 75,00,000', e.valuation.landValue === 7500000);
  ok('BV = 1,920 × 1,800 × 0.82 = 28,33,920', near(e.valuation.buildingValue, 2833920, 1e-6), String(e.valuation.buildingValue));
  ok('MV = 1,03,33,920', near(e.valuation.mv, 10333920, 1e-6));
  ok('FSV = 80%', near(e.valuation.fsv, 8267136, 1e-6));
  ok('max loan = 70%', near(e.valuation.maxLoan, 7233744, 1e-6));
  ok('geofence PASS', e.geofence.status === 'PASS', e.geofence.summary);
  ok('T3 blocker without approved plan file', e.sanity.checks.find((c) => c.id === 'T3')?.status === 'BLOCKER');
  ok('verdict REFER while plan missing', e.sanity.verdict === 'REFER');
  ok('valuation stage DONE', e.stages.find((s) => s.key === 'VALUATION')?.state === 'DONE');
  ok('docs stage needs customer', e.stages.find((s) => s.key === 'DOCUMENTS')?.state === 'ACTION_NEEDED');

  // customer view never carries figures
  const cv = JSON.stringify(toCustomerView(a, now));
  ok('customer view has no rupee figures', !/₹|Rs\.|1,03,33,920|10333920|7500000|marketValue|"mv"/.test(cv));
  ok('summary carries MV for the bank', toSummary(a, now).marketValue === e.valuation.mv);

  // now verify all documents + attestations → only conditions remain
  for (const d of a.documents) {
    d.files = [{ id: d.key, fileId: d.key, name: 'x.pdf', mime: 'application/pdf', size: 1, by: 'BANK', at: '' }];
    d.status = 'VERIFIED';
  }
  a.attestations = { DEMOLITION_LIST: { ok: true, note: 'NMC', by: 't', at: '' }, ROAD_WIDENING: { ok: true, note: 'NMC', by: 't', at: '' } };
  const e2 = evaluate(a, now);
  ok('no blockers when all verified', e2.sanity.blockers === 0, e2.sanity.checks.filter((c) => c.status === 'BLOCKER').map((c) => c.id).join());
  ok('pending zero (built cross-check optional)', e2.sanity.pending === 0, e2.sanity.checks.filter((c) => c.status === 'PENDING').map((c) => c.id).join());
  ok('verdict CONDITIONS (thin evidence warns)', e2.sanity.verdict === 'CONDITIONS', e2.sanity.verdict);
  ok('documents stage DONE', e2.stages.find((s) => s.key === 'DOCUMENTS')?.state === 'DONE');
}

/* ---------- deviations, floors, usage, geofence failures ---------- */
{
  const a = baseApp();
  a.plan.approvedBuaSqft = 1400; // measured 1,920 → +37%
  const e = evaluate(a, now);
  ok('BUA +37% → T7 blocker', e.sanity.checks.find((c) => c.id === 'T7')?.status === 'BLOCKER');
  ok('BUA valued capped at approved 1,400', e.measure.buaValuedSqft === 1400);
}
{
  const a = baseApp();
  a.inspection.observedFloors = 3;
  ok('extra floor → T8 blocker', evaluate(a, now).sanity.checks.find((c) => c.id === 'T8')?.status === 'BLOCKER');
}
{
  const a = baseApp();
  a.inspection.observedUsage = 'COMMERCIAL';
  const e = evaluate(a, now);
  ok('usage conflict → LTV 60%', e.valuation.ltvCap === 0.6);
  ok('usage conflict → T12 warn', e.sanity.checks.find((c) => c.id === 'T12')?.status === 'WARN');
}
{
  const a = baseApp();
  a.inspection.snapshots = [...fullSnaps, snap('z', 'Rear', 'EXTERIOR', 2000)];
  const e = evaluate(a, now);
  ok('photo 2 km away → geofence FAIL', e.geofence.status === 'FAIL');
  ok('photo 2 km away → T5 blocker', e.sanity.checks.find((c) => c.id === 'T5')?.status === 'BLOCKER');
}
{
  const a = baseApp();
  a.plan.approvedBuaSqft = null;
  const e = evaluate(a, now);
  ok('no approved BUA → building not valued', e.measure.buaValuedSqft === 0 && e.valuation.buildingValue === 0);
}
{
  const a = baseApp();
  a.title.chainFromYear = 2020;
  ok('chain 6 years → T2 warn', evaluate(a, now).sanity.checks.find((c) => c.id === 'T2')?.status === 'WARN');
}

/* ---------- plot and flat ---------- */
{
  const a = baseApp();
  a.property = { ...a.property, type: 'PLOT', builtUpSqft: null, floors: null, ageYears: null, constructionRate: null };
  a.documents = checklistFor('PLOT');
  a.rooms = [];
  const e = evaluate(a, now);
  ok('plot: land only MV = 75,00,000', e.valuation.method === 'LAND_ONLY' && e.valuation.mv === 7500000);
  ok('plot: layout plan mandatory', a.documents.some((d) => d.key === 'LAYOUT_PLAN' && d.mandatory) && !a.documents.some((d) => d.key === 'APPROVED_PLAN'));
}
{
  const a = baseApp();
  a.property = { ...a.property, type: 'FLAT', plotAreaSqft: null };
  a.documents = checklistFor('FLAT');
  const e1 = evaluate(a, now);
  ok('flat: needs built rate', !e1.valuation.ready && e1.valuation.missing.some((m) => /Built-property rate/.test(m)));
  a.market.points = [pt('b1', 'BUILT', 'LISTING', 8000), pt('b2', 'BUILT', 'LISTING', 8000), pt('b3', 'BUILT', 'LISTING', 8000)];
  const e2 = evaluate(a, now);
  ok('flat: MV = 1,920 × 6,880 = 1,32,09,600', e2.valuation.method === 'SALES_COMPARISON' && near(e2.valuation.mv, 1920 * 6880, 1e-6), String(e2.valuation.mv));
}

/* ---------- registered sales & auction benchmark ---------- */
{
  const pin = { lat: 21.1408, lng: 79.0604 };
  const reg = (id: string, price: number, govt: number): MarketPoint => ({ id, category: 'LAND', kind: 'SALE', priceInr: price, areaSqft: 1000, date: '2026-09-01', origin: 'MANUAL', included: true, lat: pin.lat, lng: pin.lng, registration: { considerationInr: price, govtValueInr: govt } });
  const as = assessPoints([reg('r1', 3000000, 2800000), reg('r2', 2900000, 3100000), reg('r3', 3100000, 3000000)], pin, now);
  const rc = registrationCheck(as);
  ok('registration: 3 compared, 1 below govt value', rc.compared === 3 && rc.below.length === 1 && rc.below[0].id === 'r2', JSON.stringify(rc));
  ok('registration: ratio 29/31', near(rc.below[0]?.ratio, 2900000 / 3100000, 1e-9));
  const auc = (id: string, r: number): MarketPoint => ({ id, category: 'LAND', kind: 'AUCTION', ratePerSqft: r, origin: 'LIVE_SEARCH', included: true, auction: { platform: 'BAANKNET' } });
  const ab = auctionBenchmark(assessPoints([auc('a1', 1800), auc('a2', 2000), auc('a3', 2600), pt('l1', 'LAND', 'LISTING', 3000)], pin, now), 'LAND', 3000, 0.8);
  ok('auction benchmark: median 2,000, FSV rate 2,400, ratio 0.833', ab !== null && ab.n === 3 && ab.medianReserve === 2000 && ab.fsvRate === 2400 && near(ab.ratio, 2000 / 2400, 1e-9), JSON.stringify(ab));
  ok('auction benchmark: none without auctions', auctionBenchmark(assessPoints([pt('l2', 'LAND', 'LISTING', 3000)], pin, now), 'LAND', 3000, 0.8) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
