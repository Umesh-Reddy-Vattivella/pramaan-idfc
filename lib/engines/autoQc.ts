/* ------------------------------------------------------------------
   Automated Quality Control Engine (PRD §3.7) — 6 deterministic rules.
   ------------------------------------------------------------------ */
import type { AutoQcFinding, PropertyCase, QcStatus } from '@/lib/types';
import type { MeasureResult } from './measure';
import type { ValuationResult } from './valuation';
import { formatInr, formatPctTrunc, parseIndianRupeeWords, toIndianRupeeWords } from './valuation';

/* ---------------- Date helpers ---------------- */

/** Parses DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY or ISO YYYY-MM-DD to a UTC day number. */
export function parseDateToDayNumber(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000;
  return null;
}

export function daysBetween(from: string | undefined, to: string | undefined): number | null {
  const a = parseDateToDayNumber(from);
  const b = parseDateToDayNumber(to);
  return a === null || b === null ? null : b - a;
}

const normSurvey = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/^SF(NO\.?)?/, '');

/* ---------------- QC-1: Words vs Figures ---------------- */

export function qc1WordsVsFigures(c: PropertyCase, v: ValuationResult): AutoQcFinding {
  const figure = c.legacyStatedMarketValueInr ?? v.mvFinalRounded;
  const expectedWords = toIndianRupeeWords(figure);
  const base = { ruleId: 'QC-1' as const, title: 'Words vs. Figures Check' };
  if (!c.legacyStatedValueWords) {
    return {
      ...base,
      status: 'PASS',
      legacyReportValue: '—',
      pramaanDetection: `Amount in words auto-generated: "${toIndianRupeeWords(v.mvFinalRounded)}".`,
      actionRequired: 'None.',
    };
  }
  const parsed = parseIndianRupeeWords(c.legacyStatedValueWords);
  const match = parsed !== null && parsed === Math.round(figure);
  return {
    ...base,
    status: match ? 'PASS' : 'CRITICAL_FAIL',
    legacyReportValue: `${formatInr(figure)} written as "${c.legacyStatedValueWords}"`,
    pramaanDetection: match
      ? 'Stated words match the numeric figure exactly.'
      : `Words parse to ${parsed === null ? 'an unreadable amount' : formatInr(parsed)}, not ${formatInr(figure)}. Correct: "${expectedWords}".`,
    actionRequired: match ? 'None.' : 'Replace amount-in-words with the engine-generated exact Indian Rupee words.',
  };
}

/* ---------------- QC-2: Chronology & TAT ---------------- */

export const SIGNOFF_LAG_MAX_DAYS = 2;

export function qc2DatesAndTat(c: PropertyCase): AutoQcFinding {
  const base = { ruleId: 'QC-2' as const, title: 'Chronological Date & TAT Check' };
  const issues: string[] = [];
  let status: QcStatus = 'PASS';
  const bump = (s: QcStatus) => {
    const rank: Record<QcStatus, number> = { PASS: 0, WARN: 1, FAIL: 2, CRITICAL_FAIL: 3 };
    if (rank[s] > rank[status]) status = s;
  };

  const visit = c.legacyVisitDate;
  const report = c.legacyReportDate;
  const sign = c.legacySignDate;

  // Visit <= Report <= e-Sign
  const vr = daysBetween(visit, report);
  const rs = daysBetween(report, sign);
  const vs = daysBetween(visit, sign);
  if (vr !== null && vr < 0) { issues.push(`Report date ${report} precedes visit date ${visit}.`); bump('FAIL'); }
  if (rs !== null && rs < 0) { issues.push(`e-Sign date ${sign} precedes report date ${report}.`); bump('FAIL'); }
  if (vs !== null && vs < 0) { issues.push(`e-Sign date ${sign} precedes visit date ${visit}.`); bump('FAIL'); }

  // Conflicting inspection date in remarks
  if (c.legacyRemarkVisitDate && visit) {
    const d = daysBetween(visit, c.legacyRemarkVisitDate);
    if (d === null ? c.legacyRemarkVisitDate.trim() !== visit.trim() : d !== 0) {
      issues.push(`Remarks state inspection on ${c.legacyRemarkVisitDate} but visit date is ${visit}.`);
      bump('FAIL');
    }
  }

  // Sign-off lag > 2 days
  if (vs !== null && vs > SIGNOFF_LAG_MAX_DAYS) {
    issues.push(`Sign-off lag ${vs} days (visit ${visit} → e-Sign ${sign}) exceeds ${SIGNOFF_LAG_MAX_DAYS} days.`);
    bump('WARN');
  }

  const legacyParts = [visit && `Visit ${visit}`, c.legacyRemarkVisitDate && `Remark ${c.legacyRemarkVisitDate}`, report && `Report ${report}`, sign && `e-Sign ${sign}`].filter(Boolean);
  return {
    ...base,
    status,
    legacyReportValue: legacyParts.length ? legacyParts.join(' | ') : '—',
    pramaanDetection: issues.length ? issues.join(' ') : 'Dates chronological; sign-off within SLA.',
    actionRequired: issues.length ? 'Correct conflicting dates and justify sign-off delay; PRAMAAN timestamps every step.' : 'None.',
  };
}

/* ---------------- QC-3: Deviation vs Demolition Risk ---------------- */

export const QC3_DEVIATION_THRESHOLD_PCT = 25;

export function qc3DeviationVsDemolition(c: PropertyCase, m: MeasureResult): AutoQcFinding {
  const base = { ruleId: 'QC-3' as const, title: 'Deviation vs. Demolition Risk Logic' };
  const dev = m.buaDeviationPct;
  const highDeviation = dev !== null && dev > QC3_DEVIATION_THRESHOLD_PCT;
  const unapproved = m.unapprovedStructures.length > 0;
  const risk = c.legacyDemolitionRisk;
  const devText = dev === null ? 'n/a' : formatPctTrunc(dev);
  const structText = unapproved
    ? m.unapprovedStructures.map((u) => `${u.floorName} (${u.actualSqft.toLocaleString('en-IN')} sqft)`).join(', ')
    : 'none';

  // 'No' is treated as at-or-below 'Low' and therefore equally contradictory.
  const understated = risk === 'Low' || risk === 'No';
  let status: QcStatus = 'PASS';
  if ((highDeviation || unapproved) && understated) status = 'CRITICAL_FAIL';
  else if ((highDeviation || unapproved) && risk === 'Medium') status = 'WARN';

  return {
    ...base,
    status,
    legacyReportValue: `BUA deviation ${devText}; unapproved structures: ${structText}; demolition risk '${risk ?? '—'}'`,
    pramaanDetection:
      status === 'CRITICAL_FAIL'
        ? `Deviation ${devText}${unapproved ? ' + unapproved structure(s)' : ''} is incompatible with '${risk}' demolition risk.`
        : status === 'WARN'
          ? `Deviation ${devText}${unapproved ? ' + unapproved structure(s)' : ''} with only 'Medium' demolition risk — review.`
          : 'Demolition risk rating consistent with measured deviation.',
    actionRequired:
      status === 'PASS' ? 'None.' : 'Re-rate demolition risk to High; exclude unapproved area from valuation; escalate.',
  };
}

/* ---------------- QC-4: Arithmetic & FSV ---------------- */

export function qc4ArithmeticAndFsv(v: ValuationResult): AutoQcFinding {
  const base = { ruleId: 'QC-4' as const, title: 'Arithmetic & FSV Recalculation' };
  const lb = v.landBuilding;
  const recomputed = lb.landValue + lb.buildingValue + lb.amenitiesValue;
  const arithmeticOk = Math.abs(recomputed - lb.mv) < 1;
  const ratio = v.mvFinal > 0 ? v.fsv / v.mvFinal : 0;
  const fsvOk = ratio >= 0.8 - 1e-9 && ratio <= 0.85 + 1e-9;
  const ok = arithmeticOk && fsvOk;
  return {
    ...base,
    status: ok ? 'PASS' : 'FAIL',
    legacyReportValue: `Land ${formatInr(lb.landValue)} + Building ${formatInr(lb.buildingValue)} + Amenities ${formatInr(lb.amenitiesValue)}`,
    pramaanDetection:
      `Recomputed L+B+A = ${formatInr(recomputed)} ${arithmeticOk ? '✓' : `≠ stated ${formatInr(lb.mv)}`}; ` +
      `FSV ${formatInr(v.fsv)} = ${(ratio * 100).toFixed(2)}% of MV ${fsvOk ? '✓ (within 80–85%)' : '✗ (outside 80–85%)'}.`,
    actionRequired: ok ? 'None.' : 'Correct arithmetic / FSV ratio to the engine-computed values.',
  };
}

/* ---------------- QC-5: Internal Status Contradiction ---------------- */

const UNDER_CONSTRUCTION_RE = /under[\s-]?construction/i;
const COMPLETED_RE = /\b(fully\s+(constructed|completed)|construction\s+(is\s+)?complete[d]?)\b/i;

function stagePct(stage: string | undefined): number | null {
  if (!stage) return null;
  const m = stage.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) return parseFloat(m[1]);
  if (/complete/i.test(stage)) return 100;
  return null;
}

export function qc5StatusContradiction(c: PropertyCase): AutoQcFinding {
  const base = { ruleId: 'QC-5' as const, title: 'Internal Status Contradiction Check' };
  const stage = stagePct(c.legacyStageOfConstruction);
  const remarks = c.legacyRemarksText ?? '';
  const issues: string[] = [];
  if (stage !== null && stage >= 100 && UNDER_CONSTRUCTION_RE.test(remarks)) {
    issues.push(`Stage of Construction '${c.legacyStageOfConstruction}' but remarks describe an under-construction property.`);
  }
  if (stage !== null && stage < 100 && COMPLETED_RE.test(remarks)) {
    issues.push(`Stage of Construction '${c.legacyStageOfConstruction}' but remarks describe a completed property.`);
  }
  return {
    ...base,
    status: issues.length ? 'FAIL' : 'PASS',
    legacyReportValue: c.legacyStageOfConstruction ? `Stage of Construction: ${c.legacyStageOfConstruction}` : '—',
    pramaanDetection: issues.length ? issues.join(' ') : 'No internal status contradictions found.',
    actionRequired: issues.length ? 'Reconcile stage of construction with remarks and site evidence.' : 'None.',
  };
}

/* ---------------- QC-6: Cross-document Survey & Geo-tag ---------------- */

export const GEO_TAG_MAX_OFFSET_M = 25;

export function surveyMismatch(c: PropertyCase) {
  const deed = (c.surveyDeedNumbers ?? []).map(normSurvey);
  const patta = (c.surveyPattaNumbers ?? []).map(normSurvey);
  const remark = (c.legacyRemarkSurveyNumbers ?? []).map(normSurvey);
  const deedNotInPatta = patta.length ? deed.filter((d) => !patta.includes(d)) : [];
  const pattaNotInDeed = deed.length ? patta.filter((p) => !deed.includes(p)) : [];
  const known = new Set([...deed, ...patta]);
  const remarkUnknown = remark.filter((r) => !known.has(r));
  return {
    deedNotInPatta,
    pattaNotInDeed,
    remarkUnknown,
    hasMismatch: deedNotInPatta.length > 0 || pattaNotInDeed.length > 0 || remarkUnknown.length > 0,
  };
}

export function qc6SurveyAndGeoTag(c: PropertyCase): AutoQcFinding {
  const base = { ruleId: 'QC-6' as const, title: 'Cross-Document Survey & Geo-Tag Check' };
  const s = surveyMismatch(c);
  const issues: string[] = [];
  if (s.deedNotInPatta.length || s.pattaNotInDeed.length) {
    issues.push(
      `Sale Deed [${(c.surveyDeedNumbers ?? []).join(', ')}] ≠ Patta/FMB [${(c.surveyPattaNumbers ?? []).join(', ')}].`,
    );
  }
  if (s.remarkUnknown.length) {
    issues.push(`Remarks cite survey no(s). ${s.remarkUnknown.join(', ')} not found in Deed or Patta (transposition).`);
  }
  const offset = c.sanctionedMapGeoOffsetMeters;
  const geoFail = offset !== undefined && offset > GEO_TAG_MAX_OFFSET_M;
  if (geoFail) issues.push(`Sanctioned map geo-tag is ${offset} m from actual site (> ${GEO_TAG_MAX_OFFSET_M} m).`);

  const legacy = [
    c.surveyDeedNumbers?.length && `Deed: ${c.surveyDeedNumbers.join(', ')}`,
    c.surveyPattaNumbers?.length && `Patta: ${c.surveyPattaNumbers.join(', ')}`,
    c.legacyRemarkSurveyNumbers?.length && `Remarks: ${c.legacyRemarkSurveyNumbers.join(', ')}`,
    offset !== undefined && `Geo-offset: ${offset} m`,
  ].filter(Boolean);

  return {
    ...base,
    status: issues.length ? 'FAIL' : 'PASS',
    legacyReportValue: legacy.length ? legacy.join(' | ') : '—',
    pramaanDetection: issues.length ? issues.join(' ') : 'Survey numbers consistent across documents; geo-tag within 25 m.',
    actionRequired: issues.length
      ? [s.hasMismatch && 'Obtain Rectification Deed / corrected survey references', geoFail && 'verify sanctioned map belongs to this site']
          .filter(Boolean)
          .join('; ') + '.'
      : 'None.',
  };
}

/* ---------------- Runner ---------------- */

export interface AutoQcResult {
  findings: AutoQcFinding[];
  criticalFailCount: number;
  failCount: number;
  warnCount: number;
  surveyMismatch: boolean;
}

export function runAutoQc(c: PropertyCase, m: MeasureResult, v: ValuationResult): AutoQcResult {
  const findings = [
    qc1WordsVsFigures(c, v),
    qc2DatesAndTat(c),
    qc3DeviationVsDemolition(c, m),
    qc4ArithmeticAndFsv(v),
    qc5StatusContradiction(c),
    qc6SurveyAndGeoTag(c),
  ];
  return {
    findings,
    criticalFailCount: findings.filter((f) => f.status === 'CRITICAL_FAIL').length,
    failCount: findings.filter((f) => f.status === 'FAIL').length,
    warnCount: findings.filter((f) => f.status === 'WARN').length,
    surveyMismatch: surveyMismatch(c).hasMismatch,
  };
}
