/* npm run verify — deterministic engine checks for PRAMAAN v3 (hand-computed expected values). */
import type { Application, MarketPoint, Snapshot } from '../lib/domain/types';
import { checklistFor } from '../lib/domain/catalog';
import { evaluate, toCustomerView, toSummary } from '../lib/engines/evaluate';
import { agreementScore, auctionBenchmark, consensusFor, assessPoints, estimate, registrationCheck, type PointAssessment } from '../lib/engines/evidence';
import { govRatePerSqft, isTelangana } from '../lib/engines/govValue';
import { finalRate, purchaseComponent } from '../lib/engines/purchase';
import { runMeasure } from '../lib/engines/measure';
import type { Consensus } from '../lib/engines/evidence';
import { toIndianRupeeWords } from '../lib/engines/format';
import { fencePoint } from '../lib/engines/geofence';
import { areaAgreement } from '../lib/engines/measure';
import { applyBankOp } from '../lib/server/applications';
import { areaToSqft, parseAreaSqft, parseIndianDate, parseInrAmount, parseRatePerSqft, quoteInSource } from '../lib/engines/parse';
import { effectiveN, polygonAreaSqm, sampleStdDev, SQFT_PER_SQM, weightedMedian } from '../lib/engines/stats';
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
  ok('S: depth n_eff 3 → 20 × 3/12 = 5', near(c?.score.depth, 5, 1e-9), String(c?.score.depth));
  ok('S: recency ≤ 3 mo → 20', near(c?.score.recency, 20, 1e-9));
  ok('S: spatial ≤ 1 km → 20', c?.score.spatial === 20);
}
{
  const mix = [...landSales, pt('l1', 'LAND', 'LISTING', 6000), pt('l2', 'LAND', 'LISTING', 6000)];
  const c = consensusFor('LAND', assessPoints(mix, { lat: lat0, lng: lng0 }, now));
  const w = c!.rows.reduce((s, r) => s + r.weight, 0);
  ok('weights sum to 1', near(w, 1, 1e-9));
  ok('listing corrected 6000 × 0.86 = 5160', near(c!.rows.find((r) => r.kind === 'LISTING')?.rate, 5160, 1e-6));
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
  ok('₹500 among ~₹4,400–9,500 rejected (outlier / implausible)', !a.find((x) => x.point.id === 'i6')!.used && /Implausible|robust SD/.test(a.find((x) => x.point.id === 'i6')!.excludedReason ?? ''));
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
    floorPlan: { source: 'CUSTOMER_UPLOAD', basis: 'BUILT_UP', floors: [{ floor: 'Ground floor', areaSqft: 960 }, { floor: 'First floor', areaSqft: 960 }] },
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
  ok('floor-plan BUA = 960 + 960 = 1,920', near(e.measure.planBuaSqft, 1920, 1e-6));
  ok('no roof outline → T23 pending', e.sanity.checks.find((c) => c.id === 'T23')?.status === 'PENDING');
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
  const side = Math.sqrt(960 / SQFT_PER_SQM) / 2; // roof ≈ 960 sqft
  a.footprint = [off(-side, -side), off(-side, side), off(side, side), off(side, -side)];
  const e2 = evaluate(a, now);
  ok('roof ≈ 960 sqft × 2 floors seen ≈ plan 1,920 → delta ≈ 0', near(e2.measure.areaDeltaPct, 0, 1), String(e2.measure.areaDeltaPct));
  ok('confidence 70 + 15 (floors seen = plan) + 10 (customer plan, verified) = 95', e2.measure.confidence?.total === 95 && e2.measure.confidence.band === 'HIGH', JSON.stringify(e2.measure.confidence));
  ok('T23 PASS', e2.sanity.checks.find((c) => c.id === 'T23')?.status === 'PASS');
  ok('measurement stage DONE', e2.stages.find((s) => s.key === 'MEASUREMENT')?.state === 'DONE');
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
  a.floorPlan = undefined;
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

/* ---------- floor-wise area vs satellite top view ---------- */
ok('area agreement: 5% → 70, 30% → 0, 17.5% → 35, sign ignored', areaAgreement(0.05) === 70 && areaAgreement(-0.3) === 0 && near(areaAgreement(-0.175), 35, 1e-9));
{
  const a = baseApp();
  a.parcel = [off(-6.5, -6.5), off(-6.5, 6.5), off(6.5, 6.5), off(6.5, -6.5)];
  a.footprint = a.parcel; // roof 13 × 13 m ≈ 1,819 sqft × 2 floors = 3,638 vs plan 1,920
  const e = evaluate(a, now);
  ok('roof × floors ≈ 3,638 sqft', near(e.measure.satelliteBuaSqft, 2 * 169 * SQFT_PER_SQM, 3), String(e.measure.satelliteBuaSqft));
  ok('delta ≈ −47% → agreement 0, confidence low', near(e.measure.areaDeltaPct, (1920 / (2 * 169 * SQFT_PER_SQM) - 1) * 100, 0.1) && e.measure.confidence?.agreement === 0 && e.measure.confidence.band === 'LOW');
  ok('T23 BLOCKER, more built than the plan', e.sanity.checks.find((c) => c.id === 'T23')?.status === 'BLOCKER' && /extension/.test(e.sanity.checks.find((c) => c.id === 'T23')!.finding));
  a.inspection.observedFloors = 3;
  ok('floors seen 3 ≠ plan 2 → floor points 0', evaluate(a, now).measure.confidence?.floors === 0);
  a.floorPlan = { source: 'GOVT_PORTAL', basis: 'CARPET', floors: [{ floor: 'Ground floor', areaSqft: 1000 }] };
  ok('carpet plan × 1.2', near(evaluate(a, now).measure.planBuaSqft, 1200, 1e-9));
  ok('government copy, plan not verified → source 10', evaluate(a, now).measure.confidence?.source === 10);
}
{
  const a = baseApp();
  a.property = { ...a.property, type: 'FLAT', plotAreaSqft: null, builtUpSqft: 1250 };
  a.documents = checklistFor('FLAT');
  a.floorPlan = { source: 'CUSTOMER_UPLOAD', basis: 'BUILT_UP', floors: [{ floor: 'Unit', areaSqft: 1200 }] };
  const e = evaluate(a, now);
  ok('flat: plan vs deed area, −4%', e.measure.checkBasis === 'DEED' && near(e.measure.areaDeltaPct, -4, 1e-9));
  ok('flat: no satellite check for a unit', e.measure.satelliteBuaSqft === null);
}
{
  const a = baseApp();
  a.documents = a.documents.filter((d) => d.key !== 'FLOOR_PLAN');
  applyBankOp(a, { op: 'setFloorPlan', floorPlan: { source: 'CUSTOMER_UPLOAD', basis: 'BUILT_UP', floors: [{ floor: 'Ground floor', areaSqft: 900 }, { floor: 'Ground floor', areaSqft: 50 }, { floor: '', areaSqft: 10 }, { floor: 'First floor', areaSqft: -5 }] } }, 't');
  ok('setFloorPlan keeps valid, distinct floors only', a.floorPlan?.floors.length === 1 && a.floorPlan.floors[0].areaSqft === 900);
  ok('customer upload opens the floor-plan slot', a.documents.some((d) => d.key === 'FLOOR_PLAN'));
}

/* ---------- Valuation Logic v2: statistics ---------- */
ok('sample SD (n − 1) of 4,800/5,000/5,200 = 200', near(sampleStdDev([4800, 5000, 5200]), 200, 1e-9));
ok('weighted median 4900/5150/5300 at 0.707/0.445/0.315 = 5,150', weightedMedian([4900, 5150, 5300], [0.5 ** 0.5, 0.5 ** (14 / 12), 0.5 ** (20 / 12)]) === 5150);
ok('weighted median of two equal weights = midpoint', weightedMedian([10, 20], [1, 1]) === 15);
ok('n_eff of the three sales = 2.7', near(effectiveN([0.5 ** 0.5, 0.5 ** (14 / 12), 0.5 ** (20 / 12)]), 2.7, 0.01));
ok('agreement: u 6% → 35, 20% → 0, 13% → 17.5', agreementScore(0.06) === 35 && agreementScore(0.2) === 0 && near(agreementScore(0.13), 17.5, 1e-9));

/* ---------- v2 §7.5 worked example (hand-built assessments, already time-adjusted) ---------- */
const A = (id: string, kind: MarketPoint['kind'], corrected: number, tier: 'T1' | 'T2' | 'T3', weight: number, tau: number): PointAssessment => ({
  point: { id, category: 'LAND', kind, origin: 'MANUAL', included: true, ratePerSqft: corrected },
  rate: corrected, corrected, distanceKm: tier === 'T1' ? 0.5 : 3, ageMonths: 0, dateSource: 'PRINTED', tier, weight, tau, tauNotes: [], notes: [], localityAverage: false, areaBasis: null, atGuideline: false, used: true,
});
const t1 = [
  A('s1', 'SALE', 4900, 'T1', 0.5 ** (6 / 12), 0.05), A('s2', 'SALE', 5150, 'T1', 0.5 ** (14 / 12), 0.05), A('s3', 'SALE', 5300, 'T1', 0.5 ** (20 / 12), 0.05),
  A('l1', 'LISTING', 6200 * 0.86, 'T1', 1, 0.06), A('l2', 'LISTING', 6000 * 0.86, 'T1', 1, 0.06), A('l3', 'LISTING', 6500 * 0.86, 'T1', 1, 0.06),
];
{
  const e = estimate(t1)!;
  const sale = e.rows.find((r) => r.kind === 'SALE')!;
  const lst = e.rows.find((r) => r.kind === 'LISTING')!;
  ok('§7.5 sales: r = ₹5,150, n_eff 2.7, sample-SD spread', sale.rate === 5150 && near(sale.nEff, 2.7, 0.01) && sale.spreadMethod === 'SAMPLE_SD' && near(sale.spread, sampleStdDev([4900, 5150, 5300]) / 5116.667, 1e-4), JSON.stringify(sale));
  ok('§7.5 listings: r = ₹5,332, n_eff 3.0', near(lst.rate, 5332, 0.01) && near(lst.nEff, 3, 1e-9));
  ok('§7.5 R_T1 = ₹5,226', near(e.rate, 5226, 1), String(e.rate));
  ok('§7.5 u_T1 = 4.4%', near(e.u * 100, 4.4, 0.05), String(e.u));
  ok('§7.5 Q = 0.15, not widened', near(e.q, 0.15, 0.01) && !e.widened, String(e.q));
  ok('§7.5 n_eff(T1) = 5.7 (summed per kind)', near(e.nEff, 5.7, 0.05), String(e.nEff));
  const all = [...t1, A('t1', 'LISTING', 5300, 'T2', 0.5, 0.08), A('t2', 'LISTING', 5200, 'T2', 0.5, 0.08), A('t3', 'LISTING', 5250, 'T2', 1.5, 0.08)];
  const c = consensusFor('LAND', all)!;
  ok('§7.5 Z = 5.7 ÷ 10.7 = 0.53', near(c.z, 0.53, 0.01), String(c.z));
  ok('R_final = Z × R_T1 + (1 − Z) × R_all', near(c.rawRate, c.z * c.local!.rate + (1 - c.z) * c.all.rate, 1e-9));
  ok('u_final = Z × u_T1 + (1 − Z) × u_all', near(c.u, c.z * c.local!.u + (1 - c.z) * c.all.u, 1e-12));
  ok('range = R ± 1.28 u', c.low === Math.round((c.rawRate * (1 - 1.28 * c.u)) / 10) * 10 && c.high === Math.round((c.rawRate * (1 + 1.28 * c.u)) / 10) * 10);
  ok('§8 depth = 20 × (8.0 ÷ 12) + 5 = 18.3', near(c.score.depth, 18.3, 0.05), String(c.score.depth));
  ok('§8 spatial = 20 × (0.64 + 0.6 × 0.36) = 17.1', near(c.score.spatial, 17.1, 0.05), String(c.score.spatial));
  ok('§8 agreement 35 at u ≤ 6%', c.u <= 0.06 && c.score.agreement === 35);
}
{
  // Disagreeing kinds widen u through Q.
  const e = estimate([A('a', 'SALE', 4000, 'T1', 1, 0.05), A('b', 'SALE', 4100, 'T1', 1, 0.05), A('c', 'LISTING', 6000, 'T1', 1, 0.06), A('d', 'LISTING', 6100, 'T1', 1, 0.06)])!;
  ok('kinds disagree → Q > K − 1 → u widened', e.widened && e.q > 1, `Q ${e.q}`);
}

/* ---------- v2 single point, cleaning rules ---------- */
{
  const pin = { lat: lat0, lng: lng0 };
  const one = consensusFor('LAND', assessPoints([pt('o1', 'LAND', 'LISTING', 6000)], pin, now))!;
  ok('one listing → u = √(0.15² + 0.06²) = 16.2%', near(one.u, Math.sqrt(0.15 ** 2 + 0.06 ** 2), 1e-9), String(one.u));
  ok('one listing → range about ±20%', near((one.high - one.low) / 2 / one.rate, 0.207, 0.01));
  ok('one listing → agreement near 10 (not 35)', near(one.score.agreement, 9.6, 0.3), String(one.score.agreement));
  const und = assessPoints([{ ...pt('u1', 'LAND', 'LISTING', 6000), date: undefined, origin: 'LIVE_SEARCH' }], pin, now)[0];
  ok('undated live point → assumed, 12 months', und.dateSource === 'ASSUMED' && und.ageMonths === 12);
  const flat = { type: 'FLAT' as const, usage: 'RESIDENTIAL' as const };
  const mk = (id: string, quote: string, propertyType = '2 BHK flat'): MarketPoint => ({ ...pt(id, 'BUILT', 'LISTING', 6000), origin: 'LIVE_SEARCH', quote, propertyType, url: `https://x/${id}` });
  const b = assessPoints([mk('sb', '1,250 sq.ft. super built-up'), mk('ca', '850 sqft carpet'), mk('nb', '1000 sqft')], pin, now, flat);
  ok('super built-up rate × 1.25', near(b[0].corrected, 6000 * 0.86 * 1.25, 1e-6));
  ok('carpet rate ÷ 1.2', near(b[1].corrected, (6000 * 0.86) / 1.2, 1e-6));
  ok('basis not printed → × 1.25 and τ + 0.02', near(b[2].corrected, 6000 * 0.86 * 1.25, 1e-6) && near(b[2].tau, 0.08, 1e-12));
  const mixed = assessPoints([mk('c1', '', 'commercial shop'), mk('h1', '', '3 BHK independent house'), mk('f1', '', '2 BHK flat')], pin, now, flat);
  ok('usage mismatch dropped (commercial vs residential)', !mixed[0].used && /usage/.test(mixed[0].excludedReason ?? ''));
  ok('type mismatch dropped (house vs flat)', !mixed[1].used && /type/.test(mixed[1].excludedReason ?? ''));
  ok('matching flat kept', mixed[2].used);
  const dup = assessPoints([{ ...pt('d1', 'LAND', 'LISTING', 5000), url: undefined, locality: 'Kokapet', areaSqft: 1800 }, { ...pt('d2', 'LAND', 'LISTING', 5040), url: undefined, locality: 'Kokapet', areaSqft: 1810 }, { ...pt('d3', 'LAND', 'LISTING', 5040), url: undefined, locality: 'Kokapet', areaSqft: 2400 }], pin, now);
  ok('same locality, rate ±1%, area ±2% → duplicate; different area kept', dup[0].used && !dup[1].used && dup[2].used);
  const reg = assessPoints([{ ...pt('g1', 'LAND', 'SALE', 3000), registration: { considerationInr: 3000000, govtValueInr: 2950000 } }], pin, now)[0];
  ok('sale declared at government value (±5%) kept out of R', reg.atGuideline && !reg.used);
  const auc = assessPoints([{ ...pt('a9', 'LAND', 'AUCTION', 3000, 8000, 0) }], pin, now)[0];
  ok('auction 8 km away (T3) not in R', auc.tier === 'T3' && !auc.used);
  const out = assessPoints([5000, 5100, 4900, 5050, 9800].map((r, i) => pt(`x${i}`, 'LAND', 'LISTING', r)), pin, now);
  ok('log-MAD outlier dropped (9,800 among ~5,000)', !out[4].used && /robust SD/.test(out[4].excludedReason ?? ''), out[4].excludedReason);
  const far = assessPoints([{ ...pt('r1', 'LAND', 'LISTING', 5000, 3000, 0), gCompPerSqft: 1000 }, { ...pt('r2', 'LAND', 'LISTING', 5000, 3000, 0), gCompPerSqft: 2000 }], pin, now, { type: 'PLOT', usage: 'RESIDENTIAL', gLand: 1600 });
  ok('guideline ratio 1.6 drops the point', !far[0].used && /ratio 1.60/.test(far[0].excludedReason ?? ''));
  ok('guideline ratio 0.8 scales T2 point', far[1].used && near(far[1].corrected, 5000 * 0.86 * 0.8, 1e-6));
}

/* ---------- v2 Phase 1: purchase price C, blend, floor (doc worked example) ---------- */
{
  const market = { rawRate: 5332, u: 0.064 } as Consensus;
  const C = { applicable: true, category: 'LAND' as const, rate: 1.07 ** 5.4 * 4000, u: Math.min(0.3, 0.08 + 0.02 * 5.4) + 0.05 } as Parameters<typeof finalRate>[2];
  ok('doc example: R_C = ₹5,764, u_C = 23.8%', near(C!.rate, 5764, 1) && near(C!.u, 0.238, 1e-9));
  const f = finalRate('LAND', market, C, { rate: 2778, official: true, n: 1 })!;
  ok('doc example: weights B 93% / C 7%', near(f.wMarket, 0.933, 0.002) && near(f.wPurchase, 0.067, 0.002), `${f.wMarket}`);
  ok('doc example: R_final ₹5,360, range ₹4,940–₹5,790', f.rate === 5360 && f.low === 4940 && f.high === 5790, `${f.rate} ${f.low} ${f.high}`);
  ok('doc example: above the floor of ₹2,778', !f.floorApplied);
  const fresh = finalRate('LAND', market, { ...C!, u: 0.1 + 0.05 }, null)!;
  ok('purchase 1 year old → weight about 15%', near(fresh.wPurchase, 0.154, 0.005), String(fresh.wPurchase));
  const capped = finalRate('LAND', { rawRate: 5000, u: 0.2 } as Consensus, { ...C!, u: 0.1 }, null)!;
  ok('C weight capped at 30%', capped.capped && capped.wPurchase === 0.3);
  const floor = finalRate('LAND', { rawRate: 2500, u: 0.06 } as Consensus, null, { rate: 2778, official: true, n: 1 })!;
  ok('official government value is a floor', floor.floorApplied && floor.rate === 2780);
  const web = finalRate('LAND', { rawRate: 2500, u: 0.06 } as Consensus, null, { rate: 2778, official: false, n: 2 })!;
  ok('web-search guideline is not a floor', !web.floorApplied && web.rate === 2500);
}

/* ---------- v2 Telangana helpers ---------- */
ok('₹27,000 per sq yd = ₹3,000 per sqft', govRatePerSqft(27000, 'SQYD') === 3000);
ok('Telangana from state', isTelangana({ state: 'Telangana', address: '' }));
ok('Telangana from PIN 500075', isTelangana({ address: 'Plot 12, Kokapet 500075' }));
ok('Maharashtra is not Telangana', !isTelangana({ state: 'Maharashtra', address: 'Nagpur 440010' }));

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

/* ---------- v2 checks on a full case ---------- */
{
  const a = baseApp();
  a.property = { ...a.property, type: 'PLOT', builtUpSqft: null, floors: null, ageYears: null, constructionRate: null, plotAreaSqft: 1800 };
  a.documents = checklistFor('PLOT');
  a.floorPlan = undefined;
  a.ownership = { acquiredBy: 'PURCHASED', purchaseMonth: '2021-06', priceInr: 7200000, covered: 'PLOT', claimedValueInr: 20000000 };
  const e = evaluate(a, now);
  const pc = e.rates.purchase!;
  ok('purchase: 5.42 years, ₹4,000 paid, × 1.06^years', pc.applicable && near(pc.years, 65 / 12, 1e-9) && near(pc.paidRate, 4000, 1e-9) && near(pc.rate, 4000 * 1.06 ** (65 / 12), 1e-6), JSON.stringify({ y: pc.years, r: pc.rate, why: pc.reason }));
  ok('purchase: u_C = min(30%, 8% + 2% × 5.42) + 5% self-declared', near(pc.u, 0.08 + 0.02 * (65 / 12) + 0.05, 1e-9));
  ok('purchase enters the land rate with a weight', (e.rates.LAND?.wPurchase ?? 0) > 0 && e.valuation.landRate === e.rates.LAND?.rate);
  ok('T21 own purchase price checked', !!e.sanity.checks.find((c) => c.id === 'T21'));
  ok('T20 claim 2 Cr far above MV → WARN', e.sanity.checks.find((c) => c.id === 'T20')?.status === 'WARN');
  ok('MV range carried (land only)', e.valuation.mvLow !== null && e.valuation.mvLow < e.valuation.mv! && e.valuation.mvHigh! > e.valuation.mv!);
  a.market.points = [pt('far1', 'LAND', 'LISTING', 5000, 8000, 0)];
  a.ownership = undefined; // the purchase price would narrow the range below 15%
  const e2 = evaluate(a, now);
  ok('only T3 evidence → T13 BLOCKER (thin market)', e2.sanity.checks.find((c) => c.id === 'T13')?.status === 'BLOCKER');
  ok('wide range (u > 15%) → loan on the lower edge', e2.valuation.wideRange && near(e2.valuation.maxLoan, e2.valuation.mvLow! * e2.valuation.ltvCap, 1e-6));
  void runMeasure;
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
