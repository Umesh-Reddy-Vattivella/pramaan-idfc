/* ------------------------------------------------------------------
   Confidence-Gated Risk Cascade (PRD §3.6) — deterministic routing.
   ------------------------------------------------------------------ */
import type { RouteTier, UsageClass } from '@/lib/types';
import { formatPctTrunc } from './valuation';

export const CRORE = 10000000;
export const INSTANT_MV_CAP_INR = 5 * CRORE;
export const HIGH_TICKET_MV_INR = 15 * CRORE;
export const PHYSICAL_S_FLOOR = 60;
export const INSTANT_BUA_DEV_MAX_PCT = 15;
export const PHYSICAL_BUA_DEV_PCT = 30;

export const ROUTE_META: Record<RouteTier, { label: string; sla: string; expectedShare: string }> = {
  INSTANT: { label: 'Instant', sla: '30–55 mins', expectedShare: '60–75% of files' },
  REMOTE_REVIEW: { label: 'Remote Review', sla: 'Same Day (<= 24 hrs)', expectedShare: '15–25% of files' },
  PHYSICAL_CHECK: { label: 'Physical Check', sla: '24–72 hrs', expectedShare: '5–15% of files' },
};

export interface RoutingInput {
  authenticityScore: number;
  /** Instant threshold after Drift Guard (80 default, 88 if locality drift > 7%). */
  instantThreshold: number;
  trustAllPassed: boolean;
  omissionFraudBlock: boolean;
  areaVarianceFlag: boolean;
  buaDeviationPct: number | null;
  hasUnapprovedStructures: boolean;
  usageConfirmedByTwoSources: boolean;
  usageConflict: boolean;
  severeUsageConflict: boolean;
  appliedUsage: UsageClass;
  hasSanctionedPlan: boolean;
  surveyMismatch: boolean;
  boundaryMismatchCount: number;
  criticalQcFailCount: number;
  marketValueInr: number;
  yieldGuardrailFlag: boolean;
  roadWidening: boolean;
  forestBuffer: boolean;
  forestRtiCleared: boolean;
  otherGisHazards: string[];
  isTypicalProperty: boolean;
  belowCircleRateFlag: boolean;
  /** State land portal not on API → Ops Lookup Desk fallback. */
  landPortalOffline?: boolean;
  /** Technical-sanity BLOCKERs (no approved plan, demolition notice, severe usage conflict). */
  sanityBlockerCount?: number;
  /** No market evidence collected yet → valuation pending, never Instant. */
  marketEvidenceMissing?: boolean;
}

export interface GateResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface RoutingResult {
  tier: RouteTier;
  label: string;
  sla: string;
  /** The 6 INSTANT gates (all must pass). */
  instantGates: GateResult[];
  /** Reasons that triggered PHYSICAL_CHECK (any one is sufficient). */
  physicalTriggers: string[];
  /** Reasons that triggered REMOTE_REVIEW (any one is sufficient). */
  remoteTriggers: string[];
}

const fmtCr = (v: number) => `Rs. ${(v / CRORE).toFixed(2)} Cr`;
const isCommercialLike = (u: UsageClass) => u === 'COMMERCIAL' || u === 'MIXED_USE' || u === 'INDUSTRIAL' || u === 'INSTITUTIONAL';

export function routeCase(i: RoutingInput): RoutingResult {
  const dev = i.buaDeviationPct;
  const devText = dev === null ? 'n/a' : formatPctTrunc(dev);

  /* ---- INSTANT gates (ALL must pass) ---- */
  const instantGates: GateResult[] = [
    {
      id: 'G1',
      label: `Authenticity Score S >= ${i.instantThreshold}`,
      passed: i.authenticityScore >= i.instantThreshold,
      detail: `S = ${i.authenticityScore}`,
    },
    {
      id: 'G2',
      label: 'Trust Layer 100% PASS',
      passed: i.trustAllPassed && !i.omissionFraudBlock,
      detail: i.omissionFraudBlock ? 'OMISSION_FRAUD_BLOCK raised' : i.trustAllPassed ? 'All trust checks passed' : 'One or more trust checks failed',
    },
    {
      id: 'G3',
      label: 'Area sources within 10% & BUA deviation <= 15%',
      passed: !i.areaVarianceFlag && dev !== null && dev <= INSTANT_BUA_DEV_MAX_PCT && !i.hasUnapprovedStructures,
      detail: `Area variance ${i.areaVarianceFlag ? 'FLAGGED' : 'OK'}; BUA deviation ${devText}${i.hasUnapprovedStructures ? '; unapproved structures present' : ''}`,
    },
    {
      id: 'G4',
      label: 'Usage confirmed by 2 independent sources',
      passed: i.usageConfirmedByTwoSources && !i.usageConflict,
      detail: i.usageConflict ? 'USAGE_CONFLICT' : 'CV + records agree',
    },
    {
      id: 'G5',
      label: 'Sanctioned plan verified, 0 Survey/Title mismatches, 0 Critical QC fails',
      passed: i.hasSanctionedPlan && !i.surveyMismatch && i.boundaryMismatchCount === 0 && i.criticalQcFailCount === 0,
      detail: [
        i.hasSanctionedPlan ? 'Plan verified' : 'No sanctioned plan',
        i.surveyMismatch ? 'survey mismatch' : 'survey OK',
        `${i.boundaryMismatchCount} boundary mismatch(es)`,
        `${i.criticalQcFailCount} critical QC fail(s)`,
      ].join('; '),
    },
    {
      id: 'G6',
      label: 'Market Value <= Rs. 5 Cr',
      passed: i.marketValueInr <= INSTANT_MV_CAP_INR,
      detail: `MV = ${fmtCr(i.marketValueInr)}`,
    },
  ];

  /* ---- PHYSICAL CHECK triggers (ANY) ---- */
  const physicalTriggers: string[] = [];
  if (i.authenticityScore < PHYSICAL_S_FLOOR) physicalTriggers.push(`Authenticity Score S = ${i.authenticityScore} < 60 (thin market / one-off asset).`);
  if (dev !== null && dev > PHYSICAL_BUA_DEV_PCT) physicalTriggers.push(`BUA deviation ${devText} > 30%.`);
  if (i.hasUnapprovedStructures) physicalTriggers.push('Unapproved floors / sheds detected.');
  if (!i.trustAllPassed || i.omissionFraudBlock) {
    physicalTriggers.push(i.omissionFraudBlock ? 'Trust Layer failure: Omission Fraud floor mismatch.' : 'Trust Layer not passed (geo-fence / device / media — or no PRAMAAN live capture).');
  }
  if (i.severeUsageConflict) physicalTriggers.push('Severe usage conflict.');
  if (i.marketValueInr > HIGH_TICKET_MV_INR && isCommercialLike(i.appliedUsage) && dev !== null && dev > INSTANT_BUA_DEV_MAX_PCT) {
    physicalTriggers.push(`High-ticket commercial ${fmtCr(i.marketValueInr)} > Rs. 15 Cr with major deviation (Dual-Valuation Policy Gate).`);
  }

  /* ---- REMOTE REVIEW triggers (ANY) ---- */
  const remoteTriggers: string[] = [];
  if (i.authenticityScore >= PHYSICAL_S_FLOOR && i.authenticityScore < i.instantThreshold) {
    remoteTriggers.push(`Authenticity Score S = ${i.authenticityScore} (60 – ${i.instantThreshold - 1}).`);
  }
  if (!i.hasSanctionedPlan) remoteTriggers.push('Missing sanctioned plan (land-only policy / exception review).');
  if (i.surveyMismatch) remoteTriggers.push('Survey No. mismatch requiring Rectification Deed.');
  if (i.boundaryMismatchCount > 0) remoteTriggers.push(`${i.boundaryMismatchCount} boundary mismatch(es) deed vs site.`);
  if (i.roadWidening) remoteTriggers.push('Road widening corridor affects plot.');
  if (i.forestBuffer) remoteTriggers.push(i.forestRtiCleared ? 'Forest buffer (RTI clearance on file — review).' : 'Forest buffer — RTI review required.');
  if (!i.isTypicalProperty) remoteTriggers.push('Irregular / non-standard property.');
  if (i.otherGisHazards.length) remoteTriggers.push(`GIS hazard overlay: ${i.otherGisHazards.join(', ')}.`);
  if (i.yieldGuardrailFlag) remoteTriggers.push('Income yield variance > 15%.');
  if (i.marketValueInr > INSTANT_MV_CAP_INR) remoteTriggers.push(`MV ${fmtCr(i.marketValueInr)} above Rs. 5 Cr instant threshold.`);
  if (i.areaVarianceFlag) remoteTriggers.push('Area sources differ by > 10%.');
  if (dev === null) remoteTriggers.push('BUA deviation not computable (no sanctioned / permissible reference).');
  else if (dev > INSTANT_BUA_DEV_MAX_PCT && dev <= PHYSICAL_BUA_DEV_PCT) remoteTriggers.push(`BUA deviation ${devText} (15–30%).`);
  if (i.usageConflict && !i.severeUsageConflict) remoteTriggers.push('Usage conflict — lower LTV band applied.');
  if (i.criticalQcFailCount > 0) remoteTriggers.push(`${i.criticalQcFailCount} critical Auto-QC fail(s).`);
  if (i.belowCircleRateFlag) remoteTriggers.push('Consensus rate below circle rate (floor sanity check).');
  if (i.landPortalOffline) remoteTriggers.push('State land portal not on API — Ops Lookup Desk fallback.');
  if (i.marketEvidenceMissing) remoteTriggers.push('Market evidence not yet collected — valuation pending.');
  if (i.sanityBlockerCount) remoteTriggers.push(`${i.sanityBlockerCount} technical-sanity blocker(s) — property not mortgageable until cleared.`);

  const allInstantPass = instantGates.every((g) => g.passed);
  const tier: RouteTier = physicalTriggers.length
    ? 'PHYSICAL_CHECK'
    : allInstantPass && remoteTriggers.length === 0
      ? 'INSTANT'
      : 'REMOTE_REVIEW';

  // Guarantee a reason is always present for non-instant routes.
  if (tier === 'REMOTE_REVIEW' && remoteTriggers.length === 0) {
    remoteTriggers.push(...instantGates.filter((g) => !g.passed).map((g) => `Instant gate failed: ${g.label}.`));
  }

  return { tier, label: ROUTE_META[tier].label, sla: ROUTE_META[tier].sla, instantGates, physicalTriggers, remoteTriggers };
}
