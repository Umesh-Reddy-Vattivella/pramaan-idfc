/*
  GET  /api/links/:token                     → { prefill, status, openedAt, submission }
  POST /api/links/:token { action: 'open' }  → marks the link opened
  POST /api/links/:token { action: 'submit', submission, prefill? } → stores the customer's capture
  (prefill is accepted on submit so a link opened from its URL fallback still lands on the server.)
*/
import { NextResponse } from 'next/server';
import type { CaptureSubmission, LinkPrefill } from '@/lib/types';
import { getLink, putLink, storeMode, TOKEN_RE } from '@/lib/server/linkStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SUBMISSION_BYTES = 900_000; // keeps one record under the KV free-tier 1 MB limit

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Bad token' }, { status: 400 });
  try {
    const rec = await getLink(token);
    if (!rec) return NextResponse.json({ error: 'Link not found', storeMode }, { status: 404 });
    return NextResponse.json({ ...rec, storeMode });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Store unavailable' }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Bad token' }, { status: 400 });
  try {
    const raw = await req.text();
    if (raw.length > MAX_SUBMISSION_BYTES) return NextResponse.json({ error: 'Submission too large — fewer / smaller photos' }, { status: 413 });
    const body = JSON.parse(raw) as { action?: string; submission?: CaptureSubmission; prefill?: LinkPrefill };
    let rec = await getLink(token);
    if (!rec && body.prefill && body.prefill.token === token) rec = { prefill: body.prefill, status: 'SENT' };
    if (!rec) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

    if (body.action === 'open') {
      if (rec.status === 'SENT') rec = { ...rec, status: 'OPENED', openedAt: new Date().toISOString() };
    } else if (body.action === 'submit' && body.submission) {
      const s = body.submission;
      if (!Array.isArray(s.photos) || !Array.isArray(s.rooms) || !Array.isArray(s.documents)) {
        return NextResponse.json({ error: 'Malformed submission' }, { status: 400 });
      }
      rec = { ...rec, status: 'SUBMITTED', openedAt: rec.openedAt ?? new Date().toISOString(), submission: s };
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    await putLink(token, rec);
    return NextResponse.json({ ok: true, status: rec.status, storeMode });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Store unavailable' }, { status: 502 });
  }
}
