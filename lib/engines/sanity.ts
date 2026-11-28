/* ------------------------------------------------------------------
   Technical checks / sanity remarks (PRD_V3 §7) — pure.
   Each check: PASS | WARN | BLOCKER | PENDING, with the action that clears it.
   ------------------------------------------------------------------ */
import type { Application, DocSlot } from '@/lib/domain/types';
import { isBuilt, isUnit, USAGE_LABEL } from '@/lib/domain/catalog';
import { VALUATION as V } from '@/config/valuation';
import { registrationCheck, type EvidenceResult } from './evidence';
import type { FinalRates } from './purchase';
import type { GeofenceResult } from './geofence';
import { MIN_EXTERIOR_SNAPSHOTS } from './geofence';
import type { MeasureResult } from './measure';
import { PLOT_AREA_TOLERANCE_PCT } from './measure';
import type { ValuationResult } from './valuation';
import { LTV_CAP } from './valuation';

export type CheckStatus = 'PASS' | 'WARN' | 'BLOCKER' | 'PENDING';

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  finding: string;
  action?: string;
}

export const TITLE_CHAIN_YEARS = 13;
export const BUA_WARN_PCT = 10;
export const BUA_BLOCK_PCT = 30;
export const FSI_BLOCK_OVER_PCT = 10;
export const MIN_SCORE = V.t13.minScore;
export const MIN_RESIDUAL_LIFE = 20;

export type Verdict = 'REFER' | 'IN_PROGRESS' | 'CONDITIONS' | 'CLEAR';
export const VERDICT_LABEL: Record<Verdict, string> = {
  REFER: 'Refer — resolve before sanction',
  IN_PROGRESS: 'In progress',
  CONDITIONS: 'Clear with conditions',
  CLEAR: 'Clear',
};

const slot = (a: Application, key: string): DocSlot | undefined => a.documents.find((d) => d.key === key);
const docState = (d?: DocSlot) => (!d ? 'NA' : d.status === 'VERIFIED' ? 'VERIFIED' : d.files.length ? (d.status === 'REJECTED' ? 'REJECTED' : 'RECEIVED') : 'MISSING');

export interface SanityResult {
  checks: Check[];
  blockers: number;
  warnings: number;
  pending: number;
  passed: number;
  verdict: Verdict;
}

const inrN = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function runSanity(a: Application, m: MeasureResult, g: GeofenceResult, ev: EvidenceResult, v: ValuationResult, now: Date, rates?: FinalRates): SanityResult {
  const c: Check[] = [];
  const built = isBuilt(a.property.type);

  // T1 sale deed
  const deed = docState(slot(a, 'SALE_DEED'));
  c.push({
    id: 'T1',
    title: 'Registered sale deed',
    status: deed === 'VERIFIED' ? 'PASS' : deed === 'MISSING' || deed === 'REJECTED' ? 'BLOCKER' : 'PENDING',
    finding: deed === 'VERIFIED' ? 'Sale deed received and verified.' : deed === 'RECEIVED' ? 'Sale deed received — awaiting verification.' : deed === 'REJECTED' ? 'Sale deed rejected.' : 'Sale deed not on file.',
    action: deed === 'VERIFIED' ? undefined : deed === 'RECEIVED' ? 'Verify the deed in Identification → Documents.' : 'Upload the registered sale deed from the loan file.',
  });

  // T2 title chain
  const chain = docState(slot(a, 'TITLE_CHAIN'));
  const from = a.title.chainFromYear;
  const years = from ? now.getFullYear() - from : null;
  c.push({
    id: 'T2',
    title: `Title chain (${TITLE_CHAIN_YEARS} years)`,
    status: chain === 'MISSING' || chain === 'REJECTED' ? 'WARN' : years === null ? 'PENDING' : years >= TITLE_CHAIN_YEARS && chain === 'VERIFIED' ? 'PASS' : years < TITLE_CHAIN_YEARS ? 'WARN' : 'PENDING',
    finding:
      chain === 'MISSING' ? 'No chain documents on file.' : years === null ? 'Chain documents on file — start year not recorded.' : `Chain traced from ${from} (${years} years)${years < TITLE_CHAIN_YEARS ? ` — short of ${TITLE_CHAIN_YEARS} years` : ''}.`,
    action:
      chain === 'MISSING' ? 'Collect previous deeds back to at least ' + (now.getFullYear() - TITLE_CHAIN_YEARS) + '.' : years === null ? 'Record the year the chain starts from (Identification → Title).' : years < TITLE_CHAIN_YEARS ? 'Collect earlier link documents.' : chain !== 'VERIFIED' ? 'Verify the chain documents.' : undefined,
  });

  // T3 approved plan / layout
  const planKey = built ? 'APPROVED_PLAN' : 'LAYOUT_PLAN';
  const plan = docState(slot(a, planKey));
  const planName = built ? 'Approved building plan' : 'Approved layout plan';
  c.push({
    id: 'T3',
    title: planName,
    status: plan === 'VERIFIED' ? 'PASS' : plan === 'RECEIVED' ? 'PENDING' : 'BLOCKER',
    finding: plan === 'VERIFIED' ? `${planName} verified${a.plan.planRef ? ` (${a.plan.planRef}${a.plan.authority ? `, ${a.plan.authority}` : ''})` : ''}.` : plan === 'RECEIVED' ? `${planName} received — awaiting verification.` : `${planName} not on file. Only an approved structure can be mortgaged.`,
    action: plan === 'VERIFIED' ? undefined : plan === 'RECEIVED' ? 'Verify the plan and enter its approved area / floors / FSI.' : 'Obtain the approved plan from the customer or the authority.',
  });

  // T4 EC
  const ec = docState(slot(a, 'EC'));
  c.push({
    id: 'T4',
    title: 'Encumbrance certificate',
    status: ec === 'VERIFIED' ? 'PASS' : ec === 'RECEIVED' ? 'PENDING' : 'WARN',
    finding: ec === 'VERIFIED' ? 'EC verified — no undisclosed charge.' : ec === 'RECEIVED' ? 'EC received — awaiting verification.' : 'EC not on file.',
    action: ec === 'VERIFIED' ? undefined : ec === 'RECEIVED' ? 'Verify the EC.' : 'Obtain a 13-year EC from the sub-registrar (condition to disbursal).',
  });

  // T5 snapshots at the property
  c.push({
    id: 'T5',
    title: 'Photos taken at the pledged property',
    status: g.status === 'PASS' ? 'PASS' : g.status === 'FAIL' ? 'BLOCKER' : g.status === 'WARN' ? 'WARN' : 'PENDING',
    finding: a.property.lat === null ? 'Property pin not set.' : g.summary,
    action:
      g.status === 'PASS' ? undefined : g.status === 'FAIL' ? 'Snapshots were taken away from the property — re-do the video inspection at the site.' : g.status === 'NO_CAPTURE' ? 'Call the customer and capture the exterior and each floor.' : `Capture at least ${MIN_EXTERIOR_SNAPSHOTS} exterior views inside the fence; re-take any marked "near".`,
  });

  // T6 plot area
  if (m.deedPlotSqft !== null || m.satellitePlotSqft !== null) {
    const pv = m.plotVariancePct;
    c.push({
      id: 'T6',
      title: 'Plot area — deed vs satellite',
      status: pv === null ? 'PENDING' : Math.abs(pv) <= PLOT_AREA_TOLERANCE_PCT ? 'PASS' : 'WARN',
      finding: pv === null ? (m.satellitePlotSqft ? 'Deed area not entered.' : 'Plot boundary not drawn on the satellite map yet.') : `Deed ${Math.round(m.deedPlotSqft!)} sqft vs satellite ${Math.round(m.satellitePlotSqft!)} sqft (${pv > 0 ? '+' : ''}${pv.toFixed(1)}%). Lower area is used.`,
      action: pv === null ? 'Draw the plot boundary in Identification → Location.' : Math.abs(pv) > PLOT_AREA_TOLERANCE_PCT ? 'Check demarcation / encroachment; confirm with the land record.' : undefined,
    });
  }

  if (built) {
    // T7 BUA vs approved
    const dev = m.deviationPct;
    c.push({
      id: 'T7',
      title: 'Built-up area vs approved plan',
      status: !m.approvedBuaSqft || !m.actualBuaSqft ? 'PENDING' : dev! <= BUA_WARN_PCT ? 'PASS' : dev! <= BUA_BLOCK_PCT ? 'WARN' : 'BLOCKER',
      finding: !m.approvedBuaSqft
        ? 'Approved built-up area not entered.'
        : !m.actualBuaSqft
          ? 'Actual built-up area not known yet (enter the floor-wise areas from the floor plan).'
          : `${m.actualBuaBasis === 'FLOOR_PLAN' ? 'Floor plan' : 'Declared'} ${Math.round(m.actualBuaSqft)} sqft vs approved ${Math.round(m.approvedBuaSqft)} sqft (${dev! > 0 ? '+' : ''}${dev!.toFixed(1)}%).`,
      action: !m.approvedBuaSqft
        ? 'Enter the approved BUA from the plan.'
        : !m.actualBuaSqft
          ? 'Enter the floor-wise areas from the floor plan (Inspection & measurement).'
          : dev! > BUA_BLOCK_PCT
            ? 'Deviation beyond 30% — demolition / regularisation risk. Obtain regularisation or refer for physical inspection.'
            : dev! > BUA_WARN_PCT
              ? 'Only the approved area is valued. Record the deviation as a remark.'
              : undefined,
    });

    // T23 floor-plan area vs the satellite top view × floors (units: vs the deed area).
    const unitT = isUnit(a.property.type);
    const cf = m.confidence;
    const sq = (n: number) => `${Math.round(n).toLocaleString('en-IN')} sqft`;
    const vs = unitT ? `deed ${m.declaredBuaSqft ? sq(m.declaredBuaSqft) : '—'}` : `satellite ${m.satelliteBuaSqft ? sq(m.satelliteBuaSqft) : '—'} (roof ${m.footprintSqft ? sq(m.footprintSqft) : '—'} × ${m.floorsForCheck ?? '?'} floor(s) ${m.floorsBasis === 'OBSERVED' ? 'seen on the call' : m.floorsBasis === 'DECLARED' ? 'declared' : 'on the plan'})`;
    const d = m.areaDeltaPct;
    c.push({
      id: 'T23',
      title: unitT ? 'Floor-plan area vs deed area' : 'Floor-plan area vs satellite top view',
      status: !m.planBuaSqft || !cf ? 'PENDING' : cf.total >= V.floorArea.pass ? 'PASS' : cf.total >= V.floorArea.warn ? 'WARN' : 'BLOCKER',
      finding: !m.planBuaSqft
        ? 'Floor-wise areas from the floor plan not entered yet.'
        : !cf
          ? unitT
            ? 'Deed built-up area not entered — nothing to check the plan against.'
            : 'Roof outline not drawn on the satellite top view yet.'
          : `Plan ${sq(m.planBuaSqft)} vs ${vs}: ${d! > 0 ? '+' : ''}${d!.toFixed(1)}%. Confidence ${cf.total}/100 (agreement ${cf.agreement.toFixed(0)}, floors ${cf.floors}, source ${cf.source}).${!unitT && d! < -10 ? ' More is built than the plan shows — possible extension beyond the plan.' : !unitT && d! > 10 ? ' The plan shows more area than is visible from above.' : ''}`,
      action: !m.planBuaSqft
        ? 'Enter each floor’s area from the floor plan (government copy or customer upload).'
        : !cf
          ? unitT
            ? 'Enter the built-up area from the deed (Identification → Facts).'
            : 'Draw the building’s roof outline on the satellite image (Inspection & measurement).'
          : cf.total < V.floorArea.warn
            ? 'Plan and top view disagree strongly — refer for physical measurement before sanction.'
            : cf.total < V.floorArea.pass
              ? 'Confirm the floor count and any extensions on the video call; verify the floor plan document.'
              : undefined,
    });

    // T8 floors
    const fo = a.inspection.observedFloors;
    const fa = a.plan.approvedFloors;
    c.push({
      id: 'T8',
      title: 'Floors vs approved floors',
      status: fo === null || fa === null ? 'PENDING' : fo > fa ? 'BLOCKER' : 'PASS',
      finding: fo === null ? 'Floors seen on the video call not recorded.' : fa === null ? 'Approved number of floors not entered.' : `${fo} floor(s) seen vs ${fa} approved.${fo > fa ? ' Unauthorised floor(s).' : ''}`,
      action: fo === null ? 'Record the floors seen during the call.' : fa === null ? 'Enter the approved floors from the plan.' : fo > fa ? 'Unapproved floor — exclude from security, obtain regularisation, or refer.' : undefined,
    });

    // T9 FSI
    if (m.fsiActual !== null || a.plan.permissibleFsi) {
      const over = m.fsiActual && m.fsiPermissible ? ((m.fsiActual - m.fsiPermissible) / m.fsiPermissible) * 100 : null;
      c.push({
        id: 'T9',
        title: 'FSI / FAR',
        status: over === null ? 'PENDING' : over <= 0 ? 'PASS' : over <= FSI_BLOCK_OVER_PCT ? 'WARN' : 'BLOCKER',
        finding: over === null ? 'Permissible FSI or actual FSI not available yet.' : `Actual FSI ${m.fsiActual!.toFixed(2)} vs permissible ${m.fsiPermissible!.toFixed(2)}${over > 0 ? ` (${over.toFixed(1)}% over)` : ''}.`,
        action: over === null ? 'Enter permissible FSI from the plan / bye-laws.' : over > 0 ? 'FSI exceeded — confirm regularisation with the authority.' : undefined,
      });
    }
  }

  // T10, T11 manual attestations
  const att = (key: 'DEMOLITION_LIST' | 'ROAD_WIDENING', id: string, title: string, what: string) => {
    const x = a.attestations[key];
    c.push({
      id,
      title,
      status: !x ? 'PENDING' : x.ok ? 'PASS' : 'BLOCKER',
      finding: !x ? `No public data source connected — ${what} must be confirmed by the bank.` : `${x.ok ? 'Confirmed clear' : 'Affected'} — ${x.note || 'no note'} (${x.by}, ${new Date(x.at).toLocaleDateString('en-IN')}).`,
      action: !x ? 'Check with the local authority and record the result in Technical checks.' : x.ok ? undefined : 'Property affected — refer to credit / legal.',
    });
  };
  att('DEMOLITION_LIST', 'T10', 'Demolition / unauthorised-construction list', 'presence on the municipal demolition list');
  att('ROAD_WIDENING', 'T11', 'Master-plan road widening / setback', 'any proposed road widening or setback');

  // T12 usage
  if (built) {
    const ob = a.inspection.observedUsage;
    c.push({
      id: 'T12',
      title: 'Usage — declared vs seen',
      status: !ob ? 'PENDING' : ob === a.property.usage ? 'PASS' : 'WARN',
      finding: !ob ? `Declared ${USAGE_LABEL[a.property.usage]}; usage seen on the call not recorded.` : ob === a.property.usage ? `${USAGE_LABEL[ob]} — matches the declaration.` : `Declared ${USAGE_LABEL[a.property.usage]} but seen ${USAGE_LABEL[ob]}. LTV capped at ${Math.round(Math.min(LTV_CAP[ob], LTV_CAP[a.property.usage]) * 100)}%.`,
      action: !ob ? 'Record the usage seen during the call.' : ob !== a.property.usage ? 'Confirm usage with tax receipt / electricity tariff.' : undefined,
    });
  }

  // T13 market evidence depth (v2): score >= 60 and n_eff >= 3 pass; thin market or u / R above 25% blocks.
  const unit = isUnit(a.property.type);
  const primary = unit ? ev.built : ev.land;
  const pf = rates ? (unit ? rates.BUILT : rates.LAND) : null;
  const pu = pf?.u ?? primary?.u ?? 0;
  const t13: Check['status'] = !primary ? 'PENDING' : primary.nEffT1T2 < V.t13.blockNeffT1T2 || pu > V.t13.blockU ? 'BLOCKER' : primary.score.total < V.t13.minScore || primary.nEff < V.t13.minNeff ? 'WARN' : 'PASS';
  c.push({
    id: 'T13',
    title: 'Market evidence depth',
    status: t13,
    finding: !primary
      ? 'No market evidence applied yet.'
      : `${primary.n} point(s), n_eff ${primary.nEff.toFixed(1)} (T1 + T2: ${primary.nEffT1T2.toFixed(1)}); u ${(pu * 100).toFixed(1)}% of the rate; Authenticity Score ${primary.score.total}/100.${primary.thinMarket ? ' Thin market.' : ''}`,
    action: !primary
      ? 'Fetch market evidence around the property (Valuation tab).'
      : t13 === 'BLOCKER'
        ? 'Too little local evidence or too wide a range — physical inspection / valuer check before sanction.'
        : t13 === 'WARN'
          ? 'Add registered sales (Index II / EC) or listings in the same locality.'
          : undefined,
  });

  // T14 guideline-rate floor: the market rate (before any floor) vs the government value.
  const gv = unit ? ev.guidelines.BUILT : ev.guidelines.LAND;
  const marketRate = pf ? pf.blended : primary?.rawRate;
  if (gv && marketRate) {
    const src = gv.official ? `official ${gv.ref?.basis === 'APARTMENT' ? 'apartment' : 'land'} value (IGRS Telangana, ${gv.ref?.locality ?? ''})` : 'guideline rate from web search';
    c.push({
      id: 'T14',
      title: 'Guideline-rate floor',
      status: marketRate >= gv.rate ? 'PASS' : 'WARN',
      finding: `${unit ? 'Built' : 'Land'} rate ${inrN(marketRate)}/sqft vs ${src} ${inrN(gv.rate)}/sqft (${(marketRate / gv.rate).toFixed(2)}×).${pf?.floorApplied ? ' Floor applied: the government value is used.' : ''}`,
      action: marketRate < gv.rate ? (gv.official ? 'Market evidence reads below the government value — re-check comparables; the value is held at the floor.' : 'Market rate below the government guideline — re-check comparables.') : undefined,
    });
  }

  // T18 local premium: the same-locality rate differs from the wider rate while local evidence is thin.
  if (primary?.local && primary.nEffT1 < V.localPremium.maxNeffT1) {
    const ratio = primary.local.rate / primary.all.rate;
    const off = ratio < V.localPremium.min || ratio > V.localPremium.max;
    c.push({
      id: 'T18',
      title: 'Local premium',
      status: off ? 'WARN' : 'PASS',
      finding: `Same-locality rate ${inrN(primary.local.rate)} vs all tiers ${inrN(primary.all.rate)} (${ratio.toFixed(2)}×) with n_eff(T1) ${primary.nEffT1.toFixed(1)}.`,
      action: off ? 'Few local points disagree with the wider area — confirm the locality premium / discount with a registered sale.' : undefined,
    });
  }

  // T15 residual life
  if (built && v.residualLife !== null) {
    c.push({
      id: 'T15',
      title: 'Residual life of the building',
      status: v.residualLife >= MIN_RESIDUAL_LIFE ? 'PASS' : 'WARN',
      finding: `${v.residualLife} years (economic life ${v.totalLife} − age ${a.property.ageYears}).`,
      action: v.residualLife < MIN_RESIDUAL_LIFE ? `Below ${MIN_RESIDUAL_LIFE} years — restrict loan tenure to the residual life.` : undefined,
    });
  }

  // T17 registered sales: consideration vs government value on the same deed
  const rc = registrationCheck(ev.assessed);
  if (rc.compared) {
    const worst = rc.below.reduce<(typeof rc.below)[number] | null>((w, x) => (!w || x.ratio < w.ratio ? x : w), null);
    c.push({
      id: 'T17',
      title: 'Registered sales vs government value',
      status: rc.below.length ? 'WARN' : 'PASS',
      finding:
        (rc.below.length
          ? `${rc.below.length} of ${rc.compared} registered sale(s) declare a price below the government value on the deed (lowest ${Math.round(worst!.ratio * 100)}%: ${worst!.title}).`
          : `None of the ${rc.compared} registered sale(s) declares a price below the government value.`) + ` ${rc.atGuideline} of ${rc.compared} declared at the government value (±${V.atGuidelineBand * 100}%) — kept out of the rate.`,
      action: rc.below.length ? 'Possible under-declaration — confirm these sales or exclude them from the rate.' : undefined,
    });
  }

  // T20 customer's claimed value (cross-check only).
  const claim = a.ownership?.claimedValueInr;
  if (claim && v.mv) {
    const gap = (claim - v.mv) / v.mv;
    c.push({
      id: 'T20',
      title: "Customer's claimed value",
      status: gap > V.claimGapWarn ? 'WARN' : 'PASS',
      finding: `Claimed ${inrN(claim)} vs MV ${inrN(v.mv)} (${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(0)}%). Never used in the value.`,
      action: gap > V.claimGapWarn ? 'Claim well above the valuation — the customer may overstate, or comparables missed a feature (main-road frontage, corner plot). Underwriter to review.' : undefined,
    });
  }

  // T21 own purchase price, indexed, vs the market rate.
  const pc = rates?.purchase;
  const pcf = pc?.applicable && pc.category ? rates![pc.category] : null;
  if (pc?.applicable && pcf && pcf.divergence !== null) {
    const off = pcf.divergence > V.purchase.divergenceWarn;
    c.push({
      id: 'T21',
      title: 'Own purchase price, indexed',
      status: off ? 'WARN' : 'PASS',
      finding: `Purchase price brought to today ${inrN(pc.rate)}/sqft vs market ${inrN(pcf.market.rawRate)}/sqft (${(pcf.divergence * 100).toFixed(0)}% apart); weight in the rate ${(pcf.wPurchase * 100).toFixed(0)}%.`,
      action: off ? 'Declared price and listings disagree by more than 30% — check the sale deed, or what the listings missed.' : undefined,
    });
  } else if (pc && !pc.applicable) {
    c.push({ id: 'T21', title: 'Own purchase price, indexed', status: 'PENDING', finding: pc.reason ?? 'Purchase price incomplete.', action: 'Complete the purchase details (Identification → Facts).' });
  }

  // T16 rejected documents
  const rejected = a.documents.filter((d) => d.status === 'REJECTED');
  if (rejected.length) {
    c.push({ id: 'T16', title: 'Rejected documents', status: 'WARN', finding: rejected.map((d) => `${d.label}: ${d.remark || 'rejected'}`).join(' · '), action: 'Awaiting re-upload from the customer / sales team.' });
  }

  const blockers = c.filter((x) => x.status === 'BLOCKER').length;
  const warnings = c.filter((x) => x.status === 'WARN').length;
  const pending = c.filter((x) => x.status === 'PENDING').length;
  const passed = c.filter((x) => x.status === 'PASS').length;
  const verdict: Verdict = blockers ? 'REFER' : pending ? 'IN_PROGRESS' : warnings ? 'CONDITIONS' : 'CLEAR';
  return { checks: c, blockers, warnings, pending, passed, verdict };
}
