/* ------------------------------------------------------------------
   Quick demo loan application at any location (for the live pitch demo:
   create it where the presenter is standing, send the link, capture on a phone).
   NOT an IDFC benchmark case. Price evidence is the Case 1 micro-market
   template, shifted to the new pin and clearly labelled as illustrative —
   use "Value New Property" for live comparables at a real address.
   ------------------------------------------------------------------ */
import type { PropertyCase, UsageClass } from '@/lib/types';
import { SEED_CASES } from './seedCases';
import { residualLife, type StructureType } from '@/lib/engines/valuation';

export interface DemoApplicationInput {
  borrowerName: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  usage: UsageClass;
  plotAreaSqft: number;
  floorCount: number;
  approvedSqftPerFloor: number;
  builtSqftPerFloor: number;
  hasApprovedPlan: boolean;
  ageYears: number;
  structure: StructureType;
}

const FLOOR_NAMES = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];

export function buildDemoApplication(id: string, d: DemoApplicationInput): PropertyCase {
  const base = SEED_CASES[0];
  const dLat = d.lat - base.lat;
  const dLng = d.lng - base.lng;
  const n = Math.max(1, Math.min(4, Math.round(d.floorCount)));
  const life = residualLife(d.structure, d.ageYears);
  const suffix = id.slice(-6).toUpperCase();
  return {
    ...base,
    id,
    fileNo: `IDFC-PRM-LOS-${suffix}`,
    caseRefNo: `05${suffix}`,
    benchmarkLabel: undefined,
    title: `${d.usage === 'COMMERCIAL' ? 'Commercial' : 'Residential'} property — ${d.city || 'demo location'}`,
    city: d.city || '—',
    state: d.state || '—',
    applicantName: d.borrowerName || 'Demo Borrower',
    isBenchmarkSample: false,
    origin: 'LIVE_MARKET',
    pramaanTatMinutes: 0,
    lat: d.lat,
    lng: d.lng,
    deedPlotAreaSqft: d.plotAreaSqft,
    cadastralPlotAreaSqft: d.plotAreaSqft,
    roadWideningLossSqft: 0,
    floors: FLOOR_NAMES.slice(0, n).map((floorName) => ({ floorName, sanctionedSqft: d.hasApprovedPlan ? d.approvedSqftPerFloor : 0, actualSqft: d.builtSqftPerFloor })),
    hasSanctionedPlan: d.hasApprovedPlan,
    noPlanPolicy: 'LAND_ONLY',
    exteriorDetectedFloors: n,
    // Coverage is "not yet locked" (not omission fraud) until the customer link evidences each floor.
    interiorWalkedFloors: n,
    ageYears: d.ageYears,
    residualLifeYears: life.residualLifeYears,
    gisHazards: { forestBuffer: false, roadWidening: false, crzOrWaterbody: false, htLine: false, cautionArea: false, negativeArea: false },
    boundaries: [],
    comparables: base.comparables.map((p) => ({ ...p, lat: +(p.lat + dLat).toFixed(6), lng: +(p.lng + dLng).toFixed(6) })),
    cvDetectedUsage: d.usage,
    recordConfirmedUsage: d.usage,
    utilitySummary: 'Usage as per loan application (to be confirmed by capture)',
    cvDetections: [],
    trustChecks: { gpsInParcel: false, liveCameraOnly: false, deviceAttested: false, sunAngleMatched: true, floorCoverageLocked: false },
    surveyDeedNumbers: undefined,
    surveyPattaNumbers: undefined,
    esignStatus: 'PENDING',
    los: undefined,
    customerLink: undefined,
    liveEvidence: undefined,
    details: [
      { label: 'Full Address', value: d.address || `${d.city}, ${d.state}` },
      { label: 'Source', value: 'Quick demo loan application (LOS mock) created at the presenter’s location' },
      { label: 'Residual life', value: life.formula },
      { label: 'Price evidence', value: 'ILLUSTRATIVE — Case 1 micro-market template shifted to this pin. Use “Value New Property” for live comparables.' },
    ],
  };
}
