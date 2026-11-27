/*
  Bank side of the live video verification call.
  GET  /api/bank/cases/:caseId/call                       → { call }  (status, answer when picked up)
  POST /api/bank/cases/:caseId/call { action:'start', offer } → rings the customer
  POST /api/bank/cases/:caseId/call { action:'end', callId }  → hang up
*/
import { NextResponse } from 'next/server';
import { endCall, getCall, startCall } from '@/lib/server/calls';
import { getRecord, ID_RE, withCase } from '@/lib/server/caseFiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ caseId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { caseId } = await ctx.params;
  if (!ID_RE.test(caseId)) return NextResponse.json({ error: 'Bad case' }, { status: 400 });
  try {
    return NextResponse.json({ call: await getCall(caseId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Store unavailable' }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { caseId } = await ctx.params;
  if (!ID_RE.test(caseId)) return NextResponse.json({ error: 'Bad case' }, { status: 400 });
  try {
    const b = (await req.json()) as { action: string; offer?: string; callId?: string };
    const r = await getRecord(caseId);
    if (!r) return NextResponse.json({ error: 'Open customer access for this case first' }, { status: 404 });
    if (b.action === 'start' && b.offer && b.offer.length < 20000) {
      const call = await startCall(caseId, b.offer);
      await withCase(caseId, (x) => void x.events.unshift({ at: call.startedAt, by: 'BANK', text: 'Video verification call started (ringing customer)' }));
      return NextResponse.json({ call });
    }
    if (b.action === 'end') {
      const call = await endCall(caseId, b.callId, 'BANK');
      if (call?.status === 'ENDED' && call.endedBy === 'BANK') {
        await withCase(caseId, (x) => void x.events.unshift({ at: new Date().toISOString(), by: 'BANK', text: 'Video call ended' }));
      }
      return NextResponse.json({ call });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Call failed' }, { status: 400 });
  }
}
