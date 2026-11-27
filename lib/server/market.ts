/* ------------------------------------------------------------------
   Live market evidence around the property's geolocation (PRD_V3 §6.1).
   Tavily real-time search → Google Gemini COPIES printed price /
   area / rate text from numbered results → every copied number must exist
   verbatim in its source → units parsed deterministically → each locality
   geocoded so the engine can measure distance from the pin.
   If the model is unavailable a regex parser extracts explicit ₹/sqft rates.
   No arithmetic is done by the model.
   ------------------------------------------------------------------ */
import type { EvidenceCategory, EvidenceKind, MarketEvidence, MarketPoint, PropertyType, RejectedPoint } from '@/lib/domain/types';
import { extractRatesFromText, parseAreaSqft, parseInrAmount, parseRatePerSqft, quoteInSource } from '@/lib/engines/parse';
import { geocodeReverse, geocodeSearch } from '@/lib/live/geocode';
import { geminiChat } from '@/lib/live/gemini';
import { tavilyMulti, type SearchResult } from '@/lib/live/tavily';

const BUILT_ASSET: Record<PropertyType, string> = {
  HOUSE: 'independent house',
  FLAT: 'flat apartment',
  PLOT: 'independent house',
  SHOP_OFFICE: 'commercial shop office',
  COMMERCIAL_BUILDING: 'commercial building',
  INDUSTRIAL: 'industrial shed warehouse',
};
const LAND_ASSET: Record<PropertyType, string> = {
  HOUSE: 'residential plot',
  FLAT: 'residential plot',
  PLOT: 'residential plot',
  SHOP_OFFICE: 'commercial plot',
  COMMERCIAL_BUILDING: 'commercial plot',
  INDUSTRIAL: 'industrial plot land',
};

const LAND_RE = /plot|land|site|\bna\b|open|bhukhand|भूखंड|प्लॉट|जमीन/i;
const BUILT_RE = /flat|apartment|\bbhk\b|villa|bungalow|house|office|shop|showroom|penthouse|studio|builder floor|shed|warehouse|building/i;
const MIN_RATE = 100;
const MAX_RATE = 500000;
const NON_PROPERTY = ['facebook.com', 'instagram.com', 'youtube.com', 'x.com', 'twitter.com', 'linkedin.com', 'pinterest.com', 'indiamart.com', 'tradeindia.com', 'quora.com', 'reddit.com', 'justdial.com', 'amazon.in', 'flipkart.com'];

const host = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^(www|m)\./, '').toLowerCase() : '';
  } catch {
    return '';
  }
};
const isNonProperty = (u?: string) => {
  const h = host(u);
  return !!h && NON_PROPERTY.some((d) => h === d || h.endsWith(`.${d}`));
};
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, max) : undefined);
const monthOf = (d?: string) => d?.match(/^\d{4}-\d{2}/)?.[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** Time budget for one market fetch; the route's maxDuration is 300 s. */
export const MARKET_BUDGET = { geminiMs: 210_000, geocodeTrimMs: 230_000, geocodeStopMs: 265_000 };

export interface MarketQuery {
  lat: number;
  lng: number;
  type: PropertyType;
  locality?: string;
  city?: string;
  state?: string;
  address?: string;
}

const SYSTEM = `You are a strict data-extraction tool for an Indian bank's property valuation system.
You COPY text from the numbered search results you are given. You never calculate, convert, round, estimate or invent anything.
Output ONLY a JSON array. No prose, no markdown.`;

function prompt(where: string, q: MarketQuery, sources: SearchResult[]) {
  const list = sources.map((s, i) => `[S${i + 1}] ${s.title}\nURL: ${s.url}\nTEXT: ${s.content}`).join('\n\n');
  return `Subject property: ${BUILT_ASSET[q.type]} near ${where}.

From the search results, extract every INDIVIDUAL property price data point and any government guideline (circle / ready-reckoner) rate.
Return a JSON array of objects with exactly these keys:
{"source":"S<number>","category":"LAND|BUILT|GUIDELINE","kind":"LISTING|SALE|AUCTION|GUIDELINE","propertyType":"<as printed, e.g. residential plot, 3 BHK flat, independent house>","priceText":"<exact text or null>","areaText":"<exact text or null>","rateText":"<exact text or null>","locality":"<locality as printed or null>","dateText":"<date as printed or null>"}

Rules:
- category LAND = plots / land; BUILT = houses, villas, flats, shops, offices, sheds (price relates to built-up area); GUIDELINE = government guideline / circle / ready reckoner rate.
- priceText, areaText and rateText MUST be copied character-for-character from that source's TEXT (e.g. "₹15 Lac", "1200 sqft", "₹4,500/sqft"). Include unit words exactly as printed.
- One object per individual property or per stated rate. LISTING = for sale; SALE = completed / registered transaction; AUCTION = bank auction reserve price.
- SKIP portal-wide "average price" summaries only if they have no locality. SKIP rentals. SKIP anything without a price or rate.
- Do not include names or phone numbers. Maximum 30 objects.

SEARCH RESULTS:
${list}`;
}

function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('[');
  const b = t.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return [];
  }
}

/** The subject locality only if the source itself names it — never assumed (distance would be overstated). */
function printedLocality(src: SearchResult, q: MarketQuery): string | undefined {
  const l = q.locality?.trim();
  return l && l.length >= 3 && `${src.title} ${src.content}`.toLowerCase().includes(l.toLowerCase()) ? l : undefined;
}

const CATS: EvidenceCategory[] = ['LAND', 'BUILT', 'GUIDELINE'];
const KINDS: EvidenceKind[] = ['LISTING', 'SALE', 'AUCTION', 'GUIDELINE'];

function validate(rows: unknown[], sources: SearchResult[], q: MarketQuery, rejected: RejectedPoint[]): MarketPoint[] {
  const out: MarketPoint[] = [];
  rows.slice(0, 40).forEach((row, i) => {
    const o = (row ?? {}) as Record<string, unknown>;
    const src = sources[Number(String(o.source ?? '').replace(/\D/g, '')) - 1];
    if (!src) return rejected.push({ reason: `Unknown source reference "${String(o.source)}"` });
    let category = CATS.includes(o.category as EvidenceCategory) ? (o.category as EvidenceCategory) : null;
    let kind = KINDS.includes(o.kind as EvidenceKind) ? (o.kind as EvidenceKind) : null;
    if (category === 'GUIDELINE' || kind === 'GUIDELINE') {
      category = 'GUIDELINE';
      kind = 'GUIDELINE';
    }
    const propertyType = str(o.propertyType, 80);
    if (!category || !kind) return rejected.push({ title: src.title, url: src.url, reason: 'Unknown evidence type' });
    if (category === 'LAND' && propertyType && BUILT_RE.test(propertyType) && !LAND_RE.test(propertyType)) category = 'BUILT';
    const numeric = (s?: string) => (s && /\d/.test(s) ? s : undefined);
    const pq = numeric(str(o.priceText, 60));
    const aq = numeric(str(o.areaText, 60));
    const rq = numeric(str(o.rateText, 80));
    for (const [label, s] of [['price', pq], ['area', aq], ['rate', rq]] as const) {
      if (s && !quoteInSource(s, `${src.title} ${src.content}`)) return rejected.push({ title: src.title, url: src.url, reason: `Quoted ${label} "${s}" not found in the source text` });
    }
    const rate = rq ? parseRatePerSqft(rq) : null;
    const price = pq ? parseInrAmount(pq) : null;
    const area = aq ? parseAreaSqft(aq) : null;
    const eff = rate ?? (price && area ? price / area : null);
    if (eff === null) return rejected.push({ title: src.title, url: src.url, reason: aq && !area ? `Area "${aq}" has no recognised unit` : 'No usable rate (needs a rate, or price + area)' });
    if (eff < MIN_RATE || eff > MAX_RATE) return rejected.push({ title: src.title, url: src.url, reason: `Rate ₹${Math.round(eff)}/sqft outside plausible range` });
    out.push({
      id: `live-${i + 1}`,
      category,
      kind,
      priceInr: price ?? undefined,
      areaSqft: area ?? undefined,
      ratePerSqft: rate ?? undefined,
      propertyType,
      locality: str(o.locality, 100) ?? printedLocality(src, q),
      date: monthOf(src.publishedDate) ?? (kind === 'LISTING' ? thisMonth() : undefined),
      url: src.url,
      title: src.title,
      quote: [pq, aq, rq].filter(Boolean).join(' · '),
      origin: 'LIVE_SEARCH',
      included: true,
    });
  });
  return out;
}

function regexExtract(sources: SearchResult[], q: MarketQuery): MarketPoint[] {
  const out: MarketPoint[] = [];
  for (const s of sources) {
    const text = `${s.title} ${s.content}`;
    const head = `${s.title} ${s.url}`;
    // Without an AI reader, a page counts as a guideline-rate source only if its title / URL says so —
    // listing pages often mention "circle rate" somewhere in the text.
    const guideline = /guideline|circle rate|circle-rate|ready reckoner|ready-reckoner|collector rate|dlc rate/i.test(head);
    const category: EvidenceCategory = guideline ? 'GUIDELINE' : LAND_RE.test(head) && !BUILT_RE.test(head) ? 'LAND' : BUILT_RE.test(head) ? 'BUILT' : 'LAND';
    if (!guideline && !LAND_RE.test(head) && !BUILT_RE.test(head)) continue;
    extractRatesFromText(s.content)
      .slice(0, 3)
      .forEach((m, j) => {
        if (m.rate < MIN_RATE || m.rate > MAX_RATE) return;
        out.push({
          id: `live-r${out.length + 1}-${j}`,
          category,
          kind: guideline ? 'GUIDELINE' : /auction|sarfaesi/i.test(text) ? 'AUCTION' : 'LISTING',
          ratePerSqft: m.rate,
          propertyType: `${category === 'LAND' ? 'plot / land' : category === 'BUILT' ? 'built property' : 'guideline'} (regex extraction)`,
          locality: printedLocality(s, q),
          date: monthOf(s.publishedDate) ?? thisMonth(),
          url: s.url,
          title: s.title,
          quote: m.rateText,
          origin: 'LIVE_SEARCH',
          included: true,
        });
      });
  }
  return out;
}

export async function fetchMarketEvidence(q: MarketQuery): Promise<MarketEvidence> {
  const started = Date.now();
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) throw new Error('Live search is not configured (TAVILY_API_KEY). Add comparables manually.');

  // Locality from the pin when the address did not provide one.
  let { locality, city, state } = q;
  if (!locality || !city) {
    try {
      const r = await geocodeReverse(q.lat, q.lng);
      locality ??= r?.locality;
      city ??= r?.city;
      state ??= r?.state;
    } catch {
      /* keep what we have */
    }
  }
  const loc = [locality, city].filter(Boolean).join(' ') || q.address || '';
  const where = [locality, city, state].filter(Boolean).join(', ') || q.address || '';
  const query: MarketQuery = { ...q, locality, city, state };

  const { results, errors } = await tavilyMulti(tavilyKey, [
    { q: `${LAND_ASSET[q.type]} for sale in ${loc} price per sq ft`, depth: 'advanced', max: 8 },
    { q: `${BUILT_ASSET[q.type]} for sale in ${loc} price per sq ft`, depth: 'advanced', max: 8 },
    { q: `${loc} ${state ?? ''} guideline value circle rate per sq ft`, depth: 'basic', max: 5 },
    { q: `bank e-auction property ${loc} reserve price sq ft`, depth: 'basic', max: 5 },
  ]);
  if (!results.length) throw new Error(errors.length ? errors.join(' | ') : 'Web search returned no results');

  const rejected: RejectedPoint[] = [];
  for (const r of results) if (isNonProperty(r.url)) rejected.push({ title: r.title, url: r.url, reason: 'Not a property-price source (social / product catalogue)' });
  const sources = results.filter((r) => !isNonProperty(r.url)).slice(0, 20).map((s) => ({ ...s, content: s.content.slice(0, 900) }));

  let points: MarketPoint[] = [];
  let model = 'Tavily search + deterministic rate parser';
  let warning: string | undefined;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const r = await geminiChat(geminiKey, SYSTEM, prompt(where, query, sources), { json: true, deadline: started + MARKET_BUDGET.geminiMs });
      const parsed = extractJson(r.text);
      points = validate(Array.isArray(parsed) ? parsed : [], sources, query, rejected);
      model = `Tavily search + ${r.model} (copy-only extraction)`;
    } catch (err) {
      warning = `${err instanceof Error ? err.message : 'Extraction model failed'} — used the deterministic rate parser instead.`;
      points = regexExtract(sources, query);
    }
  } else points = regexExtract(sources, query);

  // Geocode distinct localities (Nominatim, ≤ 1 req/s) so distance from the pin can be measured.
  const region = [city, state].filter(Boolean).join(', ');
  const locs = [...new Set(points.map((p) => p.locality).filter((x): x is string => !!x))].slice(0, Date.now() - started > MARKET_BUDGET.geocodeTrimMs ? 2 : 6);
  const coords = new Map<string, { lat: number; lng: number }>();
  for (const l of locs) {
    if (Date.now() - started > MARKET_BUDGET.geocodeStopMs) break;
    try {
      const qq = city && l.toLowerCase().includes(city.toLowerCase()) ? l : `${l}${region ? `, ${region}` : ''}`;
      const hit = (await geocodeSearch(qq, 1))[0];
      if (hit) coords.set(l, { lat: hit.lat, lng: hit.lng });
    } catch {
      /* point kept without coordinates */
    }
  }
  for (const p of points) {
    const c = p.locality ? coords.get(p.locality) : undefined;
    if (c) {
      p.lat = c.lat;
      p.lng = c.lng;
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    model,
    queries: [...new Set(results.map((r) => r.query))],
    points,
    rejected,
    warning: [warning, errors.length ? `Some searches failed: ${errors.join(' | ')}` : undefined].filter(Boolean).join(' ') || undefined,
    searchedFor: where,
  };
}
