/* ------------------------------------------------------------------
   Market evidence → consensus rate + Authenticity Score (PRD_V3 §6.2–6.3).
   Pure and deterministic. Runs separately for LAND rates (Rs./sqft of plot)
   and BUILT rates (Rs./sqft of built-up area); GUIDELINE is a floor check.
   ------------------------------------------------------------------ */
import type { EvidenceCategory, EvidenceKind, MarketPoint } from '@/lib/domain/types';
import { monthsSince } from './parse';
import { coefficientOfVariation, haversineMeters, inverseVarianceWeights, median, outlierFlags, stdDev } from './stats';

/** Default corrections for uncalibrated live data (labelled as defaults wherever shown). */
export const EVIDENCE_DEFAULTS = { listingDiscount: 0.14, auctionForcedSaleRatio: 0.8, kReg: 1.0 };
/** Comparables farther than this from the pin are listed but not used. */
export const MAX_COMPARABLE_KM = 10;
/** Undated points are treated as this old. */
export const UNKNOWN_AGE_MONTHS = 12;
/** Points below 30% or above 300% of their category median are treated as misreads. */
export const IMPLAUSIBLE_LOW = 0.3;
export const IMPLAUSIBLE_HIGH = 3;

export const KIND_LABEL: Record<EvidenceKind, string> = {
  LISTING: 'Portal listing (asking price)',
  SALE: 'Reported sale / registration',
  AUCTION: 'Bank auction (reserve price)',
  GUIDELINE: 'Guideline / circle rate',
};

export const CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  LAND: 'Land / plot rates',
  BUILT: 'Built property rates',
  GUIDELINE: 'Guideline (circle) rate',
};

export function correctionFactor(kind: EvidenceKind): number {
  if (kind === 'LISTING') return 1 - EVIDENCE_DEFAULTS.listingDiscount;
  if (kind === 'AUCTION') return 1 / EVIDENCE_DEFAULTS.auctionForcedSaleRatio;
  if (kind === 'SALE') return EVIDENCE_DEFAULTS.kReg;
  return 1;
}

export function correctionText(kind: EvidenceKind): string {
  if (kind === 'LISTING') return `× (1 − ${EVIDENCE_DEFAULTS.listingDiscount}) asking→closing discount (default)`;
  if (kind === 'AUCTION') return `÷ ${EVIDENCE_DEFAULTS.auctionForcedSaleRatio} forced-sale ratio`;
  if (kind === 'SALE') return `× ${EVIDENCE_DEFAULTS.kReg.toFixed(2)} k_reg (uncalibrated)`;
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

export type SpatialTier = 'MICRO_1KM' | 'WARD_3KM' | 'ZONE_10KM' | 'DISTRICT';
export const SPATIAL_SCORE: Record<SpatialTier, number> = { MICRO_1KM: 20, WARD_3KM: 14, ZONE_10KM: 9, DISTRICT: 4 };
export const SPATIAL_LABEL: Record<SpatialTier, string> = {
  MICRO_1KM: 'within 1 km',
  WARD_3KM: 'within 3 km',
  ZONE_10KM: 'within 10 km',
  DISTRICT: 'city / district level (distance unknown or > 10 km)',
};

export function tierFromKm(km: number | null): SpatialTier {
  if (km === null) return 'DISTRICT';
  if (km <= 1) return 'MICRO_1KM';
  if (km <= 3) return 'WARD_3KM';
  if (km <= 10) return 'ZONE_10KM';
  return 'DISTRICT';
}

export const agreementScore = (cv: number) => (cv <= 0.05 ? 35 : cv >= 0.25 ? 0 : 35 * (1 - (cv - 0.05) / 0.2));
export const depthScore = (n: number) => (n >= 20 ? 25 : Math.round((n / 20) * 25));
export const recencyScore = (m: number) => (m <= 3 ? 20 : m >= 24 ? 0 : 20 * (1 - (m - 3) / 21));

export interface PointAssessment {
  point: MarketPoint;
  rate: number | null;
  corrected: number | null;
  distanceKm: number | null;
  ageMonths: number;
  used: boolean;
  /** Why an included point is not used. */
  excludedReason?: string;
}

export interface KindRow {
  kind: EvidenceKind;
  n: number;
  medianRate: number;
  factor: number;
  correctedRate: number;
  sigma: number;
  weight: number;
}

export interface Consensus {
  category: EvidenceCategory;
  rows: KindRow[];
  /** Σ w_k × r_k, rounded to Rs. 10. */
  rate: number;
  low: number;
  high: number;
  n: number;
  cv: number;
  medianAgeMonths: number;
  medianDistanceKm: number | null;
  tier: SpatialTier;
  score: { agreement: number; depth: number; recency: number; spatial: number; total: number };
}

export function assessPoints(points: MarketPoint[], pin: { lat: number; lng: number } | null, now: Date): PointAssessment[] {
  const base = points.map((p): PointAssessment => {
    const r = pointRate(p);
    const d = pointDistanceKm(p, pin);
    const age = monthsSince(p.date, now) ?? UNKNOWN_AGE_MONTHS;
    let excludedReason: string | undefined;
    if (!p.included) excludedReason = 'Excluded by reviewer';
    else if (r === null) excludedReason = 'No usable rate';
    else if (d !== null && d > MAX_COMPARABLE_KM) excludedReason = `More than ${MAX_COMPARABLE_KM} km from the property`;
    return { point: p, rate: r, corrected: r === null ? null : r * correctionFactor(p.kind), distanceKm: d, ageMonths: age, used: !excludedReason, excludedReason };
  });
  // Duplicates: same URL + same rate, or same kind + locality + rate.
  const seen = new Set<string>();
  for (const a of base) {
    if (!a.used) continue;
    const key = a.point.url ? `${a.point.url}|${a.rate?.toFixed(0)}` : `${a.point.kind}|${(a.point.locality ?? '').toLowerCase()}|${a.rate?.toFixed(0)}`;
    if (seen.has(key)) {
      a.used = false;
      a.excludedReason = 'Duplicate of another data point';
    } else seen.add(key);
  }
  // Statistical outliers per category + kind.
  const groups = new Map<string, PointAssessment[]>();
  for (const a of base) if (a.used) groups.set(`${a.point.category}|${a.point.kind}`, [...(groups.get(`${a.point.category}|${a.point.kind}`) ?? []), a]);
  for (const g of groups.values()) {
    const flags = outlierFlags(g.map((a) => a.rate!));
    g.forEach((a, i) => {
      if (flags[i]) {
        a.used = false;
        a.excludedReason = 'Statistical outlier (outside Tukey fences)';
      }
    });
  }
  // Implausible vs the other points of the same category (e.g. a misread "5+ flats … ₹500/sqft").
  for (const cat of ['LAND', 'BUILT'] as const) {
    const g = base.filter((a) => a.used && a.point.category === cat);
    if (g.length < 3) continue;
    const med = median(g.map((a) => a.rate!));
    for (const a of g) {
      if (a.rate! < med * IMPLAUSIBLE_LOW || a.rate! > med * IMPLAUSIBLE_HIGH) {
        a.used = false;
        a.excludedReason = `Implausible — under ${IMPLAUSIBLE_LOW * 100}% or over ${IMPLAUSIBLE_HIGH * 100}% of the median of the other points`;
      }
    }
  }
  return base;
}

export function consensusFor(category: Exclude<EvidenceCategory, 'GUIDELINE'>, assessed: PointAssessment[]): Consensus | null {
  const used = assessed.filter((a) => a.used && a.point.category === category);
  if (!used.length) return null;
  const kinds: EvidenceKind[] = ['SALE', 'LISTING', 'AUCTION'];
  const draft = kinds
    .map((k) => {
      const ps = used.filter((a) => a.point.kind === k);
      if (!ps.length) return null;
      const rates = ps.map((a) => a.rate!);
      const f = correctionFactor(k);
      const corrected = median(rates) * f;
      const se = ps.length > 1 ? stdDev(rates.map((r) => r * f)) / Math.sqrt(ps.length) : corrected * 0.15;
      return { kind: k, n: ps.length, medianRate: median(rates), factor: f, correctedRate: corrected, sigma: Math.max(se, corrected * 0.01) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const w = inverseVarianceWeights(draft.map((d) => d.sigma));
  const rows: KindRow[] = draft.map((d, i) => ({ ...d, weight: w[i] }));
  const raw = rows.reduce((s, r) => s + r.weight * r.correctedRate, 0);
  const rate = Math.round(raw / 10) * 10;
  const correctedAll = used.map((a) => a.corrected!);
  const cv = coefficientOfVariation(correctedAll);
  const ages = used.map((a) => a.ageMonths);
  const dists = used.map((a) => a.distanceKm).filter((d): d is number => d !== null);
  const medianDistanceKm = dists.length ? median(dists) : null;
  const tier = tierFromKm(medianDistanceKm);
  const medianAgeMonths = median(ages);
  const agreement = agreementScore(cv);
  const depth = depthScore(used.length);
  const recency = recencyScore(medianAgeMonths);
  const spatial = SPATIAL_SCORE[tier];
  return {
    category,
    rows,
    rate,
    low: Math.round((raw * (1 - cv)) / 10) * 10,
    high: Math.round((raw * (1 + cv)) / 10) * 10,
    n: used.length,
    cv,
    medianAgeMonths,
    medianDistanceKm,
    tier,
    score: { agreement, depth, recency, spatial, total: Math.round(agreement + depth + recency + spatial) },
  };
}

export function guidelineRate(assessed: PointAssessment[]): number | null {
  const g = assessed.filter((a) => a.used && a.point.category === 'GUIDELINE').map((a) => a.rate!);
  return g.length ? Math.round(median(g)) : null;
}

/* ---------------- registered sales (Index II) ---------------- */

export interface RegistrationCheck {
  /** Registered sales that carry both the consideration and the government value. */
  compared: number;
  /** Of those, how many declare a consideration below the government value (possible under-declaration). */
  below: { id: string; title: string; considerationInr: number; govtValueInr: number; ratio: number }[];
}

/** Registered sales in use vs the government value printed on the same deed. */
export function registrationCheck(assessed: PointAssessment[]): RegistrationCheck {
  const regs = assessed.filter((a) => a.used && a.point.kind === 'SALE' && a.point.registration?.considerationInr && a.point.registration?.govtValueInr);
  const below = regs
    .filter((a) => a.point.registration!.considerationInr! < a.point.registration!.govtValueInr!)
    .map((a) => {
      const r = a.point.registration!;
      return { id: a.point.id, title: a.point.title ?? 'Registered sale', considerationInr: r.considerationInr!, govtValueInr: r.govtValueInr!, ratio: r.considerationInr! / r.govtValueInr! };
    });
  return { compared: regs.length, below };
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

/**
 * Bank e-auction reserves near the property (included, ≤ MAX_COMPARABLE_KM or distance unknown) compared with the
 * forced-sale rate implied by the consensus. Auction points dropped as outliers still count here: this is a
 * downside reference, not part of the market rate.
 */
export function auctionBenchmark(assessed: PointAssessment[], category: Exclude<EvidenceCategory, 'GUIDELINE'>, consensusRate: number | null, fsvRatio: number): AuctionBenchmark | null {
  const rates = assessed
    .filter((a) => a.point.kind === 'AUCTION' && a.point.category === category && a.point.included && a.rate !== null && (a.distanceKm === null || a.distanceKm <= MAX_COMPARABLE_KM))
    .map((a) => a.rate!);
  if (!rates.length) return null;
  const medianReserve = Math.round(median(rates));
  const fsvRate = consensusRate ? Math.round(consensusRate * fsvRatio) : null;
  return { category, n: rates.length, medianReserve, fsvRate, ratio: fsvRate ? medianReserve / fsvRate : null };
}

export interface EvidenceResult {
  assessed: PointAssessment[];
  land: Consensus | null;
  built: Consensus | null;
  guideline: number | null;
}

export function runEvidence(points: MarketPoint[], pin: { lat: number; lng: number } | null, now: Date): EvidenceResult {
  const assessed = assessPoints(points, pin, now);
  return { assessed, land: consensusFor('LAND', assessed), built: consensusFor('BUILT', assessed), guideline: guidelineRate(assessed) };
}
