/* ------------------------------------------------------------------
   IDFC Business Case / ROI Simulator — pure arithmetic (no LLM math).
   All inputs are user-adjustable assumptions shown in the ROI modal.
   ------------------------------------------------------------------ */

export interface RoiInputs {
  /** LAP valuation files processed per month. */
  filesPerMonth: number;
  /** Legacy external valuer cost per file (Rs.). */
  legacyCostPerFile: number;
  /** PRAMAAN cost per file (Rs.). */
  pramaanCostPerFile: number;
  /** Share of files routed INSTANT (0–100). */
  instantSharePct: number;
  /** Average LAP ticket size (Rs.). */
  avgTicketInr: number;
  /** Baseline sanction-to-disbursal conversion (0–100). */
  baseConversionPct: number;
  /** Conversion uplift from faster TAT, in percentage points. */
  conversionUpliftPts: number;
  /** Net interest margin on incremental book (% p.a.). */
  nimPct: number;
  /** Processing fee on incremental disbursals (% of ticket). */
  processingFeePct: number;
}

export const ROI_DEFAULTS: RoiInputs = {
  filesPerMonth: 2000,
  legacyCostPerFile: 3000,
  pramaanCostPerFile: 480,
  instantSharePct: 68,
  avgTicketInr: 5000000,
  baseConversionPct: 60,
  conversionUpliftPts: 5,
  nimPct: 3,
  processingFeePct: 1,
};

export interface RoiResult {
  annualFiles: number;
  valuationCostSaving: number;
  instantFilesPerYear: number;
  incrementalLoans: number;
  incrementalDisbursal: number;
  incrementalNii: number;
  incrementalFees: number;
  totalYear1Impact: number;
  costReductionPct: number;
  baselineLoans: number;
  upliftedLoans: number;
}

export function computeRoi(i: RoiInputs): RoiResult {
  const annualFiles = i.filesPerMonth * 12;
  const valuationCostSaving = annualFiles * (i.legacyCostPerFile - i.pramaanCostPerFile);
  const instantFilesPerYear = annualFiles * (i.instantSharePct / 100);
  const baselineLoans = annualFiles * (i.baseConversionPct / 100);
  const upliftedLoans = annualFiles * (Math.min(100, i.baseConversionPct + i.conversionUpliftPts) / 100);
  const incrementalLoans = upliftedLoans - baselineLoans;
  const incrementalDisbursal = incrementalLoans * i.avgTicketInr;
  const incrementalNii = incrementalDisbursal * (i.nimPct / 100);
  const incrementalFees = incrementalDisbursal * (i.processingFeePct / 100);
  return {
    annualFiles,
    valuationCostSaving,
    instantFilesPerYear,
    incrementalLoans,
    incrementalDisbursal,
    incrementalNii,
    incrementalFees,
    totalYear1Impact: valuationCostSaving + incrementalNii + incrementalFees,
    costReductionPct: i.legacyCostPerFile > 0 ? ((i.legacyCostPerFile - i.pramaanCostPerFile) / i.legacyCostPerFile) * 100 : 0,
    baselineLoans,
    upliftedLoans,
  };
}
