/* ------------------------------------------------------------------
   Market evidence → market rate R with an 80% range + Authenticity Score.
   PRAMAAN Valuation Logic v2 (§3 corrections, §5 cleaning, §6 tiers,
   §7 rate engine, §8 score). Pure and deterministic; every constant comes
   from config/valuation.ts. Runs separately for LAND rates (Rs./sqft of
   plot) and BUILT rates (Rs./sqft of built-up area). GUIDELINE (government)
   rates never enter R: floor check and location adjustment only.
   ------------------------------------------------------------------ */
import type { AreaBasis, DateSource, EvidenceCategory, EvidenceKind, GuidelineRef, MarketPoint, PropertyType, Usage } from '@/lib/domain/types';
import { VALUATION as V, type Tier } from '@/config/valuation';
import { hpiFactor } from './hpi';
import { monthsSince } from './parse';
import { effectiveN, haversineMeters, mean, median, sampleStdDev, weightedMedian } from './stats';

export const EVIDENCE_DEFAULTS = { listingDiscount: V.listingDiscount, auctionForcedSaleRatio: V.auctionForcedSaleRatio, kReg: V.kReg };
export const MAX_COMPARABLE_KM = V.maxComparableKm;
export const UNKNOWN_AGE_MONTHS = V.undatedAgeMonths;

export const KIND_LABEL: Record<EvidenceKind, string> = {
  LISTING: 'Portal listing (asking price)',
  SALE: 'Registered / reported sale',
  AUCTION: 'Bank auction (reserve price)',
  GUIDELINE: 'Government guideline rate',
};

export const CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  LAND: 'Land / plot rates',
  BUILT: 'Built property rates',
  GUIDELINE: 'Guideline (government) rate',
};

export const TIER_LABEL: Record<Tier, string> = {
  T1: `T1 same locality (≤ ${V.tierKm.T1} km)`,
  T2: `T2 nearby (≤ ${V.tierKm.T2} km)`,
  T3: `T3 wider city (≤ ${V.tierKm.T3} km or distance unknown)`,
};

export const DATE_SOURCE_LABEL: Record<DateSource, string> = { PRINTED: 'printed date', PAGE: 'page date', ASSUMED: `undated — scored as ${V.undatedAgeMonths} months old` };

export function correctionFactor(kind: EvidenceKind): number {
  if (kind === 'LISTING') return 1 - V.listingDiscount;
  if (kind === 'AUCTION') return 1 / V.auctionForcedSaleRatio;
  if (kind === 'SALE') return V.kReg;
  return 1;
}

export function correctionText(kind: EvidenceKind): string {
  if (kind === 'LISTING') return `× (1 − ${V.listingDiscount}) asking→closing · τ ${V.tau.LISTING}`;
  if (kind === 'AUCTION') return `÷ ${V.auctionForcedSaleRatio} forced-sale ratio · τ ${V.tau.AUCTION}`;
  if (kind === 'SALE') return `× ${V.kReg.toFixed(2)} k_reg · τ ${V.tau.SALE}`;
  return 'floor check only (weight 0)';
}

/** Printed rate if stated, else price ÷ area. */
export function pointRate(p: MarketPoint): number | null {
  if (p.ratePerSqft && p.ratePerSqft > 0) return p.ratePerSqft;
  if (p.priceInr && p.areaSqft && p.priceInr > 0 && p.areaSqft > 0) return p.priceInr / p.areaSqft;
  return null;
}

export function pointDistanceKm(p: MarketPoint, pin: { lat: number; lng: number } | null): number | null {
  if (!pin || p.lat === undefined || p.lng === undefined) return null;
  return haversineMeters(pin.lat, pin.lng, p.lat, p.lng) / 1000;
}

/* ---------------- reading a point's printed text (deterministic) ---------------- */

const typeText = (p: MarketPoint) => `${p.propertyType ?? ''} ${p.propertyType ? '' : (p.title ?? '')}`.toLowerCase();

/** Usage printed with the point: one clear word, else null (unknown — kept). */
export function pointUsage(p: MarketPoint): Exclude<Usage, 'MIXED'> | null {
  const t = typeText(p);
  const hits = [
    /industrial|\bsheds?\b|warehouse|godown|factory|\bmidc\b/.test(t) && 'INDUSTRIAL',
    /commercial|\bshops?\b|\boffices?\b|showroom|retail/.test(t) && 'COMMERCIAL',
    /residential|\bflats?\b|apartment|\bbhk\b|\bvillas?\b|bungalow|\bhouses?\b|duplex|penthouse|builder floor|studio/.test(t) && 'RESIDENTIAL',
  ].filter(Boolean) as Exclude<Usage, 'MIXED'>[];
  return hits.length === 1 ? hits[0] : null;
}

const USAGE_ACCEPTS: Record<Usage, Usage[]> = { RESIDENTIAL: ['RESIDENTIAL'], COMMERCIAL: ['COMMERCIAL'], MIXED: ['RESIDENTIAL', 'COMMERCIAL'], INDUSTRIAL: ['INDUSTRIAL'] };

export type BuiltType = Exclude<PropertyType, 'PLOT'>;
/** Built-property type printed with the point, else null (unknown — kept). */
export function pointBuiltType(p: MarketPoint): BuiltType | null {
  const t = typeText(p);
  if (/industrial|\bsheds?\b|warehouse|godown|factory/.test(t)) return 'INDUSTRIAL';
  if (/commercial (building|complex)|\bcomplex\b/.test(t)) return 'COMMERCIAL_BUILDING';
  if (/\bshops?\b|\boffices?\b|showroom|retail/.test(t)) return 'SHOP_OFFICE';
  if (/independent house|individual house|\bvillas?\b|bungalow|row ?house|duplex|\bhouses?\b|\bkothi\b/.test(t)) return 'HOUSE';
  if (/\bflats?\b|apartment|\bbhk\b|penthouse|studio|builder floor/.test(t)) return 'FLAT';
  return null;
}

/** Area basis printed with a unit price. */
export function detectAreaBasis(text: string): AreaBasis | null {
  const t = text.toLowerCase();
  if (/carpet/.test(t)) return 'CARPET';
  if (/super|\bsba\b|saleable|salable/.test(t)) return 'SUPER_BUILT_UP';
  if (/built[\s-]?up|plinth|\bbua\b/.test(t)) return 'BUILT_UP';
  return null;
}

/** A portal's locality average, confirmed by the copied words. */
export const isLocalityAverage = (p: MarketPoint) => p.kind === 'LISTING' && /\b(average|avg)\b|price trends?/i.test(`${p.propertyType ?? ''} ${p.quote ?? ''} ${p.title ?? ''}`);

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
function sameLocality(a?: string, b?: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length >= 3 && y.length >= 3 && (x === y || x.includes(y) || y.includes(x));
}

/* ---------------- per-point assessment (§5 cleaning, §6 tiers and weights) ---------------- */

export interface EvidenceSubject {
  type: PropertyType;
  usage: Usage;
  locality?: string;
  city?: string;
  /** Guideline rate of the subject's locality (Rs./sqft) for the location adjustment. */
  gLand?: number | null;
  gBuilt?: number | null;
}

export interface PointAssessment {
  point: MarketPoint;
  /** Rate as printed / price ÷ area. */
  rate: number | null;
  /** Rate after every correction: kind, area basis, time, location. */
  corrected: number | null;
  distanceKm: number | null;
  ageMonths: number;
  dateSource: DateSource;
  tier: Tier;
  /** w = tier weight × 0.5^(age ÷ 12) × (3 for a locality average). */
  weight: number;
  /** τ of the source kind plus add-ons. */
  tau: number;
  /** Why τ was raised (each adds V.tauAddOn). */
  tauNotes: string[];
  /** Correction steps applied, for display. */
  notes: string[];
  localityAverage: boolean;
  areaBasis: AreaBasis | null;
  /** Registered sale declared at the government value (±5%): floor evidence, not in R. */
  atGuideline: boolean;
  used: boolean;
  excludedReason?: string;
}

function tierOf(p: MarketPoint, d: number | null, s: EvidenceSubject): Tier {
  const subjectLoc = s.locality && !sameLocality(s.locality, s.city) ? s.locality : undefined;
  if (subjectLoc && sameLocality(p.locality, subjectLoc)) return 'T1';
  if (d !== null && d <= V.tierKm.T1) return 'T1';
  if (d !== null && d <= V.tierKm.T2) return 'T2';
  return 'T3';
}

const UNIT_TYPES: PropertyType[] = ['FLAT', 'SHOP_OFFICE'];

export function assessPoints(points: MarketPoint[], pin: { lat: number; lng: number } | null, now: Date, subject: EvidenceSubject = { type: 'HOUSE', usage: 'RESIDENTIAL' }): PointAssessment[] {
  const out = points.map((p): PointAssessment => {
    const r = pointRate(p);
    const d = pointDistanceKm(p, pin);
    const dateSource: DateSource = p.dateSource ?? (p.date ? (p.origin === 'LIVE_SEARCH' ? 'PAGE' : 'PRINTED') : 'ASSUMED');
    const age = dateSource === 'ASSUMED' ? V.undatedAgeMonths : (monthsSince(p.date, now) ?? V.undatedAgeMonths);
    const tier = tierOf(p, d, subject);
    const a: PointAssessment = { point: p, rate: r, corrected: null, distanceKm: d, ageMonths: age, dateSource, tier, weight: 0, tau: 0, tauNotes: [], notes: [], localityAverage: false, areaBasis: null, atGuideline: false, used: true };
    const drop = (why: string) => {
      a.used = false;
      a.excludedReason ??= why;
    };

    // 1. Reviewer exclusion. 2. Usable rate.
    if (!p.included) drop('Excluded by reviewer');
    if (r === null) drop('No usable rate');
    else if (r < V.minRate || r > V.maxRate) drop(`Rate outside ₹${V.minRate}–₹${V.maxRate.toLocaleString('en-IN')} per sqft`);
    if (p.category === 'GUIDELINE' || p.kind === 'GUIDELINE') {
      a.corrected = r;
      return a;
    }

    let factor = correctionFactor(p.kind);
    const kindTau = V.tau[p.kind as 'SALE' | 'LISTING' | 'AUCTION'] ?? V.tau.LISTING;

    // 3. Area basis (unit subjects): super built-up × 1.25, carpet ÷ 1.2; not printed → assume super built-up, τ + add-on.
    if (p.category === 'BUILT' && UNIT_TYPES.includes(subject.type)) {
      const basis = p.areaBasis ?? detectAreaBasis(`${p.quote ?? ''} ${p.propertyType ?? ''}`) ?? (p.origin === 'LIVE_SEARCH' ? null : 'BUILT_UP');
      a.areaBasis = basis;
      if (basis === 'SUPER_BUILT_UP' || basis === null) {
        factor *= V.areaBasis.superBuiltUpToBuiltUp;
        a.notes.push(`× ${V.areaBasis.superBuiltUpToBuiltUp} super built-up → built-up${basis === null ? ' (basis not printed — assumed)' : ''}`);
        if (basis === null) a.tauNotes.push('area basis not printed');
      } else if (basis === 'CARPET') {
        factor *= V.areaBasis.carpetToBuiltUp;
        a.notes.push('÷ 1.2 carpet → built-up');
      }
    }

    // 4. Usage match. 5. Type match (built points).
    const u = pointUsage(p);
    if (u && !USAGE_ACCEPTS[subject.usage].includes(u)) drop(`Different usage (${u.toLowerCase()} vs ${subject.usage.toLowerCase()} subject)`);
    if (p.category === 'BUILT' && subject.type !== 'PLOT') {
      const bt = pointBuiltType(p);
      if (bt && bt !== subject.type) drop(`Different property type (${bt.replace('_', ' ').toLowerCase()})`);
    }

    // 7. Granularity: a confirmed locality average weighs as 3 points.
    a.localityAverage = isLocalityAverage(p);

    // Registered sale declared at the government value: floor evidence only.
    const rg = p.registration;
    if (p.kind === 'SALE' && rg?.considerationInr && rg.govtValueInr && Math.abs(rg.considerationInr / rg.govtValueInr - 1) <= V.atGuidelineBand) {
      a.atGuideline = true;
      drop(`Declared at the government value (±${V.atGuidelineBand * 100}%) — floor evidence, not a price`);
    }

    // 9. Distance.
    if (d !== null && d > V.maxComparableKm) drop(`More than ${V.maxComparableKm} km from the property`);
    if (p.kind === 'AUCTION' && tier === 'T3') drop('Auction outside tiers T1 / T2 — downside reference only');

    // Time adjustment (§3): sales and auctions older than 6 months, with the price index.
    if ((p.kind === 'SALE' || p.kind === 'AUCTION') && dateSource !== 'ASSUMED') {
      const nonRes = subject.usage === 'COMMERCIAL' || subject.usage === 'INDUSTRIAL';
      if (nonRes) {
        if (age > V.hpiNonResidentialMonths) a.tauNotes.push('non-residential, older than 12 months — no price index');
      } else if (age > V.hpiMinAgeMonths) {
        const f = hpiFactor(subject.city, p.registration?.regDate ?? p.date, now);
        if (f) {
          factor *= f.factor;
          a.notes.push(`× ${f.factor.toFixed(3)} HPI ${f.from} → ${f.to}${f.source === 'ALL_INDIA' ? ' (all-India)' : ''}`);
          if (f.source === 'ALL_INDIA') a.tauNotes.push('all-India price index');
        } else a.tauNotes.push('no price index for this city — not time-adjusted');
      }
    }

    // §6 location adjustment for T2 / T3: × G_subject ÷ G_comp, capped 0.67–1.5.
    if (tier !== 'T1') {
      const g = p.category === 'LAND' ? subject.gLand : subject.gBuilt;
      if (g && p.gCompPerSqft) {
        const ratio = g / p.gCompPerSqft;
        if (ratio < V.guidelineRatioCap.min || ratio > V.guidelineRatioCap.max) drop(`Different market (guideline ratio ${ratio.toFixed(2)} outside ${V.guidelineRatioCap.min}–${V.guidelineRatioCap.max})`);
        else {
          factor *= ratio;
          a.notes.push(`× ${ratio.toFixed(2)} guideline ratio`);
        }
      } else a.tauNotes.push('no guideline adjustment');
    }

    a.corrected = r === null ? null : r * factor;
    a.tau = kindTau + V.tauAddOn * a.tauNotes.length;
    a.weight = V.tierWeight[tier] * 0.5 ** (age / V.recencyHalfLifeMonths) * (a.localityAverage ? V.localityAverageMultiplier : 1);
    return a;
  });

  // 8. Duplicates: same link + rate; same registration document; same locality with rate within 1% and area within 2%.
  const kept: PointAssessment[] = [];
  for (const a of out) {
    if (!a.used || a.point.category === 'GUIDELINE') continue;
    const p = a.point;
    const dup = kept.find((b) => {
      const q = b.point;
      if (q.category !== p.category) return false;
      if (p.url && q.url && p.url === q.url && Math.round(a.rate!) === Math.round(b.rate!)) return true;
      if (p.registration?.docNo && q.registration?.docNo && norm(p.registration.docNo) === norm(q.registration.docNo)) return true;
      return !!(p.locality && sameLocality(p.locality, q.locality) && norm(p.locality) === norm(q.locality) && p.areaSqft && q.areaSqft && Math.abs(a.rate! / b.rate! - 1) <= V.duplicateRateTol && Math.abs(p.areaSqft / q.areaSqft - 1) <= V.duplicateAreaTol);
    });
    if (dup) {
      a.used = false;
      a.excludedReason = 'Duplicate of another data point';
    } else kept.push(a);
  }

  // 10. Outliers per category + kind on the log of the corrected rate (4+ points).
  const groups = new Map<string, PointAssessment[]>();
  for (const a of out) if (a.used && a.point.category !== 'GUIDELINE') groups.set(`${a.point.category}|${a.point.kind}`, [...(groups.get(`${a.point.category}|${a.point.kind}`) ?? []), a]);
  for (const g of groups.values()) {
    if (g.length < V.outlierMinN) continue;
    const logs = g.map((a) => Math.log(a.corrected!));
    const med = median(logs);
    const mad = median(logs.map((l) => Math.abs(l - med)));
    if (mad <= 0) continue;
    g.forEach((a, i) => {
      if (Math.abs(logs[i] - med) > V.outlierRobustSd * V.madToSd * mad) {
        a.used = false;
        a.excludedReason = `Outlier — more than ${V.outlierRobustSd} robust SD from the median (log-rate)`;
      }
    });
  }
  // Misread band vs the median of the category (e.g. "5+ flats … ₹500/sqft").
  for (const cat of ['LAND', 'BUILT'] as const) {
    const g = out.filter((a) => a.used && a.point.category === cat);
    if (g.length < 3) continue;
    const med = median(g.map((a) => a.corrected!));
    for (const a of g) {
      if (a.corrected! < med * V.implausibleLow || a.corrected! > med * V.implausibleHigh) {
        a.used = false;
        a.excludedReason = `Implausible — under ${V.implausibleLow * 100}% or over ${V.implausibleHigh * 100}% of the median of the other points`;
      }
    }
  }
  return out;
}

/* ---------------- §7 market rate engine ---------------- */

export type MarketKind = 'SALE' | 'LISTING' | 'AUCTION';
export type SpreadMethod = 'MAD' | 'SAMPLE_SD' | 'SINGLE';

export interface KindEstimate {
  kind: MarketKind;
  n: number;
  nEff: number;
  /** r_k = weighted median of the corrected rates. */
  rate: number;
  /** Relative spread s_k (null for a single point). */
  spread: number | null;
  spreadMethod: SpreadMethod;
  /** SE_k = 1.25 × s_k ÷ √n_eff (single point: 15%). */
  se: number;
  /** Weighted mean τ of the points. */
  tau: number;
  /** σ_k ÷ r_k = √(SE² + τ²). */
  sigmaRel: number;
  /** Share of the consensus (1/σ² normalised). */
  weight: number;
}

export interface Estimate {
  rows: KindEstimate[];
  /** R = Σ(r_k ÷ σ_k²) ÷ Σ(1 ÷ σ_k²). */
  rate: number;
  /** u ÷ R (after widening). */
  u: number;
  /** Q = Σ (r_k − R)² ÷ σ_k². */
  q: number;
  /** u was widened by √(Q ÷ (K − 1)). */
  widened: boolean;
  n: number;
  /** Σ over kinds of n_eff,k. */
  nEff: number;
}

const MARKET_KINDS: MarketKind[] = ['SALE', 'LISTING', 'AUCTION'];

export function estimate(points: PointAssessment[]): Estimate | null {
  const draft = MARKET_KINDS.map((kind) => {
    const ps = points.filter((a) => a.point.kind === kind);
    if (!ps.length) return null;
    const xs = ps.map((a) => a.corrected!);
    const ws = ps.map((a) => a.weight);
    const r = weightedMedian(xs, ws);
    const nEff = effectiveN(ws);
    let spread: number | null = null;
    let method: SpreadMethod = 'SINGLE';
    let se: number = V.singlePointSE;
    if (ps.length >= V.outlierMinN) {
      spread = (V.madToSd * weightedMedian(xs.map((x) => Math.abs(x - r)), ws)) / r;
      method = 'MAD';
    } else if (ps.length >= 2) {
      spread = sampleStdDev(xs) / mean(xs);
      method = 'SAMPLE_SD';
    }
    if (spread !== null) se = (V.medianEfficiency * spread) / Math.sqrt(nEff);
    const tw = ws.reduce((s, w) => s + w, 0);
    const tau = tw > 0 ? ps.reduce((s, a) => s + a.weight * a.tau, 0) / tw : mean(ps.map((a) => a.tau));
    return { kind, n: ps.length, nEff, rate: r, spread, spreadMethod: method, se, tau, sigmaRel: Math.sqrt(se * se + tau * tau), weight: 0 };
  }).filter((x): x is KindEstimate => !!x && x.rate > 0);
  if (!draft.length) return null;
  const prec = draft.map((d) => 1 / (d.rate * d.sigmaRel) ** 2);
  const tp = prec.reduce((a, b) => a + b, 0);
  const R = draft.reduce((s, d, i) => s + d.rate * prec[i], 0) / tp;
  let uAbs = 1 / Math.sqrt(tp);
  const q = draft.reduce((s, d, i) => s + (d.rate - R) ** 2 * prec[i], 0);
  const K = draft.length;
  const widened = K > 1 && q > K - 1;
  if (widened) uAbs *= Math.sqrt(q / (K - 1));
  return {
    rows: draft.map((d, i) => ({ ...d, weight: prec[i] / tp })),
    rate: R,
    u: uAbs / R,
    q,
    widened,
    n: points.length,
    nEff: draft.reduce((s, d) => s + d.nEff, 0),
  };
}

const sumNeffByKind = (ps: PointAssessment[]) => MARKET_KINDS.reduce((s, k) => s + effectiveN(ps.filter((a) => a.point.kind === k).map((a) => a.weight)), 0);

export interface Score {
  agreement: number;
  depth: number;
  recency: number;
  spatial: number;
  total: number;
}

export const agreementScore = (u: number) => V.agreement.max * Math.min(1, Math.max(0, 1 - (u - V.agreement.fullAtU) / (V.agreement.zeroAtU - V.agreement.fullAtU)));
export const recencyScore = (m: number) => (m <= V.recency.fullAtMonths ? V.recency.max : m >= V.recency.zeroAtMonths ? 0 : V.recency.max * (1 - (m - V.recency.fullAtMonths) / (V.recency.zeroAtMonths - V.recency.fullAtMonths)));
export function depthScore(est: Estimate): number {
  const independent = est.rows.filter((r) => r.nEff >= V.depth.bonusMinNeffPerKind).length >= 2;
  return V.depth.base * Math.min(1, est.nEff / V.depth.fullAtNeff) + (independent ? V.depth.bonus : 0);
}

export interface Consensus {
  category: Exclude<EvidenceCategory, 'GUIDELINE'>;
  /** Per-kind rows of the all-tier estimate. */
  rows: KindEstimate[];
  /** T1 points only (null if none). */
  local: Estimate | null;
  /** All tiers. */
  all: Estimate;
  /** Z = n_eff(T1) ÷ (n_eff(T1) + 5). */
  z: number;
  /** R_final = Z × R_T1 + (1 − Z) × R_all (unrounded). */
  rawRate: number;
  /** R_final rounded to Rs. 10. */
  rate: number;
  /** u_final ÷ R_final = Z × u_T1 + (1 − Z) × u_all. */
  u: number;
  /** R ± 1.28 u (80% range), rounded to Rs. 10. */
  low: number;
  high: number;
  n: number;
  nEff: number;
  nEffT1: number;
  nEffT1T2: number;
  /** Share of point weight by tier. */
  tierShare: Record<Tier, number>;
  /** Weighted median age (months). */
  medianAgeMonths: number;
  medianDistanceKm: number | null;
  /** n_eff of T1 + T2 below 2: thin market. */
  thinMarket: boolean;
  score: Score;
}

const round10 = (x: number) => Math.round(x / 10) * 10;

export function consensusFor(category: Exclude<EvidenceCategory, 'GUIDELINE'>, assessed: PointAssessment[]): Consensus | null {
  const used = assessed.filter((a) => a.used && a.point.category === category && a.corrected !== null && a.corrected > 0);
  const all = estimate(used);
  if (!all) return null;
  const t1 = used.filter((a) => a.tier === 'T1');
  const local = t1.length ? estimate(t1) : null;
  const nEffT1 = sumNeffByKind(t1);
  const z = local ? nEffT1 / (nEffT1 + V.localBlendK) : 0;
  const rawRate = local ? z * local.rate + (1 - z) * all.rate : all.rate;
  const u = local ? z * local.u + (1 - z) * all.u : all.u;
  const tw = used.reduce((s, a) => s + a.weight, 0);
  const tierShare = (['T1', 'T2', 'T3'] as Tier[]).reduce((o, t) => ({ ...o, [t]: tw > 0 ? used.filter((a) => a.tier === t).reduce((s, a) => s + a.weight, 0) / tw : 0 }), {} as Record<Tier, number>);
  const medianAgeMonths = weightedMedian(used.map((a) => a.ageMonths), used.map((a) => a.weight));
  const dists = used.map((a) => a.distanceKm).filter((d): d is number => d !== null);
  const nEffT1T2 = sumNeffByKind(used.filter((a) => a.tier !== 'T3'));
  const agreement = agreementScore(u);
  const depth = depthScore(all);
  const recency = recencyScore(medianAgeMonths);
  const spatial = V.spatial.max * (tierShare.T1 * V.spatial.credit.T1 + tierShare.T2 * V.spatial.credit.T2 + tierShare.T3 * V.spatial.credit.T3);
  return {
    category,
    rows: all.rows,
    local,
    all,
    z,
    rawRate,
    rate: round10(rawRate),
    u,
    low: round10(rawRate * (1 - V.rangeZ * u)),
    high: round10(rawRate * (1 + V.rangeZ * u)),
    n: used.length,
    nEff: all.nEff,
    nEffT1,
    nEffT1T2,
    tierShare,
    medianAgeMonths,
    medianDistanceKm: dists.length ? median(dists) : null,
    thinMarket: nEffT1T2 < V.t13.blockNeffT1T2,
    score: { agreement, depth, recency, spatial, total: Math.round(agreement + depth + recency + spatial) },
  };
}

/* ---------------- government (guideline) value ---------------- */

export interface GuidelineValue {
  /** Rs./sqft. */
  rate: number;
  /** From the official lookup (Telangana IGRS) — then it is also a floor. */
  official: boolean;
  ref?: GuidelineRef;
  /** Web-search points behind a non-official value. */
  n: number;
}

/** Official value for the category if adopted, else (land only) the median of web-search guideline points. */
export function guidelineFor(assessed: PointAssessment[], category: 'LAND' | 'BUILT'): GuidelineValue | null {
  const g = assessed.filter((a) => a.used && a.point.category === 'GUIDELINE' && a.rate !== null);
  const official = g.filter((a) => a.point.guideline && (a.point.guideline.basis === 'LAND') === (category === 'LAND')).at(-1);
  if (official) return { rate: Math.round(official.rate!), official: true, ref: official.point.guideline, n: 1 };
  if (category === 'BUILT') return null;
  const web = g.filter((a) => !a.point.guideline).map((a) => a.rate!);
  return web.length ? { rate: Math.round(median(web)), official: false, n: web.length } : null;
}

/* ---------------- registered sales (Index II / EC) ---------------- */

export interface RegistrationCheck {
  /** Registered sales that carry both the consideration and the government value. */
  compared: number;
  /** Of those, how many declare a consideration below the government value (possible under-declaration). */
  below: { id: string; title: string; considerationInr: number; govtValueInr: number; ratio: number }[];
  /** Declared at the government value (±5%): kept out of R. */
  atGuideline: number;
}

export function registrationCheck(assessed: PointAssessment[]): RegistrationCheck {
  const regs = assessed.filter((a) => a.point.included && a.point.kind === 'SALE' && a.point.registration?.considerationInr && a.point.registration?.govtValueInr && (a.used || a.atGuideline));
  const below = regs
    .filter((a) => a.point.registration!.considerationInr! < a.point.registration!.govtValueInr! && !a.atGuideline)
    .map((a) => {
      const r = a.point.registration!;
      return { id: a.point.id, title: a.point.title ?? 'Registered sale', considerationInr: r.considerationInr!, govtValueInr: r.govtValueInr!, ratio: r.considerationInr! / r.govtValueInr! };
    });
  return { compared: regs.length, below, atGuideline: regs.filter((a) => a.atGuideline).length };
}

/* ---------------- bank auctions as a forced-sale benchmark ---------------- */

export interface AuctionBenchmark {
  category: Exclude<EvidenceCategory, 'GUIDELINE'>;
  n: number;
  /** Median reserve price, Rs./sqft, as listed (no correction). */
  medianReserve: number;
  /** consensus rate × FSV ratio: what PRAMAAN's forced-sale value implies per sqft. */
  fsvRate: number | null;
  /** medianReserve ÷ fsvRate. */
  ratio: number | null;
}

/** Bank e-auction reserves within 10 km (or distance unknown) vs the forced-sale rate implied by the consensus. */
export function auctionBenchmark(assessed: PointAssessment[], category: Exclude<EvidenceCategory, 'GUIDELINE'>, consensusRate: number | null, fsvRatio: number): AuctionBenchmark | null {
  const rates = assessed
    .filter((a) => a.point.kind === 'AUCTION' && a.point.category === category && a.point.included && a.rate !== null && (a.distanceKm === null || a.distanceKm <= V.maxComparableKm))
    .map((a) => a.rate!);
  if (!rates.length) return null;
  const medianReserve = Math.round(median(rates));
  const fsvRate = consensusRate ? Math.round(consensusRate * fsvRatio) : null;
  return { category, n: rates.length, medianReserve, fsvRate, ratio: fsvRate ? medianReserve / fsvRate : null };
}

/* ---------------- one call for the whole evidence picture ---------------- */

export interface EvidenceResult {
  assessed: PointAssessment[];
  land: Consensus | null;
  built: Consensus | null;
  /** Land guideline rate, Rs./sqft (official if adopted). */
  guideline: number | null;
  guidelines: { LAND: GuidelineValue | null; BUILT: GuidelineValue | null };
}

export function runEvidence(points: MarketPoint[], pin: { lat: number; lng: number } | null, now: Date, subject: EvidenceSubject = { type: 'HOUSE', usage: 'RESIDENTIAL' }): EvidenceResult {
  // Guideline values first: they feed the location adjustment of T2 / T3 comparables.
  const pre = assessPoints(points.filter((p) => p.category === 'GUIDELINE'), pin, now, subject);
  const guidelines = { LAND: guidelineFor(pre, 'LAND'), BUILT: guidelineFor(pre, 'BUILT') };
  const assessed = assessPoints(points, pin, now, { ...subject, gLand: subject.gLand ?? guidelines.LAND?.rate ?? null, gBuilt: subject.gBuilt ?? guidelines.BUILT?.rate ?? null });
  return { assessed, land: consensusFor('LAND', assessed), built: consensusFor('BUILT', assessed), guideline: guidelines.LAND?.rate ?? null, guidelines };
}
