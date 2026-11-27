/* ------------------------------------------------------------------
   Engine 1: MEASURE (PRD §3.2) — pure, deterministic functions only.
   ------------------------------------------------------------------ */
import type { FloorAreaRow, PropertyCase } from '@/lib/types';

/** Formula 1 — Net Usable Plot Area: A_net = min(A_deed, A_record) - A_widening */
export function netUsablePlotArea(deedSqft: number, recordSqft: number, wideningLossSqft: number): number {
  return Math.min(deedSqft, recordSqft) - wideningLossSqft;
}

export interface AreaSource {
  label: string;
  areaSqft: number;
  weight: number;
}

export interface AreaReconciliation {
  aStar: number;
  sources: (AreaSource & { deviationPct: number; exceedsTolerance: boolean })[];
  areaVarianceFlag: boolean;
}

/**
 * Formula 2 — Multi-Source Area Reconciliation:
 *   A_star = sum(w_i * A_i)   (weights normalised to sum 1)
 *   AREA_VARIANCE_FLAG = some(|A_i - A_star| / A_star > 0.10)
 */
export function reconcileAreaSources(sources: AreaSource[], tolerance = 0.1): AreaReconciliation {
  const wSum = sources.reduce((s, x) => s + x.weight, 0);
  const aStar = wSum > 0 ? sources.reduce((s, x) => s + (x.weight / wSum) * x.areaSqft, 0) : 0;
  const rows = sources.map((src) => {
    const rel = aStar > 0 ? Math.abs(src.areaSqft - aStar) / aStar : 0;
    return { ...src, deviationPct: rel * 100, exceedsTolerance: rel > tolerance };
  });
  return { aStar, sources: rows, areaVarianceFlag: rows.some((r) => r.exceedsTolerance) };
}

/** Formula 3 — BUA Deviation %: ((BUA_actual - BUA_sanctioned) / BUA_sanctioned) * 100 */
export function buaDeviationPct(buaActual: number, buaReference: number): number {
  return ((buaActual - buaReference) / buaReference) * 100;
}

export type BuaValuationBasis = 'MIN_ACTUAL_SANCTIONED' | 'LAND_ONLY' | 'INSTITUTIONAL_EXCEPTION';

/**
 * Formula 4 — Permissible BUA considered for valuation.
 *  - Sanctioned plan exists:             min(BUA_actual, BUA_sanctioned)
 *  - No plan & LAND_ONLY policy:         0
 *  - No plan & INSTITUTIONAL_EXCEPTION:  BUA_actual (MISSING_PLAN_FLAG = true)
 *  - No plan & STANDARD policy:          not specified by PRD → treated conservatively as LAND_ONLY.
 */
export function buaConsideredForValuation(
  hasSanctionedPlan: boolean,
  noPlanPolicy: PropertyCase['noPlanPolicy'],
  buaActual: number,
  buaSanctioned: number,
): { buaValued: number; basis: BuaValuationBasis; missingPlanFlag: boolean } {
  if (hasSanctionedPlan) {
    return { buaValued: Math.min(buaActual, buaSanctioned), basis: 'MIN_ACTUAL_SANCTIONED', missingPlanFlag: false };
  }
  if (noPlanPolicy === 'INSTITUTIONAL_EXCEPTION') {
    return { buaValued: buaActual, basis: 'INSTITUTIONAL_EXCEPTION', missingPlanFlag: true };
  }
  return { buaValued: 0, basis: 'LAND_ONLY', missingPlanFlag: true };
}

/** Formula 5 — Height from satellite shadow: H = shadow_len * tan(sun_elev) ; floors = max(1, round(H / 3.0)) */
export function heightFromShadow(shadowLengthM: number, sunElevationDeg: number): { heightM: number; estimatedFloors: number } {
  const heightM = shadowLengthM * Math.tan((sunElevationDeg * Math.PI) / 180);
  return { heightM, estimatedFloors: Math.max(1, Math.round(heightM / 3.0)) };
}

/** Formula 6 — Known-object monocular scaling: Length_ft = px * (ref_ft / ref_px). Default reference: door = 7.0 ft. */
export function knownObjectLengthFt(measuredPixels: number, referenceObjectPixels: number, referenceObjectFt = 7.0): number {
  return measuredPixels * (referenceObjectFt / referenceObjectPixels);
}

/* ---------------- Room-by-room interior measurement (customer link) ---------------- */

/** Reference objects for monocular scaling when the phone has no AR. Lengths in feet. */
export const REFERENCE_OBJECTS = {
  A4_LONG: { label: 'A4 sheet — long edge (29.7 cm)', ft: 0.9744 },
  DOOR_HEIGHT: { label: 'Standard door height (7 ft)', ft: 7.0 },
  BRICK: { label: 'Standard brick length (9 in)', ft: 0.75 },
  FLOOR_TILE_2FT: { label: '2 ft × 2 ft floor tile', ft: 2.0 },
} as const;
export type ReferenceObjectId = keyof typeof REFERENCE_OBJECTS;

/** Pixel distance between two image points. */
export function pixelDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance between two 3-D points (metres) → feet. Used for WebXR hit-test measurements. */
export function distance3dFt(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / 0.3048;
}

/** Carpet-to-built-up loading for independent buildings (walls, ducts, stairs). */
export const CARPET_TO_BUA_LOADING = 1.2;
/** Tolerance before measured BUA counts as exceeding the approved floor area. */
export const PLAN_MATCH_TOLERANCE_PCT = 10;

export interface RoomInput {
  floorName: string;
  lengthFt: number;
  widthFt: number;
}

/** Σ(room L × W) per floor → implied BUA = carpet × 1.20, compared with the approved floor area. */
export function roomsVsPlan(rooms: RoomInput[], floors: FloorAreaRow[]) {
  const byFloor = new Map<string, number>();
  for (const r of rooms) {
    const a = Math.max(0, r.lengthFt) * Math.max(0, r.widthFt);
    byFloor.set(r.floorName, (byFloor.get(r.floorName) ?? 0) + a);
  }
  const rows = [...byFloor.entries()].map(([floorName, carpetSqft]) => {
    const fl = floors.find((f) => f.floorName === floorName);
    const approvedSqft = fl?.sanctionedSqft ?? 0;
    const impliedBuaSqft = carpetSqft * CARPET_TO_BUA_LOADING;
    const excessPct = approvedSqft > 0 ? ((impliedBuaSqft - approvedSqft) / approvedSqft) * 100 : null;
    return {
      floorName,
      carpetSqft,
      impliedBuaSqft,
      approvedSqft,
      excessPct,
      exceeds: excessPct !== null && excessPct > PLAN_MATCH_TOLERANCE_PCT,
    };
  });
  return { rows, totalCarpetSqft: rows.reduce((s, r) => s + r.carpetSqft, 0), anyExceeds: rows.some((r) => r.exceeds) };
}

/** Formula 7 — Omission Fraud Coverage Lock */
export function omissionFraudBlock(interiorWalkedFloors: number, exteriorDetectedFloors: number): boolean {
  return interiorWalkedFloors < exteriorDetectedFloors;
}

export type GisHazardKey =
  | 'in_forest_buffer'
  | 'in_road_widening'
  | 'in_crz_waterbody'
  | 'near_ht_line'
  | 'caution_area'
  | 'negative_area'
  | 'ogl_area';

export interface BoundaryCheck {
  direction: 'East' | 'West' | 'North' | 'South';
  asPerDeed: string;
  atSiteSatellite: string;
  matched: boolean;
}

/** Formula 8 — 4-direction boundary comparison & boolean GIS hazard overlay */
export function evaluateBoundariesAndHazards(c: PropertyCase, oglArea = false) {
  const boundaries: BoundaryCheck[] = c.boundaries.map((b) => ({ ...b }));
  const boundaryMismatches = boundaries.filter((b) => !b.matched);
  const hazards: Record<GisHazardKey, boolean> = {
    in_forest_buffer: c.gisHazards.forestBuffer,
    in_road_widening: c.gisHazards.roadWidening,
    in_crz_waterbody: c.gisHazards.crzOrWaterbody,
    near_ht_line: c.gisHazards.htLine,
    caution_area: c.gisHazards.cautionArea,
    negative_area: c.gisHazards.negativeArea,
    ogl_area: oglArea,
  };
  const activeHazards = (Object.keys(hazards) as GisHazardKey[]).filter((k) => hazards[k]);
  return { boundaries, boundaryMismatches, hazards, activeHazards };
}

export interface MeasureOptions {
  /** Satellite parcel area, if available, adds a 3rd source to reconciliation. */
  satelliteAreaSqft?: number;
  /** By-law permissible BUA, used as the deviation reference when no sanctioned plan exists. */
  bylawPermissibleBuaSqft?: number;
  oglArea?: boolean;
}

export interface MeasureResult {
  aNet: number;
  areaReconciliation: AreaReconciliation;
  /** Permanent BUA (excludes tin-shed / temporary structures). */
  buaActual: number;
  buaActualInclTemporary: number;
  buaSanctioned: number;
  /** Sanctioned BUA, or by-law permissible BUA when no plan; null if neither. */
  buaReference: number | null;
  /** Deviation of permanent BUA; null when no sanctioned plan and no by-law permissible BUA. */
  buaDeviationPct: number | null;
  buaDeviationPctInclTemporary: number | null;
  /** BUA_actual − BUA_reference in sqft (null when no reference). */
  buaDeviationSqft: number | null;
  deviationReference: 'SANCTIONED' | 'BYLAWS_PERMISSIBLE' | 'NONE';
  noSanctionedPlan: boolean;
  missingPlanFlag: boolean;
  buaValued: number;
  buaBasis: BuaValuationBasis;
  /** Per-floor deviation vs the floor's sanctioned / permissible area (null when that reference is 0). */
  floorDeviations: { floorName: string; referenceSqft: number; actualSqft: number; deviationSqft: number; deviationPct: number | null; temporary: boolean }[];
  /** Floors marked tin-shed/temporary, or built with zero sanctioned area while a plan exists. */
  unapprovedStructures: { floorName: string; actualSqft: number; reason: 'TIN_SHED_OR_TEMPORARY' | 'NOT_IN_SANCTIONED_PLAN' }[];
  omissionFraudBlock: boolean;
  boundaries: BoundaryCheck[];
  boundaryMismatches: BoundaryCheck[];
  hazards: Record<GisHazardKey, boolean>;
  activeHazards: GisHazardKey[];
}

export function runMeasure(c: PropertyCase, opts: MeasureOptions = {}): MeasureResult {
  const aNet = netUsablePlotArea(c.deedPlotAreaSqft, c.cadastralPlotAreaSqft, c.roadWideningLossSqft);

  const areaSources: AreaSource[] = [
    { label: 'Sale Deed', areaSqft: c.deedPlotAreaSqft, weight: 1 },
    { label: 'Cadastral / Patta', areaSqft: c.cadastralPlotAreaSqft, weight: 1 },
  ];
  if (opts.satelliteAreaSqft !== undefined) {
    areaSources.push({ label: 'Satellite Parcel', areaSqft: opts.satelliteAreaSqft, weight: 1 });
  }
  const areaReconciliation = reconcileAreaSources(areaSources);

  // Primary BUA excludes tin-shed / temporary structures (R2: 20,782 RCC vs 24,752 incl. tin shed).
  const buaActual = c.floors.filter((f) => !f.isTinShedOrTemporary).reduce((s, f) => s + f.actualSqft, 0);
  const buaActualInclTemporary = c.floors.reduce((s, f) => s + f.actualSqft, 0);
  const buaSanctioned = c.floors.reduce((s, f) => s + f.sanctionedSqft, 0);

  let reference: number | null = null;
  let deviationReference: MeasureResult['deviationReference'] = 'NONE';
  const permissible = opts.bylawPermissibleBuaSqft ?? c.permissibleBuaSqft;
  if (c.hasSanctionedPlan && buaSanctioned > 0) {
    reference = buaSanctioned;
    deviationReference = 'SANCTIONED';
  } else if (permissible && permissible > 0) {
    reference = permissible;
    deviationReference = 'BYLAWS_PERMISSIBLE';
  }
  const dev = reference === null ? null : buaDeviationPct(buaActual, reference);
  const devIncl =
    reference === null || buaActualInclTemporary === buaActual ? dev : buaDeviationPct(buaActualInclTemporary, reference);

  const { buaValued, basis, missingPlanFlag } = buaConsideredForValuation(
    c.hasSanctionedPlan,
    c.noPlanPolicy,
    buaActual,
    buaSanctioned,
  );

  const unapprovedStructures: MeasureResult['unapprovedStructures'] = [];
  for (const f of c.floors) {
    if (f.isTinShedOrTemporary) {
      unapprovedStructures.push({ floorName: f.floorName, actualSqft: f.actualSqft, reason: 'TIN_SHED_OR_TEMPORARY' });
    } else if (c.hasSanctionedPlan && f.sanctionedSqft === 0 && f.actualSqft > 0) {
      unapprovedStructures.push({ floorName: f.floorName, actualSqft: f.actualSqft, reason: 'NOT_IN_SANCTIONED_PLAN' });
    }
  }

  const floorDeviations = c.floors.map((f) => ({
    floorName: f.floorName,
    referenceSqft: f.sanctionedSqft,
    actualSqft: f.actualSqft,
    deviationSqft: f.actualSqft - f.sanctionedSqft,
    deviationPct: f.sanctionedSqft > 0 ? buaDeviationPct(f.actualSqft, f.sanctionedSqft) : null,
    temporary: !!f.isTinShedOrTemporary,
  }));

  const gis = evaluateBoundariesAndHazards(c, opts.oglArea ?? false);

  return {
    aNet,
    areaReconciliation,
    buaActual,
    buaActualInclTemporary,
    buaSanctioned,
    buaReference: reference,
    buaDeviationPct: dev,
    buaDeviationPctInclTemporary: devIncl,
    buaDeviationSqft: reference === null ? null : buaActual - reference,
    deviationReference,
    noSanctionedPlan: !c.hasSanctionedPlan,
    missingPlanFlag,
    buaValued,
    buaBasis: basis,
    floorDeviations,
    unapprovedStructures,
    omissionFraudBlock: omissionFraudBlock(c.interiorWalkedFloors, c.exteriorDetectedFloors),
    ...gis,
  };
}
