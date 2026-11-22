/* ------------------------------------------------------------------
   Owner Self-Capture demo template (Tab 2). NOT an IDFC benchmark case.
   A clean G+2 residential house in the same Nagpur micro-locality as Case 1,
   so it re-uses Case 1's micro-market price evidence. The capture simulator
   mutates only what the owner's capture actually proves (trust telemetry,
   floors walked, documents) — all scoring is done by lib/engines.
   ------------------------------------------------------------------ */
import type { PropertyCase } from '@/lib/types';
import { SEED_CASES } from '@/lib/data/seedCases';
import { haversineMeters } from '@/lib/engines/trust';

export const CAPTURE_SITE = {
  lat: 21.1352,
  lng: 79.0712,
  locality: 'Ramdaspeth',
  city: 'Nagpur',
  state: 'Maharashtra',
  deedPlotAreaSqft: 1800,
  recordPlotAreaSqft: 1795,
  exteriorFloors: 3,
  /** Mock-GPS simulation displacement. */
  mockGpsOffsetM: 180,
};

const M_PER_DEG_LAT = 111320;

/** Lat/lng displaced by metres north/east of a point. */
export function offsetLatLng(lat: number, lng: number, northM: number, eastM: number): [number, number] {
  return [lat + northM / M_PER_DEG_LAT, lng + eastM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))];
}

/** Parcel polygon ([lat, lng] ring) — square sized to the deed plot area. */
export const CAPTURE_PARCEL: [number, number][] = (() => {
  const h = (Math.sqrt(CAPTURE_SITE.deedPlotAreaSqft) * 0.3048) / 2;
  const { lat, lng } = CAPTURE_SITE;
  return [offsetLatLng(lat, lng, -h, -h), offsetLatLng(lat, lng, -h, h), offsetLatLng(lat, lng, h, h), offsetLatLng(lat, lng, h, -h)];
})();

/* ---------------- Documents (Step 3) ---------------- */

export type DocId = 'SALE_DEED' | 'SANCTIONED_PLAN' | 'EB_BILL' | 'PROPERTY_TAX' | 'VERNACULAR';

export interface DocDef {
  id: DocId;
  label: string;
  required: boolean;
  language: string;
  fields: { owner?: string; areaSqft?: number; surveyNo?: string; other?: string };
}

export const CAPTURE_OWNER = 'Self-Capture Owner (KYC verified)';
export const CAPTURE_SURVEY = 'Khasra 112/2';

export const DOC_DEFS: DocDef[] = [
  { id: 'SALE_DEED', label: 'Sale Deed', required: true, language: 'English', fields: { owner: CAPTURE_OWNER, areaSqft: 1800, surveyNo: CAPTURE_SURVEY } },
  { id: 'SANCTIONED_PLAN', label: 'Sanctioned Building Plan (NMC)', required: true, language: 'English', fields: { owner: CAPTURE_OWNER, other: 'G+2 · Sanctioned BUA 2,100 sqft' } },
  { id: 'EB_BILL', label: 'Electricity Bill (MSEDCL)', required: true, language: 'English', fields: { owner: CAPTURE_OWNER, other: 'Tariff: Domestic (LT Residential) · Consumer No. [masked]' } },
  { id: 'PROPERTY_TAX', label: 'Property Tax Receipt (NMC)', required: true, language: 'English', fields: { owner: CAPTURE_OWNER, other: 'Tax class: Residential · Paid, no arrears' } },
  { id: 'VERNACULAR', label: 'Vernacular Land Record (Hindi / Marathi)', required: false, language: 'Hindi', fields: { owner: CAPTURE_OWNER, areaSqft: 1795, surveyNo: CAPTURE_SURVEY } },
];

/* ---------------- Guided capture checklist (Step 4) ---------------- */

export type CaptureItemId = 'ROAD' | 'FACADE' | 'METER' | 'FLOOR_GF' | 'FLOOR_FF' | 'FLOOR_SF';

export interface CaptureItemDef {
  id: CaptureItemId;
  label: string;
  hint: string;
  floorIndex?: number;
}

export const CAPTURE_ITEMS: CaptureItemDef[] = [
  { id: 'ROAD', label: 'Approach Road Width', hint: 'Stand at the gate, pan across the road' },
  { id: 'FACADE', label: 'Exterior Facade', hint: 'Full elevation — floors auto-counted' },
  { id: 'METER', label: 'Electricity Meter', hint: 'Pan slowly left from main gate to electricity meter' },
  { id: 'FLOOR_GF', label: 'Ground Floor walkthrough', hint: 'Room-by-room · door-scaled', floorIndex: 1 },
  { id: 'FLOOR_FF', label: 'First Floor walkthrough', hint: 'Room-by-room · door-scaled', floorIndex: 2 },
  { id: 'FLOOR_SF', label: 'Second (Top) Floor walkthrough', hint: 'Room-by-room · door-scaled', floorIndex: 3 },
];

/** Simulated sensor measurements fed to the deterministic MEASURE formulas. */
export const CAPTURE_SENSOR = {
  roadPixels: 1800, // road span in frame
  roadRefDoorPixels: 420, // standard 7.0 ft gate-door reference
  shadowLengthM: 9.2,
  sunElevationDeg: 45,
  roomPixels: 1050, // room width in frame
  roomRefDoorPixels: 420,
};

/* ---------------- Case builder ---------------- */

export interface CaptureDraft {
  caseId: string;
  channel: 'OWNER_APP' | 'WHATSAPP_REP';
  capturePoint: { lat: number; lng: number } | null;
  gpsInParcel: boolean;
  liveCameraOnly: boolean;
  deviceAttested: boolean;
  sunAngleMatched: boolean;
  faceMatched: boolean;
  floorsWalked: number;
  docs: DocId[];
  startedAt: number;
  finishedAt?: number;
}

const base = SEED_CASES[0];

export function buildCaptureCase(d: CaptureDraft): PropertyCase {
  const { lat, lng } = CAPTURE_SITE;
  const tatMinutes = d.finishedAt ? Math.max(1, Math.round((d.finishedAt - d.startedAt) / 60000)) : 0;
  const suffix = d.caseId.slice(-6).toUpperCase();
  return {
    id: d.caseId,
    fileNo: `IDFC-PRM-SC-${suffix}`,
    caseRefNo: `SC${suffix}`,
    title: `Self-Captured Residential House — ${CAPTURE_SITE.locality}`,
    city: CAPTURE_SITE.city,
    state: CAPTURE_SITE.state,
    applicantName: d.channel === 'WHATSAPP_REP' ? 'Authorised Site Representative (WhatsApp link)' : CAPTURE_OWNER,
    isBenchmarkSample: false,
    origin: 'SELF_CAPTURE',
    pramaanTatMinutes: tatMinutes,
    lat,
    lng,

    deedPlotAreaSqft: CAPTURE_SITE.deedPlotAreaSqft,
    cadastralPlotAreaSqft: CAPTURE_SITE.recordPlotAreaSqft,
    roadWideningLossSqft: 0,
    roadWidthCurrentFt: 30,
    roadSide: 'West',
    floors: [
      { floorName: 'Ground Floor', sanctionedSqft: 700, actualSqft: 713 },
      { floorName: 'First Floor', sanctionedSqft: 700, actualSqft: 713 },
      { floorName: 'Second Floor', sanctionedSqft: 700, actualSqft: 713 },
    ],
    hasSanctionedPlan: d.docs.includes('SANCTIONED_PLAN'),
    noPlanPolicy: 'STANDARD',
    exteriorDetectedFloors: CAPTURE_SITE.exteriorFloors,
    interiorWalkedFloors: d.floorsWalked,
    ageYears: 6,
    residualLifeYears: 54,
    gisHazards: { forestBuffer: false, roadWidening: false, crzOrWaterbody: false, htLine: false, cautionArea: false, negativeArea: false },
    boundaries: [
      { direction: 'East', asPerDeed: 'Residential plot', atSiteSatellite: 'Residential house', matched: true },
      { direction: 'West', asPerDeed: '30 ft road', atSiteSatellite: '30 ft paved road', matched: true },
      { direction: 'North', asPerDeed: 'Residential plot', atSiteSatellite: 'Residential house', matched: true },
      { direction: 'South', asPerDeed: 'Residential plot', atSiteSatellite: 'Residential house', matched: true },
    ],

    // Same 1 km micro-market as Case 1 → re-use its price evidence; comps re-measured from this parcel.
    priceSources: base.priceSources,
    circleRatePerSqft: base.circleRatePerSqft,
    spatialFallbackTier: 'MICRO_1KM',
    isTypicalProperty: true,
    comparables: base.comparables.map((p) => ({ ...p, distanceKm: +(haversineMeters(lat, lng, p.lat, p.lng) / 1000).toFixed(2) })),
    constructionRatePerSqft: 1900,
    constructionRateIsDepreciated: true,
    amenitiesValueInr: 0,
    fsvRatio: 0.85,

    cvDetectedUsage: 'RESIDENTIAL',
    cvConfidencePct: 97,
    recordConfirmedUsage: 'RESIDENTIAL',
    utilitySummary: 'Domestic MSEDCL EB tariff + Residential property-tax class',
    cvDetections: [
      { label: 'Residential Kitchen', confidencePct: 97, frame: 'Interior — GF kitchen', usage: 'RESIDENTIAL' },
      { label: 'Domestic Facade (3 floors)', confidencePct: 96, frame: 'Exterior — front elevation', usage: 'RESIDENTIAL' },
      { label: 'Domestic EB Meter', confidencePct: 95, frame: 'Exterior — meter board', usage: 'RESIDENTIAL' },
    ],
    trustChecks: {
      gpsInParcel: d.gpsInParcel,
      liveCameraOnly: d.liveCameraOnly,
      deviceAttested: d.deviceAttested,
      sunAngleMatched: d.sunAngleMatched,
      faceMatched: d.faceMatched,
      floorCoverageLocked: d.floorsWalked >= CAPTURE_SITE.exteriorFloors,
    },
    surveyDeedNumbers: [CAPTURE_SURVEY.replace('Khasra ', '')],
    surveyPattaNumbers: d.docs.includes('VERNACULAR') ? [CAPTURE_SURVEY.replace('Khasra ', '')] : undefined,
    vernacularDocsParsed: d.docs.includes('VERNACULAR')
      ? [{ language: 'Hindi', docType: 'Land Record Extract', summary: `${CAPTURE_SURVEY} · 1,795 sqft · owner name matches Sale Deed.` }]
      : undefined,

    esignStatus: 'PENDING',
    details: [
      { label: 'Capture Channel', value: d.channel === 'WHATSAPP_REP' ? 'Zero-Install WhatsApp Rep Link' : 'PRAMAAN Owner App' },
      { label: 'Property', value: 'Self-Occupied Residential RCC, G+2' },
      { label: 'Location', value: `${CAPTURE_SITE.locality}, ${CAPTURE_SITE.city} (demo self-capture template)` },
      { label: 'Documents', value: DOC_DEFS.filter((x) => d.docs.includes(x.id)).map((x) => x.label).join(', ') },
      { label: 'KYC', value: '[Aadhaar OTP Verified] · [PAN Verified] · Selfie face match' },
    ],
  };
}
