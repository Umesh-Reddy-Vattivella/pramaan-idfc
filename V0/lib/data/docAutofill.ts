/* ------------------------------------------------------------------
   OCR facts → "Value a New Property" form patch (pure, deterministic).
   Every filled field carries provenance (document + verbatim quote) so
   the UI can badge it "AI · <document>" and the user can edit it.
   ------------------------------------------------------------------ */
import type { NewFloor, NewPropertyForm } from './newPropertyCase';
import type { DocFact, DocType } from '@/lib/engines/docFacts';
import { ageFromYear, DOC_TYPE_LABEL, parseRoadWidthFt, parseYear, usageFromText } from '@/lib/engines/docFacts';
import { normaliseDigits, parseAreaSqft } from '@/lib/engines/marketEvidence';

export interface DocInfo {
  name: string;
  docType: DocType;
  language: string;
  method: string;
}

export interface Provenance {
  doc: string;
  quote: string;
  derived?: string; // e.g. "2026 − 2016 = 10 years"
}

export type ProvKey = keyof NewPropertyForm;

export interface AutofillResult {
  patch: Partial<NewPropertyForm>;
  prov: Partial<Record<ProvKey, Provenance>>;
  conflicts: string[];
  notes: string[];
}

const sqftLabel = (n: number) => `${Math.round(n).toLocaleString('en-IN')} sqft`;
const norm = (s: string) => normaliseDigits(s).toUpperCase().replace(/\s+/g, '');

export function autofillFromFacts(facts: DocFact[], docs: DocInfo[], now: Date): AutofillResult {
  const patch: Partial<NewPropertyForm> = {};
  const prov: AutofillResult['prov'] = {};
  const conflicts: string[] = [];
  const notes: string[] = [];
  const docName = (i: number) => `${DOC_TYPE_LABEL[docs[i]?.docType ?? 'OTHER']} (${docs[i]?.name ?? '?'})`;
  const of = (field: DocFact['field']) => facts.filter((f) => f.field === field);
  // Prefer AI facts over pattern facts, then by document priority.
  const PRIORITY: DocType[] = ['SALE_DEED', 'LAND_RECORD', 'SANCTIONED_PLAN', 'PROPERTY_TAX', 'EB_BILL', 'OTHER'];
  const rank = (f: DocFact) => (f.origin === 'AI' ? 0 : 10) + PRIORITY.indexOf(docs[f.doc]?.docType ?? 'OTHER');
  const first = (field: DocFact['field']) => of(field).sort((a, b) => rank(a) - rank(b))[0];

  const setText = (key: ProvKey, f: DocFact | undefined) => {
    if (!f) return;
    (patch as Record<string, unknown>)[key] = f.value;
    prov[key] = { doc: docName(f.doc), quote: f.value };
  };

  /* Identity & location */
  const owner = first('OWNER_NAME');
  if (owner) {
    patch.applicantName = owner.value;
    prov.applicantName = { doc: docName(owner.doc), quote: owner.value };
  }
  setText('address', first('ADDRESS'));
  setText('locality', first('LOCALITY'));
  setText('city', first('CITY'));
  setText('state', first('STATE'));
  if (patch.address || patch.locality) {
    patch.title = `Property — ${[patch.locality, patch.city].filter(Boolean).join(', ') || patch.address}`;
  }

  /* Plot area: deed vs land record */
  const areas = of('PLOT_AREA')
    .map((f) => ({ f, sqft: parseAreaSqft(f.value) }))
    .filter((a): a is { f: DocFact; sqft: number } => a.sqft !== null);
  const deedArea = areas.find((a) => docs[a.f.doc]?.docType === 'SALE_DEED') ?? areas.find((a) => docs[a.f.doc]?.docType !== 'LAND_RECORD');
  const recordArea = areas.find((a) => docs[a.f.doc]?.docType === 'LAND_RECORD');
  if (deedArea) {
    patch.deedPlotAreaSqft = Math.round(deedArea.sqft * 100) / 100;
    prov.deedPlotAreaSqft = { doc: docName(deedArea.f.doc), quote: deedArea.f.value, derived: /sq\.?\s*f|sqft|square\s*f/i.test(deedArea.f.value) ? undefined : `${deedArea.f.value} → ${sqftLabel(deedArea.sqft)}` };
  }
  if (recordArea) {
    patch.recordPlotAreaSqft = Math.round(recordArea.sqft * 100) / 100;
    prov.recordPlotAreaSqft = { doc: docName(recordArea.f.doc), quote: recordArea.f.value, derived: /sq\.?\s*f|sqft|square\s*f/i.test(recordArea.f.value) ? undefined : `${recordArea.f.value} → ${sqftLabel(recordArea.sqft)}` };
    if (!deedArea) {
      patch.deedPlotAreaSqft = patch.recordPlotAreaSqft;
      prov.deedPlotAreaSqft = prov.recordPlotAreaSqft;
    }
  }
  if (deedArea && recordArea && Math.abs(deedArea.sqft - recordArea.sqft) / deedArea.sqft > 0.01) {
    conflicts.push(`Plot area differs: ${docName(deedArea.f.doc)} says "${deedArea.f.value}" (${sqftLabel(deedArea.sqft)}) but ${docName(recordArea.f.doc)} says "${recordArea.f.value}" (${sqftLabel(recordArea.sqft)}). Engine 1 values the lesser area.`);
  }

  /* Floors: sanctioned (plan) + actual */
  const floors = new Map<string, NewFloor>();
  const floorKey = (n?: string) => (n ?? 'Floor').replace(/\s+/g, ' ').trim();
  for (const f of [...of('FLOOR_AREA_SANCTIONED'), ...of('FLOOR_AREA_ACTUAL')]) {
    const sqft = parseAreaSqft(f.value);
    if (sqft === null) continue;
    const k = floorKey(f.floorName);
    const row = floors.get(k.toLowerCase()) ?? { floorName: k, sanctionedSqft: 0, actualSqft: 0 };
    const isPlan = f.field === 'FLOOR_AREA_SANCTIONED' || docs[f.doc]?.docType === 'SANCTIONED_PLAN';
    if (isPlan && !row.sanctionedSqft) row.sanctionedSqft = Math.round(sqft);
    if (!isPlan && !row.actualSqft) row.actualSqft = Math.round(sqft);
    floors.set(k.toLowerCase(), row);
  }
  if (floors.size) {
    const rows = [...floors.values()];
    const anyActual = rows.some((r) => r.actualSqft > 0);
    // Plan-only rows (e.g. a sanctioned TOTAL) must not be double-counted as built area when actual floors exist.
    patch.floors = anyActual ? rows : rows.map((r) => ({ ...r, actualSqft: r.sanctionedSqft }));
    const src = [...of('FLOOR_AREA_SANCTIONED'), ...of('FLOOR_AREA_ACTUAL')][0];
    prov.floors = { doc: docName(src.doc), quote: [...of('FLOOR_AREA_SANCTIONED'), ...of('FLOOR_AREA_ACTUAL')].map((f) => `${f.floorName ?? ''}: ${f.value}`).join(' · ') };
    if (!anyActual) notes.push('No document stated actual built-up areas — sanctioned areas copied as a starting point; confirm during owner capture.');
    if (anyActual && rows.some((r) => r.sanctionedSqft > 0 && r.actualSqft === 0)) {
      notes.push('A sanctioned area was stated as a total (not per floor) — enter per-floor sanctioned areas for an exact deviation check.');
    }
  }

  /* Sanctioned plan */
  const plan = first('PLAN_NUMBER');
  const planDoc = docs.findIndex((d) => d.docType === 'SANCTIONED_PLAN');
  if (plan || planDoc >= 0) {
    patch.hasSanctionedPlan = true;
    prov.hasSanctionedPlan = plan ? { doc: docName(plan.doc), quote: plan.value } : { doc: docName(planDoc), quote: 'Sanctioned plan document uploaded' };
  }

  /* Construction year → age (deterministic) */
  const yr = first('CONSTRUCTION_YEAR');
  const year = yr ? parseYear(yr.value) : null;
  const age = year !== null ? ageFromYear(year, now) : null;
  if (yr && age !== null) {
    patch.ageYears = age;
    patch.residualLifeYears = Math.max(0, 60 - age);
    prov.ageYears = { doc: docName(yr.doc), quote: yr.value, derived: `${now.getFullYear()} − ${year} = ${age} years` };
    prov.residualLifeYears = { doc: 'Derived', quote: '', derived: `60-year RCC life − ${age} = ${Math.max(0, 60 - age)} years (valuer to confirm)` };
  }

  /* Usage (tax class / tariff / land use) */
  const usages = of('USAGE').map((f) => ({ f, u: usageFromText(f.value) })).filter((x) => x.u !== null);
  if (usages.length) {
    patch.usage = usages[0].u!;
    prov.usage = { doc: docName(usages[0].f.doc), quote: usages[0].f.value };
    const distinct = [...new Set(usages.map((x) => x.u))];
    if (distinct.length > 1) conflicts.push(`Usage differs across documents (${usages.map((x) => `"${x.f.value}"`).join(' vs ')}). Engine 3 applies the LOWER LTV band.`);
  }

  /* Road width */
  const road = first('ROAD_WIDTH');
  const w = road ? parseRoadWidthFt(road.value) : null;
  if (road && w !== null) {
    patch.roadWidthFt = w;
    prov.roadWidthFt = { doc: docName(road.doc), quote: road.value };
  }

  /* Survey numbers: deed vs land record (feeds Auto-QC rule 6) */
  const surveys = of('SURVEY_NUMBER');
  // Stored with ASCII digits (११२/२ → 112/2) so deed and land record compare correctly in Auto-QC.
  const uniq = (xs: DocFact[]) => [...new Map(xs.map((x) => [norm(x.value), normaliseDigits(x.value).trim()])).values()];
  const deedSurveys = uniq(surveys.filter((s) => docs[s.doc]?.docType !== 'LAND_RECORD'));
  const recordSurveys = uniq(surveys.filter((s) => docs[s.doc]?.docType === 'LAND_RECORD'));
  if (deedSurveys.length) {
    patch.surveyDeed = deedSurveys.join(', ');
    prov.surveyDeed = { doc: 'Sale deed / other documents', quote: deedSurveys.join(', ') };
  }
  if (recordSurveys.length) {
    patch.surveyRecord = recordSurveys.join(', ');
    prov.surveyRecord = { doc: 'Land record', quote: recordSurveys.join(', ') };
  }
  if (deedSurveys.length && recordSurveys.length) {
    const a = new Set(deedSurveys.map(norm));
    const b = new Set(recordSurveys.map(norm));
    if ([...a].some((x) => !b.has(x)) || [...b].some((x) => !a.has(x))) {
      conflicts.push(`Survey numbers differ: deed [${deedSurveys.join(', ')}] vs land record [${recordSurveys.join(', ')}] — Auto-QC will flag a Rectification Deed requirement.`);
    }
  }

  /* Boundaries (deed) */
  const b = (k: DocFact['field']) => first(k)?.value;
  const E = b('BOUNDARY_EAST'), W = b('BOUNDARY_WEST'), N = b('BOUNDARY_NORTH'), S = b('BOUNDARY_SOUTH');
  if (E || W || N || S) {
    patch.deedBoundaries = { East: E ?? '', West: W ?? '', North: N ?? '', South: S ?? '' };
    const bf = first('BOUNDARY_EAST') ?? first('BOUNDARY_WEST') ?? first('BOUNDARY_NORTH') ?? first('BOUNDARY_SOUTH')!;
    prov.deedBoundaries = { doc: docName(bf.doc), quote: [E && `E: ${E}`, W && `W: ${W}`, N && `N: ${N}`, S && `S: ${S}`].filter(Boolean).join(' · ') };
  }

  patch.docsRead = docs.map((d) => ({ name: d.name, docType: DOC_TYPE_LABEL[d.docType], language: d.language, method: d.method }));
  return { patch, prov, conflicts, notes };
}
