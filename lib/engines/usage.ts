/* ------------------------------------------------------------------
   Engine 3: USAGE & Property Condition (PRD §3.4) — pure functions.
   ------------------------------------------------------------------ */
import type { PropertyCase, UsageClass } from '@/lib/types';

/**
 * Illustrative LTV caps per usage class (PRD §3.4 table).
 * Institutional is "50–55% (policy-specific)"; the conservative lower bound is used by default.
 */
export const LTV_CAP: Record<UsageClass, number> = {
  RESIDENTIAL: 0.7,
  COMMERCIAL: 0.6,
  MIXED_USE: 0.55,
  INDUSTRIAL: 0.5,
  INSTITUTIONAL: 0.5,
};

export const USAGE_LABEL: Record<UsageClass, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  MIXED_USE: 'Mixed Use',
  INDUSTRIAL: 'Industrial',
  INSTITUTIONAL: 'Institutional',
};

export function ltvCap(usage: UsageClass): number {
  return LTV_CAP[usage];
}

export interface UsageResult {
  cvDetectedUsage: UsageClass;
  cvConfidencePct: number;
  recordConfirmedUsage: UsageClass;
  /** Usage confirmed by 2 independent sources (CV + records agree). */
  confirmedByTwoSources: boolean;
  usageConflict: boolean;
  /**
   * Severe conflict (→ Physical Check): conflict involving INDUSTRIAL usage, or where the
   * two sources' LTV bands differ by >= 15 percentage points (e.g. industrial machinery in a residential parcel).
   */
  severeUsageConflict: boolean;
  /** Usage class whose LTV band is applied — the LOWER of the two on conflict (never resolves upward). */
  appliedUsage: UsageClass;
  appliedLtvCap: number;
  explanation: string;
}

/**
 * CRITICAL CONFLICT RULE: conflicts never resolve upward toward a higher LTV band.
 * On conflict, USAGE_CONFLICT = true and the lower LTV band is applied.
 */
export function runUsage(c: PropertyCase): UsageResult {
  const cv = c.cvDetectedUsage;
  const rec = c.recordConfirmedUsage;
  const conflict = cv !== rec;
  const capCv = LTV_CAP[cv];
  const capRec = LTV_CAP[rec];
  const appliedUsage = !conflict ? rec : capCv <= capRec ? cv : rec;
  const appliedLtvCap = LTV_CAP[appliedUsage];
  const severe = conflict && (cv === 'INDUSTRIAL' || rec === 'INDUSTRIAL' || Math.abs(capCv - capRec) >= 0.15 - 1e-9);

  const explanation = conflict
    ? `USAGE_CONFLICT: CV detected ${USAGE_LABEL[cv]} (${c.cvConfidencePct}% conf.) vs records ${USAGE_LABEL[rec]}. ` +
      `Lower band applied: ${USAGE_LABEL[appliedUsage]} @ ${(appliedLtvCap * 100).toFixed(0)}% LTV.`
    : `${USAGE_LABEL[rec]} confirmed by CV (${c.cvConfidencePct}% conf.) and records (${c.utilitySummary}). ` +
      `LTV cap ${(appliedLtvCap * 100).toFixed(0)}%.`;

  return {
    cvDetectedUsage: cv,
    cvConfidencePct: c.cvConfidencePct,
    recordConfirmedUsage: rec,
    confirmedByTwoSources: !conflict,
    usageConflict: conflict,
    severeUsageConflict: severe,
    appliedUsage,
    appliedLtvCap,
    explanation,
  };
}
