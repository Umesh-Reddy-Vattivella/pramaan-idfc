/* ------------------------------------------------------------------
   PRAMAAN Definition-of-Done verification (PRD §7 / §7.1).
   Run: npm run verify      (optional: npm run verify -- <outDir> to write PDFs)
   Asserts the exact deterministic figures for Case 1, R1, R2, R3, the
   Auto-QC catches, stress-test flips, capture fraud blocks, offline upload
   fallback, and that the IDFC PDF builds for every case.
   ------------------------------------------------------------------ */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_CASES } from '../lib/data/seedCases';
import { evaluateCase } from '../lib/engines/evaluateCase';
import { formatPctTrunc, parseIndianRupeeWords } from '../lib/engines/valuation';
import { baselineStressInputs, runStressTest } from '../lib/engines/stressTest';
import { buildCaptureCase, CAPTURE_SITE } from '../lib/data/captureTemplate';
import { extractionToCase, sanitizeExtraction, simulatedExtraction } from '../lib/live/extraction';
import { buildIdfcPdf } from '../lib/pdf/generateIdfcPdf';
import {
  aggregateLiveEvidence,
  correctionFactor,
  extractRatesFromText,
  monthsSince,
  outlierFlags,
  parseAreaSqft,
  parseInrAmount,
  parseRatePerSqft,
  pointRate,
  quoteInSource,
  tierFromDistanceKm,
} from '../lib/engines/marketEvidence';
import { buildNewPropertyCase, EMPTY_FORM } from '../lib/data/newPropertyCase';
import { ageFromYear, classifyDocType, detectLanguage, parseRoadWidthFt, parseYear, patternFacts, usageFromText } from '../lib/engines/docFacts';
import { normaliseDigits } from '../lib/engines/marketEvidence';
import { autofillFromFacts } from '../lib/data/docAutofill';
import type { GeoPhoto, MarketDataPoint } from '../lib/types';
import { checkCaptureLocation } from '../lib/engines/geofence';
import { knownObjectLengthFt, REFERENCE_OBJECTS, roomsVsPlan } from '../lib/engines/measure';
import { residualLife } from '../lib/engines/valuation';
import { parcelGeometry } from '../lib/mapGeometry';
import { applySubmission, buildPrefill, decodePrefill, encodePrefill } from '../lib/data/customerLink';
import { buildDemoApplication } from '../lib/data/demoApplication';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${label}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
const truthy = (label: string, cond: boolean) => check(label, cond, true);

const byLabel = (l: string) => SEED_CASES.find((c) => (c.benchmarkLabel ?? 'C1') === l)!;
const ev = (l: string) => evaluateCase(byLabel(l));
const qc = (e: ReturnType<typeof evaluateCase>, id: string) => e.autoQc.findings.find((f) => f.ruleId === id)!;

console.log('\n§7.1-2  Exact deterministic figures');
const c1 = ev('C1');
check('Case 1 MV', c1.valuation.mvFinalRounded, 23528400);
check('Case 1 FSV', Math.round(c1.valuation.fsv), 19999140);
check('Case 1 Max Loan', Math.round(c1.valuation.maxCollateralLoan), 16469880);
check('Case 1 S', c1.price.authenticity.score, 91);
check('Case 1 route', c1.routing.tier, 'INSTANT');
check('Case 1 BUA dev', formatPctTrunc(c1.measure.buaDeviationPct!), '2.14%');

const r1 = ev('R1');
check('R1 MV (land-only)', r1.valuation.mvFinalRounded, 31941000);
check('R1 building value', r1.valuation.landBuilding.buildingValue, 0);
check('R1 FSV', Math.round(r1.valuation.fsv), 25552800);
check('R1 consensus (Rs.10)', r1.valuation.rConsensusRounded, 9060);
check('R1 land @ consensus', r1.valuation.landValueAtConsensus, 32153940);
check('R1 A_net', r1.measure.aNet, 3549);
check('R1 BUA dev', formatPctTrunc(r1.measure.buaDeviationPct!), '14.96%');
check('R1 S', r1.price.authenticity.score, 84);
check('R1 route', r1.routing.tier, 'REMOTE_REVIEW');

const r2 = ev('R2');
check('R2 MV', r2.valuation.mvFinalRounded, 201060000);
check('R2 FSV', Math.round(r2.valuation.fsv), 160848000);
check('R2 gross yield', r2.valuation.income!.grossYieldPct.toFixed(2), '9.55');
check('R2 BUA dev', formatPctTrunc(r2.measure.buaDeviationPct!), '52.68%');
check('R2 BUA dev incl. tin shed', formatPctTrunc(r2.measure.buaDeviationPctInclTemporary!), '81.85%');
check('R2 S', r2.price.authenticity.score, 74);
check('R2 route', r2.routing.tier, 'PHYSICAL_CHECK');

const r3 = ev('R3');
check('R3 MV', r3.valuation.mvFinalRounded, 33975200);
check('R3 FSV', Math.round(r3.valuation.fsv), 28878920);
check('R3 Max Loan', Math.round(r3.valuation.maxCollateralLoan), 23782640);
check('R3 depreciation', (r3.valuation.landBuilding.depreciationD * 100).toFixed(2), '21.36');
check('R3 circle gap', r3.price.circleGapMultiple!.toFixed(2), '7.82');
check('R3 requested-loan LTV', formatPctTrunc(r3.valuation.requestedLoanLtvPct!, 1), '58.8%');
check('R3 S', r3.price.authenticity.score, 78);
check('R3 route', r3.routing.tier, 'REMOTE_REVIEW');
check('R3 words', r3.valuation.amountInWords, 'Three Crore Thirty Nine Lakh Seventy Five Thousand Two Hundred Rupees Only');

console.log('\n§7.1-3  Auto-QC catches');
check("R3 QC-1 'Fifty Five Lakh' words", qc(r3, 'QC-1').status, 'CRITICAL_FAIL');
check('R3 legacy words parse', parseIndianRupeeWords(byLabel('R3').legacyStatedValueWords!), 5560020);
check('R3 QC-6 survey mismatch', qc(r3, 'QC-6').status, 'FAIL');
truthy('R3 QC-6 transposition catch (174A/1A)', qc(r3, 'QC-6').pramaanDetection.includes('174A/1A'));
check('R3 QC-2 date conflict', qc(r3, 'QC-2').status, 'FAIL');
truthy('R3 QC-2 cites 04.07.2026 vs 07.08.2026', qc(r3, 'QC-2').pramaanDetection.includes('04.07.2026') && qc(r3, 'QC-2').pramaanDetection.includes('07.08.2026'));
check("R2 QC-3 52.68% 'Low' risk", qc(r2, 'QC-3').status, 'CRITICAL_FAIL');
truthy('R2 QC-3 cites 52.68%', qc(r2, 'QC-3').pramaanDetection.includes('52.68%'));
check('R2 QC-6 74 m geo-tag', qc(r2, 'QC-6').status, 'FAIL');
truthy('R2 QC-6 cites 74 m', qc(r2, 'QC-6').pramaanDetection.includes('74 m'));
check("R1 QC-5 'under-construction' vs 100%", qc(r1, 'QC-5').status, 'FAIL');
check('Case 1 all QC PASS', c1.autoQc.findings.every((f) => f.status === 'PASS'), true);

console.log('\n§7.1-4  Stress-test sliders flip the cascade');
const sc = byLabel('C1');
const b = baselineStressInputs(c1, sc);
check('Baseline reproduces engine route', runStressTest(sc, c1, b).tier, 'INSTANT');
check('Baseline reproduces engine S', runStressTest(sc, c1, b).score, 91);
check('Overstatement x=5% → Remote', runStressTest(sc, c1, { ...b, overstatementPct: 5 }).tier, 'REMOTE_REVIEW');
check('LTV_true = 70% × 1.05', runStressTest(sc, c1, { ...b, overstatementPct: 5 }).ltvTruePct.toFixed(1), '73.5');
check('Thin comps + District → Physical', runStressTest(sc, c1, { ...b, compsCount: 3, spatialTier: 'DISTRICT' }).tier, 'PHYSICAL_CHECK');

console.log('\n§7.1-5  Owner capture: success + fraud blocks');
const draft = {
  caseId: 'self-capture-verify', channel: 'OWNER_APP' as const, capturePoint: { lat: CAPTURE_SITE.lat, lng: CAPTURE_SITE.lng },
  gpsInParcel: true, liveCameraOnly: true, deviceAttested: true, sunAngleMatched: true, floorsWalked: 3,
  docs: ['SALE_DEED', 'SANCTIONED_PLAN', 'EB_BILL', 'PROPERTY_TAX'] as ('SALE_DEED' | 'SANCTIONED_PLAN' | 'EB_BILL' | 'PROPERTY_TAX')[], startedAt: 0, finishedAt: 300000,
};
check('Clean capture → INSTANT', evaluateCase(buildCaptureCase(draft)).routing.tier, 'INSTANT');
check('Omission fraud → trust blocked', evaluateCase(buildCaptureCase({ ...draft, floorsWalked: 2 })).trust.omissionFraudBlock, true);
check('Mock GPS → trust blocked', evaluateCase(buildCaptureCase({ ...draft, gpsInParcel: false, deviceAttested: false })).trust.allPassed, false);
check('Gallery upload → trust blocked', evaluateCase(buildCaptureCase({ ...draft, liveCameraOnly: false, sunAngleMatched: false })).trust.allPassed, false);

console.log('\n§5.3  Live upload offline fallback');
const simCase = extractionToCase(simulatedExtraction(['report.pdf']), { id: 'live-upload-verify', mode: 'SIMULATED', fileNames: ['report.pdf'], tatMinutes: 1 });
const simEv = evaluateCase(simCase);
truthy('Simulated extraction evaluates (MV > 0)', simEv.valuation.mvFinal > 0);
check('Simulated words consistent with figure (QC-1)', qc(simEv, 'QC-1').status, 'PASS');
check('Sanitiser masks 12-digit IDs', sanitizeExtraction({ applicantName: 'Owner 1234 5678 9012' }).applicantName, 'Owner [masked]');
check('Sanitiser normalises FSV 80 → 0.8', sanitizeExtraction({ fsvRatio: 80 }).fsvRatio, 0.8);

console.log('\nLive market evidence engine (Value a New Property)');
{
  const now = new Date(2026, 10, 22);
  const subj = { lat: 21.14, lng: 79.06 };
  const near = { lat: 21.143, lng: 79.062 }; // ≈ 0.4 km away
  const pt = (id: string, kind: MarketDataPoint['kind'], extra: Partial<MarketDataPoint>): MarketDataPoint => ({ id, kind, origin: 'LIVE_SEARCH', included: true, ...near, ...extra });
  check('pointRate = price ÷ area', pointRate(pt('a', 'LISTING', { priceInr: 9000000, areaSqft: 1200 })), 7500);
  check('pointRate prefers stated rate', pointRate(pt('a', 'LISTING', { priceInr: 9000000, areaSqft: 1200, statedRatePerSqft: 7000 })), 7000);
  check('Listing correction (1 − 0.14)', correctionFactor('LISTING'), 0.86);
  check('Auction correction (÷ 0.80)', correctionFactor('AUCTION'), 1.25);
  check('monthsSince 2026-05 → 6', monthsSince('2026-05', now), 6);
  check('Tukey outlier flagged', outlierFlags([8000, 8200, 8400, 30000]).join(','), 'false,false,false,true');
  check('Tier ≤1 km', tierFromDistanceKm(0.8), 'MICRO_1KM');
  check('Tier ≤3 km', tierFromDistanceKm(2.5), 'WARD_VILLAGE');
  check('Tier ≤10 km', tierFromDistanceKm(7), 'SRO_ZONE');
  check('Tier unknown → District', tierFromDistanceKm(null), 'DISTRICT');
  const agg = aggregateLiveEvidence(
    [
      pt('l1', 'LISTING', { statedRatePerSqft: 8000, date: '2026-09' }),
      pt('l2', 'LISTING', { statedRatePerSqft: 8200, date: '2026-10' }),
      pt('l3', 'LISTING', { statedRatePerSqft: 8400, date: '2026-08' }),
      pt('l4', 'LISTING', { statedRatePerSqft: 30000, date: '2026-10' }),
      pt('a1', 'AUCTION', { priceInr: 9000000, areaSqft: 1500, date: '2026-03' }),
      pt('g1', 'GUIDELINE', { statedRatePerSqft: 2800 }),
      pt('x1', 'LISTING', { statedRatePerSqft: 9999, included: false }),
    ],
    subj,
    now,
  );
  const lst = agg.priceSources.find((s) => s.id === 'LISTINGS')!;
  const auc = agg.priceSources.find((s) => s.id === 'AUCTIONS')!;
  check('Outlier excluded from listings', agg.outliers.join(','), 'l4');
  check('Listings raw = median 8,200', lst.rawRatePerSqft, 8200);
  check('Listings corrected = 8,200 × 0.86', lst.correctedRatePerSqft, 7052);
  check('Auction corrected = 6,000 ÷ 0.80', auc.correctedRatePerSqft, 7500);
  check('Guideline → circle rate (weight 0)', agg.circleRatePerSqft, 2800);
  check('Weights sum to 1', Math.round(agg.priceSources.reduce((s, x) => s + x.weight, 0) * 1000) / 1000, 1);
  check('Spatial tier from distance', agg.spatialTier, 'MICRO_1KM');
  check('Comparable pins (excl. guideline, outlier, unticked)', agg.comparables.length, 4);
  const form = { ...EMPTY_FORM, lat: subj.lat, lng: subj.lng, city: 'Nagpur', deedPlotAreaSqft: 1500, floors: [{ floorName: 'GF', sanctionedSqft: 1000, actualSqft: 1000 }], constructionRatePerSqft: 1800 };
  const noCap = evaluateCase(buildNewPropertyCase('live-market-test01', form, agg, null, 5));
  truthy('New-property case values (MV > 0)', noCap.valuation.mvFinal > 0);
  check('No owner capture → Trust not passed', noCap.trust.allPassed, false);
  check('No owner capture → not an omission-fraud block', noCap.trust.omissionFraudBlock, false);
  check('Capture completed → Trust passes', evaluateCase(buildNewPropertyCase('live-market-test02', { ...form, captureCompleted: true }, agg, null, 5)).trust.allPassed, true);
}

console.log('\nPrinted price / area parsers (real formats seen in live search results)');
check('"₹15 Lac" → 15,00,000', parseInrAmount('₹15 Lac'), 1500000);
check('"₹1.14 Cr" → 1,14,00,000', parseInrAmount('₹1.14 Cr'), 11400000);
check('"₹ 24,00,000" → 24,00,000', parseInrAmount('₹ 24,00,000'), 2400000);
check('"5000 sqft" → 5000', parseAreaSqft('5000 sqft'), 5000);
check('"200 sq yd" → 1800 sqft', parseAreaSqft('200 sq yd'), 1800);
check('"1 acre" → 43560 sqft', parseAreaSqft('1 acre'), 43560);
check('"₹1,200/sqft" → 1200', parseRatePerSqft('₹1,200/sqft'), 1200);
check('"INR 8.33 K/ sq.ft" → 8330', parseRatePerSqft('INR 8.33 K/ sq.ft'), 8330);
check('"17500/- per sq.ft" → 17500', parseRatePerSqft('17500/- per sq.ft'), 17500);
check('"₹45,000 per sq yd" → 5000', parseRatePerSqft('₹45,000 per sq yd'), 5000);
check('Area without unit → null', parseAreaSqft('5000'), null);
check('Quote present in source', quoteInSource('₹15 Lac', 'Plots ; ₹15 Lac · 5000 sqft · A'), true);
check('Invented quote rejected', quoteInSource('₹19 Lac', 'Plots ; ₹15 Lac · 5000 sqft · A'), false);
check('Regex fallback finds rate', extractRatesFromText('Find this plot at ₹12 Lac (₹1,200/sqft). It spans').map((x) => x.rate).join(','), '1200');

console.log('\nDocument OCR autofill (deterministic parts)');
{
  const now = new Date(2026, 10, 22);
  check('Language: Devanagari → Hindi / Marathi', detectLanguage('गाव : अजनी तालुका : नागपूर सर्वे क्रमांक 112/2'), 'Hindi / Marathi (Devanagari)');
  check('Language: Tamil', detectLanguage('பட்டா எண் 305278 புல எண் 173A/1F'), 'Tamil');
  check('Language: English', detectLanguage('Sale deed executed at Nagpur'), 'English');
  check('Doc type: sale deed', classifyDocType('This Sale Deed is executed between the Vendor and the Purchaser'), 'SALE_DEED');
  check('Doc type: 7/12 extract', classifyDocType('7/12 EXTRACT - LAND RECORD Village Ajni'), 'LAND_RECORD');
  check('Doc type: Marathi 7/12', classifyDocType('गाव नमुना सातबारा उतारा'), 'LAND_RECORD');
  check('Doc type: sanctioned plan', classifyDocType('Building Permission / Sanctioned Plan No. NMC/BP/2015/0417'), 'SANCTIONED_PLAN');
  check('Age from 2016 (in 2026)', ageFromYear(2016, now), 10);
  check('Usage: LT-I Residential tariff', usageFromText('LT-I Residential'), 'RESIDENTIAL');
  check('Usage: commercial tax class', usageFromText('Tax class: Commercial'), 'COMMERCIAL');
  check('Road width "9 m wide road" → 29.53 ft', parseRoadWidthFt('9 m wide road'), 29.53);
  check('Hectare area → sqft', parseAreaSqft('0.0167 Hectare'), 1797.5713);
  check('"167.22 sq. m. (1800 sq. ft.)" → 1800 (own-unit pairing)', parseAreaSqft('167.22 sq. m. (1800 sq. ft.)'), 1800);
  check('"0.0167 Hectare (167.0 sq. m)" → first pair', parseAreaSqft('0.0167 Hectare (167.0 sq. m)'), 1797.5713);
  check('Devanagari digits "११२/२" → "112/2"', normaliseDigits('११२/२'), '112/2');
  check('Tamil digits "௧௭௩" → "173"', normaliseDigits('௧௭௩'), '173');
  check('Marathi "०.०१६७ हे.आर" → hectare → sqft', parseAreaSqft('०.०१६७ हे.आर'), 1797.5713);
  check('Marathi "१६७ चौ.मी" → sqft', parseAreaSqft('१६७ चौ.मी'), 1797.5713);
  check('Hindi "1800 वर्ग फुट" → 1800', parseAreaSqft('1800 वर्ग फुट'), 1800);
  check('Tamil "1800 சதுர அடி" → 1800', parseAreaSqft('1800 சதுர அடி'), 1800);
  check('Marathi "२ गुंठे" → 2178 sqft', parseAreaSqft('२ गुंठे'), 2178);
  check('"4.50 Ares" → 4843.755 sqft', parseAreaSqft('4.50 Ares'), 4843.755);
  check('Year in Devanagari "२०१६"', parseYear('बांधकाम वर्ष २०१६'), 2016);
  truthy('Quote check tolerant of digit script', quoteInSource('112/2', 'भूमापन क्रमांक : ११२/२'));
  const mixed = autofillFromFacts(
    [
      { field: 'SURVEY_NUMBER', value: 'Khasra No. 112/2'.replace('Khasra No. ', ''), doc: 0, origin: 'AI' },
      { field: 'SURVEY_NUMBER', value: '११२/२', doc: 1, origin: 'AI' },
    ],
    [
      { name: 'deed.pdf', docType: 'SALE_DEED', language: 'English', method: 'text' },
      { name: '712.jpg', docType: 'LAND_RECORD', language: 'Hindi / Marathi (Devanagari)', method: 'vision' },
    ],
    now,
  );
  check('Survey 112/2 (deed) vs ११२/२ (7/12) → no false conflict', mixed.conflicts.length, 0);
  check('Survey stored with ASCII digits', mixed.patch.surveyRecord, '112/2');
  const deedText = 'SALE DEED ... Khasra No. 112/2, Mouza Ajni. Area of plot: 167.22 sq. m. (1800 sq. ft.) constructed in the year 2016.';
  const pf = patternFacts(deedText, 0);
  check('Pattern: survey number', pf.find((x) => x.field === 'SURVEY_NUMBER')?.value, '112/2');
  check('Pattern: plot area', pf.find((x) => x.field === 'PLOT_AREA')?.value, '167.22 sq. m');
  check('Pattern: construction year', pf.find((x) => x.field === 'CONSTRUCTION_YEAR')?.value, '2016');
  const docs = [
    { name: 'deed.pdf', docType: 'SALE_DEED' as const, language: 'English', method: 'PDF text layer' },
    { name: '712.jpg', docType: 'LAND_RECORD' as const, language: 'English', method: 'Vision OCR' },
  ];
  const af = autofillFromFacts(
    [
      { field: 'PLOT_AREA', value: '1800 sq. ft.', doc: 0, origin: 'AI' },
      { field: 'PLOT_AREA', value: '167.0 sq. m', doc: 1, origin: 'AI' },
      { field: 'CONSTRUCTION_YEAR', value: '2016', doc: 0, origin: 'AI' },
      { field: 'SURVEY_NUMBER', value: '112/2', doc: 0, origin: 'AI' },
      { field: 'SURVEY_NUMBER', value: '112/3', doc: 1, origin: 'AI' },
      { field: 'USAGE', value: 'LT-I Residential', doc: 0, origin: 'AI' },
      { field: 'FLOOR_AREA_SANCTIONED', value: '1,050 sq ft', floorName: 'Ground floor', doc: 0, origin: 'AI' },
    ],
    docs,
    now,
  );
  check('Autofill: deed area', af.patch.deedPlotAreaSqft, 1800);
  check('Autofill: record area 167.0 sq m → sqft', af.patch.recordPlotAreaSqft, 1797.57);
  check('Autofill: age 10, residual 50', `${af.patch.ageYears}/${af.patch.residualLifeYears}`, '10/50');
  check('Autofill: usage', af.patch.usage, 'RESIDENTIAL');
  check('Autofill: survey deed vs record', `${af.patch.surveyDeed}|${af.patch.surveyRecord}`, '112/2|112/3');
  truthy('Autofill: survey mismatch flagged', af.conflicts.some((c) => c.includes('Survey numbers differ')));
  check('Autofill: area within 1% → no area conflict', af.conflicts.some((c) => c.includes('Plot area differs')), false);
  check('Autofill: provenance keeps verbatim quote', af.prov.recordPlotAreaSqft?.quote, '167.0 sq. m');
}

console.log('\nMentor review: Technical Sanity engine (remarks pre-empted on Day 0)');
const sStat = (e: ReturnType<typeof evaluateCase>, id: string) => e.sanity.checks.find((x) => x.id === id)!.status;
check('C1 sanity verdict', c1.sanity.verdict, 'TECHNICALLY_CLEAR');
check('R1 no approved plan → BLOCKER', sStat(r1, 'S7'), 'BLOCKER');
check('R1 verdict', r1.sanity.verdict, 'NOT_MORTGAGEABLE');
check('R1 FSI 14.96% → compoundable WARN', sStat(r1, 'S5'), 'WARN');
check('R1 road widening flagged', sStat(r1, 'S10'), 'WARN');
check('R2 FSI 52.68% → FAIL', sStat(r2, 'S5'), 'FAIL');
check('R2 plan 74 m off site → FAIL', sStat(r2, 'S8'), 'FAIL');
check('R2 unapproved 5th floor + tin shed → FAIL', sStat(r2, 'S9'), 'FAIL');
check('R3 survey mismatch → FAIL', sStat(r3, 'S2'), 'FAIL');
check('R3 no approved plan → BLOCKER', sStat(r3, 'S7'), 'BLOCKER');
check('Routes unchanged by sanity layer (R1)', r1.routing.tier, 'REMOTE_REVIEW');
truthy('Sanity blocker adds a Remote trigger (R3)', r3.routing.remoteTriggers.some((t) => t.includes('technical-sanity blocker')));

console.log('\nMentor review: geo-fence replaces KYC');
{
  const base = byLabel('C1');
  const parcel = parcelGeometry(base).parcel;
  const shot = (slot: string, northM: number, ageMs = 1000): GeoPhoto => ({
    id: slot, slot, label: slot, lat: base.lat + northM / 111320, lng: base.lng, accuracyM: 8, takenAt: '2026-11-26T10:00:00Z', fileAgeMs: ageMs, hash: 'x',
  });
  const atSite = ['FRONT', 'ROAD', 'LEFT', 'RIGHT'].map((s) => shot(s, 3));
  check('4 photos at the property → PASS', checkCaptureLocation(atSite, base, parcel).status, 'PASS');
  check('Photo from residence 50 km away → FAIL', checkCaptureLocation([...atSite, shot('REAR', 50000)], base, parcel).status, 'FAIL');
  check('Photo 60 m away → WARN (re-shoot)', checkCaptureLocation([...atSite, shot('REAR', 60)], base, parcel).status, 'WARN');
  check('Gallery image (1 day old) → FAIL', checkCaptureLocation([...atSite.slice(1), shot('FRONT', 3, 86400000)], base, parcel).status, 'FAIL');
  check('Only 3 exterior photos → WARN', checkCaptureLocation(atSite.slice(0, 3), base, parcel).status, 'WARN');

  const demo = buildDemoApplication('los-verify', {
    borrowerName: 'V', address: 'A', city: 'Nagpur', state: 'Maharashtra', lat: 21.15, lng: 79.08, usage: 'RESIDENTIAL', plotAreaSqft: 1500,
    floorCount: 2, approvedSqftPerFloor: 1000, builtSqftPerFloor: 1000, hasApprovedPlan: true, ageYears: 8, structure: 'RCC_FRAMED',
  });
  const p = buildPrefill(demo, 'tok12345abcd');
  check('Prefill round-trips through the URL fragment', decodePrefill(encodePrefill(p))?.propertyAddress, p.propertyAddress);
  check('Demo application before capture: not Instant', evaluateCase(demo).routing.tier !== 'INSTANT', true);
  const dshot = (slot: string, northM: number): GeoPhoto => ({ ...shot(slot, 0), lat: demo.lat + northM / 111320, lng: demo.lng });
  const sub = {
    submittedAt: '2026-11-26T10:00:00Z', capturedBy: 'FAMILY' as const, documents: p.documents,
    photos: [...['FRONT', 'ROAD', 'LEFT', 'RIGHT'].map((s) => dshot(s, 2)), dshot('INTERIOR:Ground Floor', 1), dshot('INTERIOR:First Floor', 1)],
    rooms: [{ id: 'r1', name: 'Hall', floorName: 'Ground Floor', lengthFt: 20, widthFt: 15, method: 'TAPE' as const }],
  };
  const link = { token: 'tok12345abcd', url: 'x', sentAt: '2026-11-26T09:00:00Z', status: 'SENT' as const };
  const done = { ...demo, ...applySubmission(demo, link, sub) };
  const de = evaluateCase(done);
  check('Capture by family member at site → geo-fence PASS', de.geofence?.status, 'PASS');
  check('Both floors evidenced → coverage locked', done.trustChecks.floorCoverageLocked, true);
  check('Rooms within approved area → S6 PASS', sStat(de, 'S6'), 'PASS');
  const away = { ...demo, ...applySubmission(demo, link, { ...sub, photos: sub.photos.map((x) => ({ ...x, lat: x.lat + 0.45 })) }) };
  check('Same capture 50 km away → S1 FAIL', sStat(evaluateCase(away), 'S1'), 'FAIL');
}

console.log('\nMentor review: measurement & residual life');
check('Residual life RCC, age 8 → 52', residualLife('RCC_FRAMED', 8).residualLifeYears, 52);
check('Residual life load-bearing, age 14 → 36', residualLife('LOAD_BEARING', 14).residualLifeYears, 36);
check('A4 reference scaling (400 px wall / 40 px A4)', knownObjectLengthFt(400, 40, REFERENCE_OBJECTS.A4_LONG.ft).toFixed(2), '9.74');
{
  const rv = roomsVsPlan([{ floorName: 'GF', lengthFt: 30, widthFt: 40 }], [{ floorName: 'GF', sanctionedSqft: 1000, actualSqft: 1000 }]);
  check('Rooms 1,200 carpet → 1,440 BUA vs 1,000 approved → exceeds', rv.anyExceeds, true);
}

console.log('\n§7.1-6  PDF export builds for every case');
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });
for (const c of SEED_CASES) {
  const signed = { ...c, esignStatus: 'SIGNED_BY_VALUER' as const, signedByValuer: { name: 'Demo Registered Valuer A', ibbiRegNo: 'IBBI/RV/DEMO/2026/0001', timestamp: '2026-11-21T10:00:00.000Z', validUntil: '2027-02-19T10:00:00.000Z', signatureHash: 'f'.repeat(64) } };
  const { doc, filename } = buildIdfcPdf(signed, evaluateCase(signed));
  const bytes = doc.output('arraybuffer').byteLength;
  truthy(`${c.benchmarkLabel ?? 'C1'} PDF: ${doc.getNumberOfPages()} pages, ${(bytes / 1024).toFixed(0)} KB`, doc.getNumberOfPages() >= 2 && bytes > 5000);
  if (outDir) writeFileSync(join(outDir, filename), Buffer.from(doc.output('arraybuffer')));
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
