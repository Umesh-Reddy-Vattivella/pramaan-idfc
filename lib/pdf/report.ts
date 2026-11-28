/* ------------------------------------------------------------------
   Technical valuation report PDF (browser only — load with dynamic import()).
   Presents engine results; computes nothing itself.
   ------------------------------------------------------------------ */
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { Application } from '@/lib/domain/types';
import { assignedSnapshots, OCCUPANCY_LABEL, PROPERTY_TYPE_LABEL, STRUCTURE_LABEL, USAGE_LABEL } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { CATEGORY_LABEL, KIND_LABEL } from '@/lib/engines/evidence';
import { VERDICT_LABEL } from '@/lib/engines/sanity';

const MAROON: [number, number, number] = [156, 29, 38];

/** Standard PDF fonts are WinAnsi — replace characters they cannot draw. */
const t = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/₹/g, 'Rs. ')
    .replace(/[−–]/g, '-')
    .replace(/≈/g, '~')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/→/g, '->')
    .replace(/Σ/g, 'sum')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .replace(/[—]/g, '-')
    .replace(/·/g, '|')
    .replace(/±/g, '+/-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[ₖσ]/g, '')
    .replace(/[^ -~]/g, '');

export async function downloadReport(a: Application, ev: Evaluation) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 14;
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const heading = (s: string) => {
    if (y > 265) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...MAROON);
    doc.text(t(s), 14, y);
    doc.setTextColor(30, 41, 59);
    y += 2;
  };
  const table = (head: string[] | null, body: RowInput[], widths?: Record<number, number>) => {
    autoTable(doc, {
      startY: y,
      head: head ? [head.map(t)] : undefined,
      // keep merged cells ({ content, colSpan }) as objects; sanitise their text
      body: body.map((r) => (r as unknown[]).map((c) => (c && typeof c === 'object' && 'content' in c ? { ...(c as object), content: t((c as { content: string }).content) } : t(c as string)))) as RowInput[],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: MAROON, textColor: 255, fontStyle: 'bold' },
      columnStyles: widths ? Object.fromEntries(Object.entries(widths).map(([k, w]) => [k, { cellWidth: w }])) : undefined,
      margin: { left: 14, right: 14 },
    });
    y = lastY() + 7;
  };

  // Header
  doc.setFillColor(...MAROON);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('IDFC FIRST Bank - Technical Valuation Report (LAP)', 14, 10);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(t(`PRAMAAN · ${a.ref} · generated ${new Date().toLocaleString('en-IN')}`), 14, 16);
  y = 30;
  doc.setTextColor(30, 41, 59);
  if (a.review.status !== 'ISSUED') {
    doc.setFontSize(9);
    doc.setTextColor(180, 83, 9);
    doc.text('DRAFT - report not yet issued by the bank', 14, y - 3);
    doc.setTextColor(30, 41, 59);
    y += 2;
  }

  const v = ev.valuation;
  const m = ev.measure;
  heading('1. Application & property');
  table(null, [
    ['Application no.', a.ref, 'Borrower', a.borrower.name],
    ['LOS reference', a.borrower.losRef ?? '-', 'Property type', PROPERTY_TYPE_LABEL[a.property.type]],
    ['Address (deed)', { content: t(a.property.address), colSpan: 3 } as unknown as string],
    ['Coordinates', ev.pin ? `${ev.pin.lat.toFixed(6)}, ${ev.pin.lng.toFixed(6)}` : '-', 'Declared usage', USAGE_LABEL[a.property.usage]],
    ['Structure', a.property.type === 'PLOT' ? '-' : STRUCTURE_LABEL[a.property.structure], 'Age', a.property.ageYears !== null ? `${a.property.ageYears} years` : '-'],
    ['Occupancy (seen)', a.inspection.occupancy ? OCCUPANCY_LABEL[a.inspection.occupancy] : '-', 'Usage (seen)', a.inspection.observedUsage ? USAGE_LABEL[a.inspection.observedUsage] : '-'],
  ]);

  heading('2. Valuation summary');
  table(null, [
    ['Market value', v.mv ? `Rs. ${Math.round(v.mv).toLocaleString('en-IN')}` : 'Pending', 'Forced-sale value', v.fsv ? `Rs. ${Math.round(v.fsv).toLocaleString('en-IN')}` : '-'],
    ['Max eligible loan', v.maxLoan ? `Rs. ${Math.round(v.maxLoan).toLocaleString('en-IN')} (LTV ${Math.round(v.ltvCap * 100)}%)` : '-', 'Technical verdict', VERDICT_LABEL[ev.sanity.verdict]],
    ['In words', { content: v.words ?? '-', colSpan: 3 } as unknown as string],
  ]);

  heading('3. Calculation');
  if (v.lines.length) table(['Step', 'Formula', 'Working', 'Result'], v.lines.map((l) => [l.label, l.formula, l.working, l.result]), { 0: 32, 1: 50, 2: 64 });
  if (v.missing.length) table(null, [['Missing inputs', v.missing.join('; ')]]);

  heading('4. Measurement');
  table(null, [
    ['Plot area (deed)', m.deedPlotSqft ? `${Math.round(m.deedPlotSqft)} sqft` : '-', 'Plot area (satellite)', m.satellitePlotSqft ? `${Math.round(m.satellitePlotSqft)} sqft` : '-'],
    ['Built-up (floor plan)', m.planBuaSqft ? `${Math.round(m.planBuaSqft)} sqft` : '-', 'Built-up (approved)', m.approvedBuaSqft ? `${Math.round(m.approvedBuaSqft)} sqft` : '-'],
    ['Check area', m.checkBasis === 'SATELLITE' ? `${Math.round(m.satelliteBuaSqft!)} sqft (roof ${Math.round(m.footprintSqft!)} x ${m.floorsForCheck} floors)` : m.checkBasis === 'DEED' ? `${Math.round(m.declaredBuaSqft!)} sqft (deed)` : '-', 'Measurement confidence', m.confidence ? `${m.confidence.total}/100 (delta ${m.areaDeltaPct!.toFixed(1)}%)` : '-'],
    ['Deviation vs plan', m.deviationPct !== null ? `${m.deviationPct.toFixed(1)}%` : '-', 'BUA valued', `${Math.round(m.buaValuedSqft)} sqft`],
    ['Floors seen / approved', `${a.inspection.observedFloors ?? '-'} / ${a.plan.approvedFloors ?? '-'}`, 'FSI actual / permissible', `${m.fsiActual?.toFixed(2) ?? '-'} / ${m.fsiPermissible?.toFixed(2) ?? '-'}`],
  ]);
  if (m.floorPlan.length) table(['Floor', `Area on plan (sqft, ${a.floorPlan?.basis === 'CARPET' ? 'carpet' : 'built-up'})`, 'Built-up (sqft)'], m.floorPlan.map((f) => [f.floor, Math.round(f.areaSqft).toLocaleString('en-IN'), Math.round(f.buaSqft).toLocaleString('en-IN')]));

  heading('5. Market evidence used');
  const used = ev.evidence.assessed.filter((x) => x.used);
  if (used.length)
    table(
      ['Category', 'Type', 'Rate (Rs./sqft)', 'Distance', 'Date', 'Source'],
      used.map((x) => [CATEGORY_LABEL[x.point.category], KIND_LABEL[x.point.kind], Math.round(x.rate ?? 0).toLocaleString('en-IN'), x.distanceKm !== null ? `${x.distanceKm.toFixed(1)} km` : '-', x.point.date ?? '-', x.point.url ?? x.point.title ?? '-']),
      { 5: 62 },
    );
  else table(null, [['No market evidence applied yet.']]);
  const unitType = a.property.type === 'FLAT' || a.property.type === 'SHOP_OFFICE';
  const pc = unitType ? ev.evidence.built : ev.evidence.land;
  const fr = unitType ? ev.rates.BUILT : ev.rates.LAND;
  if (pc) {
    const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
    const rows: string[][] = [
      ['Per source kind', pc.rows.map((r) => `${KIND_LABEL[r.kind]}: ${rs(r.rate)}/sqft, n ${r.n} (n_eff ${r.nEff.toFixed(1)}), sigma ${(r.sigmaRel * 100).toFixed(1)}%, weight ${(r.weight * 100).toFixed(0)}%`).join('; ')],
      ['Local vs wider', pc.local ? `T1 ${rs(pc.local.rate)} (n_eff ${pc.nEffT1.toFixed(1)}), all tiers ${rs(pc.all.rate)}; Z = ${pc.z.toFixed(2)}` : `No same-locality points; all tiers ${rs(pc.all.rate)}`],
      ['Market rate (80% range)', `${rs(pc.rate)}/sqft (${rs(pc.low)} - ${rs(pc.high)}), u ${(pc.u * 100).toFixed(1)}%${pc.thinMarket ? ' - thin market' : ''}`],
    ];
    if (fr?.guideline) rows.push(['Government value', `${rs(fr.guideline.rate)}/sqft ${fr.guideline.official ? `(IGRS Telangana, ${fr.guideline.ref?.locality ?? ''}, effective ${fr.guideline.ref?.effectiveDate ?? '-'}) - floor` : '(web search) - check only'}`]);
    if (fr?.purchase) rows.push(['Purchase price, indexed', `${rs(fr.purchase.rate)}/sqft after ${fr.purchase.years.toFixed(1)} years, u ${(fr.purchase.u * 100).toFixed(1)}%, weight ${(fr.wPurchase * 100).toFixed(0)}%`]);
    if (fr) rows.push(['Rate used', `${rs(fr.rate)}/sqft (${rs(fr.low)} - ${rs(fr.high)})${fr.floorApplied ? ' - held at the government value' : ''}`]);
    const sc = pc.score;
    rows.push(['Authenticity score', `${sc.total}/100 (agreement ${sc.agreement.toFixed(1)}, depth ${sc.depth.toFixed(1)}, recency ${sc.recency.toFixed(1)}, spatial ${sc.spatial.toFixed(1)})`]);
    table(null, rows);
  }

  heading('6. Site inspection (video call)');
  table(null, [['Geo-fence', ev.geofence.summary]]);
  if (assignedSnapshots(a.inspection.snapshots).length) {
    table(
      ['View', 'Taken', 'GPS', 'Distance', 'Status'],
      assignedSnapshots(a.inspection.snapshots).map((s) => {
        const f = ev.geofence.perSnapshot[s.id];
        return [s.label, new Date(s.takenAt).toLocaleString('en-IN'), s.lat !== null ? `${s.lat.toFixed(5)}, ${s.lng!.toFixed(5)} (±${s.accuracyM} m)` : 'none', f?.distanceM != null ? `${Math.round(f.distanceM)} m` : '-', f?.status ?? '-'];
      }),
    );
    const thumbs = assignedSnapshots(a.inspection.snapshots).filter((s) => s.thumb.startsWith('data:image/jpeg')).slice(0, 8);
    if (thumbs.length) {
      if (y > 230) {
        doc.addPage();
        y = 16;
      }
      const w = 42;
      thumbs.forEach((s, i) => {
        const x = 14 + (i % 4) * (w + 3);
        const yy = y + Math.floor(i / 4) * 36;
        try {
          doc.addImage(s.thumb, 'JPEG', x, yy, w, 30);
        } catch {
          /* skip unreadable thumbnail */
        }
        doc.setFontSize(6.5);
        doc.text(t(s.label).slice(0, 34), x, yy + 33);
      });
      y += Math.ceil(thumbs.length / 4) * 36 + 6;
    }
  }

  heading('7. Documents');
  table(['Document', 'Status', 'Files'], a.documents.map((d) => [`${d.label}${d.mandatory ? ' (mandatory)' : ''}`, d.status === 'UPLOADED' ? 'Received' : d.status.charAt(0) + d.status.slice(1).toLowerCase(), d.files.map((f) => f.name).join(', ') || '-']));

  heading('8. Technical remarks');
  table(['#', 'Check', 'Status', 'Finding / action'], ev.sanity.checks.map((c) => [c.id, c.title, c.status === 'WARN' ? 'CONDITION' : c.status, `${c.finding}${c.action ? ` Action: ${c.action}` : ''}`]), { 0: 10, 1: 40, 2: 22 });

  heading('9. Bank remarks & sign-off');
  table(null, [
    ['Remarks', a.review.remarks || '-'],
    ['Issued by', a.review.status === 'ISSUED' ? `${a.review.issuedBy} on ${new Date(a.review.issuedAt!).toLocaleString('en-IN')}` : 'Not issued'],
  ]);

  doc.setFontSize(7);
  doc.setTextColor(120);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(t(`${a.ref} · Page ${i} of ${pages} · Valuation computed deterministically by PRAMAAN; market figures from cited sources. Prototype.`), 14, 290);
  }
  doc.save(`${a.ref}-technical-valuation.pdf`);
}
