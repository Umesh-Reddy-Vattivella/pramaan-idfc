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

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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

  const live = useMemo(() => {
    const benchmark = rows.filter((r) => r.c.isBenchmarkSample);
    return {
      medianTat: median(rows.map((r) => r.c.pramaanTatMinutes)),
      avgScore: rows.length ? Math.round(rows.reduce((s, r) => s + r.e.price.authenticity.score, 0) / rows.length) : 0,
      qcIssues: benchmark.reduce((s, r) => s + r.e.autoQc.findings.filter((f) => f.status !== 'PASS').length, 0),
      benchmarkCount: benchmark.length,
    };
  }, [rows]);

  // Headline KPI values are the PRD §6.2 portfolio figures; sub-lines are computed live from the queue.
  const kpis: Kpi[] = [
    { label: 'Median TAT', value: '41 min', compare: 'vs 7 days', sub: `Live queue median: ${live.medianTat} min`, icon: Clock },
    { label: 'Instant Route Share', value: '68%', sub: `Live queue: ${counts.INSTANT}/${counts.ALL} Instant`, icon: Zap },
    { label: 'Avg Authenticity Score', value: '84/100', sub: `Live queue avg: ${live.avgScore}/100`, icon: Gauge },
    {
      label: 'Legacy QC Errors Caught',
      value: '11',
      compare: 'across 3 IDFC samples',
      sub: `Auto-QC rule hits on ${live.benchmarkCount} samples: ${live.qcIssues}`,
      icon: Bug,
    },
    { label: 'Cost per File', value: 'Rs. 480', compare: 'vs Rs. 3,000+', sub: '~84% lower than external valuer fee', icon: IndianRupee },
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
            href="/capture"
            className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-maroon-deep"
          >
            <Plus className="h-4 w-4" /> Start Owner Self-Capture
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
                        <span className="rounded bg-maroon/10 px-1.5 py-0.5 text-[10px] font-bold text-maroon">IDFC {c.benchmarkLabel}</span>
                      ) : c.origin === 'SEED' ? (
                        <span className="rounded bg-instant-bg px-1.5 py-0.5 text-[10px] font-bold text-instant">SHOWCASE</span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          {c.origin === 'LIVE_UPLOAD' ? 'AI UPLOAD' : 'SELF-CAPTURE'}
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
                    <div className="font-semibold text-ink tabular-nums">{formatInrShort(e.valuation.mvFinal)}</div>
                    <div className="text-xs text-slate-500 tabular-nums">{formatInr(e.valuation.mvFinal)}</div>
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
                    <div className="font-semibold text-instant">{c.pramaanTatMinutes} min</div>
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
