/* ------------------------------------------------------------------
   "Value a New Property" → PropertyCase mapping (pure; no valuation math).
   Price evidence comes from live search / manual comparables aggregated by
   lib/engines/marketEvidence.ts; every figure is computed by lib/engines.
   ------------------------------------------------------------------ */
import type { LiveEvidenceSnapshot, PropertyCase, UsageClass } from '@/lib/types';
import type { LiveAggregation } from '@/lib/engines/marketEvidence';

export interface NewFloor {
  floorName: string;
  sanctionedSqft: number;
  actualSqft: number;
}

export interface NewPropertyForm {
  address: string;
  locality: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  title: string;
  applicantName: string;
  usage: UsageClass;
  isTypicalProperty: boolean;
  deedPlotAreaSqft: number;
  recordPlotAreaSqft: number | null;
  roadWideningLossSqft: number;
  roadWidthFt: number;
  floors: NewFloor[];
  hasSanctionedPlan: boolean;
  noPlanPolicy: PropertyCase['noPlanPolicy'];
  ageYears: number;
  residualLifeYears: number;
  constructionRatePerSqft: number;
  amenitiesValueInr: number;
  fsvRatio: number;
  requestedLoanInr: number | null;
  monthlyRentInr: number | null;
  /** Demo toggle: the owner self-capture for this property is treated as completed and passed. */
  captureCompleted: boolean;
}

export const EMPTY_FORM: NewPropertyForm = {
  address: '',
  locality: '',
  city: '',
  state: '',
  lat: null,
  lng: null,
  title: '',
  applicantName: 'Walk-in Prospect (live demo)',
  usage: 'RESIDENTIAL',
  isTypicalProperty: true,
  deedPlotAreaSqft: 0,
  recordPlotAreaSqft: null,
  roadWideningLossSqft: 0,
  roadWidthFt: 30,
  floors: [{ floorName: 'Ground Floor', sanctionedSqft: 0, actualSqft: 0 }],
  hasSanctionedPlan: true,
  noPlanPolicy: 'LAND_ONLY',
  ageYears: 5,
  residualLifeYears: 55,
  constructionRatePerSqft: 0,
  amenitiesValueInr: 0,
  fsvRatio: 0.8,
  requestedLoanInr: null,
  monthlyRentInr: null,
  captureCompleted: false,
};

export function snapshotMode(points: LiveEvidenceSnapshot['points']): LiveEvidenceSnapshot['mode'] {
  const live = points.some((p) => p.origin === 'LIVE_SEARCH');
  const manual = points.some((p) => p.origin === 'MANUAL');
  return live && manual ? 'MIXED' : manual ? 'MANUAL' : 'LIVE_SEARCH';
}

export function buildNewPropertyCase(
  id: string,
  f: NewPropertyForm,
  agg: LiveAggregation,
  snapshot: LiveEvidenceSnapshot | null,
  tatMinutes: number,
): PropertyCase {
  const suffix = id.slice(-6).toUpperCase();
  const floors = f.floors.filter((x) => x.floorName.trim() && (x.actualSqft > 0 || x.sanctionedSqft > 0));
  const ok = f.captureCompleted;
  const evidenceLabel = snapshot
    ? `${snapshot.mode === 'MANUAL' ? 'Manual comparables' : snapshot.mode === 'MIXED' ? 'Live Google Search grounding + manual comparables' : 'Live Google Search grounding'} · ${snapshot.points.filter((p) => p.included).length} data points · fetched ${new Date(snapshot.fetchedAt).toLocaleString('en-IN')}`
    : 'No market evidence attached';

  return {
    id,
    fileNo: `IDFC-PRM-LM-${suffix}`,
    caseRefNo: `LM${suffix}`,
    title: f.title.trim() || `Property — ${[f.locality, f.city].filter(Boolean).join(', ') || 'new location'}`,
    city: f.city || '—',
    state: f.state || '—',
    applicantName: f.applicantName || 'Not stated',
    isBenchmarkSample: false,
    origin: 'LIVE_MARKET',
    pramaanTatMinutes: tatMinutes,
    lat: f.lat ?? 20.5937,
    lng: f.lng ?? 78.9629,

    deedPlotAreaSqft: f.deedPlotAreaSqft,
    cadastralPlotAreaSqft: f.recordPlotAreaSqft ?? f.deedPlotAreaSqft,
    roadWideningLossSqft: f.roadWideningLossSqft,
    roadWidthCurrentFt: f.roadWidthFt,
    floors: floors.length ? floors : [{ floorName: 'Vacant plot', sanctionedSqft: 0, actualSqft: 0 }],
    hasSanctionedPlan: f.hasSanctionedPlan,
    noPlanPolicy: f.noPlanPolicy,
    exteriorDetectedFloors: Math.max(1, floors.length),
    // No capture ≠ omission fraud: coverage is simply not locked (floorCoverageLocked = false).
    interiorWalkedFloors: Math.max(1, floors.length),
    ageYears: f.ageYears,
    residualLifeYears: f.residualLifeYears,
    gisHazards: { forestBuffer: false, roadWidening: f.roadWideningLossSqft > 0, crzOrWaterbody: false, htLine: false, cautionArea: false, negativeArea: false },
    boundaries: [],

    priceSources: agg.priceSources,
    circleRatePerSqft: agg.circleRatePerSqft,
    spatialFallbackTier: agg.spatialTier,
    isTypicalProperty: f.isTypicalProperty,
    comparables: agg.comparables,
    constructionRatePerSqft: f.constructionRatePerSqft,
    constructionRateIsDepreciated: true,
    amenitiesValueInr: f.amenitiesValueInr,
    fsvRatio: f.fsvRatio,
    requestedLoanInr: f.requestedLoanInr ?? undefined,
    monthlyRentInr: f.monthlyRentInr ?? undefined,
    capRate: f.monthlyRentInr ? 0.085 : undefined,

    cvDetectedUsage: f.usage,
    cvConfidencePct: ok ? 95 : 0,
    recordConfirmedUsage: f.usage,
    utilitySummary: ok ? 'Usage as declared and confirmed in the (simulated) owner self-capture' : 'Usage as declared — not yet verified by owner self-capture',
    trustChecks: { gpsInParcel: ok, liveCameraOnly: ok, deviceAttested: ok, sunAngleMatched: ok, faceMatched: ok, floorCoverageLocked: ok },

    liveEvidence: snapshot ?? undefined,
    esignStatus: 'PENDING',
    details: [
      { label: 'Location', value: f.address || [f.locality, f.city, f.state].filter(Boolean).join(', ') || '—' },
      { label: 'Market evidence', value: evidenceLabel },
      { label: 'Spatial tier', value: agg.medianDistanceKm === null ? 'No geocoded comparables → District benchmark (penalised)' : `Median comparable distance ${agg.medianDistanceKm.toFixed(2)} km` },
      { label: 'Bias corrections', value: 'Default, uncalibrated: listings × 0.86 · auctions ÷ 0.80 · reported sales × 1.00 (locality calibration happens in pilot)' },
      { label: 'Construction rate', value: 'As entered by the underwriter (as-valued, depreciated)' },
      {
        label: 'Trust Layer',
        value: ok ? 'Owner self-capture marked completed (demo simulation)' : 'No owner self-capture yet — routed conservatively until capture is completed',
      },
    ],
  };
}
