/*
  GET   /api/bank/cases/:caseId              → { view, storeMode }
  PATCH /api/bank/cases/:caseId { op … }     → checklist / capture-request operations (BankOp)
  POST  /api/bank/cases/:caseId { upload }   → bank uploads one document file
*/
import { NextResponse } from 'next/server';
import { addUpload, applyBankOp, getRecord, ID_RE, putUploadFile, toView, withCase, type BankOp, type UploadBody } from '@/lib/server/caseFiles';
import { storeMode } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ caseId: string }> };

async function caseIdOf(ctx: Ctx) {
  const { caseId } = await ctx.params;
  return ID_RE.test(caseId) ? caseId : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const id = await caseIdOf(ctx);
    const r = id ? await getRecord(id) : null;
    if (!r) return NextResponse.json({ error: 'No case file', storeMode }, { status: 404 });
    return NextResponse.json({ view: toView(r), storeMode });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Store unavailable' }, { status: 502 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = await caseIdOf(ctx);
    if (!id) return NextResponse.json({ error: 'Bad case' }, { status: 400 });
    const op = (await req.json()) as BankOp;
    const res = await withCase(id, (r) => applyBankOp(r, op));
    if (!res) return NextResponse.json({ error: 'No case file' }, { status: 404 });
    return NextResponse.json({ view: toView(res.record) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const id = await caseIdOf(ctx);
    if (!id || !(await getRecord(id))) return NextResponse.json({ error: 'No case file' }, { status: 404 });
    const { upload } = (await req.json()) as { upload: UploadBody };
    const up = await putUploadFile(id, upload, 'BANK');
    const res = await withCase(id, (r) => addUpload(r, upload.docId, up));
    if (!res) return NextResponse.json({ error: 'No case file' }, { status: 404 });
    return NextResponse.json({ view: toView(res.record) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
