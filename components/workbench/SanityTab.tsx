'use client';

import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, Database, FileWarning, ListChecks, Radio, XCircle, type LucideIcon } from 'lucide-react';
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { VERDICT_META, type SanityPillar, type SanityStatus, type SanityVerdict } from '@/lib/engines/sanity';

export const SANITY_STYLE: Record<SanityStatus, { cls: string; label: string; icon: LucideIcon }> = {
  PASS: { cls: 'badge-instant', label: 'CLEAR', icon: CheckCircle2 },
  WARN: { cls: 'badge-remote', label: 'CONDITION', icon: AlertTriangle },
  FAIL: { cls: 'badge-critical', label: 'REMARK', icon: XCircle },
  BLOCKER: { cls: 'badge-critical', label: 'BLOCKER', icon: AlertOctagon },
  PENDING: { cls: 'bg-slate-100 text-slate-600', label: 'PENDING', icon: Clock },
};

export function SanityStatusBadge({ status }: { status: SanityStatus }) {
  const s = SANITY_STYLE[status];
  const Icon = s.icon;
  return (
    <span className={`badge ${s.cls}`}>
      <Icon className="h-3 w-3" aria-hidden /> {s.label}
    </span>
  );
}

export function SanityVerdictBadge({ verdict }: { verdict: SanityVerdict }) {
  const m = VERDICT_META[verdict];
  const Icon = m.tone === 'instant' ? CheckCircle2 : m.tone === 'remote' ? AlertTriangle : AlertOctagon;
  return (
    <span className={`badge badge-${m.tone}`}>
      <Icon className="h-3 w-3" aria-hidden /> {m.label.toUpperCase()}
    </span>
  );
}

const PILLAR: Record<SanityPillar, { n: string; label: string }> = {
  IDENTIFICATION: { n: '①', label: 'Identification — is this the right property?' },
  MEASUREMENT: { n: '②', label: 'Measurement — is what is built what was approved?' },
  LEGAL_COMPLIANCE: { n: '③', label: 'Legal & regulatory — can the bank safely hold and sell it?' },
};

export default function SanityTab({ c, e }: { c: PropertyCase; e: EvidencePack }) {
  const s = e.sanity;
  const tone = VERDICT_META[s.verdict].tone;

  return (
    <div className="space-y-4">
      <section className={`card overflow-hidden ${tone === 'critical' ? 'ring-2 ring-critical/30' : tone === 'remote' ? 'ring-2 ring-remote/30' : 'ring-2 ring-instant/30'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <ListChecks className="h-4 w-4 text-maroon" /> Technical Sanity Report
            </h2>
            <p className="max-w-2xl text-xs text-slate-500">
              The technical remarks a valuer would raise after a 48-hour visit, checked on Day 0 against documents, the customer&apos;s geo-tagged capture and government records,
              with what clears each one now. Mortgageability is separate from the valuation route ({e.routing.label}).
            </p>
          </div>
          <div className="text-right">
            <SanityVerdictBadge verdict={s.verdict} />
            <div className="mt-1.5 flex flex-wrap justify-end gap-1 text-[11px]">
              {(['BLOCKER', 'FAIL', 'WARN', 'PENDING', 'PASS'] as SanityStatus[]).map((k) =>
                s.counts[k] ? (
                  <span key={k} className={`rounded px-1.5 py-0.5 font-semibold ${SANITY_STYLE[k].cls}`}>
                    {s.counts[k]} {SANITY_STYLE[k].label.toLowerCase()}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
        {s.actionList.length > 0 && (
          <div className="border-t border-slate-100 bg-canvas/60 px-5 py-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Clear these upfront (send to sales / customer today)</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm text-ink">
              {s.actionList.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {(Object.keys(PILLAR) as SanityPillar[]).map((p) => (
        <section key={p} className="card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-2.5 text-sm font-semibold text-ink">
            <span className="mr-1.5 text-maroon">{PILLAR[p].n}</span>
            {PILLAR[p].label}
          </div>
          <ul className="divide-y divide-slate-100">
            {s.checks
              .filter((x) => x.pillar === p)
              .map((x) => (
                <li key={x.id} className={`grid gap-2 px-5 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_minmax(0,2fr)] ${x.status === 'BLOCKER' ? 'bg-critical-bg/40' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{x.id}</span>
                      <SanityStatusBadge status={x.status} />
                    </div>
                    <div className="mt-1 text-sm font-semibold text-ink">{x.title}</div>
                    <div className="mt-0.5 text-[11px] italic text-slate-400">Pre-empts: “{x.typicalRemark}”</div>
                  </div>
                  <div className="text-sm text-slate-700">
                    {x.finding}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {x.sources.map((src) => (
                        <span key={src.name} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${src.live ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500'}`} title={src.live ? 'Live in prototype' : 'Simulated adapter in prototype'}>
                          {src.live ? <Radio className="h-2.5 w-2.5" /> : <Database className="h-2.5 w-2.5" />}
                          {src.name}
                          {!src.live && ' (sim.)'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={`text-xs ${x.status === 'PASS' ? 'text-slate-400' : 'font-medium text-slate-700'}`}>
                    <FileWarning className="mr-1 inline h-3.5 w-3.5" />
                    {x.action}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <p className="text-[11px] text-slate-400">
        Sources marked “sim.” are simulated adapters in this prototype (ULB notice lists, DP layers, land records, SRO search). Each is one plain input to the deterministic engine in
        lib/engines/sanity.ts, so a live feed changes no engine code. Case {c.fileNo ?? c.id}.
      </p>
    </div>
  );
}
