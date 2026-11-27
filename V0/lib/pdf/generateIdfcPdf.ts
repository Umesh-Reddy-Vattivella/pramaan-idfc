/* ------------------------------------------------------------------
   IDFC FIRST Bank Technical Appraisal Report — client-side PDF (jsPDF + autotable).
   Renders values already computed by lib/engines; performs no valuation math.
   Load with `await import('@/lib/pdf/generateIdfcPdf')` from a click handler (browser only).
   ------------------------------------------------------------------ */
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { formatIndianNumber, formatInr, formatPctTrunc } from '@/lib/engines/valuation';
import { SPATIAL_TIER_LABEL } from '@/lib/engines/price';
import { USAGE_LABEL } from '@/lib/engines/usage';

const MAROON: [number, number, number] = [156, 29, 38];
const DEEP: [number, number, number] = [110, 17, 24];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const M = 14; // page margin (mm)

/** jsPDF core fonts are WinAnsi — map/strip glyphs they cannot render. */
export function pdfSafe(s: string): string {
  return s
    .replace(/−/g, '-')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/≠/g, '!=')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/✓/g, 'OK')
    .replace(/✗/g, 'X')
    .replace(/±/g, '+/-')
    .replace(/…/g, '...')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E -ÿ–—•]/g, '');
}

const sqft = (n: number) => `${formatIndianNumber(Math.round(n * 100) / 100)} sqft`;
const rate = (n: number) => `Rs. ${formatIndianNumber(Math.round(n))}/sqft`;

/** Builds the report document (no side effects) — used by the download button and the verification script. */
export function buildIdfcPdf(c: PropertyCase, e: EvidencePack): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = e.measure;
  const v = e.valuation;
  const p = e.price;
  const lb = v.landBuilding;
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  let y = 30;

  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  const ensure = (needed: number) => {
    if (y + needed > H - 18) {
      doc.addPage();
      y = 30;
    }
  };

  const section = (title: string) => {
    ensure(34); // keep a heading together with at least its first table rows
    doc.setFillColor(...MAROON);
    doc.rect(M, y, 2, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(pdfSafe(title), M + 4, y + 4.6);
    y += 8;
  };

  const table = (head: string[] | null, body: RowInput[], opts: { colWidths?: number[]; kv?: boolean } = {}) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 26, bottom: 16 },
      head: head ? [head.map(pdfSafe)] : undefined,
      body: body.map((r) => (r as unknown[]).map((cell) => (typeof cell === 'string' ? pdfSafe(cell) : cell))) as RowInput[],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.2, overflow: 'linebreak' },
      headStyles: { fillColor: DEEP, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: opts.kv ? undefined : { fillColor: [250, 248, 248] },
      columnStyles: opts.kv
        ? { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [250, 248, 248] } }
        : Object.fromEntries((opts.colWidths ?? []).map((w, i) => [i, { cellWidth: w }])),
    });
    y = lastY() + 6;
  };

  /* ---------------- Title block ---------------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text('TECHNICAL APPRAISAL REPORT', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(pdfSafe(`Loan Against Property · ${c.title}`), M, y + 5);
  doc.text(pdfSafe(`File No. ${c.fileNo ?? c.id}  |  Case Ref ${c.caseRefNo}  |  Generated ${generatedAt}`), M, y + 10);

  // Decision box
  const tierColor: Record<string, [number, number, number]> = { INSTANT: [21, 128, 61], REMOTE_REVIEW: [180, 83, 9], PHYSICAL_CHECK: [220, 38, 38] };
  doc.setFillColor(...(tierColor[e.routing.tier] ?? MAROON));
  doc.roundedRect(W - M - 52, y - 6, 52, 17, 2, 2, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(e.routing.label.toUpperCase(), W - M - 26, y + 0.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(pdfSafe(`S = ${p.authenticity.score}/100 · SLA ${e.routing.sla}`), W - M - 26, y + 6, { align: 'center' });
  y += 17;

  if (!e.valuationReady) {
    doc.setFillColor(254, 243, 199);
    doc.rect(M, y - 2, W - 2 * M, 9, 'F');
    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('DRAFT - valuation pending: no market evidence collected yet. Figures below are not a valuation.', M + 2, y + 4);
    y += 12;
  }

  /* ---------------- 1. Basic details ---------------- */
  section('1. Basic Details');
  table(
    null,
    [
      ['Applicant / Owner', c.applicantName],
      ['Property', c.title],
      ['Location', `${c.city}, ${c.state}`],
      ['Usage (confirmed)', `${USAGE_LABEL[e.usage.appliedUsage]} — ${e.usage.explanation}`],
      ['Legacy agency / timeline', c.legacyAgencyName ? `${c.legacyAgencyName} · Visit ${c.legacyVisitDate ?? '—'} · Report ${c.legacyReportDate ?? '—'} · Signed ${c.legacySignDate ?? '—'}` : 'PRAMAAN self-capture / no legacy report'],
      ['PRAMAAN turnaround', c.pramaanTatMinutes ? `${c.pramaanTatMinutes} min${c.legacyTatDays !== undefined ? ` (legacy ${c.legacyTatDays} days)` : ''}` : 'In progress'],
      ...(c.details ?? []).map((d) => [d.label, d.value]),
    ],
    { kv: true },
  );

  /* ---------------- 2. Locality & GIS ---------------- */
  section('2. Locality, Geo-Coordinates & GIS Overlay');
  table(
    null,
    [
      ['Geo-coordinates', `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`],
      ['Approach road', c.roadWidthCurrentFt ? `${c.roadWidthCurrentFt} ft${c.roadWidthProposedFt ? ` (proposed ${c.roadWidthProposedFt} ft)` : ''}${c.roadSide ? `, ${c.roadSide}` : ''}` : 'Not recorded'],
      ['GIS hazards', m.activeHazards.length ? m.activeHazards.join(', ').replaceAll('_', ' ') : 'None'],
      ['Sanctioned-map geo-tag', c.sanctionedMapGeoOffsetMeters !== undefined ? `${c.sanctionedMapGeoOffsetMeters} m from actual site` : 'Not applicable'],
      ['Circle / guideline rate', c.circleRatePerSqft ? `${rate(c.circleRatePerSqft)} (gap ${p.circleGapMultiple?.toFixed(2)}x)` : (c.origin === 'SEED' ? 'Not stated in source report' : 'Not found in market evidence')],
      ['Price evidence tier', SPATIAL_TIER_LABEL[c.spatialFallbackTier]],
    ],
    { kv: true },
  );

  /* ---------------- 3. Building & floor-wise deviation ---------------- */
  section('3. Building & Floor-wise Deviation');
  const refLabel = m.deviationReference === 'BYLAWS_PERMISSIBLE' ? 'Permissible' : 'Sanctioned';
  table(
    ['Floor', `${refLabel} (sqft)`, 'Actual (sqft)', 'Deviation (sqft)', 'Deviation %'],
    [
      ...m.floorDeviations.map((f) => [
        `${f.floorName}${f.temporary ? ' [temporary]' : ''}`,
        formatIndianNumber(f.referenceSqft),
        formatIndianNumber(f.actualSqft),
        formatIndianNumber(f.deviationSqft),
        f.deviationPct === null ? (f.actualSqft > 0 && f.referenceSqft === 0 ? 'Not in plan' : '—') : formatPctTrunc(f.deviationPct),
      ]),
      [
        { content: 'Total (permanent)', styles: { fontStyle: 'bold' } },
        { content: m.buaReference === null ? '—' : formatIndianNumber(m.buaReference), styles: { fontStyle: 'bold' } },
        { content: formatIndianNumber(m.buaActual), styles: { fontStyle: 'bold' } },
        { content: m.buaDeviationSqft === null ? '—' : formatIndianNumber(m.buaDeviationSqft), styles: { fontStyle: 'bold' } },
        { content: m.buaDeviationPct === null ? 'N/A (no plan)' : formatPctTrunc(m.buaDeviationPct), styles: { fontStyle: 'bold' } },
      ],
      ...(m.buaActualInclTemporary !== m.buaActual && m.buaDeviationPctInclTemporary !== null
        ? [['Total incl. tin shed / temporary', '', formatIndianNumber(m.buaActualInclTemporary), '', formatPctTrunc(m.buaDeviationPctInclTemporary)]]
        : []),
    ],
  );

  /* ---------------- 4. Valuation ---------------- */
  section('4. Land & Building Valuation');
  table(
    ['Component', 'Quantity', 'Rate', 'Value (Rs.)'],
    [
      ['Land (A_net = min(deed, record) - widening)', sqft(m.aNet), rate(v.rLand), formatInr(lb.landValue)],
      [`Building (${m.buaBasis.replaceAll('_', ' ').toLowerCase()})`, sqft(m.buaValued), rate(lb.rConstrDepreciated), formatInr(lb.buildingValue)],
      ['Amenities', '', '', formatInr(lb.amenitiesValue)],
      [
        { content: 'MARKET VALUE (MV)', styles: { fontStyle: 'bold' } },
        '',
        '',
        { content: formatInr(v.mvFinal), styles: { fontStyle: 'bold' } },
      ],
      [{ content: `In words: ${v.amountInWords}`, colSpan: 4, styles: { fontStyle: 'italic' } }],
      [`Forced-Sale Value (${Math.round(v.fsvRatio * 100)}% of MV)`, '', '', formatInr(v.fsv)],
      [`Max Collateral Loan (${Math.round(v.ltvCap * 100)}% LTV, ${USAGE_LABEL[e.usage.appliedUsage]})`, '', '', formatInr(v.maxCollateralLoan)],
      ...(v.requestedLoan !== null && v.requestedLoanLtvPct !== null
        ? [[`Requested loan -> LTV`, '', formatPctTrunc(v.requestedLoanLtvPct, 1), formatInr(v.requestedLoan)]]
        : []),
    ],
    { colWidths: [80, 32, 34, 36] },
  );
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  const basisLines = doc.splitTextToSize(
    pdfSafe(
      `Land-rate basis: ${v.rLandBasisNote}.` +
        (v.rLandBasis === 'ADOPTED' ? ` Land value at PRAMAAN consensus ${rate(v.rConsensusRounded)}: ${formatInr(v.landValueAtConsensus)}.` : '') +
        ` Depreciation D = ${(lb.depreciationD * 100).toFixed(2)}% (age ${c.ageYears} / total life ${lb.totalLifeYears} yrs x 0.90).`,
    ),
    W - 2 * M,
  );
  ensure(basisLines.length * 3.5 + 4);
  doc.text(basisLines, M, y - 2);
  y += basisLines.length * 3.5 + 2;

  /* ---------------- 5. Income ---------------- */
  if (v.income) {
    section('5. Income Yield Cross-Check');
    table(
      null,
      [
        ['Monthly rent', formatInr(c.monthlyRentInr ?? 0)],
        ['Annual rent', formatInr(v.income.annualRent)],
        ['Gross yield', `${v.income.grossYieldPct.toFixed(2)}%`],
        ['Income capitalisation value', `${formatInr(v.income.mvIncome)} (outgoings ${(v.income.outgoingsPct * 100).toFixed(0)}%, cap rate ${((c.capRate ?? 0) * 100).toFixed(1)}%)`],
        ['Variance vs MV', `${v.income.variancePct.toFixed(2)}% -> ${v.income.yieldGuardrailFlag ? 'YIELD GUARDRAIL FLAG' : 'within 15% guardrail'}`],
      ],
      { kv: true },
    );
  }

  /* ---------------- 6. Boundaries ---------------- */
  section(`${v.income ? '6' : '5'}. Boundaries (Deed vs Site / Satellite)`);
  if (m.boundaries.length) {
    table(['Direction', 'As per Deed', 'At Site / Satellite', 'Match'], m.boundaries.map((b) => [b.direction, b.asPerDeed, b.atSiteSatellite, b.matched ? 'Yes' : 'MISMATCH']), {
      colWidths: [24, 66, 66, 26],
    });
  } else {
    table(null, [['Boundary schedule not captured in the source report.']]);
  }

  /* ---------------- 7. Auto-QC ---------------- */
  section(`${v.income ? '7' : '6'}. Auto-QC Remarks (6 deterministic rules)`);
  table(
    ['Rule', 'Status', 'Legacy report value', 'PRAMAAN detection & action'],
    e.autoQc.findings.map((f) => [
      `${f.ruleId}\n${f.title}`,
      { content: f.status.replace('_', ' '), styles: { fontStyle: 'bold', textColor: f.status === 'PASS' ? [21, 128, 61] : f.status === 'WARN' ? [180, 83, 9] : [220, 38, 38] } },
      f.legacyReportValue,
      f.status === 'PASS' ? f.pramaanDetection : `${f.pramaanDetection}\nAction: ${f.actionRequired}`,
    ]),
    { colWidths: [32, 22, 56, 72] },
  );

  /* ---------------- 8. Risk cascade ---------------- */
  section(`${v.income ? '8' : '7'}. Confidence-Gated Risk Cascade`);
  table(
    ['Instant gate', 'Result', 'Detail'],
    e.routing.instantGates.map((g) => [g.label, { content: g.passed ? 'PASS' : 'FAIL', styles: { fontStyle: 'bold', textColor: g.passed ? [21, 128, 61] : [220, 38, 38] } }, g.detail]),
    { colWidths: [70, 18, 94] },
  );
  const triggers = [...e.routing.physicalTriggers.map((t) => ['Physical', t]), ...e.routing.remoteTriggers.map((t) => ['Remote', t])];
  if (triggers.length) table(['Trigger', 'Reason'], triggers, { colWidths: [24, 158] });

  /* ---------------- 9. Technical sanity (mortgageability) ---------------- */
  const sn = e.sanity;
  const sColor = (st: string): [number, number, number] =>
    st === 'PASS' ? [21, 128, 61] : st === 'WARN' ? [180, 83, 9] : st === 'PENDING' ? [100, 116, 139] : [220, 38, 38];
  section(`${v.income ? '9' : '8'}. Technical Sanity Report — ${sn.verdictLabel}`);
  table(
    ['Check', 'Status', 'Finding & source', 'Action to clear upfront'],
    sn.checks.map((x) => [
      `${x.id} ${x.title}`,
      { content: x.status, styles: { fontStyle: 'bold', textColor: sColor(x.status) } },
      `${x.finding}\nSource: ${x.sources.map((s) => `${s.name}${s.live ? '' : ' (not connected)'}`).join('; ')}`,
      x.action,
    ]),
    { colWidths: [38, 20, 78, 46] },
  );

  const capture = c.customerLink?.submission;
  if (capture && e.geofence) {
    section('Customer-Link Capture — Geo-fence (photos vs pledged property)');
    table(
      ['Photo', 'Lat, Lng (+/- m)', 'Distance', 'Fence', 'Live', 'Hash'],
      e.geofence.photos.map((g) => {
        const ph = capture.photos.find((p) => p.id === g.id)!;
        return [g.label, `${ph.lat.toFixed(6)}, ${ph.lng.toFixed(6)} (+/-${ph.accuracyM})`, `${Math.round(g.distanceM)} m`, g.status, g.live ? 'Yes' : 'NO', ph.hash];
      }),
      { colWidths: [40, 50, 20, 20, 14, 38] },
    );
    if (capture.rooms.length) {
      table(
        ['Room', 'Floor', 'L x W (ft)', 'Area', 'Method'],
        capture.rooms.map((r) => [r.name, r.floorName, `${r.lengthFt} x ${r.widthFt}`, sqft(r.lengthFt * r.widthFt), r.method]),
        { colWidths: [40, 44, 34, 34, 30] },
      );
    }
  }

  /* ---------------- Annex ---------------- */
  doc.addPage();
  y = 30;
  section('Annex A — Price Evidence (6-Source Bias-Correction Triangulation)');
  table(
    ['Source', 'n', 'Raw', 'Correction', 'Corrected', 'Weight'],
    c.priceSources.map((s) => [s.label, String(s.count), formatIndianNumber(s.rawRatePerSqft), s.correctionFormulaLabel, formatIndianNumber(s.correctedRatePerSqft), `${Math.round(s.weight * 100)}%`]),
    { colWidths: [50, 10, 22, 54, 26, 20] },
  );
  table(
    null,
    [
      ['Consensus land rate', `${rate(p.rConsensus)} (range ${rate(p.rLow)} - ${rate(p.rHigh)})`],
      [
        'Authenticity Score S',
        `${p.authenticity.score}/100 = agreement ${p.authenticity.agreement.toFixed(1)}/35 + depth ${p.authenticity.depth}/25 + recency ${p.authenticity.recency.toFixed(1)}/20 + spatial ${p.authenticity.spatialTypicality}/20`,
      ],
    ],
    { kv: true },
  );

  section('Annex B — Geo-Coordinates & Comparables Evidence');
  if (c.comparables.length) {
    table(
      ['ID', 'Source', 'Lat, Lng', 'Dist.', 'Date', 'Raw', 'Adjusted', 'Note'],
      c.comparables.map((x) => [x.id, x.source.replace('_', ' '), `${x.lat.toFixed(5)}, ${x.lng.toFixed(5)}`, `${x.distanceKm} km`, x.date, formatIndianNumber(x.rawRate), formatIndianNumber(x.adjustedRate), x.note]),
      { colWidths: [14, 20, 30, 14, 18, 15, 16, 55] },
    );
  } else {
    table(null, [['No comparables on file (single-source evidence).']]);
  }

  /* ---------------- Signature block ---------------- */
  section('Digital Signature Block — Registered Valuer (RBI Phase 1 Remote e-Sign)');
  ensure(40);
  const s = c.signedByValuer;
  doc.setDrawColor(...(s ? [21, 128, 61] : [203, 213, 225]) as [number, number, number]);
  doc.setLineWidth(0.6);
  doc.roundedRect(M, y, W - 2 * M, 32, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  if (s) {
    doc.setTextColor(21, 128, 61);
    doc.text('DIGITALLY SIGNED — SIGNED & READY FOR DISBURSAL', M + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(pdfSafe(`Valuer: ${s.name}   |   IBBI Reg. No.: ${s.ibbiRegNo}`), M + 4, y + 13);
    doc.text(pdfSafe(`Signed: ${new Date(s.timestamp).toLocaleString('en-IN')}   |   Valid 90 Days (until ${s.validUntil ? new Date(s.validUntil).toLocaleDateString('en-IN') : '—'})`), M + 4, y + 18.5);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text(pdfSafe(`SHA-256: ${s.signatureHash ?? '—'}`), M + 4, y + 24);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('Simulated OTP e-sign for prototype demonstration.', M + 4, y + 29);
  } else {
    doc.setTextColor(...MUTED);
    doc.text(c.esignStatus === 'ESCALATED_PHYSICAL' ? 'ESCALATED TO PHYSICAL INSPECTION — remote sign-off not applicable' : 'PENDING — awaiting Registered Valuer remote e-sign', M + 4, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Valuer name, IBBI registration number, timestamp and signature hash will be stamped here.', M + 4, y + 16);
  }
  y += 38;

  /* ---------------- Header / footer on every page ---------------- */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...MAROON);
    doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('IDFC FIRST Bank', M, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Technical Appraisal Report · PRAMAAN evidence-backed valuation (prototype)', M, 13.5);
    doc.text(pdfSafe(c.fileNo ?? c.id), W - M, 8, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setTextColor(...MUTED);
    doc.setFontSize(7.5);
    doc.text('All figures computed deterministically by lib/engines — no LLM arithmetic. Generated ' + pdfSafe(generatedAt), M, H - 7);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 7, { align: 'right' });
  }

  return { doc, filename: `IDFC_Technical_Appraisal_${(c.fileNo ?? c.id).replace(/[^A-Za-z0-9-]+/g, '_')}.pdf` };
}

/** 1-click download (browser). */
export function generateIdfcPdf(c: PropertyCase, e: EvidencePack): void {
  const { doc, filename } = buildIdfcPdf(c, e);
  doc.save(filename);
}
