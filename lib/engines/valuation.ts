/* ------------------------------------------------------------------
   Valuation (PRD_V3 §6.4) — pure, deterministic. Every step is returned
   as a formula line with the actual numbers substituted, for display.
   ------------------------------------------------------------------ */
import type { Application, Structure, Usage } from '@/lib/domain/types';
import { hasLand, isUnit, USAGE_LABEL } from '@/lib/domain/catalog';
import type { EvidenceResult } from './evidence';
import type { MeasureResult } from './measure';
import { formatIndianNumber, inr, toIndianRupeeWords } from './format';

/** Economic life by structure type (years). */
export const ECONOMIC_LIFE: Record<Structure, number> = { RCC: 60, LOAD_BEARING: 50, STEEL_SHED: 30 };
export const SALVAGE = 0.1;
export const MAX_DEPRECIATION = 0.85;
export const FSV_RATIO = 0.8;
/** Policy LTV caps by usage (illustrative bank policy defaults). */
export const LTV_CAP: Record<Usage, number> = { RESIDENTIAL: 0.7, COMMERCIAL: 0.6, MIXED: 0.55, INDUSTRIAL: 0.5 };
export const METHOD_VARIANCE_WARN_PCT = 20;

export function residualLife(structure: Structure, ageYears: number) {
  const total = ECONOMIC_LIFE[structure];
  return { totalLife: total, residual: Math.max(0, total - ageYears) };
}

/** D = min(0.85, age / total_life × (1 − salvage)) */
export function depreciation(structure: Structure, ageYears: number): number {
  const { totalLife } = residualLife(structure, ageYears);
  return Math.min(MAX_DEPRECIATION, (Math.max(0, ageYears) / totalLife) * (1 - SALVAGE));
}

/** The more conservative (lower LTV) of declared and observed usage. */
export function conservativeUsage(declared: Usage, observed: Usage | null): Usage {
  if (!observed) return declared;
  return LTV_CAP[observed] < LTV_CAP[declared] ? observed : declared;
}

export interface FormulaLine {
  label: string;
  formula: string;
  working: string;
  result: string;
}

export type Method = 'LAND_BUILDING' | 'SALES_COMPARISON' | 'LAND_ONLY';
export const METHOD_LABEL: Record<Method, string> = {
  LAND_BUILDING: 'Land + Building (cost method)',
  SALES_COMPARISON: 'Sales comparison',
  LAND_ONLY: 'Land value (open plot)',
};

export interface ValuationResult {
  ready: boolean;
  missing: string[];
  method: Method;
  lines: FormulaLine[];
  landValue: number | null;
  buildingValue: number | null;
  costMV: number | null;
  comparisonMV: number | null;
  methodVariancePct: number | null;
  mv: number | null;
  fsv: number | null;
  ltvCap: number;
  usageForLtv: Usage;
  maxLoan: number | null;
  words: string | null;
  depreciationPct: number | null;
  totalLife: number | null;
  residualLife: number | null;
  landRate: number | null;
  builtRate: number | null;
  guidelineRate: number | null;
}

const r = (n: number) => formatIndianNumber(Math.round(n));

export function runValuation(a: Application, m: MeasureResult, ev: EvidenceResult): ValuationResult {
  const p = a.property;
  const method: Method = p.type === 'PLOT' ? 'LAND_ONLY' : isUnit(p.type) ? 'SALES_COMPARISON' : 'LAND_BUILDING';
  const missing: string[] = [];
  const lines: FormulaLine[] = [];
  const usageForLtv = conservativeUsage(p.usage, a.inspection.observedUsage);
  const ltvCap = LTV_CAP[usageForLtv];
  const landRate = ev.land?.rate ?? null;
  const builtRate = ev.built?.rate ?? null;

  let totalLife: number | null = null;
  let residual: number | null = null;
  let dep: number | null = null;
  if (p.type !== 'PLOT') {
    if (p.ageYears === null || p.ageYears < 0) missing.push('Age of the building');
    else {
      const rl = residualLife(p.structure, p.ageYears);
      totalLife = rl.totalLife;
      residual = rl.residual;
      dep = depreciation(p.structure, p.ageYears);
      lines.push({
        label: 'Residual life',
        formula: 'residual = economic life (by structure) − age',
        working: `${rl.totalLife} yrs (${p.structure === 'RCC' ? 'RCC frame' : p.structure === 'LOAD_BEARING' ? 'load-bearing' : 'steel shed'}) − ${p.ageYears} yrs`,
        result: `${rl.residual} years`,
      });
      lines.push({
        label: 'Depreciation',
        formula: 'D = min(85%, age ÷ economic life × (1 − 10% salvage))',
        working: `${p.ageYears} ÷ ${rl.totalLife} × 0.90`,
        result: `${(dep * 100).toFixed(2)}%`,
      });
    }
  }

  let landValue: number | null = null;
  if (hasLand(p.type)) {
    if (!m.landAreaSqft) missing.push('Plot area (sale deed or satellite boundary)');
    if (!landRate) missing.push('Land rate from market evidence');
    if (m.landAreaSqft && landRate) {
      landValue = m.landAreaSqft * landRate;
      lines.push({
        label: 'Land area used',
        formula: 'A_land = min(deed area, satellite area)',
        working: m.deedPlotSqft && m.satellitePlotSqft ? `min(${r(m.deedPlotSqft)}, ${r(m.satellitePlotSqft)})` : m.deedPlotSqft ? 'deed area (no satellite boundary drawn)' : 'satellite area (no deed area)',
        result: `${r(m.landAreaSqft)} sqft`,
      });
      lines.push({ label: 'Land value', formula: 'LV = A_land × R_land', working: `${r(m.landAreaSqft)} sqft × ₹${r(landRate)}/sqft`, result: inr(landValue) });
    }
  }

  let buildingValue: number | null = null;
  if (method === 'LAND_BUILDING') {
    if (!p.constructionRate) missing.push('Construction rate (₹/sqft)');
    if (p.constructionRate && dep !== null) {
      buildingValue = m.buaValuedSqft * p.constructionRate * (1 - dep);
      lines.push({
        label: 'Built-up area valued',
        formula: 'BUA_valued = min(actual BUA, approved BUA)',
        working: m.buaValuedBasis,
        result: `${r(m.buaValuedSqft)} sqft`,
      });
      lines.push({
        label: 'Building value',
        formula: 'BV = BUA_valued × R_construction × (1 − D)',
        working: `${r(m.buaValuedSqft)} × ₹${r(p.constructionRate)} × (1 − ${(dep * 100).toFixed(2)}%)`,
        result: inr(buildingValue),
      });
    }
  }

  const costMV = method === 'LAND_BUILDING' && landValue !== null && buildingValue !== null ? landValue + buildingValue : method === 'LAND_ONLY' ? landValue : null;
  if (method === 'LAND_BUILDING' && costMV !== null) {
    lines.push({ label: 'Market value — cost method', formula: 'MV_A = LV + BV', working: `${inr(landValue!)} + ${inr(buildingValue!)}`, result: inr(costMV) });
  }

  let comparisonMV: number | null = null;
  if (p.type !== 'PLOT') {
    if (isUnit(p.type) && !builtRate) missing.push('Built-property rate from market evidence');
    if (isUnit(p.type) && m.buaValuedSqft <= 0) missing.push(m.approvedBuaSqft ? 'Built-up area' : 'Approved plan built-up area');
    if (builtRate && m.buaValuedSqft > 0) {
      comparisonMV = m.buaValuedSqft * builtRate;
      if (isUnit(p.type)) lines.push({ label: 'Built-up area valued', formula: 'BUA_valued = min(actual BUA, approved BUA)', working: m.buaValuedBasis, result: `${r(m.buaValuedSqft)} sqft` });
      lines.push({
        label: isUnit(p.type) ? 'Market value — sales comparison' : 'Cross-check — sales comparison',
        formula: 'MV_B = BUA_valued × R_built',
        working: `${r(m.buaValuedSqft)} sqft × ₹${r(builtRate)}/sqft`,
        result: inr(comparisonMV),
      });
    }
  }

  const mv = method === 'SALES_COMPARISON' ? comparisonMV : costMV;
  const methodVariancePct = method === 'LAND_BUILDING' && costMV && comparisonMV ? (Math.abs(costMV - comparisonMV) / costMV) * 100 : null;
  if (methodVariancePct !== null) {
    lines.push({ label: 'Method variance', formula: '|MV_A − MV_B| ÷ MV_A', working: `|${inr(costMV!)} − ${inr(comparisonMV!)}| ÷ ${inr(costMV!)}`, result: `${methodVariancePct.toFixed(1)}%${methodVariancePct > METHOD_VARIANCE_WARN_PCT ? ' (above 20% — review)' : ''}` });
  }

  let fsv: number | null = null;
  let maxLoan: number | null = null;
  if (mv !== null && mv > 0) {
    fsv = mv * FSV_RATIO;
    maxLoan = mv * ltvCap;
    lines.push({ label: 'Market value adopted', formula: `MV = ${METHOD_LABEL[method]}`, working: method === 'LAND_BUILDING' ? 'cost method is primary; comparison is a cross-check' : 'primary method', result: inr(mv) });
    lines.push({ label: 'Forced-sale value', formula: 'FSV = 80% × MV', working: `0.80 × ${inr(mv)}`, result: inr(fsv) });
    lines.push({
      label: 'Max eligible loan',
      formula: 'LTV cap (usage) × MV',
      working: `${Math.round(ltvCap * 100)}% (${USAGE_LABEL[usageForLtv]}${a.inspection.observedUsage && a.inspection.observedUsage !== p.usage ? ', lower of declared and observed' : ''}) × ${inr(mv)}`,
      result: inr(maxLoan),
    });
  }

  return {
    ready: mv !== null && mv > 0,
    missing: [...new Set(missing)],
    method,
    lines,
    landValue,
    buildingValue,
    costMV,
    comparisonMV,
    methodVariancePct,
    mv,
    fsv,
    ltvCap,
    usageForLtv,
    maxLoan,
    words: mv ? toIndianRupeeWords(mv) : null,
    depreciationPct: dep === null ? null : dep * 100,
    totalLife,
    residualLife: residual,
    landRate,
    builtRate,
    guidelineRate: ev.guideline,
  };
}
