/* ------------------------------------------------------------------
   Evidence trail builder for the Click-to-Inspect Evidence Drawer.
   Formats values already computed by lib/engines — performs no valuation math.
   ------------------------------------------------------------------ */
import type { PriceSourceInput, PropertyCase } from '@/lib/types';
import { KIND_TO_SOURCE } from '@/lib/engines/marketEvidence';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { formatIndianNumber, formatInr, formatPctTrunc } from '@/lib/engines/valuation';
import { SPATIAL_TIER_LABEL } from '@/lib/engines/price';

export interface Evidence {
  key: string;
  title: string;
  value: string;
  formula: string;
  inputs: { label: string; value: string }[];
  sources: string[];
  engine: string;
}

const sqft = (n: number) => `${formatIndianNumber(Math.round(n * 100) / 100)} sqft`;
const rate = (n: number) => `Rs. ${formatIndianNumber(Math.round(n * 100) / 100)}/sqft`;
const pct = (n: number, dp = 2) => `${(n * 100).toFixed(dp)}%`;

function deedSource(c: PropertyCase): string {
  const deed = c.vernacularDocsParsed?.find((d) => /sale deed/i.test(d.docType));
  return deed ? `${deed.docType} — ${deed.summary}` : `Sale Deed (OCR extraction) — ${c.fileNo ?? c.id}`;
}

function recordSource(c: PropertyCase): string {
  const patta = c.vernacularDocsParsed?.find((d) => /patta/i.test(d.docType));
  return patta ? `${patta.language} ${patta.docType} via Vernacular OCR` : 'Cadastral / land-record map (state GIS)';
}

export function buildEvidence(c: PropertyCase, e: EvidencePack): Record<string, Evidence> {
  const m = e.measure;
  const v = e.valuation;
  const p = e.price;
  const lb = v.landBuilding;
  const a = p.authenticity;
  const legacyRef = c.legacyAgencyName ? `Legacy report: ${c.legacyAgencyName} (${c.fileNo ?? c.caseRefNo})` : null;

  const out: Evidence[] = [
    {
      key: 'mv',
      title: 'Market Value (MV_final)',
      value: formatInr(v.mvFinal),
      formula:
        v.primaryMethod === 'LAND_BUILDING'
          ? 'MV_final = Land_Value + Building_Value + Amenities_Value   (Method 1, weight 1.0)'
          : 'MV_final = Saleable_Area × R_comp_adj   (Method 2, weight 1.0)',
      inputs: [
        { label: 'Land Value', value: formatInr(lb.landValue) },
        { label: 'Building Value', value: formatInr(lb.buildingValue) },
        { label: 'Amenities Value', value: formatInr(lb.amenitiesValue) },
        { label: 'In words', value: v.amountInWords },
      ],
      sources: ['lib/engines/valuation.ts → runValuation()', ...(legacyRef ? [legacyRef] : [])],
      engine: 'Valuation Calculator §3.5',
    },
    {
      key: 'fsv',
      title: 'Forced-Sale Value (FSV)',
      value: formatInr(v.fsv),
      formula: 'FSV = MV_final × fsv_ratio',
      inputs: [
        { label: 'MV_final', value: formatInr(v.mvFinal) },
        { label: 'fsv_ratio', value: pct(v.fsvRatio, 0) },
      ],
      sources: ['IDFC FSV policy (80–85% of MV)', 'lib/engines/valuation.ts'],
      engine: 'Valuation Calculator §3.5',
    },
    {
      key: 'maxLoan',
      title: 'Max Collateral Loan',
      value: formatInr(v.maxCollateralLoan),
      formula: 'Max_Collateral_Loan = LTV_cap(confirmed_usage) × MV_final',
      inputs: [
        { label: 'Confirmed usage', value: e.usage.appliedUsage },
        { label: 'LTV cap', value: pct(v.ltvCap, 0) },
        { label: 'MV_final', value: formatInr(v.mvFinal) },
        ...(v.requestedLoan !== null && v.requestedLoanLtvPct !== null
          ? [{ label: 'Requested loan → LTV%', value: `${formatInr(v.requestedLoan)} → ${formatPctTrunc(v.requestedLoanLtvPct, 1)}` }]
          : []),
      ],
      sources: ['Engine 3 dual-source usage verification', 'lib/engines/usage.ts LTV_CAP table'],
      engine: 'Valuation Calculator §3.5',
    },
    {
      key: 'landValue',
      title: 'Land Value',
      value: formatInr(lb.landValue),
      formula: 'Land_Value = A_net × R_land',
      inputs: [
        { label: 'A_net', value: sqft(m.aNet) },
        { label: 'R_land', value: rate(v.rLand) },
        { label: 'R_land basis', value: v.rLandBasisNote },
        ...(v.rLandBasis === 'ADOPTED'
          ? [{ label: 'Land value at PRAMAAN consensus', value: `${sqft(m.aNet)} × ${rate(v.rConsensusRounded)} = ${formatInr(v.landValueAtConsensus)}` }]
          : []),
      ],
      sources: [deedSource(c), recordSource(c), 'Engine 2 price triangulation'],
      engine: 'Valuation Calculator §3.5',
    },
    {
      key: 'buildingValue',
      title: 'Building Value',
      value: formatInr(lb.buildingValue),
      formula: c.constructionRateIsDepreciated
        ? 'Building_Value = BUA_valued × R_constr_depreciated'
        : 'Building_Value = BUA_valued × R_constr_new × (1 − D)',
      inputs: [
        { label: 'BUA_valued', value: sqft(m.buaValued) },
        { label: 'BUA basis', value: m.buaBasis },
        { label: 'R_constr (as valued)', value: rate(lb.rConstrDepreciated) },
        { label: 'Depreciation D', value: `${pct(lb.depreciationD)} (age ${c.ageYears} / total life ${lb.totalLifeYears} yrs × 0.90)` },
      ],
      sources: [c.hasSanctionedPlan ? 'Sanctioned building plan (OCR)' : 'No sanctioned plan — bank policy rule applied', 'Owner guided interior capture'],
      engine: 'Engine 1 MEASURE §3.2 + Valuation §3.5',
    },
    {
      key: 'depreciation',
      title: 'Depreciation D',
      value: pct(lb.depreciationD),
      formula: 'D = min(0.85, (age_years / total_life_years) × (1 − 0.10))',
      inputs: [
        { label: 'age_years', value: `${c.ageYears}` },
        { label: 'residual life', value: `${c.residualLifeYears}` },
        { label: 'total_life_years', value: `${lb.totalLifeYears}` },
      ],
      sources: ['Valuer age assessment + CV condition grading'],
      engine: 'Valuation Calculator §3.5',
    },
    {
      key: 'aNet',
      title: 'Net Usable Plot Area (A_net)',
      value: sqft(m.aNet),
      formula: 'A_net = min(A_deed, A_record) − A_widening',
      inputs: [
        { label: 'A_deed', value: sqft(c.deedPlotAreaSqft) },
        { label: 'A_record', value: sqft(c.cadastralPlotAreaSqft) },
        { label: 'A_widening', value: sqft(c.roadWideningLossSqft) },
      ],
      sources: [deedSource(c), recordSource(c), 'Master Plan road-widening overlay (GIS)'],
      engine: 'Engine 1 MEASURE §3.2 (Formula 1)',
    },
    {
      key: 'buaDev',
      title: 'BUA Deviation %',
      value: m.buaDeviationPct === null ? 'Not computable' : formatPctTrunc(m.buaDeviationPct),
      formula: 'dev_pct = ((BUA_actual − BUA_reference) / BUA_reference) × 100',
      inputs: [
        { label: 'BUA_actual (permanent)', value: sqft(m.buaActual) },
        { label: 'BUA_reference', value: m.buaReference === null ? '— (no plan / permissible BUA)' : `${sqft(m.buaReference)} (${m.deviationReference})` },
        ...(m.buaActualInclTemporary !== m.buaActual && m.buaDeviationPctInclTemporary !== null
          ? [{ label: 'Incl. tin shed / temporary', value: `${sqft(m.buaActualInclTemporary)} → ${formatPctTrunc(m.buaDeviationPctInclTemporary)}` }]
          : []),
      ],
      sources: ['Sanctioned / permissible floor areas (plan OCR)', 'Phone scan + footprint × floors cross-check'],
      engine: 'Engine 1 MEASURE §3.2 (Formula 3)',
    },
    {
      key: 'buaValued',
      title: 'BUA Considered for Valuation',
      value: sqft(m.buaValued),
      formula:
        m.buaBasis === 'MIN_ACTUAL_SANCTIONED'
          ? 'BUA_valued = min(BUA_actual, BUA_sanctioned)'
          : m.buaBasis === 'LAND_ONLY'
            ? 'BUA_valued = 0   (no plan & Land-Only policy)'
            : 'BUA_valued = BUA_actual   (no plan & institutional exception, MISSING_PLAN_FLAG)',
      inputs: [
        { label: 'BUA_actual', value: sqft(m.buaActual) },
        { label: 'BUA_sanctioned', value: sqft(m.buaSanctioned) },
        { label: 'Plan policy', value: c.noPlanPolicy },
      ],
      sources: ['Bank plan policy rule'],
      engine: 'Engine 1 MEASURE §3.2 (Formula 4)',
    },
    {
      key: 'consensus',
      title: 'PRAMAAN Consensus Land Rate',
      value: rate(p.rConsensus),
      formula: 'R_consensus = Σ (w_i × r_i_corr),  Σ w_i = 1.0   |   Range = R × (1 ± weighted_cv)',
      inputs: [
        ...p.activeSources.map((s) => ({
          label: `${s.label} (w ${pct(s.normalizedWeight, 0)})`,
          value: `${rate(s.correctedRatePerSqft)} → ${rate(s.contribution)}`,
        })),
        { label: 'Range', value: `${rate(p.rLow)} – ${rate(p.rHigh)} (weighted CV ${pct(p.weightedCv)})` },
        { label: 'Adopted (nearest Rs. 10)', value: rate(v.rConsensusRounded) },
      ],
      sources: ['IGR deeds via ULI', 'Licensed listing feeds (de-duplicated)', 'IDFC valuation archive', 'SARFAESI auction results'],
      engine: 'Engine 2 PRICE §3.3 (Formula 1)',
    },
    {
      key: 'score',
      title: 'Authenticity Score S',
      value: `${a.score}/100`,
      formula: 'S = round(agreement + depth + recency + spatial_typicality)',
      inputs: [
        { label: 'Agreement (/35)', value: `${a.agreement.toFixed(2)} — CV ${pct(a.cv)}` },
        { label: 'Comps depth (/25)', value: `${a.depth} — n = ${a.nComps}` },
        { label: 'Recency (/20)', value: `${a.recency.toFixed(2)} — median age ${a.medianAgeMonths} months` },
        { label: 'Spatial typicality (/20)', value: `${a.spatialTypicality} — ${SPATIAL_TIER_LABEL[c.spatialFallbackTier]}${c.isTypicalProperty ? '' : ', −4 non-standard'}` },
        { label: 'Instant threshold', value: `S >= ${p.instantThreshold}` },
      ],
      sources: ['lib/engines/price.ts → authenticityScore()'],
      engine: 'Engine 2 PRICE §3.3 (Formula 4)',
    },
    {
      key: 'circleGap',
      title: 'Circle / Guideline Rate Gap',
      value: p.circleGapMultiple === null ? 'Not stated' : `${p.circleGapMultiple.toFixed(2)}×`,
      formula: 'gap = R_consensus / circle_rate ;  flag if R_consensus < circle_rate',
      inputs: [
        { label: 'R_consensus', value: rate(p.rConsensus) },
        { label: 'Circle rate', value: c.circleRatePerSqft ? rate(c.circleRatePerSqft) : (c.origin === 'SEED' ? 'Not stated in source report' : 'Not found in market evidence') },
      ],
      sources: ['State SRO guideline value (weight 0% — floor sanity check only)'],
      engine: 'Engine 2 PRICE §3.3',
    },
  ];

  if (v.income) {
    out.push(
      {
        key: 'grossYield',
        title: 'Gross Rental Yield',
        value: `${v.income.grossYieldPct.toFixed(2)}%`,
        formula: 'Gross_Yield% = (Monthly_Rent × 12 / MV_primary) × 100',
        inputs: [
          { label: 'Monthly rent', value: formatInr(c.monthlyRentInr ?? 0) },
          { label: 'Annual rent', value: formatInr(v.income.annualRent) },
          { label: 'MV_primary', value: formatInr(v.mvPrimary) },
        ],
        sources: ['Registered lease deed (OCR)'],
        engine: 'Valuation §3.5 (Method 3)',
      },
      {
        key: 'mvIncome',
        title: 'Income Capitalisation Value',
        value: formatInr(v.income.mvIncome),
        formula: 'MV_income = Annual_Rent × (1 − outgoings) / Cap_Rate ;  flag if |MV − MV_income| / MV > 15%',
        inputs: [
          { label: 'Annual rent', value: formatInr(v.income.annualRent) },
          { label: 'Outgoings', value: pct(v.income.outgoingsPct, 0) },
          { label: 'Cap rate', value: pct(c.capRate ?? 0, 1) },
          { label: 'Variance vs MV', value: `${v.income.variancePct.toFixed(2)}% → ${v.income.yieldGuardrailFlag ? 'FLAG' : 'within 15%'}` },
        ],
        sources: ['Registered lease deed (OCR)', 'Commercial cap-rate band'],
        engine: 'Valuation §3.5 (Method 3)',
      },
    );
  }

  const byKey: Record<string, Evidence> = {};
  for (const ev of out) byKey[ev.key] = ev;
  for (const s of c.priceSources) byKey[`src:${s.id}`] = sourceEvidence(s, liveUrls(c, s.id));
  if (c.liveEvidence && byKey.consensus) {
    const le = c.liveEvidence;
    byKey.consensus.sources = [
      `Live evidence snapshot (${le.mode.replace('_', ' ').toLowerCase()}) fetched ${new Date(le.fetchedAt).toLocaleString('en-IN')}${le.model ? ` via ${le.model} + Google Search grounding` : ''}`,
      ...(le.queries.length ? [`Searches: ${le.queries.join(' | ')}`] : []),
      ...le.citations.slice(0, 8).map((x) => x.uri),
    ];
  }
  return byKey;
}

/** Source URLs of included live / manual data points feeding a given price source. */
function liveUrls(c: PropertyCase, id: PriceSourceInput['id']): string[] {
  if (!c.liveEvidence) return [];
  return c.liveEvidence.points.filter((p) => p.included && p.url && KIND_TO_SOURCE[p.kind] === id).map((p) => p.url!).slice(0, 10);
}

function sourceEvidence(s: PriceSourceInput, urls: string[] = []): Evidence {
  return {
    key: `src:${s.id}`,
    title: `${s.label} — corrected rate`,
    value: rate(s.correctedRatePerSqft),
    formula: s.correctionFormulaLabel,
    inputs: [
      { label: 'Raw rate', value: rate(s.rawRatePerSqft) },
      { label: 'Correction factor', value: s.id === 'RERA_BUILDER' ? '− net offer value' : `× ${s.correctionFactor}` },
      { label: 'Comps (n)', value: `${s.count}` },
      { label: 'Median age', value: `${s.medianAgeMonths} months` },
      { label: 'Weight', value: pct(s.weight, 0) },
    ],
    sources: [s.label, ...urls],
    engine: 'Engine 2 PRICE §3.3 bias correction',
  };
}
