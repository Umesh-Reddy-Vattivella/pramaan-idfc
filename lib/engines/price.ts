/* ------------------------------------------------------------------
   Engine 2: PRICE & Authenticity Score (PRD §3.3) — pure functions.
   ------------------------------------------------------------------ */
import type { PriceSourceInput, PropertyCase, SpatialTier } from '@/lib/types';

/* ---------------- Statistics helpers ---------------- */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Population standard deviation. */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/** CV = stdDev(values) / mean(values) */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  return m === 0 ? 0 : stdDev(values) / m;
}

/* ---------------- Source bias corrections (table §3.3) ---------------- */

/** 1. Registered deeds: r_reg* = median(r_reg) * k_reg, k_reg = verified_rate / registered_rate */
export function correctRegisteredDeeds(registeredRates: number[], kReg: number): number {
  return median(registeredRates) * kReg;
}
export function kRegFactor(verifiedRate: number, registeredRate: number): number {
  return verifiedRate / registeredRate;
}

/** 2. Listings: r_list* = median(r_ask) * (1 - d)  (after de-duplication) */
export function correctListings(askingRates: number[], discountD: number): number {
  return median(askingRates) * (1 - discountD);
}

/** 3. IDFC archive: r_idfc* = r_then * (HPI_now / HPI_then) */
export function correctIdfcArchive(rThen: number, hpiNow: number, hpiThen: number): number {
  return rThen * (hpiNow / hpiThen);
}

/** 4. Auctions: r_auc* = r_auction / f   (f = forced-sale ratio, e.g. 0.80) */
export function correctAuction(rAuction: number, forcedSaleRatioF: number): number {
  return rAuction / forcedSaleRatioF;
}

/** 5. RERA / builder: r_rera* = list_rate - net_offer_value */
export function correctRera(listRate: number, netOfferValue: number): number {
  return listRate - netOfferValue;
}

/**
 * Recomputes a source's corrected rate from raw × correctionFactor (all multiplicative corrections:
 * k_reg, (1-d), HPI ratio, 1/f). RERA is subtractive, so the stored corrected rate is authoritative.
 * Circle rate is uncorrected (weight 0).
 */
export function recomputeCorrectedRate(src: PriceSourceInput): number {
  if (src.id === 'RERA_BUILDER') return src.correctedRatePerSqft;
  if (src.id === 'CIRCLE_RATE') return src.rawRatePerSqft;
  return src.rawRatePerSqft * src.correctionFactor;
}

/* ---------------- Formula 1: inverse-variance weighted consensus ---------------- */

/** w_i ∝ 1 / sigma_i^2, normalised so sum(w_i) = 1 */
export function inverseVarianceWeights(sigmas: number[]): number[] {
  const inv = sigmas.map((s) => (s > 0 ? 1 / (s * s) : 0));
  const total = inv.reduce((a, b) => a + b, 0);
  return total > 0 ? inv.map((v) => v / total) : inv.map(() => 0);
}

export interface ConsensusResult {
  rConsensus: number;
  weightedCv: number;
  rLow: number;
  rHigh: number;
  /** Active sources (weight > 0, excluding CIRCLE_RATE) with normalised weights. */
  activeSources: (PriceSourceInput & { normalizedWeight: number; contribution: number })[];
}

/**
 * R_consensus = sum(w_i * r_i_corr), sum(w_i) = 1.0
 * [R_low, R_high] = [R_consensus * (1 - weighted_cv), R_consensus * (1 + weighted_cv)]
 * weighted_cv = sqrt(sum(w_i * (r_i_corr - R_consensus)^2)) / R_consensus
 */
export function consensusLandRate(sources: PriceSourceInput[]): ConsensusResult {
  const active = sources.filter((s) => s.id !== 'CIRCLE_RATE' && s.weight > 0);
  const wSum = active.reduce((s, x) => s + x.weight, 0);
  const activeSources = active.map((s) => {
    const normalizedWeight = wSum > 0 ? s.weight / wSum : 0;
    return { ...s, normalizedWeight, contribution: normalizedWeight * s.correctedRatePerSqft };
  });
  const rConsensus = activeSources.reduce((s, x) => s + x.contribution, 0);
  const wVar = activeSources.reduce((s, x) => s + x.normalizedWeight * (x.correctedRatePerSqft - rConsensus) ** 2, 0);
  const weightedCv = rConsensus > 0 ? Math.sqrt(wVar) / rConsensus : 0;
  return {
    rConsensus,
    weightedCv,
    rLow: rConsensus * (1 - weightedCv),
    rHigh: rConsensus * (1 + weightedCv),
    activeSources,
  };
}

/* ---------------- Formula 2: hedonic comparable adjustment ---------------- */

/** r_adj = r_comp * product(1 + a_k) */
export function hedonicAdjustedRate(rComp: number, adjustments: number[]): number {
  return adjustments.reduce((r, a) => r * (1 + a), rComp);
}

/* ---------------- Formula 3: spatial fallback ---------------- */

export const SPATIAL_TIER_SCORE: Record<SpatialTier, number> = {
  MICRO_1KM: 20,
  WARD_VILLAGE: 14,
  SRO_ZONE: 9,
  DISTRICT: 4,
};

export const SPATIAL_TIER_LABEL: Record<SpatialTier, string> = {
  MICRO_1KM: 'Tier 1: 1 km Micro-Locality',
  WARD_VILLAGE: 'Tier 2: Revenue Village / Ward',
  SRO_ZONE: 'Tier 3: Sub-Registrar (SRO)',
  DISTRICT: 'Tier 4: District Benchmark',
};

/* ---------------- Formula 4: Authenticity Score S ---------------- */

/** CV <= 0.05 -> 35; CV >= 0.25 -> 0; linear between. */
export function agreementScore(cv: number): number {
  if (cv <= 0.05) return 35;
  if (cv >= 0.25) return 0;
  return 35 * (1 - (cv - 0.05) / 0.2);
}

/** n >= 20 -> 25; else round((n / 20) * 25). */
export function depthScore(nComps: number): number {
  if (nComps >= 20) return 25;
  return Math.round((nComps / 20) * 25);
}

/** age <= 3 -> 20; age >= 24 -> 0; linear between. */
export function recencyScore(medianAgeMonths: number): number {
  if (medianAgeMonths <= 3) return 20;
  if (medianAgeMonths >= 24) return 0;
  return 20 * (1 - (medianAgeMonths - 3) / 21);
}

/** Spatial tier score minus 4 if non-standard/irregular/commercial trophy (floored at 0). */
export function spatialTypicalityScore(tier: SpatialTier, isTypicalProperty: boolean): number {
  return Math.max(0, SPATIAL_TIER_SCORE[tier] - (isTypicalProperty ? 0 : 4));
}

export interface AuthenticityBreakdown {
  cv: number;
  nComps: number;
  medianAgeMonths: number;
  agreement: number;
  depth: number;
  recency: number;
  spatialTypicality: number;
  /** S = round(agreement + depth + recency + spatial_typicality) */
  score: number;
}

/** Median age across all comps: each source's median age repeated by its comp count. */
export function pooledMedianAgeMonths(sources: PriceSourceInput[]): number {
  const ages: number[] = [];
  for (const s of sources) for (let i = 0; i < Math.max(0, s.count); i++) ages.push(s.medianAgeMonths);
  return median(ages);
}

export function authenticityScore(
  sources: PriceSourceInput[],
  tier: SpatialTier,
  isTypicalProperty: boolean,
): AuthenticityBreakdown {
  const active = sources.filter((s) => s.id !== 'CIRCLE_RATE' && s.weight > 0);
  const cv = coefficientOfVariation(active.map((s) => s.correctedRatePerSqft));
  const nComps = active.reduce((s, x) => s + x.count, 0);
  const medianAgeMonths = pooledMedianAgeMonths(active);
  const agreement = agreementScore(cv);
  const depth = depthScore(nComps);
  const recency = recencyScore(medianAgeMonths);
  const spatialTypicality = spatialTypicalityScore(tier, isTypicalProperty);
  return {
    cv,
    nComps,
    medianAgeMonths,
    agreement,
    depth,
    recency,
    spatialTypicality,
    score: Math.round(agreement + depth + recency + spatialTypicality),
  };
}

/* ---------------- Formula 5: Drift Guard ---------------- */

export const INSTANT_THRESHOLD_DEFAULT = 80;
export const INSTANT_THRESHOLD_DRIFT = 88;

/** If rolling 90-day hindsight audit median error in a locality > 7%, Instant threshold rises 80 -> 88. */
export function instantThreshold(localityAuditMedianErrorPct?: number): number {
  return localityAuditMedianErrorPct !== undefined && localityAuditMedianErrorPct > 7
    ? INSTANT_THRESHOLD_DRIFT
    : INSTANT_THRESHOLD_DEFAULT;
}

/* ---------------- Engine runner ---------------- */

export interface PriceResult extends ConsensusResult {
  authenticity: AuthenticityBreakdown;
  spatialTierLabel: string;
  circleRatePerSqft: number;
  /** R_consensus < circle_rate → floor sanity flag */
  belowCircleRateFlag: boolean;
  /** Circle-to-market gap multiple (R_consensus / circle rate) */
  circleGapMultiple: number | null;
  /** Sources whose stored corrected rate differs from raw × factor by more than Rs. 1/sqft. */
  correctionMismatches: { id: PriceSourceInput['id']; stored: number; recomputed: number }[];
  /** Median hedonic-adjusted comparable rate (null if no comparables). */
  comparablesMedianAdjustedRate: number | null;
  instantThreshold: number;
}

export function runPrice(c: PropertyCase, opts: { localityAuditMedianErrorPct?: number } = {}): PriceResult {
  const consensus = consensusLandRate(c.priceSources);
  const authenticity = authenticityScore(c.priceSources, c.spatialFallbackTier, c.isTypicalProperty);

  const correctionMismatches = c.priceSources
    .map((s) => ({ id: s.id, stored: s.correctedRatePerSqft, recomputed: recomputeCorrectedRate(s) }))
    .filter((x) => x.id !== 'CIRCLE_RATE' && Math.abs(x.stored - x.recomputed) > 1);

  return {
    ...consensus,
    authenticity,
    spatialTierLabel: SPATIAL_TIER_LABEL[c.spatialFallbackTier],
    circleRatePerSqft: c.circleRatePerSqft,
    belowCircleRateFlag: consensus.rConsensus < c.circleRatePerSqft,
    circleGapMultiple: c.circleRatePerSqft > 0 ? consensus.rConsensus / c.circleRatePerSqft : null,
    correctionMismatches,
    comparablesMedianAdjustedRate: c.comparables.length ? median(c.comparables.map((p) => p.adjustedRate)) : null,
    instantThreshold: instantThreshold(opts.localityAuditMedianErrorPct),
  };
}
