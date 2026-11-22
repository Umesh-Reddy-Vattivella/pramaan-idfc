/* ------------------------------------------------------------------
   POST /api/market-evidence — live, citable market data for ANY property.
   Gemini + Google Search grounding EXTRACTS individual printed data points
   (price, area, rate, date, URL). It never computes. Points whose source
   domain is not among Google's grounding citations are rejected.
   Localities are geocoded (Nominatim) so Engine 2 can measure distance.
   All rates, corrections, weights and scores: lib/engines/marketEvidence.ts.
   ------------------------------------------------------------------ */
import { NextResponse } from 'next/server';
import type { LiveEvidenceSnapshot, MarketDataPoint, MarketPointKind } from '@/lib/types';
import { callGemini, extractJson, GeminiError } from '@/lib/live/gemini';
import { geocodeSearch } from '@/lib/live/geocode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KINDS: MarketPointKind[] = ['SALE', 'LISTING', 'AUCTION', 'RERA', 'GUIDELINE'];
const ASSET: Record<string, string> = {
  RESIDENTIAL: 'residential plots / residential land',
  COMMERCIAL: 'commercial plots / commercial land',
  INDUSTRIAL: 'industrial plots / industrial land',
  MIXED_USE: 'residential and commercial plots / land',
  INSTITUTIONAL: 'institutional or residential plots / land',
};

interface Body {
  lat?: number;
  lng?: number;
  address?: string;
  locality?: string;
  city?: string;
  state?: string;
  usage?: string;
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s₹]/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};

function buildPrompt(b: Body, asset: string) {
  const where = [b.locality, b.city, b.state].filter(Boolean).join(', ') || b.address || 'the given location';
  return `Use Google Search to find CURRENT market evidence for ${asset} in and around ${where}, India${b.address ? ` (subject address: ${b.address})` : ''}.
Find as many INDIVIDUAL data points as you can (target 8-15), from the last 24 months where possible:
- LISTING: individual plot/land listings on property portals (price and plot area, or stated rate per sqft)
- SALE: reported actual sale/registration transactions (news, registration data pages)
- AUCTION: bank / SARFAESI e-auction notices for land or houses in the area (reserve price and area)
- GUIDELINE: the government guideline value / circle rate / ready reckoner rate for this locality
Rules:
- Copy numbers EXACTLY as printed on the source page. Do NOT calculate, convert, average or estimate anything.
- If the page states the area in sq yd, sq m, acre or gunta, put that text in "areaText" and leave areaSqft null.
- Every item MUST have the exact source page URL.
- Do not include personal names or phone numbers.
Return ONLY a JSON array (no prose), each item:
{"kind":"LISTING|SALE|AUCTION|GUIDELINE","priceInr":number|null,"areaSqft":number|null,"areaText":string|null,"ratePerSqft":number|null,"propertyType":string,"locality":string,"date":"YYYY-MM"|null,"url":string,"title":string}`;
}

export async function POST(req: Request) {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }
  if (!b.city && !b.address && !b.locality) return NextResponse.json({ error: 'Provide an address, locality or city' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ mode: 'UNAVAILABLE', reason: 'No GEMINI_API_KEY configured — use manual comparable entry.' }, { status: 503 });
  }

  let result;
  try {
    result = await callGemini(apiKey, {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(b, ASSET[b.usage ?? 'RESIDENTIAL'] ?? ASSET.RESIDENTIAL) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0 },
    }, 50000);
  } catch (err) {
    const reason = err instanceof GeminiError ? err.message : 'Live search failed';
    return NextResponse.json({ mode: 'UNAVAILABLE', reason, attempts: err instanceof GeminiError ? err.attempts : undefined }, { status: 503 });
  }

  const chunks = result.groundingMetadata?.groundingChunks ?? [];
  const citations = chunks.map((c) => ({ title: c.web?.title ?? '', uri: c.web?.uri ?? '' })).filter((c) => c.uri);
  const citedDomains = new Set(citations.map((c) => c.title.replace(/^www\./, '').toLowerCase()).filter(Boolean));

  let raw: unknown;
  try {
    raw = extractJson(result.text);
  } catch {
    return NextResponse.json({ mode: 'UNAVAILABLE', reason: 'Search model returned no parseable data points — use manual entry.' }, { status: 502 });
  }
  const rows = Array.isArray(raw) ? raw.slice(0, 30) : [];

  const points: MarketDataPoint[] = [];
  const rejected: LiveEvidenceSnapshot['rejected'] = [];
  rows.forEach((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const kind = KINDS.includes(o.kind as MarketPointKind) ? (o.kind as MarketPointKind) : null;
    const url = str(o.url, 500);
    const title = str(o.title, 160);
    const h = url ? host(url) : null;
    if (!kind) return rejected.push({ title, url, reason: 'Unknown evidence type' });
    if (!url || !h) return rejected.push({ title, url, reason: 'No source URL' });
    // Anti-hallucination: the page's domain must be one Google actually cited for this answer.
    const cited = [...citedDomains].some((d) => h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`));
    if (!cited) return rejected.push({ title, url, reason: `Domain ${h} not among Google grounding citations` });
    const priceInr = num(o.priceInr, 1000, 1e11);
    const areaSqft = num(o.areaSqft, 50, 1e8);
    const statedRatePerSqft = num(o.ratePerSqft, 10, 1e7);
    if (!statedRatePerSqft && !(priceInr && areaSqft)) {
      const areaText = str(o.areaText, 60);
      return rejected.push({ title, url, reason: areaText ? `Area stated as "${areaText}" — not in sqft, needs manual conversion` : 'No rate, or price without sqft area' });
    }
    points.push({
      id: `live-${i + 1}`,
      kind,
      priceInr,
      areaSqft,
      statedRatePerSqft,
      propertyType: str(o.propertyType, 80),
      locality: str(o.locality, 100),
      date: str(o.date, 10),
      url,
      title,
      origin: 'LIVE_SEARCH',
      included: true,
    });
  });

  // Geocode up to 6 distinct localities so Engine 2 can measure comparable distance.
  const region = [b.city, b.state].filter(Boolean).join(', ');
  const localities = [...new Set(points.map((p) => p.locality).filter((x): x is string => !!x))].slice(0, 6);
  const coords = new Map<string, { lat: number; lng: number }>();
  for (const loc of localities) {
    try {
      const hit = (await geocodeSearch(`${loc}${region && !loc.toLowerCase().includes((b.city ?? '').toLowerCase()) ? `, ${region}` : ''}`, 1))[0];
      if (hit) coords.set(loc, { lat: hit.lat, lng: hit.lng });
    } catch {
      /* geocoder unavailable → points kept without coordinates */
    }
  }
  for (const p of points) {
    const c = p.locality ? coords.get(p.locality) : undefined;
    if (c) {
      p.lat = c.lat;
      p.lng = c.lng;
    }
  }

  const snapshot: LiveEvidenceSnapshot = {
    fetchedAt: new Date().toISOString(),
    mode: 'LIVE_SEARCH',
    model: result.model,
    queries: result.groundingMetadata?.webSearchQueries ?? [],
    citations,
    points,
    rejected,
  };
  return NextResponse.json(snapshot);
}
