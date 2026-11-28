/* PRAMAAN v3 domain model (PRD_V3.md). One Application document per LAP technical valuation. */

export type PropertyType = 'HOUSE' | 'FLAT' | 'PLOT' | 'SHOP_OFFICE' | 'COMMERCIAL_BUILDING' | 'INDUSTRIAL';
export type Usage = 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED' | 'INDUSTRIAL';
export type Structure = 'RCC' | 'LOAD_BEARING' | 'STEEL_SHED';
export type Party = 'BANK' | 'CUSTOMER';
export type DocStatus = 'PENDING' | 'UPLOADED' | 'VERIFIED' | 'REJECTED';
export type DocFrom = 'BANK' | 'CUSTOMER' | 'EITHER';

export interface DocFile {
  id: string;
  fileId: string;
  name: string;
  mime: string;
  size: number;
  by: Party;
  at: string;
}

export interface DocSlot {
  key: string;
  label: string;
  help: string;
  mandatory: boolean;
  from: DocFrom;
  files: DocFile[];
  status: DocStatus;
  /** Reason shown to the customer when rejected. */
  remark?: string;
  reviewedAt?: string;
}

export interface PropertyFacts {
  type: PropertyType;
  usage: Usage;
  address: string;
  lat: number | null;
  lng: number | null;
  locality?: string;
  city?: string;
  state?: string;
  /** Plot / land area as per the sale deed (sqft). For a flat: undivided share is not used. */
  plotAreaSqft: number | null;
  /** Built-up area as per deed / agreement (sqft). */
  builtUpSqft: number | null;
  floors: number | null;
  ageYears: number | null;
  structure: Structure;
  /** New construction rate, Rs./sqft (bank panel rate). */
  constructionRate: number | null;
}

export interface PlanFacts {
  approvedBuaSqft: number | null;
  approvedFloors: number | null;
  permissibleFsi: number | null;
  planRef?: string;
  authority?: string;
}

export interface TitleFacts {
  /** Year the title chain on file starts from. */
  chainFromYear: number | null;
}

export type SnapshotArea = 'EXTERIOR' | 'INTERIOR';

export interface Snapshot {
  id: string;
  label: string;
  area: SnapshotArea;
  floor?: string;
  fileId: string;
  thumb: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  takenAt: string;
  hash: string;
  /** CUSTOMER_DEVICE = full-res frame + GPS from the phone; BANK_FRAME = frame grabbed from the received video. */
  source: 'CUSTOMER_DEVICE' | 'BANK_FRAME';
  width?: number;
  height?: number;
  /** Snapped during the call but not yet placed on a designated view: kept out of the geo-fence and the report. */
  unassigned?: boolean;
}

export interface LocationFix {
  lat: number;
  lng: number;
  acc: number;
  at: string;
}

/** Where the floor plan came from: a copy from the authority's website, or the customer's upload. */
export type FloorPlanSource = 'GOVT_PORTAL' | 'CUSTOMER_UPLOAD';

/** Area of one floor as printed on the floor plan. */
export interface FloorArea {
  floor: string;
  areaSqft: number;
}

/** Floor-wise areas taken from the building's floor plan (replaces room-wise measurement). */
export interface FloorPlanFacts {
  source: FloorPlanSource | null;
  /** Permit / plan number, or the portal link the copy was taken from. */
  reference?: string;
  /** Basis printed on the plan: built-up (used as is) or carpet (× 1.2). */
  basis: 'BUILT_UP' | 'CARPET';
  floors: FloorArea[];
}

export type Occupancy = 'SELF' | 'RENTED' | 'VACANT';

export interface CallLog {
  id: string;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  status: string;
}

export interface Inspection {
  snapshots: Snapshot[];
  track: LocationFix[];
  /** Customer has location sharing switched on in the portal. */
  locationOn: boolean;
  observedFloors: number | null;
  observedUsage: Usage | null;
  occupancy: Occupancy | null;
  calls: CallLog[];
}

export type EvidenceCategory = 'LAND' | 'BUILT' | 'GUIDELINE';
/** Where a point's date came from: printed in the source, the page's publish date, or assumed (no date). */
export type DateSource = 'PRINTED' | 'PAGE' | 'ASSUMED';
/** Area basis printed with a flat / unit price. PRAMAAN values on built-up (carpet × 1.2). */
export type AreaBasis = 'CARPET' | 'BUILT_UP' | 'SUPER_BUILT_UP';
export type EvidenceKind = 'LISTING' | 'SALE' | 'AUCTION' | 'GUIDELINE';

export interface MarketPoint {
  id: string;
  category: EvidenceCategory;
  kind: EvidenceKind;
  priceInr?: number;
  areaSqft?: number;
  ratePerSqft?: number;
  propertyType?: string;
  locality?: string;
  date?: string;
  url?: string;
  title?: string;
  /** Exact text copied from the source. */
  quote?: string;
  lat?: number;
  lng?: number;
  /** LIVE_SEARCH = web search; MANUAL = typed by the valuer; OFFICIAL = government lookup (kept on re-fetch). */
  origin: 'LIVE_SEARCH' | 'MANUAL' | 'OFFICIAL';
  included: boolean;
  dateSource?: DateSource;
  areaBasis?: AreaBasis;
  /** Project / society name as printed (geocoded before the locality). */
  project?: string;
  /** Location is the centre of the printed locality, not the property itself. */
  approxLocation?: boolean;
  /** Government guideline rate (Rs./sqft) of the comparable's own locality, for the location adjustment. */
  gCompPerSqft?: number;
  /** Official government value the point was taken from (GUIDELINE points). */
  guideline?: GuidelineRef;
  /** Registered sale summary (Maharashtra Index II / sub-registrar record) the point was taken from. */
  registration?: RegistrationRef;
  /** Bank e-auction listing the point was taken from. */
  auction?: AuctionRef;
}

export interface RegistrationRef {
  docNo?: string;
  /** Sub-registrar office (SRO). */
  office?: string;
  /** Registration date, YYYY-MM-DD. */
  regDate?: string;
  /** Consideration (price paid) as registered, Rs. */
  considerationInr?: number;
  /** Government market value (ready-reckoner based) on the same deed, Rs. */
  govtValueInr?: number;
  /** The Index II printout / PDF stored with the case. */
  fileId?: string;
}

export type AuctionPlatform = 'BAANKNET' | 'IBAPI' | 'OTHER';

/** A row of the Telangana IGRS Market Value Search, as adopted by the valuer. */
export interface GuidelineRef {
  source: 'IGRS_TELANGANA';
  /** LAND = land value (Rs. per sq yd); APARTMENT = apartment value (Rs. per sqft). */
  basis: 'LAND' | 'APARTMENT';
  district: string;
  mandal?: string;
  village?: string;
  locality: string;
  wardBlock?: string;
  /** e.g. "01(Residential)", "02(Commercial)". */
  classification?: string;
  /** Effective date of the rate, YYYY-MM-DD. */
  effectiveDate?: string;
  /** Rate exactly as published, and its unit. */
  printedRate: number;
  printedUnit: 'SQYD' | 'SQFT';
  fetchedAt: string;
  url: string;
}

export interface AuctionRef {
  platform: AuctionPlatform;
  /** Auction date, YYYY-MM-DD, if printed. */
  auctionDate?: string;
}

export interface RejectedPoint {
  title?: string;
  url?: string;
  reason: string;
}

export interface MarketEvidence {
  fetchedAt: string | null;
  model?: string;
  queries: string[];
  points: MarketPoint[];
  rejected: RejectedPoint[];
  warning?: string;
  searchedFor?: string;
}

export type Acquisition = 'PURCHASED' | 'INHERITED' | 'GIFTED' | 'SELF_BUILT';
/** What the purchase price covered: decides which rate it is compared with. */
export type PurchaseCovered = 'PLOT' | 'PLOT_BUILDING' | 'UNIT';
export type PurchaseAreaUnit = 'SQFT' | 'SQYD' | 'SQM';

/** How the customer got the property, and what they say it is worth (v2 §1A, component C). */
export interface Ownership {
  acquiredBy: Acquisition | null;
  /** Month of purchase, YYYY-MM. */
  purchaseMonth?: string;
  /** Consideration on the sale deed, Rs. */
  priceInr?: number | null;
  covered?: PurchaseCovered | null;
  /** Area bought, if different from today's area. */
  areaBought?: number | null;
  areaUnit?: PurchaseAreaUnit;
  /** Built after a plot-only purchase. */
  constructedAfter?: boolean | null;
  constructedYear?: number | null;
  /** Sale deed document number (for later verification through the EC). */
  deedDocNo?: string;
  /** Customer's claimed value of the property, Rs. Cross-check only — never used in the value. */
  claimedValueInr?: number | null;
}

export type AttestKey = 'DEMOLITION_LIST' | 'ROAD_WIDENING';

export interface Attestation {
  ok: boolean;
  note: string;
  by: string;
  at: string;
}

export interface Review {
  status: 'OPEN' | 'ISSUED';
  remarks: string;
  issuedAt?: string;
  issuedBy?: string;
}

export interface AppEvent {
  at: string;
  by: Party | 'SYSTEM';
  text: string;
}

export interface Borrower {
  name: string;
  mobile: string;
  losRef?: string;
}

export interface Application {
  id: string;
  ref: string;
  createdAt: string;
  updatedAt: string;
  rev: number;
  createdBy: string;
  borrower: Borrower;
  property: PropertyFacts;
  plan: PlanFacts;
  title: TitleFacts;
  /** Purchase price and the customer's claimed value (optional; older cases have none). */
  ownership?: Ownership;
  documents: DocSlot[];
  /** Plot boundary drawn on the satellite map: [lat, lng][] */
  parcel: [number, number][];
  inspection: Inspection;
  /** Floor-wise areas from the floor plan (optional; older cases have none). */
  floorPlan?: FloorPlanFacts;
  /** Building roof outline drawn on the satellite top view: [lat, lng][] */
  footprint?: [number, number][];
  market: MarketEvidence;
  attestations: Partial<Record<AttestKey, Attestation>>;
  review: Review;
  events: AppEvent[];
}

/* ---------- progress (shared by both portals) ---------- */

export type StageKey = 'OPENED' | 'DOCUMENTS' | 'INSPECTION' | 'MEASUREMENT' | 'VALUATION' | 'REPORT';
export type StageState = 'DONE' | 'IN_PROGRESS' | 'ACTION_NEEDED' | 'NOT_STARTED';

export interface Stage {
  key: StageKey;
  label: string;
  state: StageState;
  /** Bank-facing detail. */
  detail: string;
  /** Customer-facing line (never contains a valuation figure). */
  customerNote: string;
}

/* ---------- what the customer portal receives ---------- */

export interface CustomerView {
  id: string;
  ref: string;
  borrowerFirstName: string;
  address: string;
  propertyTypeLabel: string;
  documents: DocSlot[];
  stages: Stage[];
  locationOn: boolean;
  lastLocationAt: string | null;
  snapshotsTaken: number;
  completed: boolean;
}

/* ---------- list row for the bank dashboard ---------- */

export interface ApplicationSummary {
  id: string;
  ref: string;
  borrowerName: string;
  address: string;
  type: PropertyType;
  createdAt: string;
  updatedAt: string;
  stages: StageState[];
  currentStage: string;
  marketValue: number | null;
  verdict: string;
  issued: boolean;
}
