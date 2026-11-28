/* ------------------------------------------------------------------
   Phase 1 components (PRAMAAN Valuation Logic v2 §1A) — pure.
   A. Government value: shown; a FLOOR only when it comes from the official
      lookup (weight 0 by default).
   B. Market rate from the evidence engine (listings, sales, auctions).
   C. The customer's own purchase price brought to today — a second weighted
      component, capped at 30%, with an uncertainty that grows with time.
   R_final = max( (R_B/u_B² + R_C/u_C²) ÷ (1/u_B² + 1/u_C²), G ),  80% range = R ± 1.28 u.
   ------------------------------------------------------------------ */
import type { Application, PurchaseAreaUnit } from '@/lib/domain/types';
import { hasLand, isUnit } from '@/lib/domain/catalog';
import { VALUATION as V } from '@/config/valuation';
import type { Consensus, EvidenceResult, GuidelineValue } from './evidence';
import { hpiFactor } from './hpi';
import type { MeasureResult } from './measure';
import { depreciation } from './valuation';

export const PURCHASE_AREA_SQFT: Record<PurchaseAreaUnit, number> = { SQFT: 1, SQYD: 9, SQM: 10.7639 };

export interface PurchaseComponent {
  /** False when the inputs do not allow component C (see reason). */
  applicable: boolean;
  reason?: string;
  /** Which rate it is compared with. */
  category: 'LAND' | 'BUILT' | null;
  years: number;
  priceInr: number;
  areaSqft: number;
  /** P ÷ A. */
  paidRate: number;
  /** Price growth from purchase to today. */
  indexFactor: number;
  indexSource: 'HPI' | 'GROWTH';
  /** Plot + building: the building's value at purchase, taken out to leave the land. */
  buildingThenInr: number | null;
  /** R_C, Rs./sqft. */
  rate: number;
  /** u_C = min(30%, 8% + 2% × years) + 5% while self-declared. */
  u: number;
  selfDeclared: boolean;
  /** Formula lines for display. */
  lines: { label: string; formula: string; working: string; result: string }[];
}

const months = (ym: string, now: Date) => {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  return m ? (now.getFullYear() - +m[1]) * 12 + (now.getMonth() - (+m[2] - 1)) : null;
};
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Component C from the ownership facts, or null when the property was not purchased / not enough data. */
export function purchaseComponent(a: Application, m: MeasureResult, now: Date): PurchaseComponent | null {
  const o = a.ownership;
  if (!o || o.acquiredBy !== 'PURCHASED') return null;
  const p = a.property;
  const na = (reason: string): PurchaseComponent => ({ applicable: false, reason, category: null, years: 0, priceInr: o.priceInr ?? 0, areaSqft: 0, paidRate: 0, indexFactor: 1, indexSource: 'GROWTH', buildingThenInr: null, rate: 0, u: 0, selfDeclared: true, lines: [] });
  if (!o.purchaseMonth || !o.priceInr || !o.covered) return na('Needs the month of purchase, the price paid and what the price covered');
  const mo = months(o.purchaseMonth, now);
  if (mo === null || mo < 0) return na('Month of purchase is in the future');
  const years = mo / 12;
  const bought = o.areaBought ? o.areaBought * PURCHASE_AREA_SQFT[o.areaUnit ?? 'SQFT'] : null;

  let category: 'LAND' | 'BUILT';
  let area: number | null;
  if (o.covered === 'UNIT') {
    if (!isUnit(p.type)) return na('A flat / unit purchase cannot be compared with this property type');
    category = 'BUILT';
    area = bought ?? p.builtUpSqft ?? (m.buaValuedSqft || null);
  } else {
    if (!hasLand(p.type)) return na('A plot purchase cannot be compared with a flat / unit rate');
    category = 'LAND';
    area = bought ?? p.plotAreaSqft ?? m.landAreaSqft;
  }
  if (!area || area <= 0) return na('Area bought is not known');

  const hpi = hpiFactor(p.city, o.purchaseMonth, now);
  const indexFactor = hpi ? hpi.factor : (1 + V.purchase.growth) ** years;
  const indexSource = hpi ? 'HPI' : 'GROWTH';
  const indexed = o.priceInr * indexFactor;
  const lines: PurchaseComponent['lines'] = [
    {
      label: 'Price brought to today',
      formula: hpi ? 'P × HPI_now ÷ HPI_purchase' : `P × (1 + g)^years, g = ${V.purchase.growth * 100}% (no price index for this city)`,
      working: hpi ? `₹${fmt(o.priceInr)} × ${indexFactor.toFixed(3)}` : `₹${fmt(o.priceInr)} × ${(1 + V.purchase.growth).toFixed(2)}^${years.toFixed(1)}`,
      result: `₹${fmt(indexed)}`,
    },
  ];

  // Plot + building: take out the building as it was at purchase (at today's construction rate) to leave the land.
  let buildingThenInr: number | null = null;
  let landToday = indexed;
  if (o.covered === 'PLOT_BUILDING' && !o.constructedAfter) {
    const bua = p.builtUpSqft ?? (m.buaValuedSqft || null);
    if (!bua || !p.constructionRate || p.ageYears === null) return na('Plot + building purchase needs the built-up area, construction rate and age of the building');
    const ageThen = Math.max(0, p.ageYears - years);
    const dThen = depreciation(p.structure, ageThen);
    buildingThenInr = bua * p.constructionRate * (1 - dThen);
    landToday = indexed - buildingThenInr;
    lines.push({
      label: 'Less the building at purchase',
      formula: 'BUA × construction rate × (1 − D_then)  [= extra depreciation since purchase + building today]',
      working: `${fmt(bua)} × ₹${fmt(p.constructionRate)} × (1 − ${(dThen * 100).toFixed(1)}%), age then ${ageThen.toFixed(1)} yrs`,
      result: `₹${fmt(buildingThenInr)}`,
    });
    if (landToday <= 0) return na('Indexed price is below the building value — the price paid cannot give a land rate');
  }
  const rate = landToday / area;
  const selfDeclared = a.documents.find((d) => d.key === 'SALE_DEED')?.status !== 'VERIFIED';
  const u = Math.min(V.purchase.uMax, V.purchase.uBase + V.purchase.uPerYear * years) + (selfDeclared ? V.purchase.uSelfDeclared : 0);
  lines.push({ label: `R_C (${category === 'LAND' ? 'land' : 'built'} rate)`, formula: o.covered === 'PLOT_BUILDING' && !o.constructedAfter ? '(indexed price − building then) ÷ plot area' : 'indexed price ÷ area bought', working: `₹${fmt(landToday)} ÷ ${fmt(area)} sqft`, result: `₹${fmt(rate)}/sqft` });
  lines.push({
    label: 'u_C',
    formula: `min(${V.purchase.uMax * 100}%, ${V.purchase.uBase * 100}% + ${V.purchase.uPerYear * 100}% × years)${selfDeclared ? ` + ${V.purchase.uSelfDeclared * 100}% self-declared` : ''}`,
    working: `min(30%, 8% + 2% × ${years.toFixed(1)})${selfDeclared ? ' + 5%' : ' (sale deed verified)'}`,
    result: `${(u * 100).toFixed(1)}%`,
  });
  return { applicable: true, category, years, priceInr: o.priceInr, areaSqft: area, paidRate: o.priceInr / area, indexFactor, indexSource, buildingThenInr, rate, u, selfDeclared, lines };
}

export interface FinalRate {
  category: 'LAND' | 'BUILT';
  market: Consensus;
  purchase: PurchaseComponent | null;
  /** Weights of B (market) and C (purchase); C capped at 30%. */
  wMarket: number;
  wPurchase: number;
  capped: boolean;
  /** Before the floor. */
  blended: number;
  guideline: GuidelineValue | null;
  floorApplied: boolean;
  /** Rs./sqft, rounded to Rs. 10. */
  rate: number;
  /** u ÷ R of the final rate. */
  u: number;
  low: number;
  high: number;
  /** |R_C − R_B| ÷ R_B. */
  divergence: number | null;
}

const round10 = (x: number) => Math.round(x / 10) * 10;

export function finalRate(category: 'LAND' | 'BUILT', market: Consensus | null, purchase: PurchaseComponent | null, guideline: GuidelineValue | null): FinalRate | null {
  if (!market) return null;
  const c = purchase?.applicable && purchase.category === category ? purchase : null;
  let wC = 0;
  let capped = false;
  if (c) {
    const pB = 1 / market.u ** 2;
    const pC = 1 / c.u ** 2;
    wC = pC / (pB + pC);
    if (wC > V.purchase.maxWeight) {
      wC = V.purchase.maxWeight;
      capped = true;
    }
  }
  const wB = 1 - wC;
  const blended = wB * market.rawRate + (c ? wC * c.rate : 0);
  // Relative uncertainty of a weighted mean of independent estimates (= 1/√Σ(1/u²) when uncapped).
  const u = Math.sqrt((wB * market.u) ** 2 + (c ? (wC * c.u) ** 2 : 0));
  const floorApplied = !!guideline?.official && blended < guideline.rate;
  const raw = floorApplied ? guideline!.rate : blended;
  return {
    category,
    market,
    purchase: c,
    wMarket: wB,
    wPurchase: wC,
    capped,
    blended,
    guideline,
    floorApplied,
    rate: round10(raw),
    u,
    low: round10(raw * (1 - V.rangeZ * u)),
    high: round10(raw * (1 + V.rangeZ * u)),
    divergence: c ? Math.abs(c.rate - market.rawRate) / market.rawRate : null,
  };
}

export interface FinalRates {
  LAND: FinalRate | null;
  BUILT: FinalRate | null;
  purchase: PurchaseComponent | null;
}

export function finalRates(ev: EvidenceResult, purchase: PurchaseComponent | null): FinalRates {
  return { LAND: finalRate('LAND', ev.land, purchase, ev.guidelines.LAND), BUILT: finalRate('BUILT', ev.built, purchase, ev.guidelines.BUILT), purchase };
}
