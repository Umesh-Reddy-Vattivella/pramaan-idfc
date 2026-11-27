/*
  Customer portal (customer session required). Returns STATUS ONLY — never valuation figures.
  GET                                              → { view }
  POST { action:'upload', docKey, fileName, mime, dataBase64 }
  POST { action:'removeFile', docKey, fileRowId }
  POST { action:'location', on }                   → location switch
  POST { action:'track', fixes }                   → GPS fixes while location is on
*/
import { NextResponse } from 'next/server';
import type { LocationFix } from '@/lib/domain/types';
import { toCustomerView } from '@/lib/engines/evaluate';
import { customerSession } from '@/lib/server/auth';
import { addFixes, attachUpload, getApplication, removeUploadedFile, setLocationOn, storeUpload, withApp, type UploadBody } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await customerSession();
  if (!s) return fail('Please sign in', 401);
  try {
    const app = await getApplication(s.appId);
    return app ? NextResponse.json({ view: toCustomerView(app) }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err, 502);
  }
}

type Body = { action: string; on?: boolean; fixes?: LocationFix[]; docKey?: string; fileRowId?: string } & Partial<UploadBody>;

export async function POST(req: Request) {
  const s = await customerSession();
  if (!s) return fail('Please sign in', 401);
  try {
    const b = await readJson<Body>(req);
    let file = null;
    if (b.action === 'upload') {
      const app = await getApplication(s.appId);
      const slot = app?.documents.find((d) => d.key === b.docKey);
      if (!slot) return fail('Unknown document');
      if (slot.status === 'VERIFIED') return fail('This document is already verified by the bank');
      file = await storeUpload(s.appId, b as UploadBody, 'CUSTOMER');
    }
    const res = await withApp(s.appId, (a) => {
      if (b.action === 'upload' && file && b.docKey) attachUpload(a, b.docKey, file);
      else if (b.action === 'removeFile' && b.docKey && b.fileRowId) removeUploadedFile(a, b.docKey, b.fileRowId, 'CUSTOMER');
      else if (b.action === 'location') setLocationOn(a, !!b.on);
      else if (b.action === 'track' && Array.isArray(b.fixes)) addFixes(a, b.fixes);
      else throw new Error('Unknown action');
    });
    return res ? NextResponse.json({ view: toCustomerView(res.app) }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err);
  }
}
