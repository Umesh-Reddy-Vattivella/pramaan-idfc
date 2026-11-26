/* ------------------------------------------------------------------
   Pre-Loaded Golden Seed Datasets (PRD §4).
   Cases 2–4 are digital reconstructions of IDFC FIRST Bank sample reports R1, R2, R3.
   Every figure stated in PRD §4 is reproduced verbatim. Inputs that §4 does not state
   (source median ages, spatial tier, comp counts for R2/R3, CV confidence, PRAMAAN TAT for
   R1–R3) are marked "CALIBRATED" and chosen so the deterministic engines reproduce the exact
   §4 outputs (consensus rate, Authenticity Score, MV, FSV, deviation %, route).
   ------------------------------------------------------------------ */
import type { ComparablePin, PriceSourceInput, PropertyCase } from '@/lib/types';
import { haversineMeters } from '@/lib/engines/trust';

export const SEED_VERSION = 2;

/* ---------------- Comparable pin helper ---------------- */

type CompRow = [
  id: string,
  source: PriceSourceInput['id'],
  northM: number,
  eastM: number,
  date: string,
  rawRate: number,
  adjustedRate: number,
  note: string,
];

/** Builds pins at metre offsets from the subject; distance is computed, never hand-typed. */
export function comps(center: { lat: number; lng: number }, rows: CompRow[]): ComparablePin[] {
  return rows.map(([id, source, northM, eastM, date, rawRate, adjustedRate, note]) => {
    const lat = +(center.lat + northM / 111320).toFixed(6);
    const lng = +(center.lng + eastM / (111320 * Math.cos((center.lat * Math.PI) / 180))).toFixed(6);
    const distanceKm = +(haversineMeters(center.lat, center.lng, lat, lng) / 1000).toFixed(2);
    return { id, source, lat, lng, distanceKm, date, rawRate, adjustedRate, note };
  });
}

/* ================================================================
   CASE 1 — Clean Showcase (INSTANT GREEN) — IDFC-PRM-2026-001
   ================================================================ */
const C1 = { lat: 21.1408, lng: 79.0604 };

const case1: PropertyCase = {
  id: 'idfc-prm-2026-001',
  fileNo: 'IDFC-PRM-2026-001',
  caseRefNo: '0505891042',
  title: 'Clean Independent Residential House — Dharampeth',
  city: 'Nagpur',
  state: 'Maharashtra',
  applicantName: 'Showcase Applicant (Self-Occupied Owner)',
  isBenchmarkSample: false,
  origin: 'SEED',
  pramaanTatMinutes: 38,
  lat: C1.lat,
  lng: C1.lng,

  deedPlotAreaSqft: 2400,
  cadastralPlotAreaSqft: 2390,
  roadWideningLossSqft: 0,
  roadWidthCurrentFt: 30,
  // Floor split CALIBRATED (G+1 equal floors); totals exact: Sanctioned 2,800 / Actual 2,860.
  floors: [
    { floorName: 'Ground Floor', sanctionedSqft: 1400, actualSqft: 1430 },
    { floorName: 'First Floor', sanctionedSqft: 1400, actualSqft: 1430 },
  ],
  hasSanctionedPlan: true,
  noPlanPolicy: 'STANDARD',
  exteriorDetectedFloors: 2,
  interiorWalkedFloors: 2,
  ageYears: 4,
  residualLifeYears: 56,
  gisHazards: {
    forestBuffer: false,
    roadWidening: false,
    crzOrWaterbody: false,
    htLine: false,
    cautionArea: false,
    negativeArea: false,
  },
  boundaries: [
    { direction: 'East', asPerDeed: 'Residential plot', atSiteSatellite: 'Residential house', matched: true },
    { direction: 'West', asPerDeed: '30 ft road', atSiteSatellite: '30 ft paved road', matched: true },
    { direction: 'North', asPerDeed: 'Residential plot', atSiteSatellite: 'Residential house', matched: true },
    { direction: 'South', asPerDeed: 'Residential plot', atSiteSatellite: 'Residential house', matched: true },
  ],

  // Engine 2 — exact §4 values. medianAgeMonths CALIBRATED (pooled median 12 mo → S = 91).
  priceSources: [
    { id: 'REGD_DEEDS', label: 'Registered Sale Deeds (IGR)', count: 16, rawRatePerSqft: 5400, correctionFormulaLabel: 'median(r_reg) × k_reg (1.38)', correctionFactor: 1.38, correctedRatePerSqft: 7452, weight: 0.3, medianAgeMonths: 10 },
    { id: 'LISTINGS', label: 'Online Portal Listings', count: 28, rawRatePerSqft: 8800, correctionFormulaLabel: 'median(r_ask) × (1 − d), d = 14%', correctionFactor: 0.86, correctedRatePerSqft: 7568, weight: 0.25, medianAgeMonths: 12 },
    { id: 'IDFC_ARCHIVE', label: 'IDFC Past Valuation Reports', count: 9, rawRatePerSqft: 7600, correctionFormulaLabel: 'r_then × (HPI_now / HPI_then) — indexed', correctionFactor: 1.0, correctedRatePerSqft: 7600, weight: 0.35, medianAgeMonths: 14 },
    { id: 'AUCTIONS', label: 'Bank Auctions (SARFAESI)', count: 3, rawRatePerSqft: 6150, correctionFormulaLabel: 'r_auction / f, f = 0.80', correctionFactor: 1.25, correctedRatePerSqft: 7688, weight: 0.1, medianAgeMonths: 20 },
    { id: 'CIRCLE_RATE', label: 'Circle / Guideline Rate (SRO)', count: 1, rawRatePerSqft: 2800, correctionFormulaLabel: 'Floor sanity check only (weight 0%)', correctionFactor: 1, correctedRatePerSqft: 2800, weight: 0, medianAgeMonths: 0 },
  ],
  circleRatePerSqft: 2800,
  spatialFallbackTier: 'MICRO_1KM',
  isTypicalProperty: true,
  comparables: comps(C1, [
    ['C1-D1', 'REGD_DEEDS', 320, -410, '2026-03-18', 5350, 7383, 'Regd. sale — 2,000 sqft residential plot, Dharampeth Extension'],
    ['C1-D2', 'REGD_DEEDS', -540, 260, '2026-01-09', 5480, 7562, 'Regd. sale — independent house plot, Ramnagar side'],
    ['C1-L1', 'LISTINGS', 610, 180, '2026-10-02', 8900, 7654, 'Portal listing (de-duped) — G+1 bungalow plot, Shivaji Nagar'],
    ['C1-L2', 'LISTINGS', -220, -690, '2026-09-14', 8650, 7439, 'Portal listing (de-duped) — corner plot, Gokulpeth'],
    ['C1-I1', 'IDFC_ARCHIVE', 140, 520, '2025-09-22', 7450, 7600, 'IDFC LAP valuation (HPI-indexed) — residential, Dharampeth'],
    ['C1-I2', 'IDFC_ARCHIVE', -760, -300, '2025-07-30', 7380, 7560, 'IDFC home-loan valuation (HPI-indexed) — Ambazari Road'],
    ['C1-A1', 'AUCTIONS', 880, 640, '2025-03-11', 6150, 7688, 'SARFAESI auction (÷0.80) — residential plot, Ravi Nagar'],
  ]),
  constructionRatePerSqft: 1950,
  constructionRateIsDepreciated: true,
  amenitiesValueInr: 0,
  fsvRatio: 0.85,

  cvDetectedUsage: 'RESIDENTIAL',
  cvConfidencePct: 98,
  recordConfirmedUsage: 'RESIDENTIAL',
  utilitySummary: 'Domestic MSEDCL EB tariff + Residential property-tax class',
  roadSide: 'West',
  cvDetections: [
    { label: 'Residential Kitchen', confidencePct: 98, frame: 'Interior — GF kitchen', usage: 'RESIDENTIAL' },
    { label: 'Bedroom Furniture', confidencePct: 97, frame: 'Interior — FF bedroom', usage: 'RESIDENTIAL' },
    { label: 'Domestic Facade', confidencePct: 96, frame: 'Exterior — front elevation', usage: 'RESIDENTIAL' },
  ],
  trustChecks: { gpsInParcel: true, liveCameraOnly: true, deviceAttested: true, sunAngleMatched: true, floorCoverageLocked: true },

  esignStatus: 'PENDING',
  details: [
    { label: 'Property', value: 'Self-Occupied Residential RCC, G+1' },
    { label: 'Jurisdiction', value: 'Within NMC Municipal Limits | Residential Zone' },
    { label: 'Approach Road', value: '30 ft paved approach road | 0 m road widening | 0 GIS hazards' },
    { label: 'Documents', value: 'Sale Deed, NMC Sanctioned Plan, Property Tax Receipt, Domestic MSEDCL EB Bill — verified via DigiLocker / OCR' },
    { label: 'Status', value: 'All Trust Layer checks PASS | All 6 Auto-QC rules PASS | Ready for 1-click Phase 1 Remote Valuer e-Sign' },
  ],
};

/* ================================================================
   CASE 2 — IDFC Sample Report 1 (REMOTE REVIEW AMBER) — IDFC/UKDDN26051909
   ================================================================ */
const R1 = { lat: 30.279861, lng: 77.973972 };

const case2: PropertyCase = {
  id: 'idfc-ukddn26051909',
  fileNo: 'IDFC/UKDDN26051909',
  benchmarkLabel: 'R1',
  caseRefNo: '0505658323',
  title: 'Residential Property — Chandrabadni',
  city: 'Dehradun',
  state: 'Uttarakhand',
  applicantName: 'Mr. Anoop Singh Chauhan s/o Mr. Ashok Singh Chauhan',
  isBenchmarkSample: true,
  origin: 'SEED',
  legacyAgencyName: 'Black Olive Ventures',
  legacyTatDays: 10,
  pramaanTatMinutes: 43, // CALIBRATED (not stated in PRD §4)
  lat: R1.lat,
  lng: R1.lng,

  deedPlotAreaSqft: 3831,
  cadastralPlotAreaSqft: 3831, // no separate record area stated; record = deed
  roadWideningLossSqft: 282,
  roadWidthCurrentFt: 47,
  roadWidthProposedFt: 78.72,
  // Permissible (by-law) vs actual per floor — exact §4 values.
  floors: [
    { floorName: 'Ground Floor (Parking)', sanctionedSqft: 1298, actualSqft: 1298 },
    { floorName: 'First Floor', sanctionedSqft: 1298, actualSqft: 1298 },
    { floorName: 'Second Floor', sanctionedSqft: 1125, actualSqft: 1298 },
    { floorName: 'Mumty', sanctionedSqft: 0, actualSqft: 384 },
  ],
  permissibleBuaSqft: 3721,
  hasSanctionedPlan: false,
  noPlanPolicy: 'LAND_ONLY',
  exteriorDetectedFloors: 4,
  interiorWalkedFloors: 4,
  ageYears: 1,
  residualLifeYears: 59,
  gisHazards: {
    forestBuffer: true,
    forestRtiCleared: true,
    roadWidening: true,
    crzOrWaterbody: false,
    htLine: false,
    cautionArea: false,
    negativeArea: false,
  },
  boundaries: [
    { direction: 'East', asPerDeed: 'Land of Deepak Rana', atSiteSatellite: 'House of Sarika & Anoop Singh', matched: true },
    { direction: 'West', asPerDeed: 'Land of Buyer (Anoop Singh)', atSiteSatellite: 'House of Suman Singh Negi', matched: true },
    { direction: 'North', asPerDeed: '28 ft road', atSiteSatellite: '47 ft road', matched: true },
    { direction: 'South', asPerDeed: '8 ft road & land of Suman Negi', atSiteSatellite: '11 ft road', matched: true },
  ],

  // Engine 2 — exact §4 values. Ages + spatial tier CALIBRATED (S = 84).
  priceSources: [
    { id: 'REGD_DEEDS', label: 'Registered Sale Deeds (IGR)', count: 12, rawRatePerSqft: 6100, correctionFormulaLabel: 'median(r_reg) × k_reg (1.45)', correctionFactor: 1.45, correctedRatePerSqft: 8845, weight: 0.3, medianAgeMonths: 6 },
    { id: 'LISTINGS', label: 'Online Portal Listings', count: 31, rawRatePerSqft: 10400, correctionFormulaLabel: 'median(r_ask) × (1 − d), d = 14%', correctionFactor: 0.86, correctedRatePerSqft: 8944, weight: 0.25, medianAgeMonths: 9 },
    { id: 'IDFC_ARCHIVE', label: 'Past IDFC Valuation Reports', count: 7, rawRatePerSqft: 9200, correctionFormulaLabel: 'r_then × (HPI_now / HPI_then) — indexed', correctionFactor: 1.0, correctedRatePerSqft: 9200, weight: 0.35, medianAgeMonths: 14 },
    { id: 'AUCTIONS', label: 'Bank Auctions (SARFAESI)', count: 2, rawRatePerSqft: 7600, correctionFormulaLabel: 'r_auction / f, f = 0.80', correctionFactor: 1.25, correctedRatePerSqft: 9500, weight: 0.1, medianAgeMonths: 20 },
  ],
  circleRatePerSqft: 0, // not stated in IDFC Report 1
  spatialFallbackTier: 'WARD_VILLAGE',
  isTypicalProperty: false, // irregular plot shape
  comparables: comps(R1, [
    ['R1-D1', 'REGD_DEEDS', 410, -280, '2026-05-06', 6050, 8773, 'Regd. sale — residential plot, Chandrabadni'],
    ['R1-D2', 'REGD_DEEDS', -350, 520, '2026-04-17', 6180, 8961, 'Regd. sale — plot off Wildlife Institute Rd'],
    ['R1-L1', 'LISTINGS', 690, 150, '2026-02-20', 10600, 9116, 'Portal listing (de-duped) — house plot, Chandrabani Rd'],
    ['R1-L2', 'LISTINGS', -620, -430, '2026-03-03', 10250, 8815, 'Portal listing (de-duped) — residential plot, Mehuwala side'],
    ['R1-I1', 'IDFC_ARCHIVE', 230, 760, '2025-09-12', 8950, 9200, 'IDFC LAP valuation (HPI-indexed) — residential, Chandrabadni'],
    ['R1-I2', 'IDFC_ARCHIVE', -880, 90, '2025-08-28', 8900, 9150, 'IDFC valuation (HPI-indexed) — G+2 residence, Turner Rd side'],
    ['R1-A1', 'AUCTIONS', 1050, -620, '2025-03-25', 7600, 9500, 'SARFAESI auction (÷0.80) — residential plot'],
  ]),
  constructionRatePerSqft: 0, // land-only policy; construction not valued
  constructionRateIsDepreciated: true,
  amenitiesValueInr: 0,
  fsvRatio: 0.8,
  adoptedLandRatePerSqft: 9000,
  adoptedLandRateBasis: 'Legacy valuer baseline Rs. 9,000/sqft (PRAMAAN consensus Rs. 9,060/sqft shown for comparison)',

  cvDetectedUsage: 'RESIDENTIAL',
  cvConfidencePct: 94, // CALIBRATED
  recordConfirmedUsage: 'RESIDENTIAL',
  utilitySummary: 'Residential use within Nagar Nigam limit (GF parking; FF & SF residential units)',
  roadSide: 'North',
  cvDetections: [
    { label: 'Residential Kitchen Units', confidencePct: 94, frame: 'Interior — FF kitchen', usage: 'RESIDENTIAL' },
    { label: 'GF Stilt Parking', confidencePct: 95, frame: 'Exterior — ground floor', usage: 'RESIDENTIAL' },
    { label: 'Mumty Stair Cabin', confidencePct: 92, frame: 'Exterior — roof level', usage: 'RESIDENTIAL' },
  ],
  trustChecks: { gpsInParcel: true, liveCameraOnly: true, deviceAttested: true, sunAngleMatched: true, floorCoverageLocked: true },

  legacyStatedLandRate: 9000,
  legacyVisitDate: '25/05/2026',
  legacyReportDate: '26/05/2026',
  legacySignDate: '04/06/2026',
  legacyStageOfConstruction: '100%',
  legacyRemarksText: "Remarks describe the subject as an 'under-construction property'.",
  surveyDeedNumbers: ['2206', '2221'],
  surveyPattaNumbers: ['2206', '2221'],
  vernacularDocsParsed: [
    {
      language: 'Hindi',
      docType: 'Forest Division RTI Reply (dated 13 Mar 2026)',
      summary: 'Confirms Khasra 2206 & 2221 are NOT Section 4/20 forest land.',
    },
  ],

  esignStatus: 'PENDING',
  details: [
    { label: 'Location', value: 'Chandrabadni, near Wildlife Institute & Shiv Bhadrakali Mandir, Dehradun' },
    { label: 'Property', value: 'Vacant Residential RCC, GF+2+Mumty (GF Parking; FF & SF 4 Rooms / 4 Kitchens / 4 T&B each)' },
    { label: 'Jurisdiction', value: 'Within Nagar Nigam Limit' },
    { label: 'Approach Road', value: '47 ft wide (North & South) | Master Plan road widening 24 m (78.72 ft) proposed → 15.86 ft plot depth lost (−282 sqft)' },
    { label: 'Net Plot', value: '3,549 sqft (329.71 sqmt) after road widening | Irregular plot shape' },
    { label: 'Sanctioned Plan', value: 'NOT PROVIDED → Policy enforces Land-Only Value (BUA_valued = 0)' },
    { label: 'Forest Buffer', value: 'Adjacent Wildlife Forest Buffer — Hindi Forest Division RTI (13 Mar 2026) verified via Vernacular OCR' },
    { label: 'Legacy Timeline', value: 'Visit 25/05/2026 → Report 26/05/2026 → Signed 04/06/2026 (10-day TAT)' },
  ],
};

/* ================================================================
   CASE 3 — IDFC Sample Report 2 (PHYSICAL CHECK RED) — IDFC/UKDDN26061359
   ================================================================ */
const R2 = { lat: 30.33666, lng: 78.056372 };

const case3: PropertyCase = {
  id: 'idfc-ukddn26061359',
  fileNo: 'IDFC/UKDDN26061359',
  benchmarkLabel: 'R2',
  caseRefNo: '0505667804',
  title: 'Commercial Building (RS Tower) — Rajpur Road',
  city: 'Dehradun',
  state: 'Uttarakhand',
  applicantName: 'Mrs. Sarita Gupta & Mr. Abhilash Gupta',
  isBenchmarkSample: true,
  origin: 'SEED',
  legacyAgencyName: 'Black Olive Ventures',
  pramaanTatMinutes: 49, // CALIBRATED (not stated in PRD §4)
  lat: R2.lat,
  lng: R2.lng,
  sanctionedMapGeoOffsetMeters: 74,

  deedPlotAreaSqft: 5192,
  cadastralPlotAreaSqft: 5192, // doc land across 5 Sale/Gift Deeds
  roadWideningLossSqft: 1053, // 5,192 − 4,139 net after 33 m R/W (incl. 190 sqft front shop excluded)
  roadWidthCurrentFt: 68,
  roadWidthProposedFt: 108.27, // 33 m
  // Sanctioned (DLDA OC/0015 & OC/0009, 31.05.2024) vs actual — exact §4 values.
  floors: [
    { floorName: 'Ground / Stilt', sanctionedSqft: 2832, actualSqft: 3970 },
    { floorName: 'First Floor', sanctionedSqft: 2703, actualSqft: 3970 },
    { floorName: 'Second Floor', sanctionedSqft: 2703, actualSqft: 3970 },
    { floorName: 'Third Floor', sanctionedSqft: 2703, actualSqft: 3970 },
    { floorName: 'Fourth Floor', sanctionedSqft: 2670, actualSqft: 3970 },
    { floorName: 'Fifth Floor (RCC)', sanctionedSqft: 0, actualSqft: 932 },
    { floorName: 'Fifth Floor Tin Shed', sanctionedSqft: 0, actualSqft: 3970, isTinShedOrTemporary: true },
  ],
  hasSanctionedPlan: true,
  noPlanPolicy: 'STANDARD',
  exteriorDetectedFloors: 6,
  interiorWalkedFloors: 6,
  ageYears: 1,
  residualLifeYears: 59,
  gisHazards: {
    forestBuffer: false,
    roadWidening: true,
    crzOrWaterbody: false,
    htLine: false,
    cautionArea: false,
    negativeArea: false,
  },
  boundaries: [],

  // §4 states only the triangulated Rs. 42,000/sqft and S = 74. Source breakdown CALIBRATED to give
  // consensus exactly Rs. 42,000 and S = 74 (thin high-ticket commercial market).
  priceSources: [
    { id: 'REGD_DEEDS', label: 'Rajpur Rd Commercial Deeds (IGR)', count: 3, rawRatePerSqft: 30000, correctionFormulaLabel: 'median(r_reg) × k_reg (1.42)', correctionFactor: 1.42, correctedRatePerSqft: 42600, weight: 0.35, medianAgeMonths: 8 },
    { id: 'LISTINGS', label: 'Commercial Listings', count: 4, rawRatePerSqft: 49000, correctionFormulaLabel: 'median(r_ask) × (1 − d), d = 16%', correctionFactor: 0.84, correctedRatePerSqft: 41160, weight: 0.25, medianAgeMonths: 2 },
    { id: 'IDFC_ARCHIVE', label: 'IDFC Commercial Benchmarks', count: 2, rawRatePerSqft: 40000, correctionFormulaLabel: 'r_then × (HPI_now / HPI_then), HPI ratio 1.05', correctionFactor: 1.05, correctedRatePerSqft: 42000, weight: 0.4, medianAgeMonths: 5 },
  ],
  circleRatePerSqft: 0, // not stated in IDFC Report 2
  spatialFallbackTier: 'WARD_VILLAGE',
  isTypicalProperty: false, // high-ticket commercial trophy asset
  comparables: comps(R2, [
    ['R2-D1', 'REGD_DEEDS', 380, 120, '2026-03-27', 30200, 42880, 'Regd. sale — commercial frontage, Rajpur Rd (Dilaram Bazaar)'],
    ['R2-D2', 'REGD_DEEDS', -460, -90, '2026-02-12', 29600, 42030, 'Regd. sale — showroom plot, Rajpur Rd (Ghantaghar side)'],
    ['R2-L1', 'LISTINGS', 720, 210, '2026-09-18', 49500, 41580, 'Commercial listing (de-duped) — Rajpur Rd frontage'],
    ['R2-L2', 'LISTINGS', -260, 340, '2026-10-05', 48200, 40490, 'Commercial listing (de-duped) — Old Survey Rd junction'],
    ['R2-I1', 'IDFC_ARCHIVE', 150, -380, '2026-06-20', 40000, 42000, 'IDFC commercial valuation (HPI-indexed) — Rajpur Rd'],
    ['R2-I2', 'IDFC_ARCHIVE', -830, -210, '2026-05-02', 39800, 41790, 'IDFC commercial valuation (HPI-indexed) — EC Rd side'],
  ]),
  constructionRatePerSqft: 2000,
  constructionRateIsDepreciated: true,
  amenitiesValueInr: 0,
  fsvRatio: 0.8,
  monthlyRentInr: 1600000,
  capRate: 0.085,

  cvDetectedUsage: 'COMMERCIAL',
  cvConfidencePct: 96, // CALIBRATED
  recordConfirmedUsage: 'COMMERCIAL',
  utilitySummary: 'Commercial Master Plan zone + registered 9-yr lease to IDFC FIRST Bank Ltd (Reg No. 11154 dated 12/12/2024)',
  roadSide: 'West',
  cvDetections: [
    { label: 'Commercial Signage', confidencePct: 96, frame: 'Exterior — Rajpur Rd frontage', usage: 'COMMERCIAL' },
    { label: 'Bank Branch Counters', confidencePct: 95, frame: 'Interior — ground floor', usage: 'COMMERCIAL' },
    { label: '5th Floor Tin Shed', confidencePct: 94, frame: 'Exterior — roof level', usage: 'COMMERCIAL' },
  ],
  trustChecks: { gpsInParcel: true, liveCameraOnly: true, deviceAttested: true, sunAngleMatched: true, floorCoverageLocked: true },

  legacyDemolitionRisk: 'Low',
  legacyVisitDate: '12/06/2026',
  legacyReportDate: '13/06/2026',

  esignStatus: 'PENDING',
  details: [
    { label: 'Location', value: 'Rajpur Road, Dilaram Bazaar, near Vishal Mega Mart, Dehradun' },
    { label: 'Tenant', value: 'IDFC FIRST Bank Ltd — 9-yr Lease Reg No. 11154 dated 12/12/2024 at Rs. 16,00,000/month' },
    { label: 'Property', value: 'Tenant-Occupied Commercial RCC, GF/Stilt + 04 + Mumty + 5th Floor Tin Shed, 2 Lifts' },
    { label: 'Jurisdiction', value: 'Within MC Limit | Commercial Master Plan Zone' },
    { label: 'Approach Road', value: '68 ft paved Rajpur Road (West) | Proposed 33 m R/W road widening' },
    { label: 'Net Plot', value: '4,139 sqft (384.52 sqmt) after R/W | Doc land 5,192 sqft (5 Sale/Gift Deeds)' },
    { label: 'Sanctioned Maps', value: 'DLDA OC/0015/24-25 & OC/0009/24-25 (31.05.2024) | OC/0015 geo-tag ~74 m offset; OC/0009 matches site' },
    { label: 'Excluded', value: '190 sqft front shop — outside bank possession & in widening' },
    { label: 'Legacy Timeline', value: 'Visit 12/06/2026 → Report 13/06/2026' },
  ],
};

/* ================================================================
   CASE 4 — IDFC Sample Report 3 (REMOTE REVIEW AMBER) — ADR/CBE/July/26/IDFC/022
   ================================================================ */
const R3 = { lat: 11.092555, lng: 76.94705 };

const case4: PropertyCase = {
  id: 'adr-cbe-july-26-idfc-022',
  fileNo: 'ADR/CBE/July/26/IDFC/022',
  benchmarkLabel: 'R3',
  caseRefNo: '0505783489',
  title: 'Residential Building — NGGO Colony, Thudiyalur',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  applicantName: 'Mr. A. Subramaniyan (s/o Ammasai Gounder)',
  isBenchmarkSample: true,
  origin: 'SEED',
  legacyAgencyName: 'Adroit Technical Services',
  legacyTatDays: 18,
  pramaanTatMinutes: 39, // CALIBRATED (not stated in PRD §4)
  lat: R3.lat,
  lng: R3.lng,

  deedPlotAreaSqft: 6000,
  cadastralPlotAreaSqft: 5920, // Tamil Patta (550 sqmt)
  roadWideningLossSqft: 0,
  roadWidthCurrentFt: 30,
  floors: [
    { floorName: 'Ground Floor (3BHK + Others 4)', sanctionedSqft: 0, actualSqft: 3200 },
    { floorName: 'First Floor (2 Room + 2 Hall + Others 2)', sanctionedSqft: 0, actualSqft: 2100 },
  ],
  hasSanctionedPlan: false,
  noPlanPolicy: 'INSTITUTIONAL_EXCEPTION',
  exteriorDetectedFloors: 2,
  interiorWalkedFloors: 2,
  ageYears: 14,
  residualLifeYears: 45,
  gisHazards: {
    forestBuffer: false,
    roadWidening: false,
    crzOrWaterbody: false,
    htLine: false,
    cautionArea: false,
    negativeArea: false,
  },
  boundaries: [],

  // §4 states land rate Rs. 3,910, guideline Rs. 500 (7.82x) and S = 78. Source breakdown CALIBRATED
  // to give consensus exactly Rs. 3,910 and S = 78.
  priceSources: [
    { id: 'REGD_DEEDS', label: 'Registered Sale Deeds (TNREGINET)', count: 6, rawRatePerSqft: 2500, correctionFormulaLabel: 'median(r_reg) × k_reg (1.588)', correctionFactor: 1.588, correctedRatePerSqft: 3970, weight: 0.4, medianAgeMonths: 9 },
    { id: 'LISTINGS', label: 'Online Portal Listings', count: 4, rawRatePerSqft: 4825, correctionFormulaLabel: 'median(r_ask) × (1 − d), d = 20%', correctionFactor: 0.8, correctedRatePerSqft: 3860, weight: 0.3, medianAgeMonths: 3 },
    { id: 'IDFC_ARCHIVE', label: 'Past IDFC Valuation Reports', count: 2, rawRatePerSqft: 3200, correctionFormulaLabel: 'r_then × (HPI_now / HPI_then), HPI ratio 1.2125', correctionFactor: 1.2125, correctedRatePerSqft: 3880, weight: 0.3, medianAgeMonths: 18 },
    { id: 'CIRCLE_RATE', label: 'TNREGINET Guideline Value', count: 1, rawRatePerSqft: 500, correctionFormulaLabel: 'Floor sanity check only (weight 0%)', correctionFactor: 1, correctedRatePerSqft: 500, weight: 0, medianAgeMonths: 0 },
  ],
  circleRatePerSqft: 500,
  spatialFallbackTier: 'WARD_VILLAGE',
  isTypicalProperty: true,
  comparables: comps(R3, [
    ['R3-D1', 'REGD_DEEDS', 420, 310, '2026-02-16', 2480, 3938, 'Regd. sale — residential plot, NGGO Colony'],
    ['R3-D2', 'REGD_DEEDS', -380, -520, '2026-01-28', 2530, 4018, 'Regd. sale — house site, Kurudampalayam'],
    ['R3-L1', 'LISTINGS', 760, -140, '2026-08-21', 4900, 3920, 'Portal listing (de-duped) — residential plot, Thudiyalur'],
    ['R3-L2', 'LISTINGS', -640, 380, '2026-09-04', 4750, 3800, 'Portal listing (de-duped) — independent house, Asokapuram'],
    ['R3-I1', 'IDFC_ARCHIVE', 190, 860, '2025-05-14', 3200, 3880, 'IDFC valuation (HPI-indexed) — residential, Thudiyalur'],
    ['R3-I2', 'IDFC_ARCHIVE', -910, -260, '2025-04-03', 3150, 3819, 'IDFC valuation (HPI-indexed) — G+1 residence, Vellakinar side'],
  ]),
  constructionRatePerSqft: 1760, // depreciated construction rate (D = 21.36%)
  constructionRateIsDepreciated: true,
  amenitiesValueInr: 1500000, // EB, UGWT, Septic Tank
  fsvRatio: 0.85,
  requestedLoanInr: 20000000,

  cvDetectedUsage: 'RESIDENTIAL',
  cvConfidencePct: 97, // CALIBRATED
  recordConfirmedUsage: 'RESIDENTIAL',
  utilitySummary: 'EB Meter 21443611 (Consumer 0313300462, LA1A/DOMESTIC, 3-Phase 4 KW, LIVE) + Property Tax Assessment 4490',
  roadSide: 'North',
  cvDetections: [
    { label: 'Residential Kitchen', confidencePct: 97, frame: 'Interior — GF kitchen', usage: 'RESIDENTIAL' },
    { label: 'EB Meter LA1A/DOMESTIC', confidencePct: 96, frame: 'Exterior — meter board', usage: 'RESIDENTIAL' },
    { label: 'Household Furniture', confidencePct: 95, frame: 'Interior — FF hall', usage: 'RESIDENTIAL' },
  ],
  trustChecks: { gpsInParcel: true, liveCameraOnly: true, deviceAttested: true, sunAngleMatched: true, floorCoverageLocked: true },

  legacyStatedMarketValueInr: 33975200,
  legacyStatedValueWords: 'Fifty Five Lakh Sixty Thousand and Twenty Rupees Only',
  legacyVisitDate: '07.08.2026',
  legacyRemarkVisitDate: '04.07.2026',
  legacyReportDate: '10.08.2026',
  legacySignDate: '25.08.2026',
  surveyDeedNumbers: ['173A/1F'],
  surveyPattaNumbers: ['165/21', '173A/1A', '174A/1F'],
  legacyRemarkSurveyNumbers: ['173A/1F', '174A/1A'],
  vernacularDocsParsed: [
    {
      language: 'Tamil',
      docType: 'Patta (Order 2021/0103/12/305278)',
      summary: 'Lists THREE Survey Nos: 165/21 (0-4.50 Ares), 173A/1A (0-0.50 Ares), 174A/1F (0-0.50 Ares).',
    },
    {
      language: 'English',
      docType: 'Sale Deed Doc No. 5851/2010 (14.06.2010)',
      summary: 'Mentions ONLY SF No. 173A/1F.',
    },
    {
      language: 'English',
      docType: 'Property Tax Receipt (Assessment 4490)',
      summary: 'Rs. 2,642 paid 05-08-2026, Door 4/66 Richard Street — matched.',
    },
  ],

  esignStatus: 'PENDING',
  details: [
    { label: 'Location', value: 'NGGO Colony, Thudiyalur / Kurudampalayam, Asokapuram Village Panchayat, Coimbatore' },
    { label: 'Land Records', value: 'Tamil Nilam ULPIN 732SH2D9TJ1SH0 | Village LGD Code 644442 (Rural) | SRO Periyanayakkan Palayam' },
    { label: 'Property', value: 'Self-Occupied Residential RCC, G+1 | Residential Class I Type-I' },
    { label: 'Approach Road', value: 'North 30 ft East-West Road' },
    { label: 'Areas', value: 'Deed & Actual Plot 6,000 sqft vs Tamil Patta 5,920 sqft (550 sqmt) → least area valued | Actual BUA 5,300 sqft (Carpet 4,505 sqft)' },
    { label: 'Plans', value: 'Approved Building Plan & Layout Plan: NOT PROVIDED' },
    { label: 'Depreciation', value: 'Age 14 yrs, Residual 45 yrs (Total 59) → straight-line D = 21.36%' },
    { label: 'Loan Example', value: 'Loan request Rs. 2.0 Cr = 58.8% LTV (Max Collateral Loan at 70% LTV = Rs. 2.38 Cr)' },
    { label: 'Legacy Timeline', value: 'Visit 07.08.2026 → Report 10.08.2026 → Signed 25.08.2026 (18-day TAT)' },
  ],
};

export const SEED_CASES: PropertyCase[] = [case1, case2, case3, case4];
