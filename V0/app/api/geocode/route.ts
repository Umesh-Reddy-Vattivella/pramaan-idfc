/* GET /api/geocode?q=<address>   or   /api/geocode?lat=..&lng=..  (reverse) */
import { NextResponse } from 'next/server';
import { geocodeReverse, geocodeSearch } from '@/lib/live/geocode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get('q')?.trim();
  const lat = Number(u.searchParams.get('lat'));
  const lng = Number(u.searchParams.get('lng'));
  try {
    if (q) {
      if (q.length < 3 || q.length > 200) return NextResponse.json({ error: 'Query must be 3-200 characters' }, { status: 400 });
      return NextResponse.json({ results: await geocodeSearch(q) });
    }
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98) {
      return NextResponse.json({ result: await geocodeReverse(lat, lng) });
    }
    return NextResponse.json({ error: 'Provide q, or lat & lng within India' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Geocoding failed' }, { status: 502 });
  }
}
