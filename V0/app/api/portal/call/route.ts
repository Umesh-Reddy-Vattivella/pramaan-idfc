/*
  Customer side of the live video verification call (session cookie required).
  GET  /api/portal/call                                              → { call } incoming / active call (offer included)
  POST { action:'answer', callId, answer }                           → picks up
  POST { action:'decline' | 'end', callId }                          → declines / hangs up
  POST { action:'photo', photo: GeoPhoto, full: base64 JPEG }        → photo taken on the bank's instruction
*/
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { GeoPhoto } from '@/lib/types';
import { answerCall, endCall, getCall } from '@/lib/server/calls';
import { addCallPhoto, getRecord, putCallPhoto, withCase } from '@/lib/server/caseFiles';
import { readSession, SESSION_COOKIE } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function caseId() {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value)?.caseId ?? null;
}

export async function GET() {
  const id = await caseId();
  if (!id) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  try {
    const call = await getCall(id);
    return NextResponse.json({ call: call && (call.status === 'RINGING' || call.status === 'ACTIVE') ? call : call ? { ...call, offer: '' } : null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Store unavailable' }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const id = await caseId();
  if (!id) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  try {
    const b = (await req.json()) as { action: string; callId?: string; answer?: string; photo?: GeoPhoto; full?: string };
    const r = await getRecord(id);
    if (!r) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    if (b.action === 'answer' && b.callId && b.answer && b.answer.length < 20000) {
      const call = await answerCall(id, b.callId, b.answer);
      await withCase(id, (x) => void x.events.unshift({ at: new Date().toISOString(), by: 'CUSTOMER', text: 'Answered the video call (location + camera allowed)' }));
      return NextResponse.json({ call });
    }
    if ((b.action === 'decline' || b.action === 'end') && b.callId) {
      const call = await endCall(id, b.callId, 'CUSTOMER', b.action === 'decline' ? 'DECLINED' : 'ENDED');
      await withCase(id, (x) => void x.events.unshift({ at: new Date().toISOString(), by: 'CUSTOMER', text: b.action === 'decline' ? 'Declined the video call' : 'Ended the video call' }));
      return NextResponse.json({ call });
    }
    if (b.action === 'photo' && b.photo && b.full) {
      const p = b.photo;
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || typeof p.slot !== 'string' || p.slot.length > 80) {
        return NextResponse.json({ error: 'Photo needs a GPS fix' }, { status: 400 });
      }
      const safe: GeoPhoto = {
        id: String(p.id).slice(0, 60),
        slot: p.slot,
        label: String(p.label).slice(0, 80),
        lat: p.lat,
        lng: p.lng,
        accuracyM: Math.round(Number(p.accuracyM) || 0),
        takenAt: new Date().toISOString(),
        fileAgeMs: 0,
        hash: String(p.hash).slice(0, 64),
        thumb: typeof p.thumb === 'string' && p.thumb.length < 80_000 ? p.thumb : undefined,
      };
      const stored = await putCallPhoto(id, safe, b.full);
      await withCase(id, (x) => addCallPhoto(x, stored));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Request failed' }, { status: 400 });
  }
}
