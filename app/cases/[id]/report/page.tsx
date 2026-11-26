'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Download, Footprints, Loader2, ShieldCheck } from 'lucide-react';
import { useCases } from '@/lib/state/CasesContext';
import { formatIndianNumber, formatInr, formatPctTrunc } from '@/lib/engines/valuation';
import { SPATIAL_TIER_LABEL } from '@/lib/engines/price';
import { USAGE_LABEL } from '@/lib/engines/usage';
import { SOURCE_SHORT } from '@/lib/sourceMeta';
import { QcStatusBadge, RouteBadge } from '@/components/StatusBadges';
import RemoteESignModal from '@/components/RemoteESignModal';
import { SanityStatusBadge, SanityVerdictBadge } from '@/components/workbench/SanityTab';

const sqft = (n: number) => `${formatIndianNumber(Math.round(n * 100) / 100)} sqft`;
const rate = (n: number) => `Rs. ${formatIndianNumber(Math.round(n))}/sqft`;

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { getCase, getEvaluation, hydrated, updateCase } = useCases();
  const c = getCase(id);
  const e = getEvaluation(id);
  const [signOpen, setSignOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (!c || !e) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-slate-500">{hydrated ? `Case "${id}" not found.` : 'Loading report…'}</p>
        <Link href="/" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-maroon">
          <ArrowLeft className="h-4 w-4" /> Back to Portfolio
        </Link>
      </div>
    );
  }

  const m = e.measure;
  const v = e.valuation;
  const p = e.price;
  const lb = v.landBuilding;
  const physical = e.routing.tier === 'PHYSICAL_CHECK';
  const signed = c.esignStatus === 'SIGNED_BY_VALUER' && c.signedByValuer;
  const refLabel = m.deviationReference === 'BYLAWS_PERMISSIBLE' ? 'Permissible' : 'Sanctioned';
  let n = 0;
  const sec = () => ++n;

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { generateIdfcPdf } = await import('@/lib/pdf/generateIdfcPdf');
      generateIdfcPdf(c, e);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF generation failed');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/cases/${encodeURIComponent(c.id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-maroon">
          <ArrowLeft className="h-4 w-4" /> Back to Workbench
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadPdf}
            disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-maroon bg-white px-4 py-2 text-sm font-semibold text-maroon hover:bg-maroon/5 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download IDFC PDF Report
          </button>
          {physical ? (
            c.esignStatus === 'ESCALATED_PHYSICAL' ? (
              <span className="badge badge-critical px-3 py-2 text-sm">
                <Footprints className="h-4 w-4" /> Escalated to Physical Inspection
              </span>
            ) : (
              <button
                type="button"
                onClick={() => updateCase(c.id, { esignStatus: 'ESCALATED_PHYSICAL' })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-critical px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                title="Physical Check route — remote e-sign not permitted"
              >
                <Footprints className="h-4 w-4" /> Escalate to Physical Inspection
              </button>
            )
          ) : signed ? (
            <span className="badge badge-instant px-3 py-2 text-sm">
              <BadgeCheck className="h-4 w-4" /> SIGNED &amp; READY FOR DISBURSAL
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setSignOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maroon-deep"
            >
              <ShieldCheck className="h-4 w-4" /> Remote Registered Valuer e-Sign (RBI Phase 1)
            </button>
          )}
        </div>
      </div>
      {pdfError && <p className="rounded-md bg-critical-bg px-3 py-2 text-sm text-critical">{pdfError}</p>}
      {physical && (
        <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">
          Physical Check route: remote sign-off is disabled. Triggers — {e.routing.physicalTriggers.join(' ')}
        </p>
      )}

      {/* Paper */}
      <article className="mx-auto max-w-[900px] bg-white shadow-lg ring-1 ring-slate-200">
        <header className="flex items-start justify-between gap-4 bg-maroon px-8 py-5 text-white">
          <div>
            <div className="text-lg font-bold">IDFC FIRST Bank</div>
            <div className="text-xs text-white/80">Technical Appraisal Report · Loan Against Property</div>
            <div className="mt-0.5 text-[11px] text-white/60">PRAMAAN evidence-backed valuation (prototype)</div>
          </div>
          <div className="text-right text-xs tabular-nums">
            <div className="font-semibold">{c.fileNo ?? c.id}</div>
            <div>Case Ref {c.caseRefNo}</div>
            <div className="mt-1.5">
              <RouteBadge tier={e.routing.tier} />
            </div>
          </div>
        </header>

        <div className="space-y-6 px-8 py-6 text-sm">
          <Section n={sec()} title="Basic Details">
            <KV
              rows={[
                ['Applicant / Owner', c.applicantName],
                ['Property', c.title],
                ['Location', `${c.city}, ${c.state}`],
                ['Usage (confirmed)', `${USAGE_LABEL[e.usage.appliedUsage]} — LTV cap ${Math.round(e.usage.appliedLtvCap * 100)}%`],
                ['Legacy agency / timeline', c.legacyAgencyName ? `${c.legacyAgencyName} · Visit ${c.legacyVisitDate ?? '—'} · Report ${c.legacyReportDate ?? '—'} · Signed ${c.legacySignDate ?? '—'}` : 'PRAMAAN capture — no legacy report'],
                ['PRAMAAN turnaround', `${c.pramaanTatMinutes} min${c.legacyTatDays !== undefined ? ` (legacy ${c.legacyTatDays} days)` : ''}`],
                ...(c.details ?? []).map((d) => [d.label, d.value] as [string, string]),
              ]}
            />
          </Section>

          <Section n={sec()} title="Locality, Geo-Coordinates & GIS">
            <KV
              rows={[
                ['Geo-coordinates', `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`],
                ['Approach road', `${c.roadWidthCurrentFt} ft${c.roadWidthProposedFt ? ` (proposed ${c.roadWidthProposedFt} ft)` : ''}${c.roadSide ? `, ${c.roadSide}` : ''}`],
                ['GIS hazards', m.activeHazards.length ? m.activeHazards.join(', ').replaceAll('_', ' ') : 'None'],
                ['Sanctioned-map geo-tag', c.sanctionedMapGeoOffsetMeters !== undefined ? `${c.sanctionedMapGeoOffsetMeters} m from actual site` : 'Not applicable'],
                ['Circle / guideline rate', c.circleRatePerSqft ? `${rate(c.circleRatePerSqft)} (${p.circleGapMultiple?.toFixed(2)}× gap)` : 'Not stated in source report'],
                ['Price evidence tier', SPATIAL_TIER_LABEL[c.spatialFallbackTier]],
              ]}
            />
          </Section>

          <Section n={sec()} title="Building & Floor-wise Deviation">
            <Table
              head={['Floor', `${refLabel} (sqft)`, 'Actual (sqft)', 'Deviation (sqft)', 'Deviation %']}
              rows={m.floorDeviations.map((f) => [
                <span key="f" className={f.temporary ? 'font-semibold text-remote' : ''}>
                  {f.floorName}
                  {f.temporary ? ' [temporary]' : ''}
                </span>,
                formatIndianNumber(f.referenceSqft),
                formatIndianNumber(f.actualSqft),
                formatIndianNumber(f.deviationSqft),
                f.deviationPct === null ? (f.actualSqft > 0 && f.referenceSqft === 0 ? 'Not in plan' : '—') : formatPctTrunc(f.deviationPct),
              ])}
              foot={[
                'Total (permanent)',
                m.buaReference === null ? '—' : formatIndianNumber(m.buaReference),
                formatIndianNumber(m.buaActual),
                m.buaDeviationSqft === null ? '—' : formatIndianNumber(m.buaDeviationSqft),
                m.buaDeviationPct === null ? 'N/A (no plan)' : formatPctTrunc(m.buaDeviationPct),
              ]}
            />
            {m.buaActualInclTemporary !== m.buaActual && m.buaDeviationPctInclTemporary !== null && (
              <p className="mt-1 text-xs text-remote">
                Including tin shed / temporary: {sqft(m.buaActualInclTemporary)} → {formatPctTrunc(m.buaDeviationPctInclTemporary)}
              </p>
            )}
          </Section>

          <Section n={sec()} title="Land & Building Valuation">
            <Table
              head={['Component', 'Quantity', 'Rate', 'Value']}
              rows={[
                ['Land (A_net)', sqft(m.aNet), rate(v.rLand), formatInr(lb.landValue)],
                [`Building (${m.buaBasis.replaceAll('_', ' ').toLowerCase()})`, sqft(m.buaValued), rate(lb.rConstrDepreciated), formatInr(lb.buildingValue)],
                ['Amenities', '', '', formatInr(lb.amenitiesValue)],
              ]}
              foot={['MARKET VALUE (MV)', '', '', formatInr(v.mvFinal)]}
            />
            <p className="mt-2 rounded-md bg-canvas px-3 py-2 text-sm italic text-ink">In words: {v.amountInWords}</p>
            <KV
              rows={[
                [`Forced-Sale Value (${Math.round(v.fsvRatio * 100)}%)`, formatInr(v.fsv)],
                [`Max Collateral Loan (${Math.round(v.ltvCap * 100)}% LTV)`, formatInr(v.maxCollateralLoan)],
                ...(v.requestedLoan !== null && v.requestedLoanLtvPct !== null
                  ? [['Requested loan → LTV', `${formatInr(v.requestedLoan)} → ${formatPctTrunc(v.requestedLoanLtvPct, 1)}`] as [string, string]]
                  : []),
                ['Land-rate basis', `${v.rLandBasisNote}${v.rLandBasis === 'ADOPTED' ? ` · at PRAMAAN consensus ${rate(v.rConsensusRounded)}: ${formatInr(v.landValueAtConsensus)}` : ''}`],
                ['Depreciation', `D = ${(lb.depreciationD * 100).toFixed(2)}% (age ${c.ageYears} / total life ${lb.totalLifeYears} yrs × 0.90)`],
              ]}
            />
          </Section>

          {v.income && (
            <Section n={sec()} title="Income Yield Cross-Check">
              <KV
                rows={[
                  ['Monthly rent', formatInr(c.monthlyRentInr ?? 0)],
                  ['Annual rent', formatInr(v.income.annualRent)],
                  ['Gross yield', `${v.income.grossYieldPct.toFixed(2)}%`],
                  ['Income capitalisation value', `${formatInr(v.income.mvIncome)} (outgoings ${(v.income.outgoingsPct * 100).toFixed(0)}%, cap rate ${((c.capRate ?? 0) * 100).toFixed(1)}%)`],
                  ['Variance vs MV', `${v.income.variancePct.toFixed(2)}% → ${v.income.yieldGuardrailFlag ? 'YIELD GUARDRAIL FLAG' : 'within 15% guardrail'}`],
                ]}
              />
            </Section>
          )}

          <Section n={sec()} title="Boundaries (Deed vs Site / Satellite)">
            {m.boundaries.length ? (
              <Table head={['Direction', 'As per Deed', 'At Site / Satellite', 'Match']} rows={m.boundaries.map((b) => [b.direction, b.asPerDeed, b.atSiteSatellite, b.matched ? 'Yes' : 'MISMATCH'])} />
            ) : (
              <p className="text-slate-500">Boundary schedule not captured in the source report.</p>
            )}
          </Section>

          <Section n={sec()} title="Auto-QC Remarks">
            <ol className="space-y-2">
              {e.autoQc.findings.map((f) => (
                <li key={f.ruleId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {f.ruleId} · {f.title}
                    </span>
                    <QcStatusBadge status={f.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Legacy: {f.legacyReportValue}</p>
                  <p className="mt-0.5 text-sm text-ink">{f.pramaanDetection}</p>
                  {f.status !== 'PASS' && <p className="mt-0.5 text-xs font-medium text-slate-700">Action: {f.actionRequired}</p>}
                </li>
              ))}
            </ol>
          </Section>

          <Section n={sec()} title="Technical Sanity Report (mortgageability)">
            <div className="mb-2 flex items-center gap-2">
              <SanityVerdictBadge verdict={e.sanity.verdict} />
              <span className="text-xs text-slate-500">Separate from the valuation route — remarks to clear before sanction.</span>
            </div>
            <ol className="space-y-1.5">
              {e.sanity.checks
                .filter((x) => x.status !== 'PASS')
                .map((x) => (
                  <li key={x.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {x.id} · {x.title}
                      </span>
                      <SanityStatusBadge status={x.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-ink">{x.finding}</p>
                    {x.action !== 'None.' && <p className="mt-0.5 text-xs font-medium text-slate-700">Action: {x.action}</p>}
                  </li>
                ))}
            </ol>
            <p className="mt-2 text-xs text-slate-500">{e.sanity.counts.PASS} other check(s) clear.</p>
          </Section>

          <Section n={sec()} title="Annex — Price Evidence, Geo-Coordinates & Comparables">
            <Table
              head={['Source', 'n', 'Raw', 'Correction', 'Corrected', 'Weight']}
              rows={c.priceSources.map((s) => [s.label, String(s.count), formatIndianNumber(s.rawRatePerSqft), s.correctionFormulaLabel, formatIndianNumber(s.correctedRatePerSqft), `${Math.round(s.weight * 100)}%`])}
              foot={['Consensus', '', '', `S = ${p.authenticity.score}/100`, formatIndianNumber(Math.round(p.rConsensus)), '']}
            />
            <div className="mt-3">
              {c.comparables.length ? (
                <Table
                  head={['Source', 'Lat, Lng', 'Dist.', 'Date', 'Adj. rate', 'Note']}
                  rows={c.comparables.map((x) => [SOURCE_SHORT[x.source], `${x.lat.toFixed(5)}, ${x.lng.toFixed(5)}`, `${x.distanceKm} km`, x.date, formatIndianNumber(x.adjustedRate), x.note])}
                />
              ) : (
                <p className="text-slate-500">No comparables on file (single-source evidence).</p>
              )}
            </div>
          </Section>

          <Section n={sec()} title="Digital Signature Block — Registered Valuer">
            {signed && c.signedByValuer ? (
              <div className="rounded-xl border-2 border-instant bg-instant-bg/60 p-4">
                <div className="flex items-center gap-2 font-bold text-instant">
                  <BadgeCheck className="h-5 w-5" /> DIGITALLY SIGNED — SIGNED &amp; READY FOR DISBURSAL
                </div>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div><dt className="inline text-slate-500">Valuer: </dt><dd className="inline font-medium">{c.signedByValuer.name}</dd></div>
                  <div><dt className="inline text-slate-500">IBBI Reg. No.: </dt><dd className="inline font-medium">{c.signedByValuer.ibbiRegNo}</dd></div>
                  <div><dt className="inline text-slate-500">Signed: </dt><dd className="inline font-medium">{new Date(c.signedByValuer.timestamp).toLocaleString('en-IN')}</dd></div>
                  <div><dt className="inline text-slate-500">Validity: </dt><dd className="inline font-medium">Valid 90 Days{c.signedByValuer.validUntil ? ` (until ${new Date(c.signedByValuer.validUntil).toLocaleDateString('en-IN')})` : ''}</dd></div>
                </dl>
                <p className="mt-2 break-all font-mono text-[10px] text-slate-600">SHA-256 {c.signedByValuer.signatureHash}</p>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-slate-500">
                {c.esignStatus === 'ESCALATED_PHYSICAL'
                  ? 'Escalated to physical inspection — remote sign-off not applicable.'
                  : physical
                    ? 'Physical Check route — remote sign-off disabled pending physical inspection.'
                    : 'PENDING — awaiting Registered Valuer remote e-sign (valuer name, IBBI Reg. No., timestamp, 90-day validity).'}
              </div>
            )}
          </Section>
        </div>
        <footer className="border-t border-slate-200 px-8 py-3 text-[11px] text-slate-400">
          All figures computed deterministically by lib/engines — no LLM arithmetic.
        </footer>
      </article>

      <RemoteESignModal c={c} e={e} open={signOpen} onClose={() => setSignOpen(false)} />
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 border-b-2 border-maroon pb-1 text-sm font-bold uppercase tracking-wide text-maroon">
        <span className="tabular-nums">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <table className="mt-1 w-full">
      <tbody className="divide-y divide-slate-100">
        {rows.map(([k, val], i) => (
          <tr key={`${k}-${i}`}>
            <td className="w-56 py-1.5 pr-3 align-top text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</td>
            <td className="py-1.5 text-ink tabular-nums">{val}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Table({ head, rows, foot }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-slate-200 text-xs">
        <thead>
          <tr className="bg-maroon-deep text-left text-white">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="even:bg-canvas">
              {r.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 tabular-nums">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-bold">
              {foot.map((cell, j) => (
                <td key={j} className="px-2 py-1.5 tabular-nums">{cell}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
