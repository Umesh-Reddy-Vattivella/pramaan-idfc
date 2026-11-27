'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bug,
  Calculator,
  Clock,
  Gauge,
  IndianRupee,
  Plus,
  Globe,
  RotateCcw,
  Upload,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useCases } from '@/lib/state/CasesContext';
import { formatInr, formatInrShort } from '@/lib/engines/valuation';
import type { RouteTier } from '@/lib/types';
import { QcSummaryBadge, RouteBadge, ScorePill } from '@/components/StatusBadges';
import RoiCalculatorModal from '@/components/RoiCalculatorModal';
import LiveUploadModal from '@/components/LiveUploadModal';

type Filter = 'ALL' | RouteTier;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'INSTANT', label: 'Instant' },
  { id: 'REMOTE_REVIEW', label: 'Remote Review' },
  { id: 'PHYSICAL_CHECK', label: 'Physical Check' },
];

interface Kpi {
  label: string;
  value: string;
  compare?: string;
  sub: string;
  icon: LucideIcon;
}


export default function PortfolioPage() {
  const { cases, evaluations, resetDemo } = useCases();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [roiOpen, setRoiOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const rows = useMemo(
    () => cases.map((c) => ({ c, e: evaluations[c.id] })).filter((r) => r.e),
    [cases, evaluations],
  );

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { ALL: rows.length, INSTANT: 0, REMOTE_REVIEW: 0, PHYSICAL_CHECK: 0 };
    for (const r of rows) out[r.e.routing.tier]++;
    return out;
  }, [rows]);

  // KPIs are computed only from real cases in this workspace (examples excluded) — nothing hard-coded.
  const live = useMemo(() => {
    const real = rows.filter((r) => r.c.origin !== 'SEED');
    const valued = real.filter((r) => r.e.valuationReady);
    const docsOpen = real.reduce((s, r) => s + r.e.sanity.counts.BLOCKER + r.e.sanity.counts.FAIL, 0);
    const examples = rows.filter((r) => r.c.isBenchmarkSample);
    return {
      real: real.length,
      valued: valued.length,
      pending: real.length - valued.length,
      instant: valued.filter((r) => r.e.routing.tier === 'INSTANT').length,
      remarks: docsOpen,
      captured: real.filter((r) => r.c.customerLink?.submission).length,
      exampleQc: examples.reduce((s, r) => s + r.e.autoQc.findings.filter((f) => f.status !== 'PASS').length, 0),
      examples: examples.length,
    };
  }, [rows]);

  const dash = (n: number) => (live.real ? String(n) : '—');
  const kpis: Kpi[] = [
    { label: 'Customer cases', value: String(live.real), sub: live.real ? `${live.captured} with site capture received` : 'Open one from “New Case”', icon: Clock },
    { label: 'Valued', value: dash(live.valued), sub: live.real ? `${live.pending} pending market evidence` : 'No customer cases yet', icon: Gauge },
    { label: 'Instant route', value: dash(live.instant), sub: live.valued ? `of ${live.valued} valued case(s)` : 'Computed once cases are valued', icon: Zap },
    { label: 'Technical remarks open', value: dash(live.remarks), sub: 'Sanity blockers + remarks across customer cases', icon: IndianRupee },
    { label: 'Example audit', value: String(live.exampleQc), compare: `QC findings on ${live.examples} IDFC sample reports`, sub: 'From the example reconstructions', icon: Bug },
  ];

  const visible = filter === 'ALL' ? rows : rows.filter((r) => r.e.routing.tier === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Portfolio Command Center</h1>
          <p className="text-sm text-slate-500">
            LAP collateral valuations — evidence-backed, confidence-gated routing across Instant, Remote Review and Physical Check.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/bank/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maroon-deep"
          >
            <Plus className="h-4 w-4" /> New Case
          </Link>
          <Link
            href="/value"
            className="inline-flex items-center gap-1.5 rounded-lg border border-maroon bg-white px-3.5 py-2 text-sm font-semibold text-maroon hover:bg-maroon/5"
          >
            <Globe className="h-4 w-4" /> Value a New Property (Live Data)
          </Link>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-maroon bg-white px-3.5 py-2 text-sm font-semibold text-maroon hover:bg-maroon/5"
          >
            <Upload className="h-4 w-4" /> Upload Live PDF / Photos (AI)
          </button>
          <button
            type="button"
            onClick={() => setRoiOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-maroon bg-white px-3.5 py-2 text-sm font-semibold text-maroon hover:bg-maroon/5"
          >
            <Calculator className="h-4 w-4" /> IDFC Business Case / ROI Simulator
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Executive KPIs">
        {kpis.map(({ label, value, compare, sub, icon: Icon }) => (
          <div key={label} className="card relative overflow-hidden p-4">
            <div className="absolute inset-y-0 left-0 w-1 bg-maroon" aria-hidden />
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <Icon className="h-4 w-4 text-maroon" aria-hidden />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-2xl font-bold text-ink tabular-nums">{value}</span>
              {compare && <span className="text-sm font-medium text-slate-500">{compare}</span>}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">{sub}</div>
          </div>
        ))}
      </section>

      {/* Case queue */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-ink">Case Queue</h2>
            <p className="text-xs text-slate-500">All values computed live by deterministic engines (lib/engines/)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    active ? 'bg-maroon text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label} <span className="tabular-nums opacity-75">({counts[f.id]})</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={resetDemo}
              title="Restore the 4 golden seed cases"
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-400 hover:text-maroon"
            >
              <RotateCcw className="h-3 w-3" /> Reset demo
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Case</th>
                <th className="px-3 py-2.5">Applicant</th>
                <th className="px-3 py-2.5 text-right">Market Value</th>
                <th className="px-3 py-2.5">Authenticity</th>
                <th className="px-3 py-2.5">Auto-QC</th>
                <th className="px-3 py-2.5">Routing Cascade</th>
                <th className="px-3 py-2.5 text-right">TAT</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map(({ c, e }) => (
                <tr key={c.id} className="hover:bg-canvas/70">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {c.benchmarkLabel ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title="Example reconstructed from an IDFC sample report">EXAMPLE · IDFC {c.benchmarkLabel}</span>
                      ) : c.origin === 'SEED' ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title="Illustrative example, not a real customer">EXAMPLE</span>
                      ) : c.origin === 'LIVE_MARKET' ? (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">LIVE MARKET</span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          {c.origin === 'LIVE_UPLOAD' ? 'AI UPLOAD' : 'CUSTOMER CASE'}
                        </span>
                      )}
                      <span className="font-semibold text-ink">{c.title}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {c.fileNo ?? c.id} · Ref {c.caseRefNo} · {c.city}, {c.state}
                    </div>
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-xs text-slate-600">{c.applicantName}</td>
                  <td className="px-3 py-3 text-right">
                    {e.valuationReady ? (
                      <>
                        <div className="font-semibold text-ink tabular-nums">{formatInrShort(e.valuation.mvFinal)}</div>
                        <div className="text-xs text-slate-500 tabular-nums">{formatInr(e.valuation.mvFinal)}</div>
                      </>
                    ) : (
                      <div className="text-xs font-semibold text-slate-400">Pending market evidence</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <ScorePill score={e.price.authenticity.score} instantThreshold={e.price.instantThreshold} />
                  </td>
                  <td className="px-3 py-3">
                    <QcSummaryBadge findings={e.autoQc.findings} />
                  </td>
                  <td className="px-3 py-3">
                    <RouteBadge tier={e.routing.tier} />
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {c.esignStatus === 'SIGNED_BY_VALUER' ? (
                        <span className="font-semibold text-instant">SIGNED &amp; READY FOR DISBURSAL</span>
                      ) : c.esignStatus === 'ESCALATED_PHYSICAL' ? (
                        <span className="font-semibold text-critical">ESCALATED — PHYSICAL</span>
                      ) : (
                        e.routing.sla
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">
                    <div className="font-semibold text-instant">{c.pramaanTatMinutes ? `${c.pramaanTatMinutes} min` : 'In progress'}</div>
                    {c.legacyTatDays !== undefined && <div className="text-slate-400 line-through">{c.legacyTatDays} days</div>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/cases/${encodeURIComponent(c.id)}`}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-maroon px-3 py-1.5 text-xs font-semibold text-white hover:bg-maroon-deep"
                    >
                      Open Workbench <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                    No cases in this route.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RoiCalculatorModal open={roiOpen} onClose={() => setRoiOpen(false)} />
      <LiveUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
