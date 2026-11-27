/*
  Customer side of the video inspection call (customer session required).
  GET                                                  → { call } ringing / active call (with offer)
  POST { action:'answer', callId, answer }
  POST { action:'decline' | 'end', callId }
  POST { action:'photo', label, area, floor?, lat, lng, acc, hash, thumb, full, width, height }
       → snapshot taken on this phone on the bank's instruction (full-res frame + phone GPS)
*/
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Snapshot } from '@/lib/domain/types';
import { answerCall, endCall, getCall } from '@/lib/server/calls';
import { customerSession } from '@/lib/server/auth';
import { addFixes, addSnapshot, logEvent, noteCall, storeSnapshotFile, withApp } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await customerSession();
  if (!s) return fail('Please sign in', 401);
  try {
    const call = await getCall(s.appId);
    return NextResponse.json({ call: call && (call.status === 'RINGING' || call.status === 'ACTIVE') ? call : call ? { ...call, offer: '' } : null });
  } catch (err) {
    return errorResponse(err, 502);
  }
}

interface Body {
  action: string;
  callId?: string;
  answer?: string;
  label?: string;
  area?: string;
  floor?: string;
  lat?: number;
  lng?: number;
  acc?: number;
  hash?: string;
  thumb?: string;
  full?: string;
  width?: number;
  height?: number;
}

export async function POST(req: Request) {
  const s = await customerSession();
  if (!s) return fail('Please sign in', 401);
  const id = s.appId;
  try {
    const b = await readJson<Body>(req);
    if (b.action === 'answer' && b.callId && typeof b.answer === 'string' && b.answer.length < 30000) {
      const call = await answerCall(id, b.callId, b.answer);
      await withApp(id, (a) => {
        noteCall(a, call.id, 'ACTIVE', { answeredAt: call.answeredAt });
        logEvent(a, 'CUSTOMER', 'Customer answered the video call (location and camera allowed)');
      });
      return NextResponse.json({ call });
    }
    if ((b.action === 'decline' || b.action === 'end') && b.callId) {
      const call = await endCall(id, b.callId, 'CUSTOMER', b.action === 'decline' ? 'DECLINED' : 'ENDED');
      await withApp(id, (a) => {
        if (call) noteCall(a, call.id, call.status, { endedAt: call.endedAt });
        logEvent(a, 'CUSTOMER', b.action === 'decline' ? 'Customer declined the video call' : 'Customer ended the video call');
      });
      return NextResponse.json({ call });
    }
    if (b.action === 'photo' && b.full) {
      if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return fail('Snapshot needs a GPS fix');
      const fileId = await storeSnapshotFile(id, b.full);
      const now = new Date().toISOString();
      const snap: Snapshot = {
        id: randomUUID(),
        label: String(b.label ?? 'Snapshot').slice(0, 80),
        area: b.area === 'INTERIOR' ? 'INTERIOR' : 'EXTERIOR',
        floor: b.floor ? String(b.floor).slice(0, 40) : undefined,
        fileId,
        thumb: typeof b.thumb === 'string' && b.thumb.length < 120_000 ? b.thumb : '',
        lat: b.lat!,
        lng: b.lng!,
        accuracyM: Math.round(Number(b.acc) || 0),
        takenAt: now,
        hash: String(b.hash ?? '').slice(0, 64),
        source: 'CUSTOMER_DEVICE',
        width: Number(b.width) || undefined,
        height: Number(b.height) || undefined,
      };
      const res = await withApp(id, (a) => {
        addSnapshot(a, snap);
        addFixes(a, [{ lat: snap.lat!, lng: snap.lng!, acc: snap.accuracyM ?? 0, at: now }]);
      });
      return res ? NextResponse.json({ ok: true, id: snap.id }) : fail('Application not found', 404);
    }
    return fail('Unknown action');
  } catch (err) {
    return errorResponse(err);
  }
}
