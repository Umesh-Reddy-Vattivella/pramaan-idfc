/* POST /api/links  { prefill }  → creates / replaces a customer valuation link. Returns { token, storeMode }. */
import { NextResponse } from 'next/server';
import type { LinkPrefill } from '@/lib/types';
import { putLink, storeMode, TOKEN_RE } from '@/lib/server/linkStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { prefill?: LinkPrefill };
    const p = body.prefill;
    if (!p || !TOKEN_RE.test(p.token) || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      return NextResponse.json({ error: 'Invalid prefill' }, { status: 400 });
    }
    if (JSON.stringify(p).length > 20000) return NextResponse.json({ error: 'Prefill too large' }, { status: 413 });
    await putLink(p.token, { prefill: p, status: 'SENT' });
    return NextResponse.json({ token: p.token, storeMode });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not create link' }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ storeMode });
}
