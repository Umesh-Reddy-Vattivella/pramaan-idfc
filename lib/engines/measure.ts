/* ------------------------------------------------------------------
   Measurement (PRD_V3 §4.2, §5.3) — pure.
   Plot: deed area vs satellite polygon area.
   Building: rooms measured on the video call → carpet → built-up → vs approved plan.
   ------------------------------------------------------------------ */
import type { Application, Room } from '@/lib/domain/types';
import { floorNames, isBuilt } from '@/lib/domain/catalog';
import { polygonAreaSqm, SQFT_PER_SQM } from './stats';

export const REFERENCE_OBJECTS = {
  DOOR_HEIGHT: { label: 'Door height (7 ft)', ft: 7.0 },
  DOOR_WIDTH: { label: 'Door width (3 ft)', ft: 3.0 },
  A4_LONG: { label: 'A4 sheet, long side (11.7 in)', ft: 0.974 },
  TILE_2FT: { label: 'Floor tile (2 ft)', ft: 2.0 },
  BRICK: { label: 'Brick length (9 in)', ft: 0.75 },
} as const;
export type ReferenceObjectId = keyof typeof REFERENCE_OBJECTS | 'CUSTOM';

/** Carpet → built-up loading (walls, ducts, staircase share). */
export const CARPET_TO_BUA = 1.2;
export const PLOT_AREA_TOLERANCE_PCT = 10;

export const pixelDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Known-object monocular scaling: length_ft = target_px × (reference_ft / reference_px). */
export function knownObjectLengthFt(targetPx: number, referencePx: number, referenceFt: number): number {
  if (referencePx <= 0) throw new RangeError('Reference length must be > 0 px');
  return targetPx * (referenceFt / referencePx);
}

export const roomArea = (r: Room) => Math.max(0, r.lengthFt) * Math.max(0, r.widthFt);

export interface FloorMeasure {
  floor: string;
  rooms: number;
  carpetSqft: number;
  buaSqft: number;
}

export interface MeasureResult {
  deedPlotSqft: number | null;
  satellitePlotSqft: number | null;
  plotVariancePct: number | null;
  /** min(deed, satellite) — conservative land area. */
  landAreaSqft: number | null;
  floors: FloorMeasure[];
  carpetSqft: number;
  measuredBuaSqft: number | null;
  declaredBuaSqft: number | null;
  /** Actual BUA used for checks: measured if rooms measured, else declared. */
  actualBuaSqft: number | null;
  actualBuaBasis: 'MEASURED' | 'DECLARED' | 'NONE';
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
  floorsMeasured: number;
}

export function runMeasure(a: Application): MeasureResult {
  const p = a.property;
  const built = isBuilt(p.type);
  const deed = p.plotAreaSqft && p.plotAreaSqft > 0 ? p.plotAreaSqft : null;
  const sat = a.parcel.length >= 3 ? polygonAreaSqm(a.parcel) * SQFT_PER_SQM : null;
  const variance = deed && sat ? ((sat - deed) / deed) * 100 : null;
  const landAreaSqft = deed && sat ? Math.min(deed, sat) : (deed ?? sat);

  const names = floorNames(p.floors);
  const extra = [...new Set(a.rooms.map((r) => r.floor))].filter((f) => !names.includes(f));
  const floors: FloorMeasure[] = [...names, ...extra]
    .map((f) => {
      const rs = a.rooms.filter((r) => r.floor === f);
      const carpet = rs.reduce((s, r) => s + roomArea(r), 0);
      return { floor: f, rooms: rs.length, carpetSqft: carpet, buaSqft: carpet * CARPET_TO_BUA };
    })
    .filter((f) => f.rooms > 0 || names.includes(f.floor));
  const carpetSqft = floors.reduce((s, f) => s + f.carpetSqft, 0);
  const measuredBuaSqft = carpetSqft > 0 ? carpetSqft * CARPET_TO_BUA : null;
  const declared = p.builtUpSqft && p.builtUpSqft > 0 ? p.builtUpSqft : null;
  const actual = built ? (measuredBuaSqft ?? declared) : null;
  const approved = a.plan.approvedBuaSqft && a.plan.approvedBuaSqft > 0 ? a.plan.approvedBuaSqft : null;
  const deviationPct = actual && approved ? ((actual - approved) / approved) * 100 : null;

  let buaValuedSqft = 0;
  let buaValuedBasis = 'Open plot — no building valued';
  if (built) {
    if (!approved) buaValuedBasis = 'No approved plan on record — building not valued (land only)';
    else if (!actual) {
      buaValuedSqft = approved;
      buaValuedBasis = 'Approved BUA (no measurement or declaration yet)';
    } else {
      buaValuedSqft = Math.min(actual, approved);
      buaValuedBasis = actual > approved ? 'Approved BUA — area built beyond the plan is not valued' : `${measuredBuaSqft ? 'Measured' : 'Declared'} BUA (within the approved plan)`;
    }
  }

  const fsiActual = built && actual && landAreaSqft && p.type !== 'FLAT' && p.type !== 'SHOP_OFFICE' ? actual / landAreaSqft : null;
  return {
    deedPlotSqft: deed,
    satellitePlotSqft: sat,
    plotVariancePct: variance,
    landAreaSqft,
    floors,
    carpetSqft,
    measuredBuaSqft,
    declaredBuaSqft: declared,
    actualBuaSqft: actual,
    actualBuaBasis: !built ? 'NONE' : measuredBuaSqft ? 'MEASURED' : declared ? 'DECLARED' : 'NONE',
    approvedBuaSqft: approved,
    deviationPct,
    buaValuedSqft,
    buaValuedBasis,
    fsiActual,
    fsiPermissible: a.plan.permissibleFsi && a.plan.permissibleFsi > 0 ? a.plan.permissibleFsi : null,
    floorsDeclared: p.floors,
    floorsObserved: a.inspection.observedFloors,
    floorsApproved: a.plan.approvedFloors,
    floorsMeasured: floors.filter((f) => f.rooms > 0).length,
  };
}
