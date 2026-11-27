/* ------------------------------------------------------------------
   POST /api/market-evidence — live, citable market data for ANY property.

   Primary path (free): Tavily real-time web search → free OpenRouter model
   COPIES printed price / area / rate text from numbered search results →
   every copied quote is verified to exist verbatim in its source text →
   lib/engines/marketEvidence.ts parses units and computes everything.
   If the model is unavailable, a deterministic regex parser extracts
   explicit "₹X / sq ft" rates from the same results (no AI at all).
   Secondary path: Gemini + Google Search grounding (if configured).
   ------------------------------------------------------------------ */
import { NextResponse } from 'next/server';
import type { LiveEvidenceSnapshot, MarketDataPoint, MarketPointKind } from '@/lib/types';
import { callGemini, extractJson, GeminiError } from '@/lib/live/gemini';
import { geocodeSearch } from '@/lib/live/geocode';
import { tavilyMulti, type SearchResult } from '@/lib/live/tavily';
import { openRouterChat, OpenRouterError } from '@/lib/live/openrouter';
import { extractRatesFromText, parseAreaSqft, parseInrAmount, parseRatePerSqft, quoteInSource } from '@/lib/engines/marketEvidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KINDS: MarketPointKind[] = ['SALE', 'LISTING', 'AUCTION', 'RERA', 'GUIDELINE'];
const ASSET: Record<string, string> = {
  RESIDENTIAL: 'residential plot',
  COMMERCIAL: 'commercial plot',
  INDUSTRIAL: 'industrial plot land',
  MIXED_USE: 'plot',
  INSTITUTIONAL: 'plot land',
};
const LAND_RE = /plot|land|site|\bna\b|open|bhukhand|भूखंड|प्लॉट|जमीन/i;
const BUILT_RE = /flat|apartment|\bbhk\b|villa|bungalow|house|office|shop|showroom|penthouse|studio|builder floor/i;
const MIN_RATE = 100;
const MAX_RATE = 500000;

interface Body {
  lat?: number;
  lng?: number;
  address?: string;
  locality?: string;
  city?: string;
  state?: string;
  usage?: string;
}
type Rejected = LiveEvidenceSnapshot['rejected'];

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};
const monthOf = (d?: string) => d?.match(/^\d{4}-\d{2}/)?.[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);

/* ================= Primary: Tavily + free OpenRouter extraction ================= */

const EXTRACT_SYSTEM = `You are a strict data-extraction tool for an Indian bank's property valuation system.
You COPY text from the numbered search results you are given. You never calculate, convert, round, estimate or invent anything.
Output ONLY a JSON array. No prose, no markdown.`;

function extractPrompt(b: Body, sources: SearchResult[]) {
  const where = [b.locality, b.city, b.state].filter(Boolean).join(', ');
  const list = sources.map((s, i) => `[S${i + 1}] ${s.title}\nURL: ${s.url}\nTEXT: ${s.content}`).join('\n\n');
  return `Subject property location: ${where}. Asset: ${ASSET[b.usage ?? 'RESIDENTIAL'] ?? 'plot'}.

From the search results below, extract every INDIVIDUAL land / plot data point and any government guideline (circle / ready-reckoner) rate.
Return a JSON array of objects with exactly these keys:
{"source":"S<number>","kind":"LISTING|SALE|AUCTION|GUIDELINE","propertyType":"<as printed, e.g. residential plot>","priceText":"<exact text or null>","areaText":"<exact text or null>","rateText":"<exact text or null>","locality":"<locality as printed or null>","dateText":"<date as printed or null>"}

Rules:
- priceText, areaText and rateText MUST be copied character-for-character from that source's TEXT (e.g. "₹15 Lac", "5000 sqft", "₹1,200/sqft", "17500/- per sq.ft"). Include the unit words exactly as printed.
- One object per individual plot or per stated rate. Use LISTING for plots for sale, SALE for completed/registered transactions, AUCTION for bank auction reserve prices, GUIDELINE for government guideline / circle / ready reckoner rates.
- SKIP flats, apartments, houses, villas, offices and shops. SKIP portal "average price" figures. SKIP anything without a price or rate.
- Do not include names or phone numbers. Maximum 25 objects.

SEARCH RESULTS:
${list}`;
}

/**
 * Sources that are not property-price evidence: social posts, B2B product catalogues, video/Q&A sites.
 * Seen in live testing (e.g. IndiaMART product prices read as Rs./sqft). Comparables must come from property
 * portals, registration / auction notices, builders or news reports of transactions.
 */
const NON_PROPERTY_DOMAINS = ['facebook.com', 'instagram.com', 'youtube.com', 'x.com', 'twitter.com', 'linkedin.com', 'pinterest.com', 'indiamart.com', 'tradeindia.com', 'quora.com', 'reddit.com', 'justdial.com', 'amazon.in', 'flipkart.com'];
const isNonProperty = (url?: string) => {
  try {
    const h = url ? new URL(url).hostname.replace(/^(www|m)\./, '') : '';
    return NON_PROPERTY_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

function validate(rows: unknown[], sources: SearchResult[], b: Body, rejected: Rejected): MarketDataPoint[] {
  const points: MarketDataPoint[] = [];
  rows.slice(0, 40).forEach((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const idx = Number(String(o.source ?? '').replace(/\D/g, '')) - 1;
    const src = sources[idx];
    const kind = KINDS.includes(o.kind as MarketPointKind) ? (o.kind as MarketPointKind) : null;
    const priceText = str(o.priceText, 60);
    const areaText = str(o.areaText, 60);
    const rateText = str(o.rateText, 80);
    const propertyType = str(o.propertyType, 80);
    if (!src) return rejected.push({ title: propertyType, reason: `Unknown source reference "${String(o.source)}"` });
    if (!kind) return rejected.push({ title: src.title, url: src.url, reason: 'Unknown evidence type' });
    if (isNonProperty(src.url)) return rejected.push({ title: src.title, url: src.url, reason: 'Not a property-price source (social / product catalogue)' });
    if (kind !== 'GUIDELINE' && propertyType && BUILT_RE.test(propertyType) && !LAND_RE.test(propertyType)) {
      return rejected.push({ title: src.title, url: src.url, reason: `Built property ("${propertyType}") — not a land rate` });
    }
    // Anti-hallucination: every quoted NUMBER must exist verbatim in the cited source text.
    // (Quotes without digits are not figures and are ignored.)
    const numeric = (q?: string) => (q && /\d/.test(q) ? q : undefined);
    const pq = numeric(priceText);
    const aq = numeric(areaText);
    const rq = numeric(rateText);
    for (const [label, q] of [['price', pq], ['area', aq], ['rate', rq]] as const) {
      if (q && !quoteInSource(q, `${src.title} ${src.content}`)) {
        return rejected.push({ title: src.title, url: src.url, reason: `Quoted ${label} "${q}" not found in the source text` });
      }
    }
    const rate = rq ? parseRatePerSqft(rq) : null;
    const price = pq ? parseInrAmount(pq) : null;
    const area = aq ? parseAreaSqft(aq) : null;
    const effective = rate ?? (price && area ? price / area : null);
    if (effective === null) {
      return rejected.push({ title: src.title, url: src.url, reason: aq && !area ? `Area "${aq}" has no recognised unit` : 'No usable rate (needs a rate, or price + area)' });
    }
    if (effective < MIN_RATE || effective > MAX_RATE) {
      return rejected.push({ title: src.title, url: src.url, reason: `Rate Rs. ${Math.round(effective)}/sqft outside plausible range` });
    }
    points.push({
      id: `live-${i + 1}`,
      kind,
      priceInr: price ?? undefined,
      areaSqft: area ?? undefined,
      statedRatePerSqft: rate ?? undefined,
      propertyType,
      locality: str(o.locality, 100) ?? b.locality,
      // Active listings without a printed date are dated to the retrieval month.
      date: monthOf(src.publishedDate) ?? (kind === 'LISTING' ? thisMonth() : undefined),
      url: src.url,
      title: src.title,
      quote: [pq, aq, rq].filter(Boolean).join(' · '),
      origin: 'LIVE_SEARCH',
      included: true,
    });
  });
  return points;
}

/** No-AI fallback: explicit "₹X / sq ft" rates found by regex in land-related results. */
function deterministicExtract(sources: SearchResult[], b: Body): MarketDataPoint[] {
  const points: MarketDataPoint[] = [];
  sources.forEach((s) => {
    const text = `${s.title} ${s.content}`;
    const head = `${s.title} ${s.url}`;
    const guideline = /guideline|circle rate|ready reckoner|collector rate|dlc/i.test(text);
    // Without an AI reader, only trust pages whose title / URL are clearly about land or plots.
    if (!guideline && (!LAND_RE.test(head) || (BUILT_RE.test(head) && !/plot|land/i.test(head)))) return;
    extractRatesFromText(s.content)
      .slice(0, 3)
      .forEach((m, j) => {
        if (m.rate < MIN_RATE || m.rate > MAX_RATE) return;
        points.push({
          id: `live-r${points.length + 1}-${j}`,
          kind: guideline ? 'GUIDELINE' : /auction|sarfaesi/i.test(text) ? 'AUCTION' : 'LISTING',
          statedRatePerSqft: m.rate,
          propertyType: 'plot / land (regex extraction)',
          locality: b.locality,
          date: monthOf(s.publishedDate) ?? thisMonth(),
          url: s.url,
          title: s.title,
          quote: m.rateText,
          origin: 'LIVE_SEARCH',
          included: true,
        });
      });
  });
  return points;
}

async function viaTavily(b: Body, tavilyKey: string, openRouterKey: string | undefined, started: number) {
  const loc = [b.locality, b.city].filter(Boolean).join(' ') || b.address || '';
  const asset = ASSET[b.usage ?? 'RESIDENTIAL'] ?? 'plot';
  const { results, errors } = await tavilyMulti(tavilyKey, [
    { q: `${asset} for sale in ${loc} price per sq ft`, depth: 'advanced', max: 8 },
    { q: `${loc} ${b.state ?? ''} land guideline value circle rate per sq ft`, depth: 'basic', max: 5 },
    { q: `bank e-auction ${asset} ${loc} reserve price`, depth: 'basic', max: 5 },
    { q: `${loc} plot sold price per sq ft registration`, depth: 'basic', max: 5 },
  ]);
  if (!results.length) throw new Error(errors.length ? errors.join(' | ') : 'Web search returned no results');

  const rejected: Rejected = [];
  // Drop social posts / product catalogues before any reader (AI or regex) sees them.
  for (const r of results) if (isNonProperty(r.url)) rejected.push({ title: r.title, url: r.url, reason: 'Not a property-price source (social / product catalogue)' });
  const sources = results.filter((r) => !isNonProperty(r.url)).slice(0, 16).map((s) => ({ ...s, content: s.content.slice(0, 900) }));
  let points: MarketDataPoint[] = [];
  let model = 'Tavily search + deterministic parser';
  let warning: string | undefined;

  if (openRouterKey) {
    try {
      // Keep the whole route under the 60 s serverless limit (search + extraction + geocoding).
      const r = await openRouterChat(openRouterKey, EXTRACT_SYSTEM, extractPrompt(b, sources), started + 42000);
      const parsed = extractJson(r.text);
      points = validate(Array.isArray(parsed) ? parsed : [], sources, b, rejected);
      model = `Tavily search + ${r.model}`;
    } catch (err) {
      warning = `${err instanceof OpenRouterError ? err.message : 'Extraction model returned unusable output'} — used deterministic rate parser instead.`;
      points = deterministicExtract(sources, b);
    }
  } else {
    points = deterministicExtract(sources, b);
  }

  return {
    model,
    warning: [warning, errors.length ? `Some searches failed: ${errors.join(' | ')}` : undefined].filter(Boolean).join(' ') || undefined,
    queries: [...new Set(results.map((r) => r.query))],
    citations: sources.map((s) => ({ title: host(s.url) ?? s.title, uri: s.url })),
    points,
    rejected,
  };
}

/* ================= Secondary: Gemini + Google Search grounding ================= */

async function viaGemini(b: Body, apiKey: string) {
  const where = [b.locality, b.city, b.state].filter(Boolean).join(', ') || b.address;
  const prompt = `Use Google Search to find current market evidence for ${ASSET[b.usage ?? 'RESIDENTIAL'] ?? 'plot'}s in and around ${where}, India.
Return ONLY a JSON array (target 8-15 items) of {"kind":"LISTING|SALE|AUCTION|GUIDELINE","priceText":string|null,"areaText":string|null,"rateText":string|null,"propertyType":string,"locality":string,"date":"YYYY-MM"|null,"url":string,"title":string}.
Copy price / area / rate text EXACTLY as printed with units. Do not calculate anything. Every item must have its exact source URL. Skip flats and houses.`;
  const result = await callGemini(apiKey, { contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }, 50000);
  const citations = (result.groundingMetadata?.groundingChunks ?? []).map((c) => ({ title: c.web?.title ?? '', uri: c.web?.uri ?? '' })).filter((c) => c.uri);
  const cited = new Set(citations.map((c) => c.title.replace(/^www\./, '').toLowerCase()).filter(Boolean));
  const parsed = extractJson(result.text);
  const rejected: Rejected = [];
  const points: MarketDataPoint[] = [];
  (Array.isArray(parsed) ? parsed : []).slice(0, 30).forEach((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const kind = KINDS.includes(o.kind as MarketPointKind) ? (o.kind as MarketPointKind) : null;
    const url = str(o.url, 500);
    const h = url ? host(url) : null;
    const title = str(o.title, 160);
    if (!kind || !url || !h) return rejected.push({ title, url, reason: 'Missing type or source URL' });
    if (isNonProperty(url)) return rejected.push({ title, url, reason: 'Not a property-price source (social / product catalogue)' });
    if (![...cited].some((d) => h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`))) return rejected.push({ title, url, reason: `Domain ${h} not among Google grounding citations` });
    const rateText = str(o.rateText, 80);
    const priceText = str(o.priceText, 60);
    const areaText = str(o.areaText, 60);
    const rate = rateText ? parseRatePerSqft(rateText) : null;
    const price = priceText ? parseInrAmount(priceText) : null;
    const area = areaText ? parseAreaSqft(areaText) : null;
    const eff = rate ?? (price && area ? price / area : null);
    if (eff === null || eff < MIN_RATE || eff > MAX_RATE) return rejected.push({ title, url, reason: 'No usable / plausible rate' });
    points.push({ id: `live-${i + 1}`, kind, priceInr: price ?? undefined, areaSqft: area ?? undefined, statedRatePerSqft: rate ?? undefined, propertyType: str(o.propertyType, 80), locality: str(o.locality, 100) ?? b.locality, date: str(o.date, 10), url, title, quote: [priceText, areaText, rateText].filter(Boolean).join(' · '), origin: 'LIVE_SEARCH', included: true });
  });
  return { model: `${result.model} + Google Search`, warning: undefined as string | undefined, queries: result.groundingMetadata?.webSearchQueries ?? [], citations, points, rejected };
}

/* ================= Route ================= */

export async function POST(req: Request) {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }
  if (!b.city && !b.address && !b.locality) return NextResponse.json({ error: 'Provide an address, locality or city' }, { status: 400 });

  const started = Date.now();
  const tavilyKey = process.env.TAVILY_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  let out: Awaited<ReturnType<typeof viaTavily>> | null = null;
  const failures: string[] = [];
  if (tavilyKey) {
    try {
      out = await viaTavily(b, tavilyKey, openRouterKey, started);
    } catch (err) {
      failures.push(`Tavily: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  if (!out && geminiKey) {
    try {
      out = await viaGemini(b, geminiKey);
    } catch (err) {
      failures.push(err instanceof GeminiError ? err.message : `Gemini: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  if (!out) {
    const reason = failures.length ? failures.join(' · ') : 'No live search provider configured (set TAVILY_API_KEY + OPENROUTER_API_KEY).';
    return NextResponse.json({ mode: 'UNAVAILABLE', reason: `${reason} Use manual comparable entry.` }, { status: 503 });
  }

  // Geocode up to 6 distinct localities so Engine 2 can measure comparable distance.
  const region = [b.city, b.state].filter(Boolean).join(', ');
  const localities = [...new Set(out.points.map((p) => p.locality).filter((x): x is string => !!x))].slice(0, Date.now() - started > 45000 ? 2 : 5);
  const coords = new Map<string, { lat: number; lng: number }>();
  for (const loc of localities) {
    try {
      const q = b.city && loc.toLowerCase().includes(b.city.toLowerCase()) ? loc : `${loc}${region ? `, ${region}` : ''}`;
      const hit = (await geocodeSearch(q, 1))[0];
      if (hit) coords.set(loc, { lat: hit.lat, lng: hit.lng });
    } catch {
      /* geocoder unavailable → points kept without coordinates */
    }
  }
  for (const p of out.points) {
    const c = p.locality ? coords.get(p.locality) : undefined;
    if (c) {
      p.lat = c.lat;
      p.lng = c.lng;
    }
  }

  const snapshot: LiveEvidenceSnapshot & { warning?: string } = {
    fetchedAt: new Date().toISOString(),
    mode: 'LIVE_SEARCH',
    model: out.model,
    queries: out.queries,
    citations: out.citations,
    points: out.points,
    rejected: out.rejected,
    warning: out.warning,
  };
  return NextResponse.json(snapshot);
}
