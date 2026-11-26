'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, ChevronDown, FileSignature, XCircle } from 'lucide-react';
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { formatInr, formatInrShort } from '@/lib/engines/valuation';
import { RouteBadge } from '@/components/StatusBadges';
import { Ev } from '@/components/EvidenceDrawer';
import { SanityVerdictBadge } from '@/components/workbench/SanityTab';

export default function DecisionHeader({ c, e }: { c: PropertyCase; e: EvidencePack }) {
  const [open, setOpen] = useState(false);
  const v = e.valuation;
  const r = e.routing;

  const figures = [
    { label: 'Market Value', k: 'mv', short: formatInrShort(v.mvFinal), full: formatInr(v.mvFinal) },
    { label: `FSV (${Math.round(v.fsvRatio * 100)}%)`, k: 'fsv', short: formatInrShort(v.fsv), full: formatInr(v.fsv) },
    {
      label: `Max Collateral Loan @ ${Math.round(v.ltvCap * 100)}% LTV`,
      k: 'maxLoan',
      short: formatInrShort(v.maxCollateralLoan),
      full: formatInr(v.maxCollateralLoan),
    },
  ];

  return (
    <div className="sticky top-14 z-[900] -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:-mx-6 lg:px-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[240px] flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            {c.benchmarkLabel && <span className="rounded bg-maroon/10 px-1.5 py-0.5 text-[10px] font-bold text-maroon">IDFC {c.benchmarkLabel}</span>}
            <span>{c.fileNo ?? c.id}</span>
            <span>·</span>
            <span>Case Ref {c.caseRefNo}</span>
          </div>
          <h1 className="text-lg font-bold leading-tight text-ink">{c.title}</h1>
          <div className="text-xs text-slate-500">
            {c.city}, {c.state} · {c.applicantName}
          </div>
        </div>

        {figures.map((f) => (
          <div key={f.k} className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{f.label}</div>
            <Ev k={f.k} className="text-lg font-bold text-ink">
              {f.short}
            </Ev>
            <div className="text-[11px] text-slate-500 tabular-nums">{f.full}</div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-col items-start gap-0.5 rounded-lg px-2 py-1 hover:bg-canvas"
          title="Show exact Pass/Fail gate checklist"
        >
          <span className="flex items-center gap-1">
            <RouteBadge tier={r.tier} />
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
          <span className="text-[11px] text-slate-500">SLA {r.sla}</span>
        </button>

        <div className="flex flex-col items-start gap-0.5" title="Technical sanity / mortgageability (separate from the valuation route)">
          <SanityVerdictBadge verdict={e.sanity.verdict} />
          <span className="text-[11px] text-slate-500">
            {e.sanity.counts.BLOCKER + e.sanity.counts.FAIL} remark(s) to clear · {e.sanity.counts.WARN} condition(s)
          </span>
        </div>

        <Link
          href={`/cases/${encodeURIComponent(c.id)}/report`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-maroon-deep"
        >
          <FileSignature className="h-4 w-4" /> Preview Report &amp; Remote e-Sign
        </Link>
      </div>

      {open && (
        <div className="mt-3 grid gap-4 border-t border-slate-200 pt-3 md:grid-cols-3">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-instant">Instant gates (all must pass)</h3>
            <ul className="space-y-1">
              {r.instantGates.map((g) => (
                <li key={g.id} className="flex gap-2 text-xs">
                  {g.passed ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-instant" aria-label="pass" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-label="fail" />
                  )}
                  <span>
                    <span className="font-medium text-ink">{g.label}</span>
                    <span className="block text-slate-500">{g.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <TriggerList title="Remote Review triggers" tone="text-remote" items={r.remoteTriggers} />
          <TriggerList title="Physical Check triggers" tone="text-critical" items={r.physicalTriggers} />
        </div>
      )}
    </div>
  );
}

function TriggerList({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div>
      <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</h3>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">None triggered.</p>
      )}
    </div>
  );
}
