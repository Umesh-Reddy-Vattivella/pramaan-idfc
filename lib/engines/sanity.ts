/* ------------------------------------------------------------------
   Technical Sanity Engine — pre-empts the "technical remarks" that today
   arrive in the valuer's report and then take days to clear with the
   customer (FSI exceeded, demolition list, no demarcation, layout ≠ site,
   road widening, title gaps …). Each check states its data source and the
   action that clears it UPFRONT. Pure, deterministic functions only.

   Valuation route (Instant / Remote / Physical) and mortgageability are
   separate answers: a property can be valued yet not be acceptable as
   security until its remarks are cleared.
   ------------------------------------------------------------------ */
import type { LosDocument, PropertyCase } from '@/lib/types';
import type { MeasureResult } from './measure';
import type { UsageResult } from './usage';
import type { GeofenceResult } from './geofence';
import { haversineMeters } from './trust';
import { formatPctTrunc } from './valuation';

export type SanityStatus = 'PASS' | 'WARN' | 'FAIL' | 'BLOCKER' | 'PENDING';
export type SanityPillar = 'IDENTIFICATION' | 'MEASUREMENT' | 'LEGAL_COMPLIANCE';

export interface SanitySource {
  name: string;
  live: boolean;
}

export interface SanityCheck {
  id: string;
  pillar: SanityPillar;
  title: string;
  status: SanityStatus;
  finding: string;
  sources: SanitySource[];
  /** What the bank / sales team should do now, before sanction. */
  action: string;
  /** The remark a manual valuer would typically write for this issue. */
  typicalRemark: string;
}

export type SanityVerdict = 'TECHNICALLY_CLEAR' | 'SANCTION_WITH_CONDITIONS' | 'CLEAR_BEFORE_SANCTION' | 'NOT_MORTGAGEABLE';

export const VERDICT_META: Record<SanityVerdict, { label: string; tone: 'instant' | 'remote' | 'critical' }> = {
  TECHNICALLY_CLEAR: { label: 'Technically clear', tone: 'instant' },
  SANCTION_WITH_CONDITIONS: { label: 'Clear with conditions', tone: 'remote' },
  CLEAR_BEFORE_SANCTION: { label: 'Clear remarks before sanction', tone: 'critical' },
  NOT_MORTGAGEABLE: { label: 'Not mortgageable until cleared', tone: 'critical' },
};

export interface SanityResult {
  checks: SanityCheck[];
  counts: Record<SanityStatus, number>;
  verdict: SanityVerdict;
  verdictLabel: string;
  /** Actions to send to the customer / sales right now, in priority order. */
  actionList: string[];
}

export interface DemolitionNoticeInput {
  id: string;
  authority: string;
  lat: number;
  lng: number;
  noticeDate: string;
  reason: string;
}

export interface RoomsVsPlanInput {
  rows: { floorName: string; carpetSqft: number; impliedBuaSqft: number; approvedSqft: number; excessPct: number | null; exceeds: boolean }[];
  totalCarpetSqft: number;
  anyExceeds: boolean;
}

export interface SanityInput {
  c: PropertyCase;
  measure: MeasureResult;
  usage: UsageResult;
  survey: { deedNotInPatta: string[]; pattaNotInDeed: string[]; remarkUnknown: string[]; hasMismatch: boolean };
  documents: LosDocument[];
  geofence: GeofenceResult | null;
  rooms: RoomsVsPlanInput | null;
  notices: DemolitionNoticeInput[];
  currentYear: number;
  sources: Record<
    'LOS' | 'OCR' | 'CAPTURE' | 'ROOMS' | 'BHULEKH' | 'SRO' | 'ULB_NOTICES' | 'DP_PLAN' | 'DCR' | 'GIS' | 'SATELLITE' | 'ZONING',
    SanitySource
  >;
}

/** Construction tolerance on approved FSI before it is a remark. */
export const FSI_TOLERANCE_PCT = 5;
/** Deviation up to this is typically compoundable / regularisable. */
export const FSI_COMPOUNDABLE_PCT = 15;
export const TITLE_CHAIN_YEARS = 13;
export const PLAN_GEO_TAG_MAX_OFFSET_M = 25;
export const DEMOLITION_MATCH_RADIUS_M = 30;

const isAvail = (d?: LosDocument) => !!d && (d.status === 'ON_FILE' || d.status === 'UPLOADED');
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

export function runSanity(i: SanityInput): SanityResult {
  const { c, measure: m, usage: u, documents, sources: S } = i;
  const docOf = (t: LosDocument['type']) => documents.find((d) => d.type === t);
  const checks: SanityCheck[] = [];
  const plan = docOf('APPROVED_PLAN');
  const hasPlan = isAvail(plan);

  /* ---------- IDENTIFICATION ---------- */

  // S1 — Captured at the pledged property (geo-fence, replaces KYC)
  {
    const g = i.geofence;
    let status: SanityStatus;
    let finding: string;
    if (g && g.status !== 'NO_CAPTURE') {
      status = g.status === 'PASS' ? 'PASS' : g.status === 'WARN' ? 'WARN' : 'FAIL';
      finding = g.summary;
    } else if (c.trustChecks.gpsInParcel) {
      status = 'PASS';
      finding = 'Live capture coordinates inside the parcel polygon / within 25 m of the property pin.';
    } else {
      status = 'PENDING';
      finding = 'Awaiting geo-tagged photos from the customer link.';
    }
    checks.push({
      id: 'S1',
      pillar: 'IDENTIFICATION',
      title: 'Photos taken at the pledged property (geo-fence)',
      status,
      finding,
      sources: [S.CAPTURE, S.LOS, S.SATELLITE],
      action:
        status === 'PASS' ? 'None.' : status === 'PENDING' ? 'Send / remind the customer valuation link.' : 'Ask the customer (or anyone on their behalf) to re-shoot the flagged photos standing at the property.',
      typicalRemark: 'Property identified by the owner / neighbours; photos attached.',
    });
  }

  // S2 — Survey / khasra consistency across deed, land record and remarks
  {
    const s = i.survey;
    const hasRecord = (c.surveyPattaNumbers ?? []).length > 0;
    const status: SanityStatus = s.hasMismatch ? 'FAIL' : hasRecord ? 'PASS' : 'PENDING';
    const finding = s.hasMismatch
      ? [
          (s.deedNotInPatta.length || s.pattaNotInDeed.length) && `Sale deed [${(c.surveyDeedNumbers ?? []).join(', ')}] ≠ land record [${(c.surveyPattaNumbers ?? []).join(', ')}].`,
          s.remarkUnknown.length && `Report cites ${s.remarkUnknown.join(', ')} — not in any document.`,
        ]
          .filter(Boolean)
          .join(' ')
      : hasRecord
        ? `Survey no(s). ${(c.surveyPattaNumbers ?? []).join(', ')} match across sale deed and land record.`
        : 'Land-record survey numbers not yet fetched — pull from the state land-record portal.';
    checks.push({
      id: 'S2',
      pillar: 'IDENTIFICATION',
      title: 'Survey / khasra numbers match across documents',
      status,
      finding,
      sources: [S.OCR, S.BHULEKH],
      action: s.hasMismatch ? 'Obtain a Rectification Deed / corrected revenue entry before sanction.' : status === 'PENDING' ? 'Fetch the land record (Bhulekh / Mahabhumi / Tamil Nilam) by survey no.' : 'None.',
      typicalRemark: 'Survey numbers as per documents; legal to verify.',
    });
  }

  // S3 — Plot area triangulation (deed vs land record)
  {
    const rec = m.areaReconciliation;
    const deed = c.deedPlotAreaSqft;
    const record = c.cadastralPlotAreaSqft;
    const diffPct = deed > 0 ? (Math.abs(deed - record) / deed) * 100 : 0;
    const status: SanityStatus = rec.areaVarianceFlag ? 'FAIL' : 'PASS';
    checks.push({
      id: 'S3',
      pillar: 'IDENTIFICATION',
      title: 'Plot area: sale deed vs land record',
      status,
      finding:
        deed === record
          ? `Deed and land record agree at ${fmt(deed)} sqft.`
          : `Deed ${fmt(deed)} sqft vs land record ${fmt(record)} sqft (${diffPct.toFixed(1)}% apart) — the lower area is valued.`,
      sources: [S.OCR, S.BHULEKH, S.SATELLITE],
      action: rec.areaVarianceFlag ? 'Area differs by > 10% — get a revenue survey / demarcation and a rectification deed.' : 'None — least area adopted.',
      typicalRemark: 'Plot area as per documents; site area differs.',
    });
  }

  // S4 — Boundaries / demarcation
  {
    const b = m.boundaries;
    const mis = m.boundaryMismatches;
    const status: SanityStatus = b.length === 0 ? 'WARN' : mis.length ? 'FAIL' : 'PASS';
    checks.push({
      id: 'S4',
      pillar: 'IDENTIFICATION',
      title: 'Boundaries / demarcation (deed vs site)',
      status,
      finding:
        b.length === 0
          ? 'Four-side boundaries not recorded for comparison — property demarcation unconfirmed.'
          : mis.length
            ? `${mis.length} side(s) differ: ${mis.map((x) => `${x.direction} — deed "${x.asPerDeed}" vs site "${x.atSiteSatellite}"`).join('; ')}.`
            : 'All four boundaries in the deed match the satellite / site photos.',
      sources: [S.OCR, S.SATELLITE, S.CAPTURE],
      action: status === 'PASS' ? 'None.' : status === 'WARN' ? 'Read boundaries from the sale deed (OCR) and compare with the four side photos from the customer link.' : 'Obtain demarcation from the revenue surveyor; resolve before sanction.',
      typicalRemark: 'No demarcation of the property at site.',
    });
  }

  /* ---------- MEASUREMENT ---------- */

  // S5 — FSI / BUA vs approved plan
  {
    const dev = m.buaDeviationPct;
    const plotForFsi = Math.min(c.deedPlotAreaSqft, c.cadastralPlotAreaSqft);
    const fsiActual = plotForFsi > 0 ? m.buaActual / plotForFsi : 0;
    const fsiRef = plotForFsi > 0 && m.buaReference ? m.buaReference / plotForFsi : null;
    let status: SanityStatus;
    if (dev === null) status = 'PENDING';
    else if (dev <= FSI_TOLERANCE_PCT) status = 'PASS';
    else if (dev <= FSI_COMPOUNDABLE_PCT) status = 'WARN';
    else status = 'FAIL';
    const refLabel = m.deviationReference === 'SANCTIONED' ? 'approved plan' : 'by-law permissible';
    checks.push({
      id: 'S5',
      pillar: 'MEASUREMENT',
      title: 'FSI / built-up area vs approved plan',
      status,
      finding:
        dev === null
          ? 'No approved plan or permissible-FSI reference — FSI compliance cannot be verified.'
          : `Built ${fmt(m.buaActual)} sqft (FSI ${fsiActual.toFixed(2)}) vs ${refLabel} ${fmt(m.buaReference!)} sqft (FSI ${fsiRef!.toFixed(2)}) → deviation ${formatPctTrunc(dev)}.`,
      sources: [S.DCR, S.OCR, S.ROOMS, S.SATELLITE],
      action:
        status === 'PASS'
          ? 'None.'
          : status === 'WARN'
            ? 'Within compoundable limit — value only the approved area; ask customer for compounding / regularisation receipt.'
            : status === 'FAIL'
              ? 'FSI exceeded beyond compoundable limit — value approved area only; excess is at demolition risk; credit to decide acceptability.'
              : 'Obtain approved plan to verify FSI.',
      typicalRemark: 'Construction exceeds permissible FSI; deviation observed.',
    });
  }

  // S6 — Measured interior (customer rooms) vs approved floor areas
  {
    const r = i.rooms;
    let status: SanityStatus = 'PENDING';
    let finding = 'Awaiting room measurements from the customer link.';
    if (r && r.rows.length) {
      const over = r.rows.filter((x) => x.exceeds);
      status = !hasPlan ? 'WARN' : over.length ? 'FAIL' : 'PASS';
      finding = `${r.rows.length} floor(s) measured, carpet ${fmt(r.totalCarpetSqft)} sqft. ${r.rows
        .map((x) => `${x.floorName}: implied BUA ${fmt(x.impliedBuaSqft)} vs approved ${x.approvedSqft ? fmt(x.approvedSqft) : '—'}${x.excessPct !== null ? ` (${x.excessPct > 0 ? '+' : ''}${x.excessPct.toFixed(1)}%)` : ''}`)
        .join('; ')}.`;
    }
    checks.push({
      id: 'S6',
      pillar: 'MEASUREMENT',
      title: 'Measured rooms vs approved floor area',
      status,
      finding,
      sources: [S.ROOMS, S.OCR],
      action:
        status === 'FAIL'
          ? 'Interior exceeds the approved floor area — check for extensions / merged balconies; value approved area only.'
          : status === 'WARN'
            ? 'No approved plan to compare against — measurement cannot replace the approved plan.'
            : status === 'PENDING'
              ? 'Customer to measure rooms (AR, tape or reference object) through the link.'
              : 'None.',
      typicalRemark: 'Measurements taken at site; area as per site.',
    });
  }

  /* ---------- LEGAL / COMPLIANCE ---------- */

  // S7 — Approved plan on file (mandatory)
  {
    checks.push({
      id: 'S7',
      pillar: 'LEGAL_COMPLIANCE',
      title: 'Approved building plan on file (mandatory)',
      status: hasPlan ? 'PASS' : 'BLOCKER',
      finding: hasPlan
        ? `Approved plan on file${plan?.ref ? ` — ${plan.ref}` : ''}${plan?.status === 'UPLOADED' ? ' (uploaded by customer)' : ' (from LOS)'}.`
        : 'Approved plan NOT provided. Unapproved / irregular structures cannot be mortgaged, and a customer measurement cannot replace the approved plan.',
      sources: [S.LOS, S.OCR],
      action: hasPlan ? 'None.' : 'Obtain the approved plan (or regularisation certificate) from the authority before sanction.',
      typicalRemark: 'Approved plan not provided for verification.',
    });
  }

  // S8 — Plan belongs to this site
  {
    const off = c.sanctionedMapGeoOffsetMeters;
    const status: SanityStatus = !hasPlan ? 'PENDING' : off !== undefined && off > PLAN_GEO_TAG_MAX_OFFSET_M ? 'FAIL' : 'PASS';
    checks.push({
      id: 'S8',
      pillar: 'LEGAL_COMPLIANCE',
      title: 'Approved plan matches this site / layout',
      status,
      finding:
        status === 'PENDING'
          ? 'No plan to match against the site.'
          : status === 'FAIL'
            ? `Plan geo-tag is ${off} m from the actual site (> ${PLAN_GEO_TAG_MAX_OFFSET_M} m) — plan may belong to another plot.`
            : `Plan location within ${PLAN_GEO_TAG_MAX_OFFSET_M} m of the property pin.`,
      sources: [S.OCR, S.SATELLITE],
      action: status === 'FAIL' ? 'Get an authority-certified copy showing the plot number; confirm the plan belongs to this site.' : 'None.',
      typicalRemark: 'Layout plan not matching with the site.',
    });
  }

  // S9 — Unapproved structures / demolition notice list
  {
    const un = m.unapprovedStructures;
    const hit = i.notices.find((n) => haversineMeters(n.lat, n.lng, c.lat, c.lng) <= DEMOLITION_MATCH_RADIUS_M);
    const status: SanityStatus = hit ? 'BLOCKER' : un.length ? 'FAIL' : 'PASS';
    checks.push({
      id: 'S9',
      pillar: 'LEGAL_COMPLIANCE',
      title: 'Unapproved structures / demolition list',
      status,
      finding: hit
        ? `Property is on the ${hit.authority} notice list (${hit.id}, ${hit.noticeDate}): ${hit.reason}.`
        : un.length
          ? `Not on the ULB notice list, but unapproved structure(s) found: ${un.map((x) => `${x.floorName} ${fmt(x.actualSqft)} sqft`).join(', ')} — at demolition risk.`
          : 'Not on the ULB unauthorised-construction / demolition notice list; no unapproved structures.',
      sources: [S.ULB_NOTICES, S.CAPTURE, S.OCR],
      action: hit
        ? 'Not acceptable as security while the notice is open.'
        : un.length
          ? 'Exclude unapproved area from value; rate demolition risk High; ask for regularisation.'
          : 'None.',
      typicalRemark: 'Property falls in demolition list / unauthorised construction.',
    });
  }

  // S10 — Road widening / DP reservation
  {
    const loss = c.roadWideningLossSqft;
    const affected = c.gisHazards.roadWidening || loss > 0;
    const known = affected || c.origin === 'SEED' || c.origin === 'SELF_CAPTURE';
    const pct = c.deedPlotAreaSqft > 0 ? (loss / c.deedPlotAreaSqft) * 100 : 0;
    const status: SanityStatus = affected ? 'WARN' : known ? 'PASS' : 'PENDING';
    checks.push({
      id: 'S10',
      pillar: 'LEGAL_COMPLIANCE',
      title: 'Road widening / DP reservation',
      status,
      finding: affected
        ? `DP road widening${c.roadWidthProposedFt ? ` ${c.roadWidthCurrentFt} ft → ${c.roadWidthProposedFt} ft` : ''}: ${fmt(loss)} sqft (${pct.toFixed(1)}% of plot) falls in the corridor — net plot ${fmt(m.aNet)} sqft valued.`
        : known
          ? 'No road-widening or reservation on the approach road in the DP layer.'
          : 'DP / Master Plan layer not yet integrated for this city — verify widening from the DP plan.',
      sources: [S.DP_PLAN, S.SATELLITE],
      action: affected ? 'Value net plot only; note TDR / compensation status on file.' : known ? 'None.' : 'Check the city DP plan for proposed widening.',
      typicalRemark: 'X sqft affected in road widening as per master plan.',
    });
  }

  // S11 — Title chain (13 years)
  {
    const t = docOf('TITLE_CHAIN');
    const years = t?.coversFromYear && t.coversToYear ? t.coversToYear - t.coversFromYear : null;
    const status: SanityStatus = !isAvail(t) ? 'FAIL' : years === null ? 'WARN' : years >= TITLE_CHAIN_YEARS ? 'PASS' : 'FAIL';
    checks.push({
      id: 'S11',
      pillar: 'LEGAL_COMPLIANCE',
      title: `Title chain covers ${TITLE_CHAIN_YEARS} years`,
      status,
      finding: !isAvail(t)
        ? 'Title-chain documents not on file.'
        : years === null
          ? 'Chain documents on file; coverage years not captured.'
          : `Chain documents cover ${t!.coversFromYear}–${t!.coversToYear} (${years} years).`,
      sources: [S.LOS, S.SRO],
      action:
        status === 'PASS' ? 'None.' : status === 'WARN' ? `Legal to confirm ${TITLE_CHAIN_YEARS}-year chain + encumbrance certificate (SRO search).` : `Collect previous deeds / EC to complete ${TITLE_CHAIN_YEARS} years.`,
      typicalRemark: 'Title documents to be verified by the legal team.',
    });
  }

  // S12 — Land use / zoning
  {
    const status: SanityStatus = u.severeUsageConflict ? 'BLOCKER' : u.usageConflict ? 'FAIL' : 'PASS';
    checks.push({
      id: 'S12',
      pillar: 'LEGAL_COMPLIANCE',
      title: 'Land use matches zoning / records',
      status,
      finding: u.explanation,
      sources: [S.ZONING, S.CAPTURE],
      action: status === 'PASS' ? 'None.' : 'Apply the lower LTV band; obtain change-of-use (CLU) permission or confirm actual use.',
      typicalRemark: 'Property used for commercial purpose in residential zone.',
    });
  }

  // S13 — Environmental / GIS hazards
  {
    const h = c.gisHazards;
    const hard = [h.crzOrWaterbody && 'CRZ / water body', h.htLine && 'HT line', h.cautionArea && 'caution area', h.negativeArea && 'negative area'].filter(Boolean) as string[];
    const forest = h.forestBuffer;
    const status: SanityStatus = hard.length ? 'FAIL' : forest ? (h.forestRtiCleared ? 'WARN' : 'FAIL') : 'PASS';
    checks.push({
      id: 'S13',
      pillar: 'LEGAL_COMPLIANCE',
      title: 'Environmental / GIS restrictions',
      status,
      finding: hard.length
        ? `Inside restricted overlay: ${hard.join(', ')}.`
        : forest
          ? `Adjacent to forest buffer — ${h.forestRtiCleared ? 'forest-department RTI on file confirms it is not forest land' : 'no clearance on file'}.`
          : 'No forest, CRZ, HT-line or negative-area overlay on the parcel.',
      sources: [S.GIS, S.OCR],
      action: status === 'PASS' ? 'None.' : forest && h.forestRtiCleared ? 'Keep RTI reply on file; legal to confirm.' : 'Obtain NOC / clearance from the authority before sanction.',
      typicalRemark: 'Property near forest / restricted area.',
    });
  }

  const counts: Record<SanityStatus, number> = { PASS: 0, WARN: 0, FAIL: 0, BLOCKER: 0, PENDING: 0 };
  for (const ch of checks) counts[ch.status]++;
  const verdict: SanityVerdict = counts.BLOCKER
    ? 'NOT_MORTGAGEABLE'
    : counts.FAIL
      ? 'CLEAR_BEFORE_SANCTION'
      : counts.WARN
        ? 'SANCTION_WITH_CONDITIONS'
        : 'TECHNICALLY_CLEAR';
  const rank: Record<SanityStatus, number> = { BLOCKER: 0, FAIL: 1, WARN: 2, PENDING: 3, PASS: 4 };
  const actionList = [...checks]
    .filter((ch) => ch.status !== 'PASS' && ch.action !== 'None.')
    .sort((a, b) => rank[a.status] - rank[b.status])
    .map((ch) => `${ch.id} · ${ch.action}`);

  return { checks, counts, verdict, verdictLabel: VERDICT_META[verdict].label, actionList };
}
