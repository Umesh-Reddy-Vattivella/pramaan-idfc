'use client';

import { use, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { evaluate } from '@/lib/engines/evaluate';
import { useApplication } from '@/lib/client/useApplication';
import { Spinner } from '@/components/ui';
import AppHeader from '@/components/bank/AppHeader';
import OverviewTab from '@/components/bank/OverviewTab';
import IdentifyTab from '@/components/bank/IdentifyTab';
import InspectTab from '@/components/bank/InspectTab';
import ValuationTab from '@/components/bank/ValuationTab';
import ChecksTab from '@/components/bank/ChecksTab';
import ReportTab from '@/components/bank/ReportTab';
import { TABS, type TabKey } from '@/components/bank/tabs';



export default function Workspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const created = useSearchParams().get('created') === '1';
  const ctl = useApplication(id);
  const [tab, setTab] = useState<TabKey>('overview');
  const ev = useMemo(() => (ctl.app ? evaluate(ctl.app) : null), [ctl.app]);

  if (!ctl.app || !ev) {
    return <div className="py-16 text-center">{ctl.error ? <p className="text-sm text-red-700">{ctl.error}</p> : <Spinner label="Loading application…" />}</div>;
  }
  const a = ctl.app;
  const counts: Partial<Record<TabKey, string>> = {
    identify: `${a.documents.filter((d) => d.status === 'VERIFIED').length}/${a.documents.length}`,
    inspect: String(a.inspection.snapshots.length),
    checks: ev.sanity.blockers ? `${ev.sanity.blockers}!` : String(ev.sanity.pending + ev.sanity.warnings),
  };

  return (
    <div className="space-y-5">
      <Link href="/bank" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-maroon">
        <ArrowLeft className="h-3.5 w-3.5" /> All applications
      </Link>
      <AppHeader app={a} ev={ev} onStage={(k) => setTab(k)} />

      <div className="sticky top-14 z-[1000] -mx-4 border-b border-slate-200 bg-canvas/95 px-4 backdrop-blur">
        <nav className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab === t.key ? 'bg-white text-maroon shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/60'}`}
            >
              {t.label}
              {counts[t.key] && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${counts[t.key]!.endsWith('!') ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>{counts[t.key]!.replace('!', '')}</span>}
            </button>
          ))}
        </nav>
      </div>

      {ctl.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{ctl.error}</p>}

      {tab === 'overview' && <OverviewTab ctl={ctl} ev={ev} created={created} go={setTab} />}
      {tab === 'identify' && <IdentifyTab ctl={ctl} ev={ev} />}
      {tab === 'inspect' && <InspectTab ctl={ctl} ev={ev} />}
      {tab === 'value' && <ValuationTab ctl={ctl} ev={ev} />}
      {tab === 'checks' && <ChecksTab ctl={ctl} ev={ev} go={setTab} />}
      {tab === 'report' && <ReportTab ctl={ctl} ev={ev} />}
    </div>
  );
}
