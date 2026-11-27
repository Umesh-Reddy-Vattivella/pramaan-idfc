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
import { surveyMismatch } from './autoQc';
import { checkCaptureLocation, type GeofenceResult } from './geofence';
import { roomsVsPlan } from './measure';
import { runSanity, type SanityResult } from './sanity';
import { parcelGeometry } from '@/lib/mapGeometry';
import { effectiveDocuments } from '@/lib/data/losRecords';
import { DEMOLITION_LIST_CONNECTED, DEMOLITION_NOTICES, GOV_SOURCE } from '@/lib/data/govRecords';

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
  /** Technical sanity / remarks (mortgageability) — separate from the valuation route. */
  sanity: SanityResult;
  /** False until real market evidence exists (≥ 1 weighted price source). MV is then NOT shown. */
  valuationReady: boolean;
  /** Geo-fence result for the customer-link photos (null when no link capture yet). */
  geofence: GeofenceResult | null;
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
  sanity?: SanityResult,
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
    sanityBlockerCount: sanity?.counts.BLOCKER ?? 0,
    marketEvidenceMissing: !marketEvidenceReady(c),
  };
}

/** Market evidence exists: at least one price source with data and weight (circle rate alone is not evidence). */
export function marketEvidenceReady(c: PropertyCase): boolean {
  return c.priceSources.some((s) => s.weight > 0 && s.count > 0 && s.correctedRatePerSqft > 0);
}

/** Sanity layer: geo-fence of the customer-link photos + room measurements + documents + gov records. */
export function evaluateSanity(c: PropertyCase, measure: MeasureResult, usage: UsageResult, now = new Date()): { sanity: SanityResult; geofence: GeofenceResult | null } {
  const sub = c.customerLink?.submission;
  const geofence = sub ? checkCaptureLocation(sub.photos, { lat: c.lat, lng: c.lng }, parcelGeometry(c).parcel) : null;
  const rooms = sub && sub.rooms.length ? roomsVsPlan(sub.rooms, c.floors) : null;
  const sanity = runSanity({
    c,
    measure,
    usage,
    survey: surveyMismatch(c),
    documents: effectiveDocuments(c),
    geofence,
    rooms,
    notices: DEMOLITION_NOTICES,
    noticesConnected: DEMOLITION_LIST_CONNECTED,
    currentYear: now.getFullYear(),
    sources: GOV_SOURCE,
  });
  return { sanity, geofence };
}

export function evaluateCase(c: PropertyCase, opts: EvaluateOptions = {}): EvidencePack {
  const trust = evaluateTrust(c);
  const measure = runMeasure(c, opts);
  const usage = runUsage(c);
  const price = runPrice(c, { localityAuditMedianErrorPct: opts.localityAuditMedianErrorPct });
  const valuation = runValuation(c, measure, price, usage, opts);
  const autoQc = runAutoQc(c, measure, valuation);
  const { sanity, geofence } = evaluateSanity(c, measure, usage);

  const routing = routeCase(buildRoutingInput(c, trust, measure, usage, price, valuation, autoQc, opts.landPortalOffline, sanity));

  return {
    caseId: c.id,
    trust,
    measure,
    usage,
    price,
    valuation,
    autoQc,
    routing,
    sanity,
    valuationReady: marketEvidenceReady(c),
    geofence,
    hindsightAuditFlag: hindsightAuditSampled(c.id, routing.tier === 'INSTANT', opts.hindsightSamplingRate),
  };
}
