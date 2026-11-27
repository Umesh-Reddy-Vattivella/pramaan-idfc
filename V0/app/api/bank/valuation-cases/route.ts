/*
  GET    /api/bank/valuation-cases          → { cases, storeMode }   (cases created in the bank portal; examples are built in)
  PUT    /api/bank/valuation-cases { case } → upsert one case
  DELETE /api/bank/valuation-cases?id=…     → delete one case
*/
import { NextResponse } from 'next/server';
import type { PropertyCase } from '@/lib/types';
import { deleteCase, listCases, MAX_CASE_BYTES, saveCase } from '@/lib/server/valuationCases';
import { ID_RE } from '@/lib/server/caseFiles';
import { storeMode } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ cases: await listCases(), storeMode });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Store unavailable', storeMode }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_CASE_BYTES) return NextResponse.json({ error: 'Case too large' }, { status: 413 });
    const { case: c } = JSON.parse(raw) as { case?: PropertyCase };
    if (!c || !ID_RE.test(c.id) || c.origin === 'SEED') return NextResponse.json({ error: 'Invalid case' }, { status: 400 });
    await saveCase(c);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  try {
    await deleteCase(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 502 });
  }
}
