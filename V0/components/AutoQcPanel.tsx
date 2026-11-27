'use client';

import { ArrowRight, Bot, FileWarning, UserRound } from 'lucide-react';
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { QcStatusBadge } from '@/components/StatusBadges';

export default function AutoQcPanel({ c, e }: { c: PropertyCase; e: EvidencePack }) {
  const q = e.autoQc;
  const issues = q.findings.filter((f) => f.status !== 'PASS').length;

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-base font-bold text-ink">Auto-QC &amp; Legacy Error Audit</h2>
          <p className="text-xs text-slate-500">
            6 deterministic rules run on Day 0 —{' '}
            {c.legacyAgencyName ? `compared against the legacy report by ${c.legacyAgencyName}` : 'no legacy report on this file'}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="badge badge-critical">{q.criticalFailCount} critical</span>
          <span className="badge badge-critical">{q.failCount} fail</span>
          <span className="badge badge-remote">{q.warnCount} warn</span>
          <span className="badge badge-instant">{6 - issues} pass</span>
        </div>
      </section>

      {q.findings.map((f) => {
        const flagged = f.status !== 'PASS';
        return (
          <section key={f.ruleId} className={`card overflow-hidden ${f.status === 'CRITICAL_FAIL' ? 'ring-2 ring-critical/40' : ''}`}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">{f.ruleId}</span>
                <span className="text-sm font-semibold text-ink">{f.title}</span>
              </div>
              <QcStatusBadge status={f.status} />
            </div>
            <div className="grid md:grid-cols-[1fr_auto_1fr]">
              <div className="p-4">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <UserRound className="h-3.5 w-3.5" /> What the legacy human report missed
                </div>
                <p className={`text-sm ${flagged ? 'text-ink' : 'text-slate-500'}`}>{f.legacyReportValue}</p>
              </div>
              <div className="hidden items-center px-1 md:flex">
                <ArrowRight className="h-5 w-5 text-slate-300" />
              </div>
              <div className={`p-4 ${flagged ? (f.status === 'WARN' ? 'bg-remote-bg/60' : 'bg-critical-bg/60') : 'bg-instant-bg/50'}`}>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Bot className="h-3.5 w-3.5" /> What PRAMAAN flagged on Day 0
                </div>
                <p className="text-sm text-ink">{f.pramaanDetection}</p>
                {flagged && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-slate-700">
                    <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Action: {f.actionRequired}
                  </p>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
