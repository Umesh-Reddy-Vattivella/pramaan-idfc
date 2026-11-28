/* ------------------------------------------------------------------
   Application store + every state change (bank and customer operations).
   One JSON document per application; writes are serialised per application
   (in-process mutex + revision re-check). File bytes go to storage BEFORE
   the lock is taken, because the mutator may run more than once.
   ------------------------------------------------------------------ */
import { randomInt, randomUUID } from 'node:crypto';
import type { Application, ApplicationSummary, AttestKey, Borrower, DocFile, FloorPlanFacts, LocationFix, MarketEvidence, MarketPoint, Occupancy, Ownership, Party, PlanFacts, PropertyFacts, Snapshot, TitleFacts, Usage } from '@/lib/domain/types';
import { checklistFor, floorPlanSlot } from '@/lib/domain/catalog';
import { toSummary } from '@/lib/engines/evaluate';
import { getFile, kvGetJson, kvSetJson, putFile, type StoredFile } from './store';

const K = {
  app: (id: string) => `pramaan3:app:${id}`,
  ref: (ref: string) => `pramaan3:ref:${ref.toUpperCase()}`,
  index: 'pramaan3:index',
};

export const ID_RE = /^[a-f0-9-]{36}$/;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TRACK = 300;

/* ---------------- locking ---------------- */

const locks = new Map<string, Promise<void>>();
async function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((res) => (release = res));
  const chain = prev.then(() => mine);
  locks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chain) locks.delete(key);
  }
}

/* ---------------- read / write ---------------- */

export const getApplication = (id: string) => kvGetJson<Application>(K.app(id));

export async function findByRef(ref: string): Promise<Application | null> {
  const id = await kvGetJson<string>(K.ref(ref.trim()));
  return id ? getApplication(id) : null;
}

async function updateIndex(s: ApplicationSummary) {
  await locked('index', async () => {
    const idx = (await kvGetJson<Record<string, ApplicationSummary>>(K.index)) ?? {};
    idx[s.id] = s;
    await kvSetJson(K.index, idx);
  });
}

export async function listApplications(): Promise<ApplicationSummary[]> {
  const idx = (await kvGetJson<Record<string, ApplicationSummary>>(K.index)) ?? {};
  return Object.values(idx).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function save(a: Application) {
  a.updatedAt = new Date().toISOString();
  await kvSetJson(K.app(a.id), a);
  await updateIndex(toSummary(a));
}

/** Read-modify-write. `fn` mutates the record and may throw to abort (nothing is saved). */
export async function withApp<T>(id: string, fn: (a: Application) => T): Promise<{ app: Application; out: T } | null> {
  return locked(id, async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const a = await getApplication(id);
      if (!a) return null;
      const rev = a.rev;
      const out = fn(a);
      const latest = await getApplication(id);
      if ((latest?.rev ?? 0) !== rev) continue;
      a.rev = rev + 1;
      await save(a);
      return { app: a, out };
    }
    throw new Error('The application is busy — please retry');
  });
}

const log = (a: Application, by: Party | 'SYSTEM', text: string) => {
  a.events.unshift({ at: new Date().toISOString(), by, text });
  a.events = a.events.slice(0, 200);
};

/* ---------------- create ---------------- */

export interface CreateInput {
  borrower: Borrower;
  property: PropertyFacts;
  ownership?: Ownership;
}

function newRef(): string {
  const d = new Date();
  return `PRM-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${randomInt(1000, 9999)}`;
}

export async function createApplication(input: CreateInput, user: string): Promise<Application> {
  let ref = newRef();
  for (let i = 0; i < 5 && (await kvGetJson<string>(K.ref(ref))); i++) ref = newRef();
  const now = new Date().toISOString();
  const a: Application = {
    id: randomUUID(),
    ref,
    createdAt: now,
    updatedAt: now,
    rev: 1,
    createdBy: user,
    borrower: input.borrower,
    property: input.property,
    plan: { approvedBuaSqft: null, approvedFloors: null, permissibleFsi: null },
    title: { chainFromYear: null },
    ownership: input.ownership,
    documents: checklistFor(input.property.type),
    parcel: [],
    inspection: { snapshots: [], track: [], locationOn: false, observedFloors: null, observedUsage: null, occupancy: null, calls: [] },
    market: { fetchedAt: null, queries: [], points: [], rejected: [] },
    attestations: {},
    review: { status: 'OPEN', remarks: '' },
    events: [{ at: now, by: 'BANK', text: `Application opened by ${user}` }],
  };
  await kvSetJson(K.ref(ref), a.id);
  await save(a);
  return a;
}

/* ---------------- files ---------------- */

export interface UploadBody {
  docKey: string;
  fileName: string;
  mime: string;
  dataBase64: string;
}

const ALLOWED_MIME = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

/** Stores the bytes and returns the DocFile to attach (call before withApp). */
export async function storeUpload(appId: string, u: UploadBody, by: Party): Promise<DocFile> {
  if (!ALLOWED_MIME.test(u.mime)) throw new Error('Only photos (JPEG/PNG) or PDF files are accepted');
  const data = Buffer.from(u.dataBase64, 'base64');
  if (!data.length || data.length > MAX_FILE_BYTES) throw new Error('File must be between 1 byte and 4 MB');
  const fileId = randomUUID();
  const name = String(u.fileName || 'document').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  await putFile(fileId, { caseId: appId, mime: u.mime, fileName: name, data });
  return { id: randomUUID(), fileId, name, mime: u.mime, size: data.length, by, at: new Date().toISOString() };
}

export function attachUpload(a: Application, docKey: string, f: DocFile) {
  const d = a.documents.find((x) => x.key === docKey);
  if (!d) throw new Error('Unknown document');
  if (d.status === 'VERIFIED') throw new Error('This document is already verified');
  d.files.push(f);
  d.status = 'UPLOADED';
  d.remark = undefined;
  log(a, f.by, `${f.by === 'BANK' ? 'Bank' : 'Customer'} uploaded ${d.label} (${f.name})`);
}

export function removeUploadedFile(a: Application, docKey: string, fileRowId: string, by: Party) {
  const d = a.documents.find((x) => x.key === docKey);
  if (!d) throw new Error('Unknown document');
  const f = d.files.find((x) => x.id === fileRowId);
  if (!f) throw new Error('File not found');
  if (by === 'CUSTOMER' && (f.by !== 'CUSTOMER' || d.status === 'VERIFIED')) throw new Error('You can only remove your own files before they are verified');
  d.files = d.files.filter((x) => x.id !== fileRowId);
  if (!d.files.length) d.status = 'PENDING';
  else if (d.status === 'VERIFIED' && by === 'BANK') d.status = 'UPLOADED';
  log(a, by, `Removed ${f.name} from ${d.label}`);
}

export async function storeSnapshotFile(appId: string, base64: string): Promise<string> {
  const data = Buffer.from(base64, 'base64');
  if (!data.length || data.length > MAX_FILE_BYTES) throw new Error('Snapshot too large');
  const fileId = randomUUID();
  await putFile(fileId, { caseId: appId, mime: 'image/jpeg', fileName: `snapshot-${fileId.slice(0, 8)}.jpg`, data });
  return fileId;
}

export function addSnapshot(a: Application, s: Snapshot) {
  a.inspection.snapshots.push(s);
  if (s.unassigned) return; // logged when the bank places it on a view
  log(a, s.source === 'CUSTOMER_DEVICE' ? 'CUSTOMER' : 'BANK', `Snapshot captured on video call: ${s.label}${s.lat !== null ? ` (GPS ±${Math.round(s.accuracyM ?? 0)} m)` : ' (no GPS)'}`);
}

export const readFile = (fileId: string): Promise<StoredFile | null> => getFile(fileId);

/* ---------------- customer location ---------------- */

export function addFixes(a: Application, fixes: LocationFix[]) {
  const ok = fixes
    .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180)
    .slice(0, 50)
    .map((f) => ({ lat: f.lat, lng: f.lng, acc: Math.round(Number(f.acc) || 0), at: typeof f.at === 'string' ? f.at.slice(0, 30) : new Date().toISOString() }));
  if (!ok.length) return;
  if (!a.inspection.track.length) log(a, 'CUSTOMER', 'Customer shared live location');
  a.inspection.track = [...a.inspection.track, ...ok].slice(-MAX_TRACK);
  a.inspection.locationOn = true;
}

export function setLocationOn(a: Application, on: boolean) {
  if (a.inspection.locationOn !== on) log(a, 'CUSTOMER', on ? 'Customer turned location ON' : 'Customer turned location OFF');
  a.inspection.locationOn = on;
}

/* ---------------- bank operations ---------------- */

export type BankOp =
  | { op: 'setBorrower'; borrower: Partial<Borrower> }
  | { op: 'setProperty'; property: Partial<PropertyFacts> }
  | { op: 'setPlan'; plan: Partial<PlanFacts> }
  | { op: 'setTitle'; title: Partial<TitleFacts> }
  | { op: 'setOwnership'; ownership: Partial<Ownership> }
  | { op: 'setParcel'; parcel: [number, number][] }
  | { op: 'reviewDoc'; key: string; status: 'VERIFIED' | 'REJECTED' | 'UPLOADED'; remark?: string }
  | { op: 'removeFile'; key: string; fileRowId: string }
  | { op: 'addDocSlot'; label: string; mandatory: boolean }
  | { op: 'setInspection'; observedFloors?: number | null; observedUsage?: Usage | null; occupancy?: Occupancy | null }
  | { op: 'deleteSnapshot'; id: string }
  | { op: 'assignSnapshot'; id: string; label: string; area: 'EXTERIOR' | 'INTERIOR'; floor?: string }
  | { op: 'unassignSnapshot'; id: string }
  | { op: 'setFloorPlan'; floorPlan: FloorPlanFacts }
  | { op: 'setFootprint'; footprint: [number, number][] }
  | { op: 'requestFloorPlan' }
  | { op: 'togglePoint'; id: string; included: boolean }
  | { op: 'addPoint'; point: MarketPoint }
  | { op: 'deletePoint'; id: string }
  | { op: 'attest'; key: AttestKey; ok: boolean; note: string }
  | { op: 'clearAttest'; key: AttestKey }
  | { op: 'issueReport'; remarks: string }
  | { op: 'reopenReport' };

const num = (v: unknown, min = 0, max = 1e9): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const txt = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

export function sanitizeProperty(p: Partial<PropertyFacts>): Partial<PropertyFacts> {
  const out: Partial<PropertyFacts> = {};
  if (p.type) out.type = p.type;
  if (p.usage) out.usage = p.usage;
  if (p.structure) out.structure = p.structure;
  if ('address' in p) out.address = txt(p.address, 400) ?? '';
  if ('lat' in p) out.lat = num(p.lat, -90, 90);
  if ('lng' in p) out.lng = num(p.lng, -180, 180);
  for (const k of ['locality', 'city', 'state'] as const) if (k in p) out[k] = txt(p[k], 120);
  if ('plotAreaSqft' in p) out.plotAreaSqft = num(p.plotAreaSqft, 1, 1e8);
  if ('builtUpSqft' in p) out.builtUpSqft = num(p.builtUpSqft, 1, 1e8);
  if ('floors' in p) out.floors = num(p.floors, 1, 60);
  if ('ageYears' in p) out.ageYears = num(p.ageYears, 0, 200);
  if ('constructionRate' in p) out.constructionRate = num(p.constructionRate, 1, 1e6);
  return out;
}

const ACQ = ['PURCHASED', 'INHERITED', 'GIFTED', 'SELF_BUILT'] as const;
const COVERED = ['PLOT', 'PLOT_BUILDING', 'UNIT'] as const;
const AREA_UNIT = ['SQFT', 'SQYD', 'SQM'] as const;

/** Purchase facts + claimed value (v2 §1A): only known values, within sane bounds. */
export function sanitizeOwnership(o: Partial<Ownership>): Ownership {
  const now = new Date();
  const ym = typeof o.purchaseMonth === 'string' && /^\d{4}-\d{2}$/.test(o.purchaseMonth) && o.purchaseMonth >= '1950-01' && o.purchaseMonth <= `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` ? o.purchaseMonth : undefined;
  return {
    acquiredBy: ACQ.includes(o.acquiredBy as 'PURCHASED') ? o.acquiredBy! : null,
    purchaseMonth: ym,
    priceInr: num(o.priceInr, 1000, 1e11),
    covered: COVERED.includes(o.covered as 'PLOT') ? o.covered! : null,
    areaBought: num(o.areaBought, 1, 1e8),
    areaUnit: AREA_UNIT.includes(o.areaUnit as 'SQFT') ? o.areaUnit : 'SQFT',
    constructedAfter: typeof o.constructedAfter === 'boolean' ? o.constructedAfter : null,
    constructedYear: num(o.constructedYear, 1950, now.getFullYear()),
    deedDocNo: txt(o.deedDocNo, 60) || undefined,
    claimedValueInr: num(o.claimedValueInr, 1000, 1e11),
  };
}

export function applyBankOp(a: Application, o: BankOp, user: string) {
  switch (o.op) {
    case 'setBorrower':
      if (o.borrower.name !== undefined) a.borrower.name = txt(o.borrower.name, 120) || a.borrower.name;
      if (o.borrower.mobile !== undefined) a.borrower.mobile = String(o.borrower.mobile).replace(/\D/g, '').slice(-10);
      if (o.borrower.losRef !== undefined) a.borrower.losRef = txt(o.borrower.losRef, 60);
      return;
    case 'setProperty':
      if (o.property.type && o.property.type !== a.property.type) throw new Error('Property type cannot be changed after opening (the checklist depends on it)');
      Object.assign(a.property, sanitizeProperty(o.property));
      log(a, 'BANK', 'Property details updated');
      return;
    case 'setPlan':
      if ('approvedBuaSqft' in o.plan) a.plan.approvedBuaSqft = num(o.plan.approvedBuaSqft, 1, 1e8);
      if ('approvedFloors' in o.plan) a.plan.approvedFloors = num(o.plan.approvedFloors, 1, 60);
      if ('permissibleFsi' in o.plan) a.plan.permissibleFsi = num(o.plan.permissibleFsi, 0.1, 30);
      if ('planRef' in o.plan) a.plan.planRef = txt(o.plan.planRef, 80);
      if ('authority' in o.plan) a.plan.authority = txt(o.plan.authority, 120);
      log(a, 'BANK', 'Approved-plan facts recorded');
      return;
    case 'setTitle':
      if ('chainFromYear' in o.title) a.title.chainFromYear = num(o.title.chainFromYear, 1900, new Date().getFullYear());
      log(a, 'BANK', 'Title-chain start year recorded');
      return;
    case 'setOwnership':
      a.ownership = sanitizeOwnership({ ...(a.ownership ?? {}), ...o.ownership });
      log(a, 'BANK', 'Purchase details / claimed value recorded');
      return;
    case 'setParcel':
      a.parcel = (Array.isArray(o.parcel) ? o.parcel : []).slice(0, 40).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]] as [number, number]);
      log(a, 'BANK', a.parcel.length >= 3 ? `Plot boundary drawn (${a.parcel.length} corners)` : 'Plot boundary cleared');
      return;
    case 'reviewDoc': {
      const d = a.documents.find((x) => x.key === o.key);
      if (!d) throw new Error('Unknown document');
      if (o.status !== 'UPLOADED' && !d.files.length) throw new Error('Nothing uploaded to review');
      d.status = o.status;
      d.remark = o.status === 'REJECTED' ? txt(o.remark, 200) || 'Please upload a clear, complete copy' : undefined;
      d.reviewedAt = new Date().toISOString();
      log(a, 'BANK', `${d.label}: ${o.status === 'VERIFIED' ? 'verified' : o.status === 'REJECTED' ? `rejected — ${d.remark}` : 'reopened'} (${user})`);
      return;
    }
    case 'removeFile':
      return removeUploadedFile(a, o.key, o.fileRowId, 'BANK');
    case 'addDocSlot': {
      const label = txt(o.label, 100);
      if (!label) throw new Error('Name the document');
      a.documents.push({ key: `CUSTOM_${randomUUID().slice(0, 8)}`, label, help: 'Additional document requested by the bank.', mandatory: !!o.mandatory, from: 'EITHER', files: [], status: 'PENDING' });
      log(a, 'BANK', `Requested additional document: ${label}`);
      return;
    }
    case 'setInspection':
      if ('observedFloors' in o) a.inspection.observedFloors = num(o.observedFloors, 1, 60);
      if ('observedUsage' in o) a.inspection.observedUsage = o.observedUsage ?? null;
      if ('occupancy' in o) a.inspection.occupancy = o.occupancy ?? null;
      return;
    case 'deleteSnapshot':
      a.inspection.snapshots = a.inspection.snapshots.filter((s) => s.id !== o.id);
      log(a, 'BANK', 'Snapshot removed');
      return;
    case 'assignSnapshot': {
      const s = a.inspection.snapshots.find((x) => x.id === o.id);
      if (!s) throw new Error('Snapshot not found');
      const label = txt(o.label, 80);
      if (!label) throw new Error('Name the view');
      // One photo per view: the photo already on this view goes back to the tray.
      for (const x of a.inspection.snapshots) if (x.id !== s.id && !x.unassigned && x.label === label) x.unassigned = true;
      s.label = label;
      s.area = o.area === 'INTERIOR' ? 'INTERIOR' : 'EXTERIOR';
      s.floor = txt(o.floor, 40) || undefined;
      s.unassigned = false;
      log(a, 'BANK', `Snapshot placed on view: ${label}${s.lat !== null ? ` (GPS ±${Math.round(s.accuracyM ?? 0)} m)` : ' (no GPS)'}`);
      return;
    }
    case 'unassignSnapshot': {
      const s = a.inspection.snapshots.find((x) => x.id === o.id);
      if (s) s.unassigned = true;
      return;
    }
    case 'setFloorPlan': {
      const f = o.floorPlan ?? ({} as FloorPlanFacts);
      const seen = new Set<string>();
      const floors = (Array.isArray(f.floors) ? f.floors : [])
        .slice(0, 20)
        .map((x) => ({ floor: txt(x?.floor, 40) || '', areaSqft: num(x?.areaSqft, 1, 1e7) ?? 0 }))
        .filter((x) => x.floor && x.areaSqft > 0 && !seen.has(x.floor) && seen.add(x.floor));
      a.floorPlan = {
        source: f.source === 'GOVT_PORTAL' || f.source === 'CUSTOMER_UPLOAD' ? f.source : null,
        reference: txt(f.reference, 300) || undefined,
        basis: f.basis === 'CARPET' ? 'CARPET' : 'BUILT_UP',
        floors,
      };
      if (a.floorPlan.source === 'CUSTOMER_UPLOAD' && !a.documents.some((d) => d.key === 'FLOOR_PLAN')) a.documents.push(floorPlanSlot());
      log(a, 'BANK', `Floor-wise areas recorded from the floor plan (${floors.length} floor(s), ${Math.round(floors.reduce((s2, x) => s2 + x.areaSqft, 0))} sqft ${a.floorPlan.basis === 'CARPET' ? 'carpet' : 'built-up'})`);
      return;
    }
    case 'setFootprint':
      a.footprint = (Array.isArray(o.footprint) ? o.footprint : []).slice(0, 40).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]] as [number, number]);
      log(a, 'BANK', a.footprint.length >= 3 ? `Roof outline drawn on the satellite top view (${a.footprint.length} corners)` : 'Roof outline cleared');
      return;
    case 'requestFloorPlan':
      if (!a.documents.some((d) => d.key === 'FLOOR_PLAN')) {
        a.documents.push(floorPlanSlot());
        log(a, 'BANK', 'Requested the floor plan from the customer');
      }
      return;
    case 'togglePoint': {
      const p = a.market.points.find((x) => x.id === o.id);
      if (p) p.included = !!o.included;
      return;
    }
    case 'addPoint': {
      const p = o.point;
      const rate = num(p.ratePerSqft, 1, 1e7);
      const price = num(p.priceInr, 1, 1e11);
      const area = num(p.areaSqft, 1, 1e8);
      if (!rate && !(price && area)) throw new Error('Enter a rate, or a price and an area');
      const cat = (['LAND', 'BUILT', 'GUIDELINE'] as const).includes(p.category) ? p.category : 'LAND';
      const kind = cat === 'GUIDELINE' ? 'GUIDELINE' : (['SALE', 'LISTING', 'AUCTION'] as const).includes(p.kind as 'SALE') ? p.kind : 'SALE';
      const rg = p.registration;
      const registration =
        kind === 'SALE' && rg
          ? {
              docNo: txt(rg.docNo, 60),
              office: txt(rg.office, 120),
              regDate: /^\d{4}-\d{2}-\d{2}$/.test(String(rg.regDate ?? '')) ? rg.regDate : undefined,
              considerationInr: num(rg.considerationInr, 1, 1e11) ?? undefined,
              govtValueInr: num(rg.govtValueInr, 1, 1e11) ?? undefined,
              fileId: /^[0-9a-f-]{36}$/.test(String(rg.fileId ?? '')) ? rg.fileId : undefined,
            }
          : undefined;
      const au = p.auction;
      const auction = kind === 'AUCTION' && au ? { platform: (['BAANKNET', 'IBAPI'] as const).includes(au.platform as 'BAANKNET') ? au.platform : ('OTHER' as const), auctionDate: /^\d{4}-\d{2}-\d{2}$/.test(String(au.auctionDate ?? '')) ? au.auctionDate : undefined } : undefined;
      a.market.points.push({
        id: `m-${randomUUID().slice(0, 8)}`,
        category: cat,
        kind,
        ratePerSqft: rate ?? undefined,
        priceInr: price ?? undefined,
        areaSqft: area ?? undefined,
        propertyType: txt(p.propertyType, 80),
        locality: txt(p.locality, 100),
        date: txt(p.date, 10),
        url: txt(p.url, 500),
        title: txt(p.title, 160) || 'Manual comparable',
        lat: num(p.lat, -90, 90) ?? undefined,
        lng: num(p.lng, -180, 180) ?? undefined,
        quote: txt(p.quote, 300),
        origin: 'MANUAL',
        included: true,
        registration,
        auction,
      });
      log(a, 'BANK', registration ? `Registered sale added from Index II${registration.docNo ? ` (doc ${registration.docNo})` : ''}` : `Manual comparable added (${cat.toLowerCase()})`);
      return;
    }
    case 'deletePoint':
      a.market.points = a.market.points.filter((p) => p.id !== o.id);
      return;
    case 'attest':
      a.attestations[o.key] = { ok: !!o.ok, note: txt(o.note, 300) ?? '', by: user, at: new Date().toISOString() };
      log(a, 'BANK', `${o.key === 'DEMOLITION_LIST' ? 'Demolition list' : 'Road widening'} check recorded: ${o.ok ? 'clear' : 'affected'}`);
      return;
    case 'clearAttest':
      delete a.attestations[o.key];
      return;
    case 'issueReport':
      a.review = { status: 'ISSUED', remarks: txt(o.remarks, 3000) ?? '', issuedAt: new Date().toISOString(), issuedBy: user };
      log(a, 'BANK', `Technical valuation report issued by ${user}`);
      return;
    case 'reopenReport':
      a.review = { ...a.review, status: 'OPEN' };
      log(a, 'BANK', 'Report reopened for changes');
      return;
  }
}

export function setMarket(a: Application, m: MarketEvidence) {
  // Keep manual comparables and official (government) values; replace live-search points.
  const manual = a.market.points.filter((p) => p.origin !== 'LIVE_SEARCH');
  a.market = { ...m, points: [...m.points, ...manual] };
  log(a, 'BANK', `Market evidence fetched: ${m.points.length} data point(s), ${m.rejected.length} rejected`);
}

export function noteCall(a: Application, callId: string, status: string, extra: { answeredAt?: string; endedAt?: string } = {}) {
  const c = a.inspection.calls.find((x) => x.id === callId);
  if (c) Object.assign(c, { status, ...extra });
  else a.inspection.calls.unshift({ id: callId, startedAt: new Date().toISOString(), status, ...extra });
  a.inspection.calls = a.inspection.calls.slice(0, 20);
}

export { log as logEvent };
