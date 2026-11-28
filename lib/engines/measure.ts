/* ------------------------------------------------------------------
   Measurement — pure.
   Plot: deed area vs satellite plot boundary.
   Building: floor-wise areas taken from the floor plan (government copy or
   customer upload), checked against the satellite top view:
     expected BUA = roof footprint (drawn on the satellite image) × floors
     delta       = (plan total − expected) ÷ expected
   The delta, the floor count and the plan's source give a measurement
   confidence score (0–100). Units (flat / shop) sit in a larger building, so
   their plan area is checked against the deed area instead.
   ------------------------------------------------------------------ */
import type { Application, DocSlot } from '@/lib/domain/types';
import { FLOOR_PLAN_DOC, isBuilt, isUnit } from '@/lib/domain/catalog';
import { VALUATION as V } from '@/config/valuation';
import { polygonAreaSqm, SQFT_PER_SQM } from './stats';

/** Carpet → built-up loading (walls, ducts, staircase share). */
export const CARPET_TO_BUA = 1.2;
export const PLOT_AREA_TOLERANCE_PCT = 10;

export interface FloorPlanRow {
  floor: string;
  /** As printed on the plan. */
  areaSqft: number;
  /** Built-up (carpet × 1.2 when the plan prints carpet). */
  buaSqft: number;
}

export interface AreaConfidence {
  /** 0–70 from |delta|: ≤ 5% full, ≥ 30% zero. */
  agreement: number;
  /** 0–15: floors on the plan = floors seen on the call (8 if only the declaration matches). */
  floors: number;
  /** 0–15: government copy / customer upload, verified or not. */
  source: number;
  total: number;
  band: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MeasureResult {
  deedPlotSqft: number | null;
  satellitePlotSqft: number | null;
  plotVariancePct: number | null;
  /** min(deed, satellite) — conservative land area. */
  landAreaSqft: number | null;
  /** Floor-wise areas from the floor plan. */
  floorPlan: FloorPlanRow[];
  /** Σ floor-wise built-up area from the plan. */
  planBuaSqft: number | null;
  declaredBuaSqft: number | null;
  /** Roof outline area on the satellite top view. */
  footprintSqft: number | null;
  /** Floors multiplied with the footprint, and where that count came from. */
  floorsForCheck: number | null;
  floorsBasis: 'OBSERVED' | 'DECLARED' | 'PLAN' | null;
  /** footprint × floors (buildings) — the independent estimate. */
  satelliteBuaSqft: number | null;
  /** What the plan total was checked against. */
  checkBasis: 'SATELLITE' | 'DEED' | null;
  /** (plan total − check area) ÷ check area × 100. */
  areaDeltaPct: number | null;
  confidence: AreaConfidence | null;
  /** Actual BUA used for the checks: floor plan if entered, else declared. */
  actualBuaSqft: number | null;
  actualBuaBasis: 'FLOOR_PLAN' | 'DECLARED' | 'NONE';
  approvedBuaSqft: number | null;
  deviationPct: number | null;
  /** Only the approved structure is mortgageable. */
  buaValuedSqft: number;
  buaValuedBasis: string;
  fsiActual: number | null;
  fsiPermissible: number | null;
  floorsDeclared: number | null;
  floorsObserved: number | null;
  floorsApproved: number | null;
  /** Floors with an area on the plan. */
  floorsWithArea: number;
}

/** Agreement points from the delta (fraction, either sign). */
export function areaAgreement(delta: number): number {
  const d = Math.abs(delta);
  const { fullAt, zeroAt, points } = V.floorArea;
  return d <= fullAt ? points.agreement : d >= zeroAt ? 0 : points.agreement * (1 - (d - fullAt) / (zeroAt - fullAt));
}

function sourcePoints(a: Application): number {
  const src = a.floorPlan?.source;
  if (!src) return 0;
  const slot = (k: string): DocSlot | undefined => a.documents.find((d) => d.key === k);
  const doc = slot(FLOOR_PLAN_DOC[src]) ?? slot('APPROVED_PLAN');
  const verified = doc?.status === 'VERIFIED';
  const s = V.floorArea.source;
  return src === 'GOVT_PORTAL' ? (verified ? s.GOVT_VERIFIED : s.GOVT) : verified ? s.CUSTOMER_VERIFIED : s.CUSTOMER;
}

export function runMeasure(a: Application): MeasureResult {
  const p = a.property;
  const built = isBuilt(p.type);
  const unit = isUnit(p.type);
  const deed = p.plotAreaSqft && p.plotAreaSqft > 0 ? p.plotAreaSqft : null;
  const sat = a.parcel.length >= 3 ? polygonAreaSqm(a.parcel) * SQFT_PER_SQM : null;
  const variance = deed && sat ? ((sat - deed) / deed) * 100 : null;
  const landAreaSqft = deed && sat ? Math.min(deed, sat) : (deed ?? sat);

  // Floor-wise areas from the floor plan.
  const fp = a.floorPlan;
  const loading = fp?.basis === 'CARPET' ? CARPET_TO_BUA : 1;
  const floorPlan: FloorPlanRow[] = built ? (fp?.floors ?? []).filter((f) => f.areaSqft > 0).map((f) => ({ floor: f.floor, areaSqft: f.areaSqft, buaSqft: f.areaSqft * loading })) : [];
  const planBuaSqft = floorPlan.length ? floorPlan.reduce((s, f) => s + f.buaSqft, 0) : null;
  const declared = p.builtUpSqft && p.builtUpSqft > 0 ? p.builtUpSqft : null;

  // Independent check: roof footprint × floors (buildings) or the deed area (units).
  const footprintSqft = built && !unit && (a.footprint?.length ?? 0) >= 3 ? polygonAreaSqm(a.footprint!) * SQFT_PER_SQM : null;
  const observed = a.inspection.observedFloors;
  const floorsForCheck = observed ?? p.floors ?? (floorPlan.length || null);
  const floorsBasis = observed ? 'OBSERVED' : p.floors ? 'DECLARED' : floorPlan.length ? 'PLAN' : null;
  const satelliteBuaSqft = footprintSqft && floorsForCheck ? footprintSqft * floorsForCheck : null;
  const checkArea = unit ? declared : satelliteBuaSqft;
  const checkBasis = !built ? null : unit ? (declared ? 'DEED' : null) : satelliteBuaSqft ? 'SATELLITE' : null;
  const delta = planBuaSqft && checkArea ? (planBuaSqft - checkArea) / checkArea : null;

  let confidence: AreaConfidence | null = null;
  if (delta !== null) {
    const agreement = areaAgreement(delta);
    const planFloors = floorPlan.length;
    const floors = unit ? V.floorArea.points.floors : observed ? (observed === planFloors ? V.floorArea.points.floors : 0) : p.floors === planFloors ? V.floorArea.floorsDeclaredOnly : 0;
    const source = sourcePoints(a);
    const total = Math.round(agreement + floors + source);
    confidence = { agreement, floors, source, total, band: total >= V.floorArea.pass ? 'HIGH' : total >= V.floorArea.warn ? 'MEDIUM' : 'LOW' };
  }

  const actual = built ? (planBuaSqft ?? declared) : null;
  const approved = a.plan.approvedBuaSqft && a.plan.approvedBuaSqft > 0 ? a.plan.approvedBuaSqft : null;
  const deviationPct = actual && approved ? ((actual - approved) / approved) * 100 : null;

  let buaValuedSqft = 0;
  let buaValuedBasis = 'Open plot — no building valued';
  if (built) {
    if (!approved) buaValuedBasis = 'No approved plan on record — building not valued (land only)';
    else if (!actual) {
      buaValuedSqft = approved;
      buaValuedBasis = 'Approved BUA (no floor plan or declaration yet)';
    } else {
      buaValuedSqft = Math.min(actual, approved);
      buaValuedBasis = actual > approved ? 'Approved BUA — area built beyond the plan is not valued' : `${planBuaSqft ? 'Floor-plan' : 'Declared'} BUA (within the approved plan)`;
    }
  }

  const fsiActual = built && actual && landAreaSqft && !unit ? actual / landAreaSqft : null;
  return {
    deedPlotSqft: deed,
    satellitePlotSqft: sat,
    plotVariancePct: variance,
    landAreaSqft,
    floorPlan,
    planBuaSqft,
    declaredBuaSqft: declared,
    footprintSqft,
    floorsForCheck: unit ? null : floorsForCheck,
    floorsBasis: unit ? null : floorsBasis,
    satelliteBuaSqft,
    checkBasis,
    areaDeltaPct: delta === null ? null : delta * 100,
    confidence,
    actualBuaSqft: actual,
    actualBuaBasis: !built ? 'NONE' : planBuaSqft ? 'FLOOR_PLAN' : declared ? 'DECLARED' : 'NONE',
    approvedBuaSqft: approved,
    deviationPct,
    buaValuedSqft,
    buaValuedBasis,
    fsiActual,
    fsiPermissible: a.plan.permissibleFsi && a.plan.permissibleFsi > 0 ? a.plan.permissibleFsi : null,
    floorsDeclared: p.floors,
    floorsObserved: observed,
    floorsApproved: a.plan.approvedFloors,
    floorsWithArea: floorPlan.length,
  };
}
