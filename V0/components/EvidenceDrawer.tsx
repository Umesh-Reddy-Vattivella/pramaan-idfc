'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { FileSearch, History, Sigma, X } from 'lucide-react';
import type { Evidence } from '@/lib/evidence';

interface Opened {
  ev: Evidence;
  replayedAt: string;
}

interface EvidenceCtx {
  evidence: Record<string, Evidence>;
  open: (key: string) => void;
}

const Ctx = createContext<EvidenceCtx | null>(null);

export function EvidenceProvider({ evidence, children }: { evidence: Record<string, Evidence>; children: ReactNode }) {
  const [opened, setOpened] = useState<Opened | null>(null);

  const open = useCallback(
    (key: string) => {
      const ev = evidence[key];
      if (ev) setOpened({ ev, replayedAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }) });
    },
    [evidence],
  );

  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpened(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opened]);

  return (
    <Ctx.Provider value={{ evidence, open }}>
      {children}
      {opened && <Drawer opened={opened} onClose={() => setOpened(null)} />}
    </Ctx.Provider>
  );
}

/** Wrap any calculated figure: click opens its evidence trail. */
export function Ev({ k, children, className = '' }: { k: string; children: ReactNode; className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.evidence[k]) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={() => ctx.open(k)}
      title="Click to inspect formula & evidence"
      className={`cursor-help rounded-sm text-left underline decoration-maroon/40 decoration-dotted underline-offset-4 tabular-nums hover:bg-maroon/5 hover:decoration-maroon ${className}`}
    >
      {children}
    </button>
  );
}

function Drawer({ opened, onClose }: { opened: Opened; onClose: () => void }) {
  const { ev, replayedAt } = opened;
  return (
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-modal="true" aria-labelledby="ev-title">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 bg-maroon px-5 py-4 text-white">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Evidence Drawer · {ev.engine}</div>
            <h2 id="ev-title" className="mt-0.5 text-lg font-bold">{ev.title}</h2>
            <div className="mt-1 text-2xl font-bold tabular-nums">{ev.value}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-white/15" aria-label="Close evidence drawer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Sigma className="h-3.5 w-3.5" /> Exact formula
            </h3>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-900 px-3 py-2.5 font-mono text-xs leading-relaxed text-emerald-200">{ev.formula}</pre>
          </section>

          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Raw input parameters</h3>
            <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {ev.inputs.map((i) => (
                <div key={i.label} className="flex justify-between gap-4 px-3 py-2">
                  <dt className="text-slate-500">{i.label}</dt>
                  <dd className="text-right font-medium text-ink tabular-nums">{i.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FileSearch className="h-3.5 w-3.5" /> Source document citation
            </h3>
            <ul className="space-y-1.5">
              {ev.sources.map((s) => (
                <li key={s} className="break-all rounded-md bg-canvas px-3 py-1.5 text-xs text-slate-700">
                  {s.startsWith('http://') || s.startsWith('https://') ? (
                    <a href={s} target="_blank" rel="noopener noreferrer" className="text-maroon underline">
                      {s}
                    </a>
                  ) : (
                    s
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            <History className="h-4 w-4 shrink-0" />
            <span>
              Audit replay: deterministically recomputed by <span className="font-mono">lib/engines</span> at{' '}
              <span className="font-semibold text-ink">{replayedAt}</span> — no LLM arithmetic.
            </span>
          </section>
        </div>
      </aside>
    </div>
  );
}
