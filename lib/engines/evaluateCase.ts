/* ------------------------------------------------------------------
   Master orchestrator — runs every deterministic engine in order and
   returns a complete EvidencePack. No LLM arithmetic anywhere.
   Order: Trust → MEASURE (E1) → USAGE (E3) → PRICE (E2) → Valuation → Auto-QC → Routing
   ------------------------------------------------------------------ */
import type { PropertyCase } from '@/lib/types';
import { evaluateTrust, hindsightAuditSampled, type TrustResult } from './trust';
import { runMeasure, type MeasureOptions, type MeasureResult } from './measure';
import { runUsage, type UsageResult } from './usage';
import { runPrice, type PriceResult } from './price';
import { runValuation, type ValuationOptions, type ValuationResult } from './valuation';
import { runAutoQc, type AutoQcResult } from './autoQc';
import { routeCase, type RoutingInput, type RoutingResult } from './routing';

export interface EvaluateOptions extends MeasureOptions, ValuationOptions {
  /** Rolling 90-day hindsight-audit median error % in the locality (Drift Guard). */
  localityAuditMedianErrorPct?: number;
  landPortalOffline?: boolean;
  hindsightSamplingRate?: number;
}

export interface EvidencePack {
  caseId: string;
  trust: TrustResult;
  measure: MeasureResult;
  usage: UsageResult;
  price: PriceResult;
  valuation: ValuationResult;
  autoQc: AutoQcResult;
  routing: RoutingResult;
  hindsightAuditFlag: boolean;
}

/** Assembles the Risk Cascade input from engine outputs (re-used by the Live Stress-Test). */
export function buildRoutingInput(
  c: PropertyCase,
  trust: TrustResult,
  measure: MeasureResult,
  usage: UsageResult,
  price: PriceResult,
  valuation: ValuationResult,
  autoQc: AutoQcResult,
  landPortalOffline?: boolean,
): RoutingInput {
  const otherGisHazards = measure.activeHazards.filter((h) => h !== 'in_road_widening' && h !== 'in_forest_buffer');

  return {
    authenticityScore: price.authenticity.score,
    instantThreshold: price.instantThreshold,
    trustAllPassed: trust.allPassed,
    omissionFraudBlock: trust.omissionFraudBlock,
    areaVarianceFlag: measure.areaReconciliation.areaVarianceFlag,
    buaDeviationPct: measure.buaDeviationPct,
    hasUnapprovedStructures: measure.unapprovedStructures.length > 0,
    usageConfirmedByTwoSources: usage.confirmedByTwoSources,
    usageConflict: usage.usageConflict,
    severeUsageConflict: usage.severeUsageConflict,
    appliedUsage: usage.appliedUsage,
    hasSanctionedPlan: c.hasSanctionedPlan,
    surveyMismatch: autoQc.surveyMismatch,
    boundaryMismatchCount: measure.boundaryMismatches.length,
    criticalQcFailCount: autoQc.criticalFailCount,
    marketValueInr: valuation.mvFinal,
    yieldGuardrailFlag: valuation.income?.yieldGuardrailFlag ?? false,
    roadWidening: c.gisHazards.roadWidening || c.roadWideningLossSqft > 0,
    forestBuffer: c.gisHazards.forestBuffer,
    forestRtiCleared: c.gisHazards.forestRtiCleared ?? false,
    otherGisHazards,
    isTypicalProperty: c.isTypicalProperty,
    belowCircleRateFlag: price.belowCircleRateFlag,
    landPortalOffline,
  };
}

export function evaluateCase(c: PropertyCase, opts: EvaluateOptions = {}): EvidencePack {
  const trust = evaluateTrust(c);
  const measure = runMeasure(c, opts);
  const usage = runUsage(c);
  const price = runPrice(c, { localityAuditMedianErrorPct: opts.localityAuditMedianErrorPct });
  const valuation = runValuation(c, measure, price, usage, opts);
  const autoQc = runAutoQc(c, measure, valuation);

  const routing = routeCase(buildRoutingInput(c, trust, measure, usage, price, valuation, autoQc, opts.landPortalOffline));

  return {
    caseId: c.id,
    trust,
    measure,
    usage,
    price,
    valuation,
    autoQc,
    routing,
    hindsightAuditFlag: hindsightAuditSampled(c.id, routing.tier === 'INSTANT', opts.hindsightSamplingRate),
  };
}
