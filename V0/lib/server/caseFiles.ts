/* ------------------------------------------------------------------
   Shared case file (server). Both portals read and write the same record:
   the bank creates it with a suggested checklist, either side uploads
   documents one at a time, the customer submits the site capture.
   ------------------------------------------------------------------ */
import { randomBytes, randomUUID } from 'node:crypto';
import type { CaptureSubmission, CaseEvent, CaseFileInit, CaseFileView, DocRequest, DocUpload, GeoPhoto, LocationFix, Party } from '@/lib/types';
import { getFile, kvGetJson, kvSetJson, putFile, type StoredFile } from './store';
import { maskMobile, newAccessCode, normMobile, sha } from './session';

export interface CaseFileRecord extends CaseFileView {
  /** Revision counter for optimistic concurrency (see withCase). */
  rev?: number;
  mobile: string;
  accessCodeHash: string;
  otp?: { hash: string; expiresAt: number; attempts: number };
}

const K = {
  file: (caseId: string) => `pramaan:case:${caseId}`,
  ref: (caseRef: string) => `pramaan:ref:${caseRef.toUpperCase()}`,
  tok: (token: string) => `pramaan:tok:${token}`,
};

export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const ID_RE = /^[A-Za-z0-9_.:-]{3,80}$/;

export function toView(r: CaseFileRecord): CaseFileView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mobile, accessCodeHash, otp, rev, ...view } = r;
  return view;
}

export async function getRecord(caseId: string): Promise<CaseFileRecord | null> {
  return kvGetJson<CaseFileRecord>(K.file(caseId));
}

export async function saveRecord(r: CaseFileRecord): Promise<void> {
  r.updatedAt = new Date().toISOString();
  await kvSetJson(K.file(r.caseId), r);
}

export async function resolveCaseId(q: { token?: string; caseRef?: string }): Promise<string | null> {
  if (q.token) return kvGetJson<string>(K.tok(q.token));
  if (q.caseRef) return kvGetJson<string>(K.ref(q.caseRef.trim()));
  return null;
}

/* ---------------- safe read-modify-write ---------------- */

const locks = new Map<string, Promise<void>>();

/**
 * Every mutation of a case file goes through here so concurrent requests (photo upload + location trail +
 * bank verify …) never overwrite each other: writes are serialised per case in this server instance, and a
 * revision check re-applies the change on a fresh copy if another instance wrote in between.
 * `fn` must only mutate the record (do file uploads BEFORE calling withCase — it may run more than once).
 */
export async function withCase<T>(caseId: string, fn: (r: CaseFileRecord) => T | Promise<T>): Promise<{ record: CaseFileRecord; out: T } | null> {
  const prev = locks.get(caseId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((res) => (release = res));
  const chain = prev.then(() => mine);
  locks.set(caseId, chain);
  await prev;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await getRecord(caseId);
      if (!r) return null;
      const rev = r.rev ?? 0;
      const out = await fn(r);
      const latest = await getRecord(caseId);
      if ((latest?.rev ?? 0) !== rev) continue; // another writer got in first — redo on the fresh copy
      r.rev = rev + 1;
      await saveRecord(r);
      return { record: r, out };
    }
    throw new Error('The case is busy — please retry');
  } finally {
    release();
    if (locks.get(caseId) === chain) locks.delete(caseId);
  }
}

const ev = (by: Party, text: string): CaseEvent => ({ at: new Date().toISOString(), by, text });

export async function createCaseFile(init: CaseFileInit): Promise<{ record: CaseFileRecord; accessCode: string }> {
  const now = new Date().toISOString();
  const accessCode = newAccessCode();
  const token = randomBytes(9).toString('base64url');
  const { mobile, ...rest } = init;
  const record: CaseFileRecord = {
    ...rest,
    mobile: normMobile(mobile),
    mobileMasked: maskMobile(mobile),
    token,
    accessCodeHash: sha(`code|${init.caseId}|${accessCode}`),
    events: [ev('BANK', `Case opened · ${init.checklist.length} documents on the checklist`)],
    createdAt: now,
    updatedAt: now,
  };
  await saveRecord(record);
  await kvSetJson(K.ref(init.caseRef), init.caseId);
  await kvSetJson(K.tok(token), init.caseId);
  return { record, accessCode };
}

export function checkAccessCode(r: CaseFileRecord, code: string): boolean {
  return sha(`code|${r.caseId}|${code.trim().toUpperCase()}`) === r.accessCodeHash;
}

/* ---------------- mutations (pure on the record; caller saves) ---------------- */

function doc(r: CaseFileRecord, docId: string): DocRequest {
  const d = r.checklist.find((x) => x.id === docId);
  if (!d) throw new Error('Unknown document');
  return d;
}

export function addUpload(r: CaseFileRecord, docId: string, up: DocUpload): void {
  const d = doc(r, docId);
  d.uploads.push(up);
  d.status = 'UPLOADED';
  d.note = undefined;
  r.events.unshift(ev(up.uploadedBy, `${up.uploadedBy === 'BANK' ? 'Bank' : 'Customer'} uploaded ${d.label} (${up.fileName})`));
}

export function removeUpload(r: CaseFileRecord, docId: string, uploadId: string, by: Party): void {
  const d = doc(r, docId);
  const u = d.uploads.find((x) => x.id === uploadId);
  if (!u) return;
  if (by === 'CUSTOMER' && (u.uploadedBy !== 'CUSTOMER' || d.status === 'VERIFIED')) throw new Error('Not allowed');
  d.uploads = d.uploads.filter((x) => x.id !== uploadId);
  if (!d.uploads.length) d.status = 'REQUESTED';
  r.events.unshift(ev(by, `Removed ${u.fileName} from ${d.label}`));
}

export function setNotAvailable(r: CaseFileRecord, docId: string, by: Party, on: boolean): void {
  const d = doc(r, docId);
  if (d.status === 'VERIFIED') throw new Error('Already verified');
  d.status = on ? 'NOT_AVAILABLE' : d.uploads.length ? 'UPLOADED' : 'REQUESTED';
  r.events.unshift(ev(by, on ? `${d.label}: marked “not available”` : `${d.label}: requested again`));
}

export type BankOp =
  | { op: 'verify'; docId: string }
  | { op: 'reject'; docId: string; note: string }
  | { op: 'assign'; docId: string; assignee: Party }
  | { op: 'mandatory'; docId: string; mandatory: boolean }
  | { op: 'addDoc'; doc: DocRequest }
  | { op: 'removeDoc'; docId: string }
  | { op: 'requestCapture'; on: boolean }
  | { op: 'notAvailable'; docId: string; on: boolean }
  | { op: 'removeUpload'; docId: string; uploadId: string };

export function applyBankOp(r: CaseFileRecord, o: BankOp): void {
  switch (o.op) {
    case 'verify': {
      const d = doc(r, o.docId);
      if (!d.uploads.length) throw new Error('Nothing uploaded to verify');
      d.status = 'VERIFIED';
      d.note = undefined;
      r.events.unshift(ev('BANK', `Verified ${d.label}`));
      return;
    }
    case 'reject': {
      const d = doc(r, o.docId);
      d.status = 'REJECTED';
      d.note = o.note.slice(0, 300);
      r.events.unshift(ev('BANK', `Asked again for ${d.label}: ${d.note}`));
      return;
    }
    case 'assign': {
      const d = doc(r, o.docId);
      d.assignee = o.assignee;
      r.events.unshift(ev('BANK', `${d.label} → ${o.assignee === 'BANK' ? 'bank will collect' : 'requested from customer'}`));
      return;
    }
    case 'mandatory':
      doc(r, o.docId).mandatory = o.mandatory;
      return;
    case 'addDoc':
      if (r.checklist.some((x) => x.id === o.doc.id)) throw new Error('Duplicate document');
      r.checklist.push({ ...o.doc, uploads: [], status: 'REQUESTED' });
      r.events.unshift(ev('BANK', `Added ${o.doc.label} to the checklist`));
      return;
    case 'removeDoc':
      r.checklist = r.checklist.filter((x) => x.id !== o.docId);
      return;
    case 'requestCapture':
      r.captureRequested = o.on;
      r.events.unshift(ev('BANK', o.on ? 'Requested site photos & measurements from customer' : 'Site capture request withdrawn'));
      return;
    case 'notAvailable':
      setNotAvailable(r, o.docId, 'BANK', o.on);
      return;
    case 'removeUpload':
      removeUpload(r, o.docId, o.uploadId, 'BANK');
      return;
  }
}

export function setCapture(r: CaseFileRecord, s: CaptureSubmission): void {
  r.capture = s;
  r.events.unshift(ev('CUSTOMER', `Site capture submitted · ${s.photos.length} geo-tagged photos · ${s.rooms.length} rooms measured`));
}

export function noteLogin(r: CaseFileRecord, method: string): void {
  r.customerLastLoginAt = new Date().toISOString();
  r.events.unshift(ev('CUSTOMER', `Signed in (${method})`));
}

/* ---------------- file blobs ---------------- */

export interface UploadBody {
  docId: string;
  fileName: string;
  mime: string;
  dataBase64: string;
  preview?: string;
}

const MIME_OK = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

/** Validates and stores the file bytes; returns the upload entry to add with addUpload() inside withCase(). */
export async function putUploadFile(caseId: string, body: UploadBody, by: Party): Promise<DocUpload> {
  if (!ID_RE.test(body.docId)) throw new Error('Bad document id');
  if (!MIME_OK.test(body.mime)) throw new Error('Only photos (JPG/PNG/WebP) or PDF are accepted');
  const sizeBytes = Math.floor((body.dataBase64.length * 3) / 4);
  if (sizeBytes > MAX_FILE_BYTES) throw new Error('File too large (max 3 MB after compression)');
  const id = randomUUID();
  await putFile(id, { caseId, mime: body.mime, fileName: body.fileName.slice(0, 120), data: Buffer.from(body.dataBase64, 'base64') });
  return {
    id,
    fileName: body.fileName.slice(0, 120),
    mime: body.mime,
    sizeBytes,
    uploadedBy: by,
    uploadedAt: new Date().toISOString(),
    preview: body.preview && body.preview.length < 60_000 ? body.preview : undefined,
  };
}

export async function getBlob(id: string): Promise<StoredFile | null> {
  return getFile(id);
}

/* ---------------- live video-call capture ---------------- */

const MAX_TRACK = 500;

/** Stores the full-resolution call photo; returns the GeoPhoto to add with addCallPhoto() inside withCase(). */
export async function putCallPhoto(caseId: string, photo: GeoPhoto, fullJpegBase64: string): Promise<GeoPhoto> {
  const sizeBytes = Math.floor((fullJpegBase64.length * 3) / 4);
  if (sizeBytes > MAX_FILE_BYTES) throw new Error('Photo too large');
  const fileId = randomUUID();
  await putFile(fileId, { caseId, mime: 'image/jpeg', fileName: `${photo.slot}-${photo.takenAt}.jpg`, data: Buffer.from(fullJpegBase64, 'base64') });
  return { ...photo, fileId, viaCall: true };
}

/** Photo taken on the customer's phone during a bank-directed video call. */
export function addCallPhoto(r: CaseFileRecord, p: GeoPhoto): void {
  if (r.capture?.photos.some((x) => x.id === p.id)) return;
  const cap: CaptureSubmission = r.capture ?? { submittedAt: p.takenAt, capturedBy: 'OWNER', photos: [], rooms: [], documents: [] };
  cap.photos = [...cap.photos, p];
  cap.submittedAt = new Date().toISOString();
  r.capture = cap;
  r.events.unshift(ev('BANK', `Video call photo: ${p.label} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} ±${p.accuracyM} m)`));
}

export function addLocationFixes(r: CaseFileRecord, fixes: LocationFix[]): void {
  const clean = fixes.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180).slice(0, 50);
  r.locationTrack = [...(r.locationTrack ?? []), ...clean].slice(-MAX_TRACK);
}
