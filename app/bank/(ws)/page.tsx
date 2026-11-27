'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileSearch, Plus, Search } from 'lucide-react';
import type { ApplicationSummary } from '@/lib/domain/types';
import { PROPERTY_TYPE_LABEL } from '@/lib/domain/catalog';
import { inrShort } from '@/lib/engines/format';
import { api } from '@/lib/client/api';
import { Badge, Spinner, STAGE_LABEL, Stat, type Tone } from '@/components/ui';

const STAGE_NAMES = ['Opened', 'Documents', 'Inspection', 'Measurement', 'Valuation', 'Report'];
const DOT: Record<string, string> = { DONE: 'bg-emerald-500', IN_PROGRESS: 'bg-sky-500', ACTION_NEEDED: 'bg-amber-400', NOT_STARTED: 'bg-slate-200' };

const verdictTone = (v: string): Tone => (v.startsWith('Refer') ? 'red' : v.startsWith('Clear with') ? 'amber' : v === 'Clear' ? 'green' : 'slate');

export default function Dashboard() {
  const [rows, setRows] = useState<ApplicationSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [store, setStore] = useState<string>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api<{ applications: ApplicationSummary[]; storeMode: string }>('/api/applications')
      .then((j) => {
        setRows(j.applications);
        setStore(j.storeMode);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const list = useMemo(() => (rows ?? []).filter((r) => !q || `${r.ref} ${r.borrowerName} ${r.address}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const open = (rows ?? []).filter((r) => !r.issued);
  const waitingCustomer = open.filter((r) => r.stages.includes('ACTION_NEEDED')).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Applications</h1>
          <p className="text-sm text-slate-500">Every LAP technical valuation, from documents to the issued report.</p>
        </div>
        {store && (
          <span className="text-[11px] text-slate-400">
            Storage: {store === 'supabase' ? 'Supabase (Postgres + Storage)' : store === 'kv' ? 'Upstash KV' : 'in-memory (local only)'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open" value={rows ? open.length : '–'} />
        <Stat label="Waiting on customer" value={rows ? waitingCustomer : '–'} tone="amber" />
        <Stat label="Valued, not issued" value={rows ? open.filter((r) => r.marketValue).length : '–'} />
        <Stat label="Reports issued" value={rows ? rows.filter((r) => r.issued).length : '–'} tone="green" />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search by application no., borrower or address" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            {(['DONE', 'IN_PROGRESS', 'ACTION_NEEDED', 'NOT_STARTED'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} /> {STAGE_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
        {err && <p className="p-5 text-sm text-red-700">{err}</p>}
        {!rows && !err && (
          <div className="p-8">
            <Spinner label="Loading applications…" />
          </div>
        )}
        {rows && !rows.length && (
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <FileSearch className="h-10 w-10 text-slate-300" />
            <div className="font-semibold text-ink">No applications yet</div>
            <p className="max-w-md text-sm text-slate-500">Open one for a loan file: borrower, mobile and the property address. The document checklist is created for the property type.</p>
            <Link href="/bank/new" className="btn-primary mt-2">
              <Plus className="h-4 w-4" /> New application
            </Link>
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Application</th>
                  <th className="th">Property</th>
                  <th className="th">Progress</th>
                  <th className="th">Market value</th>
                  <th className="th">Technical verdict</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td">
                      <Link href={`/bank/applications/${r.id}`} className="font-mono text-xs font-bold text-maroon">
                        {r.ref}
                      </Link>
                      <div className="font-semibold text-ink">{r.borrowerName}</div>
                      <div className="text-[11px] text-slate-400">Updated {new Date(r.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </td>
                    <td className="td max-w-[280px]">
                      <div className="text-xs font-semibold text-slate-700">{PROPERTY_TYPE_LABEL[r.type]}</div>
                      <div className="line-clamp-2 text-xs text-slate-500">{r.address}</div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        {r.stages.map((s, i) => (
                          <span key={i} title={`${STAGE_NAMES[i]}: ${STAGE_LABEL[s]}`} className={`h-2.5 w-7 rounded-full ${DOT[s]}`} />
                        ))}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{r.issued ? 'Report issued' : `Now: ${r.currentStage}`}</div>
                    </td>
                    <td className="td font-semibold tabular-nums">{r.marketValue ? inrShort(r.marketValue) : <span className="text-slate-400">Pending</span>}</td>
                    <td className="td">
                      <Badge tone={verdictTone(r.verdict)}>{r.verdict}</Badge>
                    </td>
                    <td className="td text-right">
                      <Link href={`/bank/applications/${r.id}`} className="btn-ghost px-2">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
