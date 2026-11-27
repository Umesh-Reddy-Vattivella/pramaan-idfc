/*
  Bank side of the video inspection call.
  GET                                   → { call } (status; answer once picked up)
  POST { action:'start', offer }        → rings the customer portal
  POST { action:'end', callId }         → hang up
*/
import { NextResponse } from 'next/server';
import { endCall, getCall, startCall } from '@/lib/server/calls';
import { bankSession } from '@/lib/server/auth';
import { getApplication, ID_RE, logEvent, noteCall, withApp } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    return NextResponse.json({ call: await getCall(id) });
  } catch (err) {
    return errorResponse(err, 502);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const s = await bankSession();
  if (!s) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    const b = await readJson<{ action: string; offer?: string; callId?: string }>(req);
    if (!(await getApplication(id))) return fail('Application not found', 404);
    if (b.action === 'start' && typeof b.offer === 'string' && b.offer.length < 30000) {
      const call = await startCall(id, b.offer);
      await withApp(id, (a) => {
        noteCall(a, call.id, 'RINGING');
        logEvent(a, 'BANK', `${s.user} started the video inspection call`);
      });
      return NextResponse.json({ call });
    }
    if (b.action === 'end') {
      const call = await endCall(id, b.callId, 'BANK');
      if (call) await withApp(id, (a) => noteCall(a, call.id, call.status, { endedAt: call.endedAt }));
      return NextResponse.json({ call });
    }
    return fail('Unknown action');
  } catch (err) {
    return errorResponse(err);
  }
}
