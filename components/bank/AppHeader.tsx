'use client';

import { MapPin, Phone, User } from 'lucide-react';
import type { Application, StageKey } from '@/lib/domain/types';
import { PROPERTY_TYPE_LABEL } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { inrShort } from '@/lib/engines/format';
import { VERDICT_LABEL } from '@/lib/engines/sanity';
import { Badge, STAGE_LABEL, StageDot, type Tone } from '@/components/ui';
import type { TabKey } from './tabs';

const STAGE_TAB: Record<StageKey, TabKey> = { OPENED: 'overview', DOCUMENTS: 'identify', INSPECTION: 'inspect', MEASUREMENT: 'inspect', VALUATION: 'value', REPORT: 'report' };
const VERDICT_TONE: Record<string, Tone> = { REFER: 'red', IN_PROGRESS: 'slate', CONDITIONS: 'amber', CLEAR: 'green' };

export default function AppHeader({ app: a, ev, onStage }: { app: Application; ev: Evaluation; onStage: (t: TabKey) => void }) {
  const v = ev.valuation;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-maroon">{a.ref}</span>
            <Badge tone="slate">{PROPERTY_TYPE_LABEL[a.property.type]}</Badge>
            {a.review.status === 'ISSUED' && <Badge tone="green">Report issued</Badge>}
            {a.borrower.losRef && <span className="text-[11px] text-slate-400">LOS {a.borrower.losRef}</span>}
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-ink">
            <User className="h-5 w-5 text-slate-400" /> {a.borrower.name}
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Phone className="h-3 w-3" /> XXXXXX{a.borrower.mobile.slice(-4)}
            </span>
          </h1>
          <p className="mt-1 flex max-w-2xl items-start gap-1.5 text-sm text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {a.property.address}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border border-slate-200 px-4 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Market value</div>
            <div className="text-xl font-extrabold tabular-nums text-maroon">{v.mv ? inrShort(v.mv) : '—'}</div>
            <div className="text-[11px] text-slate-500">{v.mv ? `FSV ${inrShort(v.fsv!)} · max loan ${inrShort(v.maxLoan!)}` : 'valuation pending'}</div>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Technical verdict</div>
            <div className="mt-1">
              <Badge tone={VERDICT_TONE[ev.sanity.verdict]}>{VERDICT_LABEL[ev.sanity.verdict]}</Badge>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {ev.sanity.blockers} blocker · {ev.sanity.warnings} condition · {ev.sanity.pending} pending
            </div>
          </div>
        </div>
      </div>
      <ol className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/60 sm:grid-cols-3 lg:grid-cols-6">
        {ev.stages.map((s, i) => (
          <li key={s.key}>
            <button onClick={() => onStage(STAGE_TAB[s.key])} className="flex h-full w-full items-start gap-2 px-4 py-3 text-left hover:bg-white">
              <StageDot s={s.state} />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-ink">
                  {i + 1}. {s.label}
                </span>
                <span className="block text-[11px] font-semibold text-slate-500">{STAGE_LABEL[s.state]}</span>
                <span className="line-clamp-2 block text-[11px] text-slate-400">{s.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
