/* GET /api/call/ice → { iceServers } for the WebRTC video call (STUN + optional TURN from env). */
import { NextResponse } from 'next/server';
import { iceServers } from '@/lib/server/calls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ iceServers: iceServers(), turnConfigured: !!process.env.TURN_URLS });
}
