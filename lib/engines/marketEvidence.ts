/* ------------------------------------------------------------------
   Live Market Evidence aggregation — pure, deterministic (PRD §3.3 applied
   to live / manual data points). The search model only EXTRACTS printed
   prices, areas and rates; every rate, correction, weight and tier is
   computed here.
   ------------------------------------------------------------------ */
import type { ComparablePin, MarketDataPoint, MarketPointKind, PriceSourceInput, SpatialTier } from '@/lib/types';
import { inverseVarianceWeights, median, stdDev } from './price';
import { haversineMeters } from './trust';

/**
 * Default bias corrections for UNCALIBRATED live data (no locality k_reg / d calibration yet):
 *  - LISTING : r × (1 − d), d = 0.14 (PRD §3.3 illustrative asking-to-closing discount)
 *  - AUCTION : r / f, f = 0.80 (PRD §3.3 forced-sale ratio)
 *  - SALE    : r × k_reg, k_reg = 1.00 (reported transaction values — no under-declaration uplift without calibration)
 *  - RERA    : r − net offer (0 when no offer is stated)
 *  - GUIDELINE: circle-rate floor check only (weight 0)
 */
export const LIVE_DEFAULTS = { listingDiscount: 0.14, auctionForcedSaleRatio: 0.8, kReg: 1.0 };

export const KIND_TO_SOURCE: Record<MarketPointKind, PriceSourceInput['id']> = {
  SALE: 'REGD_DEEDS',
  LISTING: 'LISTINGS',
  AUCTION: 'AUCTIONS',
  RERA: 'RERA_BUILDER',
  GUIDELINE: 'CIRCLE_RATE',
};

const SOURCE_LABEL: Record<MarketPointKind, string> = {
  SALE: 'Reported sale transactions (web)',
  LISTING: 'Online portal listings (live search)',
  AUCTION: 'Bank auction notices (live search)',
  RERA: 'RERA / builder price lists (live search)',
  GUIDELINE: 'Circle / guideline rate (live search)',
};

/** Correction factor applied multiplicatively to the raw rate. */
export function correctionFactor(kind: MarketPointKind): number {
  if (kind === 'LISTING') return 1 - LIVE_DEFAULTS.listingDiscount;
  if (kind === 'AUCTION') return 1 / LIVE_DEFAULTS.auctionForcedSaleRatio;
  if (kind === 'SALE') return LIVE_DEFAULTS.kReg;
  return 1;
}

function correctionLabel(kind: MarketPointKind): string {
  if (kind === 'LISTING') return `median(r_ask) × (1 − d), d = ${LIVE_DEFAULTS.listingDiscount * 100}% (default, uncalibrated)`;
  if (kind === 'AUCTION') return `r_auction / f, f = ${LIVE_DEFAULTS.auctionForcedSaleRatio}`;
  if (kind === 'SALE') return `median(r_sale) × k_reg, k_reg = ${LIVE_DEFAULTS.kReg.toFixed(2)} (uncalibrated)`;
  if (kind === 'RERA') return 'list_rate − net_offer (no offer stated)';
  return 'Floor sanity check only (weight 0%)';
}

/* ---------------- Deterministic parsers for printed Indian price / area text ---------------- */

/* Indic numerals (Devanagari, Bengali, Gurmukhi, Gujarati, Tamil, Telugu, Kannada, Malayalam) → ASCII. */
const INDIC_ZERO = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];

/** "११२/२" → "112/2", "०.०१६७" → "0.0167". Leaves all other characters unchanged. */
export function normaliseDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const zero = INDIC_ZERO.find((z) => cp >= z && cp <= z + 9);
    out += zero === undefined ? ch : String(cp - zero);
  }
  return out;
}

// Unit words in English and Indian languages. NOTE: no \b around Indic words (\b is ASCII-only in JS).
const SQFT_PER: { re: RegExp; factor: number }[] = [
  { re: /(sq\.?\s*(ft|feet|fit)|sqft|sft|square\s*f(ee|oo)t|qs\.?\s*fit|स्क्वेयर\s*फीट|चौ\.?\s*फ[ूु]ट?|चौरस\s*फ[ूु]ट|वर्ग\s*फ[ुी]ट|சதுர\s*அடி|ச\.?\s*அடி)/i, factor: 1 },
  { re: /(sq\.?\s*(yd|yard)s?|square\s*yards?|gaj|वर्ग\s*गज|गज)/i, factor: 9 },
  { re: /(sq\.?\s*m(tr|eter|etre)?s?\b|sqm|square\s*met(er|re)s?|m²|चौ\.?\s*मी|चौरस\s*मीटर|वर्ग\s*मीटर|சதுர\s*மீட்டர்|ச\.?\s*மீ)/i, factor: 10.7639 },
  { re: /(\bacres?\b|एकर|एकड़|ஏக்கர்)/i, factor: 43560 },
  { re: /(\bhectares?\b|हेक्टर|हेक्टेयर|हे\.?\s*आर|हे\.|ஹெக்டேர்)/i, factor: 107639 },
  { re: /(\bgunt(h)?as?\b|गुंठ[ाे]?)/i, factor: 1089 },
  { re: /\bares?\b/i, factor: 1076.39 },
];

/** Square feet per one unit of the area unit named in the text (null if no recognised unit). */
export function sqftPerUnit(text: string): number | null {
  for (const u of SQFT_PER) if (u.re.test(text)) return u.factor;
  return null;
}

/**
 * Parses a printed rupee amount: "₹15 Lac" → 1,500,000 · "₹1.14 Cr" → 11,400,000 ·
 * "Rs. 24,00,000" → 2,400,000 · "INR 8.33 K" → 8,330. Returns null if no number.
 */
export function parseInrAmount(text: string): number | null {
  const t = normaliseDigits(text).replace(/,/g, '').replace(/\/-/g, '');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(crores?|cr\b|lakhs?|lacs?|lac\b|lakh\b|l\b|k\b|thousand)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  const mult = /^cr/.test(unit) ? 1e7 : /^(lakh|lac|l$)/.test(unit) ? 1e5 : /^(k|thousand)/.test(unit) ? 1e3 : 1;
  const v = Math.round(n * mult * 100) / 100; // exact to the paisa (avoids 1.14 × 1e7 = 11399999.999…)
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Parses a printed area into sqft, pairing each number with ITS OWN unit:
 * "5000 sqft" → 5000 · "200 sq yd" → 1800 · "1 acre" → 43560 ·
 * "167.22 sq. m. (1800 sq. ft.)" → 1800 (an explicit sq ft figure is preferred over a conversion).
 */
export function parseAreaSqft(text: string): number | null {
  const t = normaliseDigits(text).replace(/,/g, '');
  const pairs: { index: number; value: number; factor: number }[] = [];
  for (const u of SQFT_PER) {
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${u.re.source})`, 'gi');
    for (const m of t.matchAll(re)) pairs.push({ index: m.index ?? 0, value: parseFloat(m[1]), factor: u.factor });
  }
  if (!pairs.length) return null;
  const sqft = pairs.find((p) => p.factor === 1);
  const pick = sqft ?? pairs.sort((a, b) => a.index - b.index)[0];
  const v = Math.round(pick.value * pick.factor * 10000) / 10000;
  return v > 0 ? v : null;
}

/** Parses a printed rate into Rs./sqft: "₹1,200/sqft" → 1200 · "INR 8.33 K/ sq.ft" → 8330 · "₹45,000 per sq yd" → 5000. */
export function parseRatePerSqft(text: string): number | null {
  const amount = parseInrAmount(text);
  const f = sqftPerUnit(text);
  if (amount === null || f === null) return null;
  return amount / f;
}

/** Whitespace / case / currency-symbol normalised text for "is this quote really in the source?" checks. */
export function normaliseForMatch(s: string): string {
  return normaliseDigits(s).toLowerCase().replace(/₹|rs\.?|inr/g, '').replace(/[\s,]+/g, '');
}

/** True if the quoted text appears verbatim (after normalisation) in the source text. */
export function quoteInSource(quote: string, source: string): boolean {
  const q = normaliseForMatch(quote);
  return q.length >= 2 && normaliseForMatch(source).includes(q);
}

/**
 * Deterministic fallback extractor (no AI): finds explicit "₹X / sqft"-style rates in text.
 * Used when the extraction model is unavailable.
 */
export function extractRatesFromText(text: string): { rateText: string; rate: number }[] {
  const re = /(?:₹|rs\.?|inr)\s*\d[\d,.]*\s*(?:k|lakh|lac)?\s*(?:\/-)?\s*(?:\/|per)\s*(?:sq\.?\s*(?:ft|feet|yd|yard|m)|sqft|sft|square\s*(?:feet|yards?))/gi;
  const out: { rateText: string; rate: number }[] = [];
  for (const m of text.matchAll(re)) {
    const rate = parseRatePerSqft(m[0]);
    if (rate !== null && rate >= 100 && rate <= 500000) out.push({ rateText: m[0].trim(), rate });
  }
  return out;
}

/** Rate per sqft: the printed rate if stated, else price ÷ area. null if neither is usable. */
export function pointRate(p: MarketDataPoint): number | null {
  if (p.statedRatePerSqft && p.statedRatePerSqft > 0) return p.statedRatePerSqft;
  if (p.priceInr && p.areaSqft && p.priceInr > 0 && p.areaSqft > 0) return p.priceInr / p.areaSqft;
  return null;
}

/** Months between a printed date (YYYY, YYYY-MM or YYYY-MM-DD) and now; null if unparseable. */
export function monthsSince(date: string | undefined, now: Date): number | null {
  if (!date) return null;
  const m = date.trim().match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return null;
  const y = +m[1];
  const mo = m[2] ? +m[2] - 1 : 5; // year only → assume mid-year
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() - mo);
  return Math.max(0, months);
}

/** Unknown dates are treated conservatively as 12 months old. */
export const UNKNOWN_AGE_MONTHS = 12;

/** Tukey fences: flags values outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR] (only applied when n ≥ 4). */
export function outlierFlags(values: number[]): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  return values.map((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
}

/** Spatial tier from the median comparable distance: ≤1 km micro, ≤3 km ward, ≤10 km SRO, else district. */
export function tierFromDistanceKm(km: number | null): SpatialTier {
  if (km === null) return 'DISTRICT';
  if (km <= 1) return 'MICRO_1KM';
  if (km <= 3) return 'WARD_VILLAGE';
  if (km <= 10) return 'SRO_ZONE';
  return 'DISTRICT';
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
}

/** Removes duplicate data points (same URL + same rate, or same kind + locality + rate + area). */
export function dedupePoints(points: MarketDataPoint[]): MarketDataPoint[] {
  const seen = new Set<string>();
  const out: MarketDataPoint[] = [];
  for (const p of points) {
    const r = pointRate(p);
    const key = p.url ? `${p.url}|${r?.toFixed(0)}` : `${p.kind}|${(p.locality ?? '').toLowerCase()}|${r?.toFixed(0)}|${p.areaSqft ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export interface LiveAggregation {
  priceSources: PriceSourceInput[];
  comparables: ComparablePin[];
  circleRatePerSqft: number;
  spatialTier: SpatialTier;
  medianDistanceKm: number | null;
  usable: number;
  outliers: string[]; // point ids excluded as statistical outliers
  missingRate: string[]; // point ids without a usable rate
}

/**
 * Aggregates included data points into PRD §3.3 price sources:
 *  raw rate = median of per-point rates · corrected = raw × correction factor ·
 *  weight ∝ 1 / σ² with σ = standard error of corrected rates (prior 15% when n = 1) ·
 *  medianAge = median of point ages · spatial tier from median comparable distance.
 */
export function aggregateLiveEvidence(points: MarketDataPoint[], subject: { lat: number; lng: number }, now: Date): LiveAggregation {
  const included = dedupePoints(points.filter((p) => p.included));
  const missingRate = included.filter((p) => pointRate(p) === null).map((p) => p.id);
  const rated = included.filter((p) => pointRate(p) !== null);

  // Outliers are judged within each kind (listings vs sales vs auctions differ structurally).
  const outliers: string[] = [];
  const kinds: MarketPointKind[] = ['SALE', 'LISTING', 'AUCTION', 'RERA', 'GUIDELINE'];
  const clean: MarketDataPoint[] = [];
  for (const k of kinds) {
    const ks = rated.filter((p) => p.kind === k);
    const flags = outlierFlags(ks.map((p) => pointRate(p)!));
    ks.forEach((p, i) => (flags[i] ? outliers.push(p.id) : clean.push(p)));
  }

  const withDist = clean.map((p) => ({
    ...p,
    distanceKm: p.lat !== undefined && p.lng !== undefined ? distanceKm(subject, { lat: p.lat, lng: p.lng }) : undefined,
  }));

  // Guideline / circle rate → weight-0 floor check.
  const guideline = withDist.filter((p) => p.kind === 'GUIDELINE').map((p) => pointRate(p)!);
  const circleRatePerSqft = guideline.length ? median(guideline) : 0;

  const marketKinds = kinds.filter((k) => k !== 'GUIDELINE');
  const draft = marketKinds
    .map((k) => {
      const ps = withDist.filter((p) => p.kind === k);
      if (!ps.length) return null;
      const rates = ps.map((p) => pointRate(p)!);
      const raw = median(rates);
      const f = correctionFactor(k);
      const corrected = raw * f;
      const correctedRates = rates.map((r) => r * f);
      const se = ps.length > 1 ? stdDev(correctedRates) / Math.sqrt(ps.length) : corrected * 0.15;
      const ages = ps.map((p) => monthsSince(p.date, now) ?? UNKNOWN_AGE_MONTHS);
      return { k, n: ps.length, raw, f, corrected, sigma: Math.max(se, corrected * 0.01), age: median(ages) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const weights = inverseVarianceWeights(draft.map((d) => d.sigma));
  const priceSources: PriceSourceInput[] = draft.map((d, i) => ({
    id: KIND_TO_SOURCE[d.k],
    label: SOURCE_LABEL[d.k],
    count: d.n,
    rawRatePerSqft: Math.round(d.raw),
    correctionFormulaLabel: correctionLabel(d.k),
    correctionFactor: +d.f.toFixed(4),
    correctedRatePerSqft: Math.round(d.corrected),
    weight: +weights[i].toFixed(4),
    medianAgeMonths: d.age,
  }));
  if (circleRatePerSqft > 0) {
    priceSources.push({
      id: 'CIRCLE_RATE',
      label: SOURCE_LABEL.GUIDELINE,
      count: guideline.length,
      rawRatePerSqft: Math.round(circleRatePerSqft),
      correctionFormulaLabel: correctionLabel('GUIDELINE'),
      correctionFactor: 1,
      correctedRatePerSqft: Math.round(circleRatePerSqft),
      weight: 0,
      medianAgeMonths: 0,
    });
  }

  const comparables: ComparablePin[] = withDist
    .filter((p) => p.kind !== 'GUIDELINE' && p.lat !== undefined && p.lng !== undefined)
    .map((p) => {
      const r = pointRate(p)!;
      return {
        id: p.id,
        source: KIND_TO_SOURCE[p.kind],
        lat: p.lat!,
        lng: p.lng!,
        distanceKm: +(p.distanceKm ?? 0).toFixed(2),
        date: p.date ?? 'undated',
        rawRate: Math.round(r),
        adjustedRate: Math.round(r * correctionFactor(p.kind)),
        note: `${p.title ?? p.propertyType ?? 'Market data point'}${p.locality ? ` — ${p.locality}` : ''}${p.origin === 'MANUAL' ? ' (manual entry)' : ''}`,
        url: p.url,
      };
    });

  const dists = withDist.filter((p) => p.kind !== 'GUIDELINE' && p.distanceKm !== undefined).map((p) => p.distanceKm!);
  const medianDistanceKm = dists.length ? median(dists) : null;

  return {
    priceSources,
    comparables,
    circleRatePerSqft,
    spatialTier: tierFromDistanceKm(medianDistanceKm),
    medianDistanceKm,
    usable: draft.reduce((s, d) => s + d.n, 0),
    outliers,
    missingRate,
  };
}
