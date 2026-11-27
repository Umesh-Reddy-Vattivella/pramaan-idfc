/* Bank: POST { docKey, fileName, mime, dataBase64 } → { app } — one file into one document slot. */
import { NextResponse } from 'next/server';
import { bankSession } from '@/lib/server/auth';
import { attachUpload, getApplication, ID_RE, storeUpload, withApp, type UploadBody } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    const u = await readJson<UploadBody>(req);
    const app = await getApplication(id);
    if (!app) return fail('Application not found', 404);
    const slot = app.documents.find((d) => d.key === u.docKey);
    if (!slot) return fail('Unknown document');
    if (slot.status === 'VERIFIED') return fail('This document is already verified');
    const f = await storeUpload(id, u, 'BANK');
    const res = await withApp(id, (a) => attachUpload(a, u.docKey, f));
    return res ? NextResponse.json({ app: res.app }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err);
  }
}
