'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardCheck, Fingerprint, IndianRupee, ListChecks, Ruler, ScanEye } from 'lucide-react';
import { useCases } from '@/lib/state/CasesContext';
import { buildEvidence } from '@/lib/evidence';
import { EvidenceProvider } from '@/components/EvidenceDrawer';
import DecisionHeader from '@/components/workbench/DecisionHeader';
import MeasureTab from '@/components/workbench/MeasureTab';
import UsageTrustTab from '@/components/workbench/UsageTrustTab';
import PriceTriangulationPanel from '@/components/PriceTriangulationPanel';
import AutoQcPanel from '@/components/AutoQcPanel';
import SanityTab from '@/components/workbench/SanityTab';
import IdentifyTab, { CustomerRoomsSection } from '@/components/workbench/IdentifyTab';
import { syncPatch, useBankCaseFile } from '@/lib/client/caseFileClient';
import MarketEvidencePanel from '@/components/workbench/MarketEvidencePanel';
import { worstQcStatus } from '@/components/StatusBadges';

type TabId = 'sanity' | 'identify' | 'measure' | 'price' | 'usage' | 'qc';

export default function WorkbenchPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { getCase, getEvaluation, hydrated, updateCase } = useCases();
  const c = getCase(id);
  const e = getEvaluation(id);
  const [tab, setTab] = useState<TabId>('sanity');
  const portal = useBankCaseFile(c?.id, !!c?.portal);
  // Fold uploads / capture from the shared case file into the valuation case.
  useEffect(() => {
    if (!c || !portal.view) return;
    const p = syncPatch(c, portal.view);
    if (p) updateCase(c.id, p);
  }, [c, portal.view, updateCase]);
  const evidence = useMemo(() => (c && e ? buildEvidence(c, e) : {}), [c, e]);

  if (!c || !e) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-slate-500">{hydrated ? `Case "${id}" not found.` : 'Loading case…'}</p>
        <Link href="/bank" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-maroon">
          <ArrowLeft className="h-4 w-4" /> Back to Portfolio
        </Link>
      </div>
    );
  }

  const qcWorst = worstQcStatus(e.autoQc.findings);
  const qcIssues = e.autoQc.findings.filter((f) => f.status !== 'PASS').length;

  const sc = e.sanity.counts;
  const link = c.customerLink;
  const tabs: { id: TabId; label: string; sub: string; icon: typeof Ruler; flag?: string }[] = [
    {
      id: 'sanity',
      label: 'Technical Sanity Report',
      sub: e.sanity.verdictLabel,
      icon: ListChecks,
      flag: sc.BLOCKER || sc.FAIL ? 'critical' : sc.WARN ? 'remote' : undefined,
    },
    {
      id: 'identify',
      label: '① Identify',
      sub: link?.submission
        ? `Capture received · geo-fence ${e.geofence?.status ?? '—'}`
        : portal.view
          ? `${portal.view.checklist.filter((d) => d.status === 'VERIFIED' || d.status === 'UPLOADED').length}/${portal.view.checklist.length} docs · customer portal open`
          : 'Documents · open customer access',
      icon: Fingerprint,
      flag: e.geofence && e.geofence.status !== 'PASS' ? (e.geofence.status === 'WARN' ? 'remote' : 'critical') : undefined,
    },
    { id: 'measure', label: '② Measure', sub: 'Area, BUA vs plan, rooms, GIS', icon: Ruler },
    { id: 'price', label: '③ Value', sub: e.valuationReady ? `Comparables · S = ${e.price.authenticity.score}/100` : 'Pending market evidence', icon: IndianRupee, flag: e.valuationReady ? undefined : 'remote' },
    { id: 'usage', label: 'Usage & Trust', sub: e.trust.allPassed ? 'Trust 100% PASS' : 'Trust not passed', icon: ScanEye, flag: e.trust.allPassed && !e.usage.usageConflict ? undefined : 'critical' },
    { id: 'qc', label: 'Auto-QC & Legacy Audit', sub: qcIssues ? `${qcIssues} issue${qcIssues > 1 ? 's' : ''} flagged` : '6/6 PASS', icon: ClipboardCheck, flag: qcWorst === 'PASS' ? undefined : qcWorst === 'WARN' ? 'remote' : 'critical' },
  ];

  return (
    <EvidenceProvider evidence={evidence}>
      <div className="-mt-6 space-y-5">
        <DecisionHeader c={c} e={e} />

        <div className="flex items-center justify-between gap-3">
          <Link href="/bank" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-maroon">
            <ArrowLeft className="h-3.5 w-3.5" /> Portfolio
          </Link>
          <span className="text-[11px] text-slate-400">Tip: click any dotted-underlined figure to inspect its formula &amp; evidence</span>
        </div>

        {c.details && c.details.length > 0 && (
          <details className="card group px-5 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Case facts (from source documents)</summary>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
              {c.details.map((d) => (
                <div key={d.label} className="flex gap-3">
                  <dt className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{d.label}</dt>
                  <dd className="text-slate-700">{d.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        <div role="tablist" aria-label="Workbench engines" className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {tabs.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-maroon bg-maroon text-white shadow' : 'border-slate-200 bg-white text-ink hover:border-maroon/40'
                }`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-maroon'}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className={`flex items-center gap-1.5 text-xs ${active ? 'text-white/80' : 'text-slate-500'}`}>
                    {t.flag && <span className={`inline-block h-2 w-2 rounded-full ${t.flag === 'critical' ? 'bg-critical' : 'bg-remote'}`} aria-hidden />}
                    {t.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div role="tabpanel" key={`${c.id}-${tab}`}>
          {tab === 'sanity' && <SanityTab c={c} e={e} />}
          {tab === 'identify' && <IdentifyTab c={c} e={e} portal={portal} />}
          {tab === 'measure' && (
            <div className="space-y-5">
              <CustomerRoomsSection c={c} />
              <MeasureTab c={c} e={e} />
            </div>
          )}
          {tab === 'price' && (
            <div className="space-y-5">
              {c.origin !== 'SEED' && <MarketEvidencePanel c={c} ready={e.valuationReady} />}
              {e.valuationReady ? <PriceTriangulationPanel c={c} e={e} /> : <p className="card p-6 text-center text-sm text-slate-500">Valuation pending — no market evidence yet.</p>}
            </div>
          )}
          {tab === 'usage' && <UsageTrustTab c={c} e={e} />}
          {tab === 'qc' && <AutoQcPanel c={c} e={e} />}
        </div>
      </div>
    </EvidenceProvider>
  );
}
