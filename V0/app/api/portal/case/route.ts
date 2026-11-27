/*
  Customer portal (session cookie required).
  GET                                                   → { view }
  POST { action: 'upload', upload }                     → customer uploads one document file
  POST { action: 'notAvailable', docId, on }            → "I don't have this" / undo
  POST { action: 'removeUpload', docId, uploadId }      → remove own upload (until verified)
  POST { action: 'capture', submission }                → site photos + room measurements
  POST { action: 'track', fixes }                       → GPS fixes while location sharing is on
*/
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CaptureSubmission, DocUpload, LocationFix } from '@/lib/types';
import {
  addLocationFixes,
  addUpload,
  getRecord,
  putUploadFile,
  removeUpload,
  setCapture,
  setNotAvailable,
  toView,
  withCase,
  type UploadBody,
} from '@/lib/server/caseFiles';
import { readSession, SESSION_COOKIE } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function sessionCaseId() {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value)?.caseId ?? null;
}

export async function GET() {
  try {
    const id = await sessionCaseId();
    const r = id ? await getRecord(id) : null;
    if (!r) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    return NextResponse.json({ view: toView(r) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Store unavailable' }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const id = await sessionCaseId();
    if (!id) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    const b = (await req.json()) as { action: string; upload?: UploadBody; docId?: string; uploadId?: string; on?: boolean; submission?: CaptureSubmission; fixes?: LocationFix[] };

    let up: DocUpload | null = null;
    if (b.action === 'upload' && b.upload) up = await putUploadFile(id, b.upload, 'CUSTOMER'); // file bytes first, outside the lock

    const res = await withCase(id, (r) => {
      if (b.action === 'upload' && b.upload && up) addUpload(r, b.upload.docId, up);
      else if (b.action === 'notAvailable' && b.docId) setNotAvailable(r, b.docId, 'CUSTOMER', !!b.on);
      else if (b.action === 'removeUpload' && b.docId && b.uploadId) removeUpload(r, b.docId, b.uploadId, 'CUSTOMER');
      else if (b.action === 'track' && Array.isArray(b.fixes)) addLocationFixes(r, b.fixes);
      else if (b.action === 'capture' && b.submission && Array.isArray(b.submission.photos) && Array.isArray(b.submission.rooms)) setCapture(r, b.submission);
      else throw new Error('Unknown action');
    });
    if (!res) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    return NextResponse.json({ view: toView(res.record) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Request failed' }, { status: 400 });
  }
}
