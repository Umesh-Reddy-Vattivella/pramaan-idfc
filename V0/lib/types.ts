/* ------------------------------------------------------------------
   PRAMAAN — Core TypeScript Data Model (PRD §5.2)
   ------------------------------------------------------------------ */

export type UsageClass = 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED_USE' | 'INDUSTRIAL' | 'INSTITUTIONAL';
export type RouteTier = 'INSTANT' | 'REMOTE_REVIEW' | 'PHYSICAL_CHECK';
export type QcStatus = 'PASS' | 'WARN' | 'FAIL' | 'CRITICAL_FAIL';
export type SpatialTier = 'MICRO_1KM' | 'WARD_VILLAGE' | 'SRO_ZONE' | 'DISTRICT';

export interface PriceSourceInput {
  id: 'REGD_DEEDS' | 'LISTINGS' | 'IDFC_ARCHIVE' | 'AUCTIONS' | 'RERA_BUILDER' | 'CIRCLE_RATE';
  label: string;
  count: number;
  rawRatePerSqft: number;
  correctionFormulaLabel: string;
  correctionFactor: number; // e.g., k_reg=1.45, (1-d)=0.86, 1/f=1.25
  correctedRatePerSqft: number;
  weight: number; // 0 for CIRCLE_RATE; sum = 1.0 for active sources
  medianAgeMonths: number;
}

export interface ComparablePin {
  id: string;
  source: PriceSourceInput['id'];
  lat: number;
  lng: number;
  distanceKm: number;
  date: string;
  rawRate: number;
  adjustedRate: number;
  note: string;
  url?: string; // source page for live-search / manual comparables
}

export interface FloorAreaRow {
  floorName: string;
  sanctionedSqft: number;
  actualSqft: number;
  isTinShedOrTemporary?: boolean;
}

export interface AutoQcFinding {
  ruleId: 'QC-1' | 'QC-2' | 'QC-3' | 'QC-4' | 'QC-5' | 'QC-6';
  title: string;
  status: QcStatus;
  legacyReportValue: string;
  pramaanDetection: string;
  actionRequired: string;
}

export interface PropertyCase {
  id: string;
  caseRefNo: string;
  title: string;
  city: string;
  state: string;
  applicantName: string;
  isBenchmarkSample: boolean;
  legacyAgencyName?: string;
  legacyTatDays?: number;
  pramaanTatMinutes: number;
  lat: number;
  lng: number;
  sanctionedMapGeoOffsetMeters?: number; // e.g., 74m for R2
  // Measure Inputs
  deedPlotAreaSqft: number;
  cadastralPlotAreaSqft: number;
  roadWideningLossSqft: number;
  roadWidthCurrentFt: number;
  roadWidthProposedFt?: number;
  floors: FloorAreaRow[];
  hasSanctionedPlan: boolean;
  noPlanPolicy: 'LAND_ONLY' | 'INSTITUTIONAL_EXCEPTION' | 'STANDARD';
  exteriorDetectedFloors: number;
  interiorWalkedFloors: number;
  ageYears: number;
  residualLifeYears: number;
  gisHazards: {
    forestBuffer: boolean;
    forestRtiCleared?: boolean;
    roadWidening: boolean;
    crzOrWaterbody: boolean;
    htLine: boolean;
    cautionArea: boolean;
    negativeArea: boolean;
  };
  boundaries: {
    direction: 'East' | 'West' | 'North' | 'South';
    asPerDeed: string;
    atSiteSatellite: string;
    matched: boolean;
  }[];
  // Price Inputs
  priceSources: PriceSourceInput[];
  circleRatePerSqft: number;
  spatialFallbackTier: SpatialTier;
  isTypicalProperty: boolean;
  comparables: ComparablePin[];
  constructionRatePerSqft: number;
  amenitiesValueInr: number;
  fsvRatio: number; // 0.80 or 0.85
  monthlyRentInr?: number; // e.g., 1600000 for R2
  capRate?: number; // e.g., 0.085
  // Usage & Trust Inputs
  cvDetectedUsage: UsageClass;
  cvConfidencePct: number;
  recordConfirmedUsage: UsageClass;
  utilitySummary: string;
  trustChecks: {
    gpsInParcel: boolean;
    liveCameraOnly: boolean;
    deviceAttested: boolean;
    sunAngleMatched: boolean;
    floorCoverageLocked: boolean;
  };
  // Legacy Audit Comparison Fields (for Auto-QC)
  legacyStatedLandRate?: number;
  legacyStatedValueWords?: string;
  legacyStatedMarketValueInr?: number; // numeric MV printed in legacy report (QC-1 figure vs words)
  legacyReportDate?: string;           // legacy report date (QC-2: Visit <= Report <= e-Sign)
  legacyDemolitionRisk?: 'Low' | 'Medium' | 'High' | 'No';
  legacyVisitDate?: string;
  legacyRemarkVisitDate?: string;
  legacySignDate?: string;
  legacyStageOfConstruction?: string;
  legacyRemarksText?: string;
  surveyDeedNumbers?: string[];
  surveyPattaNumbers?: string[];
  legacyRemarkSurveyNumbers?: string[];
  vernacularDocsParsed?: { language: string; docType: string; summary: string }[];
  // Sign-off state
  esignStatus: 'PENDING' | 'SIGNED_BY_VALUER' | 'ESCALATED_PHYSICAL';
  signedByValuer?: { name: string; ibbiRegNo: string; timestamp: string; signatureHash?: string; validUntil?: string };

  // ---- Extensions (not in PRD §5.2) needed to reproduce PRD §4 seed values ----
  fileNo?: string;                          // e.g. 'IDFC/UKDDN26051909'
  benchmarkLabel?: 'R1' | 'R2' | 'R3';      // IDFC sample report identifier
  origin?: CaseOrigin;
  permissibleBuaSqft?: number;              // by-law permissible BUA (deviation reference when no plan, e.g. R1 3,721)
  adoptedLandRatePerSqft?: number;          // land rate adopted for MV when it differs from PRAMAAN consensus (R1: 9,000 legacy baseline)
  adoptedLandRateBasis?: string;
  constructionRateIsDepreciated?: boolean;  // true => constructionRatePerSqft is already the as-valued (depreciated) rate
  requestedLoanInr?: number;                // example loan request (R3: Rs. 2.0 Cr)
  details?: { label: string; value: string }[]; // descriptive report fields for display
  roadSide?: 'East' | 'West' | 'North' | 'South'; // approach-road side (map widening overlay)
  liveEvidence?: LiveEvidenceSnapshot; // live market evidence snapshot (replays offline)
  cvDetections?: { label: string; confidencePct: number; frame: string; usage: UsageClass }[]; // CV photo annotations
  /** Loan-origination (LOS) record this valuation was triggered from — pre-fills the customer link. */
  los?: LosRecord;
  /** Customer valuation link (sent from the bank) and what came back from it. */
  customerLink?: CustomerLinkState;
  /** Shared case file (server) that the bank portal and the customer portal both work on. */
  portal?: { caseRef: string; token: string; accessCode: string; mobileMasked: string; createdAt: string };
}

/* ---------------- Shared case file: bank portal ⇄ customer portal ---------------- */

export type PropertyKind = 'HOUSE' | 'FLAT' | 'COMMERCIAL' | 'INDUSTRIAL' | 'PLOT';
export type Party = 'BANK' | 'CUSTOMER';
export type DocRequestStatus = 'REQUESTED' | 'UPLOADED' | 'VERIFIED' | 'REJECTED' | 'NOT_AVAILABLE';

export interface DocUpload {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  uploadedBy: Party;
  uploadedAt: string;
  /** Small image preview (data-URL) for the list; full file via /api/files/:id. */
  preview?: string;
}

export interface DocRequest {
  id: string;
  type: LosDocType;
  label: string;
  help: string;
  mandatory: boolean;
  /** Who is expected to provide it. Either side can still upload. */
  assignee: Party;
  status: DocRequestStatus;
  uploads: DocUpload[];
  note?: string;
}

export interface CaseEvent {
  at: string;
  by: Party;
  text: string;
}

export interface CaseFileInit {
  caseId: string;
  caseRef: string;
  borrowerName: string;
  mobile: string;
  propertyKind: PropertyKind;
  propertyType: UsageClass;
  propertyAddress: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  parcel: [number, number][];
  floors: string[];
  checklist: DocRequest[];
  captureRequested: boolean;
}

/** What either portal sees (no secrets). */
export interface CaseFileView extends Omit<CaseFileInit, 'mobile'> {
  mobileMasked: string;
  token: string;
  capture?: CaptureSubmission;
  events: CaseEvent[];
  createdAt: string;
  updatedAt: string;
  customerLastLoginAt?: string;
  /** GPS fixes shared by the customer's phone (audit trail of where the capture happened). */
  locationTrack?: LocationFix[];
}

/* ---------------- Loan origination (LOS) record + customer link ---------------- */

export type LosDocType =
  | 'SALE_DEED'
  | 'TITLE_CHAIN'
  | 'ENCUMBRANCE_CERT'
  | 'INDEX_II'
  | 'APPROVED_PLAN'
  | 'LAYOUT_PLAN'
  | 'LAND_RECORD'
  | 'PROPERTY_TAX'
  | 'OC_CC'
  | 'EB_BILL'
  | 'SOCIETY_NOC'
  | 'SHARE_CERTIFICATE'
  | 'BUILDER_AGREEMENT'
  | 'NA_ORDER'
  | 'MUTATION'
  | 'TRADE_LICENSE'
  | 'OTHER';

export type LosDocStatus = 'ON_FILE' | 'PENDING' | 'UPLOADED' | 'NOT_AVAILABLE' | 'NOT_APPLICABLE';

export interface LosDocument {
  type: LosDocType;
  label: string;
  mandatory: boolean;
  status: LosDocStatus;
  /** Reference printed on the document (doc no., plan no., ULPIN …). */
  ref?: string;
  /** Title-chain / EC coverage, calendar years. */
  coversFromYear?: number;
  coversToYear?: number;
  /** File name when uploaded through the customer link. */
  fileName?: string;
}

export interface LosRecord {
  loanAppNo: string;
  product: 'LAP';
  borrowerName: string;
  propertyAddress: string;
  propertyType: UsageClass;
  /** KYC is done once at onboarding — never repeated in the technical journey. */
  kycStatus: string;
  sourcedBy: string;
  documents: LosDocument[];
}

export interface GeoPhoto {
  id: string;
  /** Shot-list slot, e.g. 'FRONT', 'LEFT', 'INTERIOR_GF'. */
  slot: string;
  label: string;
  lat: number;
  lng: number;
  accuracyM: number;
  takenAt: string; // ISO
  /** Age of the image file when attached (ms) — gallery uploads are old. */
  fileAgeMs: number;
  hash: string;
  /** Small JPEG data-URL thumbnail (<= 360 px). */
  thumb?: string;
  /** Full-resolution image in file storage (/api/files/:id). */
  fileId?: string;
  /** Taken during a bank-directed live video call. */
  viaCall?: boolean;
}

/** One GPS fix from the customer's phone (location permission granted). */
export interface LocationFix {
  lat: number;
  lng: number;
  accuracyM: number;
  at: string;
  source: 'CALL' | 'PORTAL' | 'CAPTURE';
}

export type RoomMethod = 'AR' | 'TAPE' | 'REFERENCE_OBJECT';

export interface RoomMeasurement {
  id: string;
  name: string;
  floorName: string;
  lengthFt: number;
  widthFt: number;
  method: RoomMethod;
}

export type CapturedBy = 'OWNER' | 'FAMILY' | 'REPRESENTATIVE';

export interface CaptureSubmission {
  submittedAt: string;
  capturedBy: CapturedBy;
  photos: GeoPhoto[];
  rooms: RoomMeasurement[];
  /** Document statuses after the customer's step (uploads / "not available"). */
  documents: LosDocument[];
  userAgent?: string;
  arSupported?: boolean;
}

export interface LinkPrefill {
  token: string;
  caseId: string;
  loanAppNo: string;
  borrowerName: string;
  propertyAddress: string;
  propertyType: UsageClass;
  city: string;
  lat: number;
  lng: number;
  parcel: [number, number][];
  floors: string[];
  documents: LosDocument[];
  createdAt: string;
  expiresAt: string;
}

export type LinkStatus = 'SENT' | 'OPENED' | 'SUBMITTED';

export interface CustomerLinkState {
  token: string;
  url: string;
  sentAt: string;
  status: LinkStatus;
  openedAt?: string;
  submission?: CaptureSubmission;
}

export type CaseOrigin = 'SEED' | 'SELF_CAPTURE' | 'LIVE_UPLOAD' | 'LIVE_MARKET' | 'BANK_PORTAL';

/* ---------------- Live market evidence (Value a New Property) ---------------- */
export type MarketPointKind = 'SALE' | 'LISTING' | 'AUCTION' | 'RERA' | 'GUIDELINE';

export interface MarketDataPoint {
  id: string;
  kind: MarketPointKind;
  priceInr?: number;
  areaSqft?: number;
  statedRatePerSqft?: number;
  propertyType?: string;
  locality?: string;
  date?: string; // YYYY-MM or YYYY-MM-DD as printed
  url?: string;
  title?: string;
  origin: 'LIVE_SEARCH' | 'MANUAL';
  quote?: string; // exact text copied from the source page (verified present in it)
  lat?: number;
  lng?: number;
  distanceKm?: number;
  included: boolean;
}

export interface LiveEvidenceSnapshot {
  fetchedAt: string;
  mode: 'LIVE_SEARCH' | 'MANUAL' | 'MIXED';
  model?: string;
  queries: string[];
  citations: { title: string; uri: string }[];
  points: MarketDataPoint[];
  rejected: { title?: string; url?: string; reason: string }[];
}
