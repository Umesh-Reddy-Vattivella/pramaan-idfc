/* ------------------------------------------------------------------
   Live market evidence around the property's geolocation (PRD_V3 §6.1).
   Tavily real-time search → Google Gemini COPIES printed price /
   area / rate text from numbered results → every copied number must exist
   verbatim in its source → units parsed deterministically → each locality
   geocoded so the engine can measure distance from the pin.
   Bank e-auctions come from BAANKNET (the PSB e-auction portal) and IBAPI:
   a domain-restricted search; reserve price + area from single-property pages.
   If the model is unavailable a regex parser extracts explicit ₹/sqft rates.
   No arithmetic is done by the model.
   ------------------------------------------------------------------ */
import type { AuctionPlatform, EvidenceCategory, EvidenceKind, MarketEvidence, MarketPoint, PropertyType, RejectedPoint } from '@/lib/domain/types';
import { extractRatesFromText, parseAreaSqft, parseIndianDate, parseInrAmount, parseRatePerSqft, quoteInSource } from '@/lib/engines/parse';
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

/** BAANKNET titles its pages "3851 square feet Plot for sale in Nagpur": queries mirror that wording. */
const AUCTION_TITLE: Record<PropertyType, string> = {
  HOUSE: 'Individual House',
  FLAT: 'Flat',
  PLOT: 'Plot',
  SHOP_OFFICE: 'Shop',
  COMMERCIAL_BUILDING: 'Commercial',
  INDUSTRIAL: 'Industrial',
};
/** Bank e-auction portals searched for reserve prices. */
export const AUCTION_DOMAINS = ['baanknet.com', 'ibapi.in'];
/** Listings come only from these five property sites (Valuation Logic v2 §1A-B). */
export const LISTING_DOMAINS = ['housing.com', '99acres.com', 'magicbricks.com', 'nobroker.in', 'squareyards.com'];
/** Auction results kept for the extractor even when the other searches return many pages. */
const MAX_AUCTION_SOURCES = 6;

function auctionQueries(type: PropertyType, place: string): string[] {
  if (!place) return [];
  const land = type === 'HOUSE' || type === 'PLOT' || type === 'COMMERCIAL_BUILDING' || type === 'INDUSTRIAL';
  return [...(land ? [`Plot for sale in ${place} reserve price`] : []), ...(type !== 'PLOT' ? [`${AUCTION_TITLE[type]} for sale in ${place} reserve price`] : [])];
}

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
const auctionPlatform = (u?: string): AuctionPlatform | null => {
  const h = host(u);
  if (!h) return null;
  if (h === 'baanknet.com' || h.endsWith('.baanknet.com')) return 'BAANKNET';
  if (h === 'ibapi.in' || h.endsWith('.ibapi.in')) return 'IBAPI';
  return null;
};
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, max) : undefined);
const monthOf = (d?: string) => d?.match(/^\d{4}-\d{2}/)?.[0];

/** Time budget for one market fetch (ms from the start); the route's maxDuration is 90 s. */
export const MARKET_BUDGET = { geminiMs: 60_000, geocodeTrimMs: 62_000, geocodeStopMs: 75_000 };
/** Search results sent to the extractor (besides auction pages) and characters kept from each. */
const MAX_SOURCES = 16;
const SOURCE_CHARS = 800;

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
{"source":"S<number>","category":"LAND|BUILT|GUIDELINE","kind":"LISTING|SALE|AUCTION|GUIDELINE","propertyType":"<as printed, e.g. residential plot, 3 BHK flat, independent house, commercial shop>","priceText":"<exact text or null>","areaText":"<exact text or null>","rateText":"<exact text or null>","project":"<project / society / layout name as printed or null>","locality":"<locality as printed or null>","dateText":"<date as printed or null>"}

Rules:
- category LAND = plots / land; BUILT = houses, villas, flats, shops, offices, sheds (price relates to built-up area); GUIDELINE = government guideline / circle / ready reckoner rate.
- priceText, areaText and rateText MUST be copied character-for-character from that source's TEXT (e.g. "₹15 Lac", "1200 sqft", "₹4,500/sqft"). Include unit words exactly as printed, and the area basis words if printed next to the area (e.g. "1,250 sq.ft. super built-up", "850 sqft carpet").
- propertyType: copy the usage words if printed (residential / commercial / industrial).
- A locality-wide average or price-trend figure is allowed: keep words like "average" or "price trend" in rateText / propertyType exactly as printed.
- One object per individual property or per stated rate. LISTING = for sale; SALE = completed / registered transaction; AUCTION = bank auction reserve price.
- SKIP portal-wide "average price" summaries only if they have no locality. SKIP rentals. SKIP anything without a price or rate.
- Pages from baanknet.com or ibapi.in are BANK AUCTION listings: kind AUCTION; priceText = the RESERVE PRICE exactly as printed (not the EMD, not the bid increment / "price during extension"); areaText = that property's area; dateText = the auction date if printed. SKIP the property if its reserve price is "N/A" or marked indicative. From a multi-property sale notice, include a property only if its own reserve price and its own area are printed together for that one property.
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
    const platform = auctionPlatform(src.url);
    if (platform && category !== 'GUIDELINE') kind = 'AUCTION';
    const numeric = (s?: string) => (s && /\d/.test(s) ? s : undefined);
    const pq = numeric(str(o.priceText, 60));
    const aq = numeric(str(o.areaText, 60));
    const rq = numeric(str(o.rateText, 80));
    const dq = numeric(str(o.dateText, 40));
    if (platform && pq && /\bn\/a\b|indicative/i.test(pq)) return rejected.push({ title: src.title, url: src.url, reason: 'Auction reserve price not declared (N/A / indicative)' });
    for (const [label, s] of [['price', pq], ['area', aq], ['rate', rq]] as const) {
      if (s && !quoteInSource(s, `${src.title} ${src.content}`)) return rejected.push({ title: src.title, url: src.url, reason: `Quoted ${label} "${s}" not found in the source text` });
    }
    const rate = rq ? parseRatePerSqft(rq) : null;
    const price = pq ? parseInrAmount(pq) : null;
    const area = aq ? parseAreaSqft(aq) : null;
    const eff = rate ?? (price && area ? price / area : null);
    if (eff === null) return rejected.push({ title: src.title, url: src.url, reason: aq && !area ? `Area "${aq}" has no recognised unit` : 'No usable rate (needs a rate, or price + area)' });
    if (eff < MIN_RATE || eff > MAX_RATE) return rejected.push({ title: src.title, url: src.url, reason: `Rate ₹${Math.round(eff)}/sqft outside plausible range` });
    // Date provenance: a printed date that really is in the source, else the page's publish date, else none (assumed).
    const printedDate = dq && quoteInSource(dq, `${src.title} ${src.content}`) ? parseIndianDate(dq) : null;
    const pageDate = monthOf(src.publishedDate);
    out.push({
      id: `live-${i + 1}`,
      category,
      kind,
      priceInr: price ?? undefined,
      areaSqft: area ?? undefined,
      ratePerSqft: rate ?? undefined,
      propertyType,
      project: str(o.project, 100),
      locality: str(o.locality, 100) ?? printedLocality(src, q),
      date: printedDate ?? pageDate,
      dateSource: printedDate ? 'PRINTED' : pageDate ? 'PAGE' : 'ASSUMED',
      url: src.url,
      title: src.title,
      quote: [pq, aq, rq].filter(Boolean).join(' · '),
      origin: 'LIVE_SEARCH',
      included: true,
      auction: platform ? { platform, auctionDate: dq ? (parseIndianDate(dq) ?? undefined) : undefined } : undefined,
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
    const platform = auctionPlatform(s.url);
    const category: EvidenceCategory = guideline ? 'GUIDELINE' : LAND_RE.test(head) && !BUILT_RE.test(head) ? 'LAND' : BUILT_RE.test(head) ? 'BUILT' : 'LAND';
    if (!guideline && !LAND_RE.test(head) && !BUILT_RE.test(head)) continue;
    extractRatesFromText(s.content)
      .slice(0, 3)
      .forEach((m, j) => {
        if (m.rate < MIN_RATE || m.rate > MAX_RATE) return;
        out.push({
          id: `live-r${out.length + 1}-${j}`,
          category,
          kind: guideline ? 'GUIDELINE' : platform || /auction|sarfaesi/i.test(text) ? 'AUCTION' : 'LISTING',
          ratePerSqft: m.rate,
          propertyType: `${category === 'LAND' ? 'plot / land' : category === 'BUILT' ? 'built property' : 'guideline'} (regex extraction)`,
          locality: printedLocality(s, q),
          date: monthOf(s.publishedDate),
          dateSource: monthOf(s.publishedDate) ? 'PAGE' : 'ASSUMED',
          url: s.url,
          title: s.title,
          quote: m.rateText,
          origin: 'LIVE_SEARCH',
          included: true,
          auction: platform ? { platform } : undefined,
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
    { q: `${LAND_ASSET[q.type]} for sale in ${loc} price per sq ft`, depth: 'advanced', max: 8, domains: LISTING_DOMAINS },
    { q: `${BUILT_ASSET[q.type]} for sale in ${loc} price per sq ft`, depth: 'advanced', max: 8, domains: LISTING_DOMAINS },
    { q: `${loc} ${state ?? ''} guideline value circle rate per sq ft`, depth: 'basic', max: 5 },
    // Bank auctions are sparse: search city-wide (points > 10 km from the pin are dropped by distance).
    ...auctionQueries(q.type, city || loc).map((x) => ({ q: x, depth: 'advanced' as const, max: 8, domains: AUCTION_DOMAINS })),
  ]);
  if (!results.length) throw new Error(errors.length ? errors.join(' | ') : 'Web search returned no results');

  const rejected: RejectedPoint[] = [];
  for (const r of results) if (isNonProperty(r.url)) rejected.push({ title: r.title, url: r.url, reason: 'Not a property-price source (social / product catalogue)' });
  // Auction pages get their own places so the other searches cannot crowd them out.
  const usable = results.filter((r) => !isNonProperty(r.url));
  const auctions = usable.filter((r) => auctionPlatform(r.url)).slice(0, MAX_AUCTION_SOURCES);
  const sources = [...usable.filter((r) => !auctionPlatform(r.url)).slice(0, MAX_SOURCES), ...auctions].map((s) => ({ ...s, content: s.content.slice(0, SOURCE_CHARS) }));

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

  // Geocode (Nominatim, ≤ 1 req/s) so distance from the pin can be measured: the project / society name with
  // its locality first (exact), then the locality centre (marked approximate).
  const region = [city, state].filter(Boolean).join(', ');
  const tight = Date.now() - started > MARKET_BUDGET.geocodeTrimMs;
  const place = (l: string) => (city && l.toLowerCase().includes(city.toLowerCase()) ? l : `${l}${region ? `, ${region}` : ''}`);
  const projects = tight ? [] : [...new Set(points.filter((p) => p.project).map((p) => `${p.project}|${p.locality ?? ''}`))].slice(0, 4);
  const locs = [...new Set(points.map((p) => p.locality).filter((x): x is string => !!x))].slice(0, tight ? 2 : 6);
  const coords = new Map<string, { lat: number; lng: number }>();
  for (const key of [...projects.map((k) => `P:${k}`), ...locs.map((l) => `L:${l}`)]) {
    if (Date.now() - started > MARKET_BUDGET.geocodeStopMs) break;
    try {
      const [proj, l] = key.slice(2).split('|');
      const hit = (await geocodeSearch(key.startsWith('P:') ? place(`${proj}${l ? `, ${l}` : ''}`) : place(key.slice(2)), 1))[0];
      if (hit) coords.set(key, { lat: hit.lat, lng: hit.lng });
    } catch {
      /* point kept without coordinates */
    }
  }
  for (const p of points) {
    const exact = p.project ? coords.get(`P:${p.project}|${p.locality ?? ''}`) : undefined;
    const c = exact ?? (p.locality ? coords.get(`L:${p.locality}`) : undefined);
    if (c) {
      p.lat = c.lat;
      p.lng = c.lng;
      p.approxLocation = !exact;
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
