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

export type RoomMethod = 'SNAPSHOT_SCALE' | 'TAPE_ON_CALL' | 'PLAN';

export interface Room {
  id: string;
  floor: string;
  name: string;
  lengthFt: number;
  widthFt: number;
  method: RoomMethod;
  snapshotId?: string;
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
  origin: 'LIVE_SEARCH' | 'MANUAL';
  included: boolean;
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
  documents: DocSlot[];
  /** Plot boundary drawn on the satellite map: [lat, lng][] */
  parcel: [number, number][];
  inspection: Inspection;
  rooms: Room[];
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
