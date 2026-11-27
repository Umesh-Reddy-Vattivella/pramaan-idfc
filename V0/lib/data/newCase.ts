/* ------------------------------------------------------------------
   A new bank-portal case holds ONLY what was actually entered or captured:
   no template prices, no placeholder comparables, no simulated checks.
   Until market evidence is collected (live search or sourced manual comparables)
   the valuation is "pending" — see marketEvidenceReady().
   ------------------------------------------------------------------ */
import type { PropertyCase, UsageClass } from '@/lib/types';
import { residualLife, type StructureType } from '@/lib/engines/valuation';

export interface NewCaseInput {
  borrowerName: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  usage: UsageClass;
  title: string;
  plotAreaSqft: number;
  floorCount: number; // 0 = vacant plot
  approvedSqftPerFloor: number;
  builtSqftPerFloor: number;
  hasApprovedPlan: boolean;
  ageYears: number;
  structure: StructureType;
  /** As-valued (depreciated) construction rate if the valuer has one; 0 = not yet entered. */
  constructionRatePerSqft: number;
}

const FLOOR_NAMES = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];

export function buildNewCase(id: string, caseRef: string, d: NewCaseInput): PropertyCase {
  const n = Math.max(0, Math.min(4, Math.round(d.floorCount)));
  const life = residualLife(d.structure, d.ageYears);
  return {
    id,
    fileNo: caseRef,
    caseRefNo: caseRef,
    title: `${d.title} — ${d.city || 'location pinned'}`,
    city: d.city,
    state: d.state,
    applicantName: d.borrowerName,
    isBenchmarkSample: false,
    origin: 'BANK_PORTAL',
    pramaanTatMinutes: 0,
    lat: d.lat,
    lng: d.lng,
    deedPlotAreaSqft: d.plotAreaSqft,
    cadastralPlotAreaSqft: d.plotAreaSqft,
    roadWideningLossSqft: 0,
    roadWidthCurrentFt: 0,
    floors:
      n === 0
        ? [{ floorName: 'Vacant plot', sanctionedSqft: 0, actualSqft: 0 }]
        : FLOOR_NAMES.slice(0, n).map((floorName) => ({ floorName, sanctionedSqft: d.hasApprovedPlan ? d.approvedSqftPerFloor : 0, actualSqft: d.builtSqftPerFloor })),
    hasSanctionedPlan: d.hasApprovedPlan,
    noPlanPolicy: 'LAND_ONLY',
    exteriorDetectedFloors: Math.max(1, n),
    interiorWalkedFloors: Math.max(1, n),
    ageYears: d.ageYears,
    residualLifeYears: life.residualLifeYears,
    gisHazards: { forestBuffer: false, roadWidening: false, crzOrWaterbody: false, htLine: false, cautionArea: false, negativeArea: false },
    boundaries: [],
    priceSources: [],
    circleRatePerSqft: 0,
    spatialFallbackTier: 'DISTRICT',
    isTypicalProperty: true,
    comparables: [],
    constructionRatePerSqft: d.constructionRatePerSqft,
    constructionRateIsDepreciated: true,
    amenitiesValueInr: 0,
    fsvRatio: 0.8,
    cvDetectedUsage: d.usage,
    cvConfidencePct: 0,
    recordConfirmedUsage: d.usage,
    utilitySummary: 'Declared in the loan application — not yet confirmed',
    cvDetections: [],
    trustChecks: { gpsInParcel: false, liveCameraOnly: false, deviceAttested: false, sunAngleMatched: false, floorCoverageLocked: false },
    esignStatus: 'PENDING',
    details: [
      { label: 'Full Address', value: d.address || [d.city, d.state].filter(Boolean).join(', ') },
      { label: 'Residual life', value: n === 0 ? 'Vacant plot' : life.formula },
      { label: 'Construction rate', value: d.constructionRatePerSqft ? `Rs. ${d.constructionRatePerSqft.toLocaleString('en-IN')}/sqft (entered by valuer)` : 'Not entered yet' },
    ],
  };
}
