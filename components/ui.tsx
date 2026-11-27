'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, Loader2, XCircle } from 'lucide-react';
import type { StageState } from '@/lib/domain/types';
import type { CheckStatus } from '@/lib/engines/sanity';

export function Logo({ sub }: { sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-maroon text-sm font-black text-white">P</div>
      <div className="leading-tight">
        <div className="text-[15px] font-extrabold tracking-tight text-ink">
          PRAMAAN <span className="font-semibold text-maroon">· IDFC FIRST Bank</span>
        </div>
        {sub && <div className="text-[11px] font-medium text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = '' }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-[15px] font-bold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  maroon: 'bg-rose-50 text-maroon ring-rose-200',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export const CHECK_TONE: Record<CheckStatus, Tone> = { PASS: 'green', WARN: 'amber', BLOCKER: 'red', PENDING: 'slate' };
export const CHECK_LABEL: Record<CheckStatus, string> = { PASS: 'Pass', WARN: 'Condition', BLOCKER: 'Blocker', PENDING: 'Pending' };

export function CheckIcon({ s, className = 'h-4 w-4' }: { s: CheckStatus; className?: string }) {
  if (s === 'PASS') return <CheckCircle2 className={`${className} text-emerald-600`} />;
  if (s === 'WARN') return <AlertTriangle className={`${className} text-amber-600`} />;
  if (s === 'BLOCKER') return <XCircle className={`${className} text-red-600`} />;
  return <Clock className={`${className} text-slate-400`} />;
}

export const STAGE_TONE: Record<StageState, Tone> = { DONE: 'green', IN_PROGRESS: 'blue', ACTION_NEEDED: 'amber', NOT_STARTED: 'slate' };
export const STAGE_LABEL: Record<StageState, string> = { DONE: 'Completed', IN_PROGRESS: 'In progress', ACTION_NEEDED: 'Action needed', NOT_STARTED: 'Not started' };

export function StageDot({ s }: { s: StageState }) {
  if (s === 'DONE') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (s === 'IN_PROGRESS') return <Loader2 className="h-5 w-5 animate-spin text-sky-600 [animation-duration:2.5s]" />;
  if (s === 'ACTION_NEEDED') return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  return <Circle className="h-5 w-5 text-slate-300" />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'maroon' | 'green' | 'amber' }) {
  const c = tone === 'maroon' ? 'text-maroon' : tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-ink';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Notice({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-lg px-3 py-2 text-xs ring-1 ring-inset ${TONES[tone]}`}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </span>
  );
}
