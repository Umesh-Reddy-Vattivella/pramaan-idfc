/* ------------------------------------------------------------------
   Live video verification call (bank → customer), signalled through the store.
   WebRTC media flows peer-to-peer; the server only relays the SDP offer/answer
   (non-trickle ICE) and the ring state. One call per case at a time.
   ------------------------------------------------------------------ */
import { randomUUID } from 'node:crypto';
import { kvGetJson, kvSetJson } from './store';

export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'DECLINED' | 'MISSED';

export interface CallRecord {
  id: string;
  caseId: string;
  status: CallStatus;
  offer: string;
  answer?: string;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  endedBy?: 'BANK' | 'CUSTOMER';
}

/** Ring for this long before the call counts as missed. */
export const RING_TIMEOUT_MS = 75_000;
const key = (caseId: string) => `pramaan:call:${caseId}`;

export async function getCall(caseId: string): Promise<CallRecord | null> {
  const c = await kvGetJson<CallRecord>(key(caseId));
  if (c && c.status === 'RINGING' && Date.now() - Date.parse(c.startedAt) > RING_TIMEOUT_MS) {
    const missed: CallRecord = { ...c, status: 'MISSED', endedAt: new Date().toISOString() };
    await kvSetJson(key(caseId), missed);
    return missed;
  }
  return c;
}

export async function startCall(caseId: string, offer: string): Promise<CallRecord> {
  const c: CallRecord = { id: randomUUID(), caseId, status: 'RINGING', offer, startedAt: new Date().toISOString() };
  await kvSetJson(key(caseId), c);
  return c;
}

export async function answerCall(caseId: string, callId: string, answer: string): Promise<CallRecord> {
  const c = await getCall(caseId);
  if (!c || c.id !== callId || c.status !== 'RINGING') throw new Error('This call is no longer ringing');
  const next: CallRecord = { ...c, status: 'ACTIVE', answer, answeredAt: new Date().toISOString() };
  await kvSetJson(key(caseId), next);
  return next;
}

export async function endCall(caseId: string, callId: string | undefined, by: 'BANK' | 'CUSTOMER', status: CallStatus = 'ENDED'): Promise<CallRecord | null> {
  const c = await getCall(caseId);
  if (!c || (callId && c.id !== callId)) return c;
  if (c.status === 'ENDED' || c.status === 'DECLINED' || c.status === 'MISSED') return c;
  const next: CallRecord = { ...c, status, endedAt: new Date().toISOString(), endedBy: by };
  await kvSetJson(key(caseId), next);
  return next;
}

/** STUN always; TURN when configured (needed when both sides are behind strict / mobile-carrier NAT). */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = process.env.TURN_URLS;
  if (turn) servers.push({ urls: turn.split(',').map((u) => u.trim()), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return servers;
}
