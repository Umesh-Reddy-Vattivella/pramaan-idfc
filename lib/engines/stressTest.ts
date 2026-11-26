/* ------------------------------------------------------------------
   Live Stress-Test & Sensitivity (PRD §6.4 Sub-Tab B) — pure functions.
   Re-scores Authenticity S and re-runs the Risk Cascade under
   user-perturbed market evidence, and applies the overstatement formula
   LTV_true = LTV_stated * (1 + x)  (PRD §1.3 formula 6).
   ------------------------------------------------------------------ */
import type { PropertyCase, RouteTier, SpatialTier } from '@/lib/types';
import type { EvidencePack } from './evaluateCase';
import { buildRoutingInput } from './evaluateCase';
import { agreementScore, depthScore, recencyScore, spatialTypicalityScore } from './price';
import { routeCase, type RoutingResult } from './routing';

export interface StressInputs {
  compsCount: number;
  /** Source variance as CV in percent (e.g. 2.8 = 0.028). */
  cvPct: number;
  spatialTier: SpatialTier;
  /** Market overstatement x in percent (e.g. 10 = 0.10). */
  overstatementPct: number;
}

/**
 * Stress-test policy (prototype assumption, not stated in PRD §3.6):
 *  - LTV_true above the usage LTV cap           → at least REMOTE_REVIEW (collateral cover breach)
 *  - LTV_true above the cap by >= 10 pct points → PHYSICAL_CHECK
 */
export const LTV_BREACH_PHYSICAL_PTS = 10;

export interface StressResult {
  agreement: number;
  depth: number;
  recency: number;
  spatialTypicality: number;
  score: number;
  ltvStatedPct: number;
  ltvTruePct: number;
  ltvCapPct: number;
  ltvBreach: boolean;
  routing: RoutingResult;
  tier: RouteTier;
  ltvTriggers: string[];
}

export function baselineStressInputs(e: EvidencePack, c: PropertyCase): StressInputs {
  return {
    compsCount: e.price.authenticity.nComps,
    cvPct: +(e.price.authenticity.cv * 100).toFixed(1),
    spatialTier: c.spatialFallbackTier,
    overstatementPct: 0,
  };
}

/** LTV_true = LTV_stated * (1 + x) */
export function trueLtv(ltvStated: number, x: number): number {
  return ltvStated * (1 + x);
}

const RANK: Record<RouteTier, number> = { INSTANT: 0, REMOTE_REVIEW: 1, PHYSICAL_CHECK: 2 };

export function runStressTest(c: PropertyCase, e: EvidencePack, s: StressInputs): StressResult {
  const agreement = agreementScore(s.cvPct / 100);
  const depth = depthScore(s.compsCount);
  const recency = recencyScore(e.price.authenticity.medianAgeMonths);
  const spatialTypicality = spatialTypicalityScore(s.spatialTier, c.isTypicalProperty);
  const score = Math.round(agreement + depth + recency + spatialTypicality);

  const input = buildRoutingInput(c, e.trust, e.measure, e.usage, e.price, e.valuation, e.autoQc, undefined, e.sanity);
  const routing = routeCase({ ...input, authenticityScore: score });

  const ltvCapPct = e.usage.appliedLtvCap * 100;
  const ltvStatedPct = e.valuation.requestedLoanLtvPct ?? ltvCapPct;
  const ltvTruePct = trueLtv(ltvStatedPct, s.overstatementPct / 100);
  const ltvBreach = ltvTruePct > ltvCapPct + 1e-9;

  let tier = routing.tier;
  const ltvTriggers: string[] = [];
  if (ltvBreach) {
    const over = ltvTruePct - ltvCapPct;
    const ltvTier: RouteTier = over >= LTV_BREACH_PHYSICAL_PTS ? 'PHYSICAL_CHECK' : 'REMOTE_REVIEW';
    ltvTriggers.push(
      `LTV_true ${ltvTruePct.toFixed(1)}% exceeds ${ltvCapPct.toFixed(0)}% cap by ${over.toFixed(1)} pts` +
        (ltvTier === 'PHYSICAL_CHECK' ? ` (>= ${LTV_BREACH_PHYSICAL_PTS} pts).` : '.'),
    );
    if (RANK[ltvTier] > RANK[tier]) tier = ltvTier;
  }

  return { agreement, depth, recency, spatialTypicality, score, ltvStatedPct, ltvTruePct, ltvCapPct, ltvBreach, routing, tier, ltvTriggers };
}
