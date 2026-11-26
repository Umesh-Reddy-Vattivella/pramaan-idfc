/* ------------------------------------------------------------------
   Deterministic Valuation Calculator (PRD §3.5) — pure functions.
   ------------------------------------------------------------------ */
import type { PropertyCase } from '@/lib/types';
import type { MeasureResult } from './measure';
import type { PriceResult } from './price';
import type { UsageResult } from './usage';

/* ================= Indian Rupee words (Crores / Lakhs / Thousands) ================= */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

/** Words for 0 <= n < 1,00,00,000 in the Indian system (no currency suffix). */
function belowCroreWords(n: number): string {
  const parts: string[] = [];
  const lakh = Math.floor(n / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(' ');
}

/** Words for any non-negative integer in the Indian system; crore multiples recurse (e.g. "One Hundred Twenty Crore"). */
export function toIndianNumberWords(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('toIndianNumberWords: non-finite input');
  const v = Math.floor(Math.abs(n));
  if (v === 0) return 'Zero';
  const crore = Math.floor(v / 10000000);
  const rest = v % 10000000;
  const parts: string[] = [];
  if (crore) parts.push(`${toIndianNumberWords(crore)} Crore`);
  if (rest) parts.push(belowCroreWords(rest));
  return (n < 0 ? 'Minus ' : '') + parts.join(' ');
}

/**
 * Exact Indian Rupee amount in words. Input is rounded to the nearest rupee.
 * e.g. 33975200 -> "Three Crore Thirty Nine Lakh Seventy Five Thousand Two Hundred Rupees Only"
 */
export function toIndianRupeeWords(amount: number): string {
  return `${toIndianNumberWords(Math.round(amount))} Rupees Only`;
}

const WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const FILLER = new Set(['and', 'rupees', 'rupee', 'rs', 'inr', 'only', 'of', 'the']);

/**
 * Parses Indian-system amount words back to a number (used by QC-1).
 * Returns null if an unrecognised word is present.
 */
export function parseIndianRupeeWords(text: string): number | null {
  const tokens = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let sawNumber = false;
  for (const tok of tokens) {
    if (FILLER.has(tok)) continue;
    if (tok in WORD_VALUES) {
      current += WORD_VALUES[tok];
      sawNumber = true;
    } else if (tok === 'hundred') {
      current = (current || 1) * 100;
    } else if (tok === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    } else if (tok === 'lakh' || tok === 'lakhs' || tok === 'lac' || tok === 'lacs') {
      total += (current || 1) * 100000;
      current = 0;
    } else if (tok === 'crore' || tok === 'crores') {
      total = (total + (current || 1)) * 10000000;
      current = 0;
    } else {
      return null;
    }
  }
  return sawNumber ? total + current : null;
}

/** Indian digit grouping, e.g. 33975200 -> "3,39,75,200" */
export function formatIndianNumber(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/** "Rs. 3,39,75,200" */
export function formatInr(n: number): string {
  return `Rs. ${formatIndianNumber(Math.round(n))}`;
}

/** "Rs. 3.40 Cr" / "Rs. 55.60 L" */
export function formatInrShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `Rs. ${(n / 100000).toFixed(2)} L`;
  return formatInr(n);
}

/**
 * Percentage display truncated (not rounded) to `dp` decimals — matches IDFC report convention
 * (e.g. 557/3721 = 14.969% → "14.96%", 7171/13611 = 52.685% → "52.68%").
 */
export function formatPctTrunc(v: number, dp = 2): string {
  const f = 10 ** dp;
  return `${(Math.trunc(v * f + (v >= 0 ? 1e-9 : -1e-9)) / f).toFixed(dp)}%`;
}

/** Land rates are adopted to the nearest Rs. 10/sqft (R1 9,059.5 → 9,060; Case 1 7,556.4 → 7,560). */
export function roundRateTo10(rate: number): number {
  return Math.round(rate / 10) * 10;
}

/* ================= Core banking formulas ================= */

/** LTV% = (Loan / MV) * 100 */
export function ltvPct(loan: number, mv: number): number {
  return (loan / mv) * 100;
}

/** D = min(0.85, (age / total_life) * (1 - 0.10)), total_life = age + residual life. */
export function depreciation(ageYears: number, residualLifeYears: number): { d: number; totalLifeYears: number } {
  const totalLifeYears = ageYears + residualLifeYears;
  const d = totalLifeYears > 0 ? Math.min(0.85, (ageYears / totalLifeYears) * (1 - 0.1)) : 0;
  return { d, totalLifeYears };
}

/* ---------------- Residual life (answers "how did you arrive at 55 years?") ---------------- */

export type StructureType = 'RCC_FRAMED' | 'LOAD_BEARING' | 'STEEL_SHED';

/** Total economic life by structure type (CPWD / valuer practice). */
export const ECONOMIC_LIFE_YEARS: Record<StructureType, number> = {
  RCC_FRAMED: 60,
  LOAD_BEARING: 50,
  STEEL_SHED: 30,
};

export const STRUCTURE_LABEL: Record<StructureType, string> = {
  RCC_FRAMED: 'RCC framed',
  LOAD_BEARING: 'Load-bearing masonry',
  STEEL_SHED: 'Steel / tin shed (industrial)',
};

/** Residual life = Total economic life − Age (floored at 0). */
export function residualLife(structure: StructureType, ageYears: number): { totalLifeYears: number; residualLifeYears: number; formula: string } {
  const totalLifeYears = ECONOMIC_LIFE_YEARS[structure];
  const residualLifeYears = Math.max(0, totalLifeYears - Math.max(0, ageYears));
  return {
    totalLifeYears,
    residualLifeYears,
    formula: `${STRUCTURE_LABEL[structure]} economic life ${totalLifeYears} yrs − age ${ageYears} yrs = ${residualLifeYears} yrs`,
  };
}

/** Method 1 — Land + Building */
export function landPlusBuilding(input: {
  aNet: number;
  rLand: number;
  buaValued: number;
  rConstrNew: number;
  ageYears: number;
  residualLifeYears: number;
  amenitiesValue: number;
  /** When true, rConstrNew is already the depreciated (as-valued) rate: Building = BUA_valued * R_constr_depreciated. */
  rateIsDepreciated?: boolean;
}) {
  const { d, totalLifeYears } = depreciation(input.ageYears, input.residualLifeYears);
  const rConstrDepreciated = input.rateIsDepreciated ? input.rConstrNew : input.rConstrNew * (1 - d);
  const landValue = input.aNet * input.rLand;
  const buildingValue = input.buaValued * rConstrDepreciated;
  return {
    depreciationD: d,
    totalLifeYears,
    rConstrDepreciated,
    landValue,
    buildingValue,
    amenitiesValue: input.amenitiesValue,
    mv: landValue + buildingValue + input.amenitiesValue,
  };
}

/** Method 2 — Comparable Sales: MV_comps = Saleable_Area * R_comp_adj */
export function comparableSalesValue(saleableAreaSqft: number, rCompAdj: number): number {
  return saleableAreaSqft * rCompAdj;
}

/** Method 3 — Income capitalisation & yield cross-check (default outgoings 10%). */
export function incomeCapitalization(monthlyRent: number, capRate: number, mvPrimary: number, outgoingsPct = 0.1) {
  const annualRent = monthlyRent * 12;
  const grossYieldPct = (annualRent / mvPrimary) * 100;
  const mvIncome = (annualRent * (1 - outgoingsPct)) / capRate;
  const variance = Math.abs(mvPrimary - mvIncome) / mvPrimary;
  return { annualRent, grossYieldPct, mvIncome, outgoingsPct, variancePct: variance * 100, yieldGuardrailFlag: variance > 0.15 };
}

/** MV_final = sum(w_m * MV_m) (weights normalised to 1). */
export function reconcileMarketValue(methods: { mv: number; weight: number }[]): number {
  const w = methods.reduce((s, m) => s + m.weight, 0);
  return w > 0 ? methods.reduce((s, m) => s + (m.weight / w) * m.mv, 0) : 0;
}

/* ================= Engine runner ================= */

export type ValuationMethod = 'LAND_BUILDING' | 'COMPARABLE_SALES';

export interface ValuationOptions {
  /** Cashflow (EMI) capacity-based loan; if absent, Final_Sanction = Max_Collateral_Loan. */
  cashflowCapacityLoanInr?: number;
  /** Income-method outgoings share (default 0.10). */
  outgoingsPct?: number;
}

export interface ValuationResult {
  primaryMethod: ValuationMethod;
  /** Land rate used for MV: case-adopted rate, else PRAMAAN consensus rounded to Rs. 10. */
  rLand: number;
  rLandBasis: 'PRAMAAN_CONSENSUS' | 'ADOPTED';
  rLandBasisNote: string;
  /** PRAMAAN consensus rate (rounded to Rs. 10) and the land value it implies — shown alongside an adopted rate. */
  rConsensusRounded: number;
  landValueAtConsensus: number;
  requestedLoan: number | null;
  requestedLoanLtvPct: number | null;
  landBuilding: ReturnType<typeof landPlusBuilding>;
  comps: { saleableAreaSqft: number; rCompAdj: number; mv: number } | null;
  income: ReturnType<typeof incomeCapitalization> | null;
  mvPrimary: number;
  mvFinal: number;
  mvFinalRounded: number;
  fsvRatio: number;
  fsv: number;
  ltvCap: number;
  maxCollateralLoan: number;
  cashflowCapacityLoan: number | null;
  finalSanction: number;
  amountInWords: string;
}

export function runValuation(
  c: PropertyCase,
  measure: MeasureResult,
  price: PriceResult,
  usage: UsageResult,
  opts: ValuationOptions = {},
): ValuationResult {
  const rConsensusRounded = roundRateTo10(price.rConsensus);
  const adopted = c.adoptedLandRatePerSqft;
  const rLand = adopted ?? rConsensusRounded;
  const lb = landPlusBuilding({
    rateIsDepreciated: c.constructionRateIsDepreciated,
    aNet: measure.aNet,
    rLand,
    buaValued: measure.buaValued,
    rConstrNew: c.constructionRatePerSqft,
    ageYears: c.ageYears,
    residualLifeYears: c.residualLifeYears,
    amenitiesValue: c.amenitiesValueInr,
  });

  // RERA flats -> Comparable Sales is primary (PRD §3.6 playbook); otherwise Land + Building.
  const isReraFlat = c.priceSources.some((s) => s.id === 'RERA_BUILDER' && s.weight > 0);
  let comps: ValuationResult['comps'] = null;
  if (isReraFlat) {
    const rCompAdj = price.comparablesMedianAdjustedRate ?? price.rConsensus;
    const saleableAreaSqft = measure.buaActual;
    comps = { saleableAreaSqft, rCompAdj, mv: comparableSalesValue(saleableAreaSqft, rCompAdj) + c.amenitiesValueInr };
  }
  const primaryMethod: ValuationMethod = comps ? 'COMPARABLE_SALES' : 'LAND_BUILDING';
  const mvPrimary = comps ? comps.mv : lb.mv;

  const income =
    c.monthlyRentInr && c.capRate && mvPrimary > 0
      ? incomeCapitalization(c.monthlyRentInr, c.capRate, mvPrimary, opts.outgoingsPct ?? 0.1)
      : null;

  const mvFinal = reconcileMarketValue([{ mv: mvPrimary, weight: 1.0 }]);
  const fsv = mvFinal * c.fsvRatio;
  const maxCollateralLoan = usage.appliedLtvCap * mvFinal;
  const cashflow = opts.cashflowCapacityLoanInr ?? null;
  const finalSanction = cashflow === null ? maxCollateralLoan : Math.min(maxCollateralLoan, cashflow);

  const requestedLoan = c.requestedLoanInr ?? null;

  return {
    primaryMethod,
    rLand,
    rLandBasis: adopted !== undefined ? 'ADOPTED' : 'PRAMAAN_CONSENSUS',
    rLandBasisNote:
      adopted !== undefined
        ? c.adoptedLandRateBasis ?? 'Adopted land rate'
        : 'PRAMAAN 6-source consensus (rounded to Rs. 10/sqft)',
    rConsensusRounded,
    landValueAtConsensus: measure.aNet * rConsensusRounded,
    requestedLoan,
    requestedLoanLtvPct: requestedLoan !== null && mvFinal > 0 ? ltvPct(requestedLoan, mvFinal) : null,
    landBuilding: lb,
    comps,
    income,
    mvPrimary,
    mvFinal,
    mvFinalRounded: Math.round(mvFinal),
    fsvRatio: c.fsvRatio,
    fsv,
    ltvCap: usage.appliedLtvCap,
    maxCollateralLoan,
    cashflowCapacityLoan: cashflow,
    finalSanction,
    amountInWords: toIndianRupeeWords(Math.round(mvFinal)),
  };
}
