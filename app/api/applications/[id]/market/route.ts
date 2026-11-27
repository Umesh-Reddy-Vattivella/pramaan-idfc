/* Bank: POST → fetches live market evidence around the property pin and stores it in the application. */
import { NextResponse } from 'next/server';
import { bankSession } from '@/lib/server/auth';
import { getApplication, ID_RE, setMarket, withApp } from '@/lib/server/applications';
import { fail } from '@/lib/server/http';
import { fetchMarketEvidence } from '@/lib/server/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  const app = await getApplication(id).catch(() => null);
  if (!app) return fail('Application not found', 404);
  const p = app.property;
  if (p.lat === null || p.lng === null) return fail('Set the property pin first');
  try {
    const ev = await fetchMarketEvidence({ lat: p.lat, lng: p.lng, type: p.type, locality: p.locality, city: p.city, state: p.state, address: p.address });
    const res = await withApp(id, (a) => setMarket(a, ev));
    return res ? NextResponse.json({ app: res.app }) : fail('Application not found', 404);
  } catch (err) {
    return fail(`${err instanceof Error ? err.message : 'Live search failed'} You can add comparables manually.`, 503);
  }
}
