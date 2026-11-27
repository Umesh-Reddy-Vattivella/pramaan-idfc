'use client';

import { useState } from 'react';
import { BadgeCheck, Download, Loader2, RotateCcw } from 'lucide-react';
import { OCCUPANCY_LABEL, PROPERTY_TYPE_LABEL, USAGE_LABEL } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { inr, metres, sqft } from '@/lib/engines/format';
import { VERDICT_LABEL } from '@/lib/engines/sanity';
import { fileUrl } from '@/lib/client/files';
import type { AppCtl } from '@/lib/client/useApplication';
import { Badge, Card, CHECK_LABEL, CHECK_TONE, Notice } from '@/components/ui';

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <tr>
    <td className="td w-48 text-xs font-semibold text-slate-500">{k}</td>
    <td className="td">{v}</td>
  </tr>
);

export default function ReportTab({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  const v = ev.valuation;
  const m = ev.measure;
  const [remarks, setRemarks] = useState(a.review.remarks);
  const [pdf, setPdf] = useState(false);
  const issued = a.review.status === 'ISSUED';
  const needsRemarks = ev.sanity.blockers > 0 && remarks.trim().length < 10;

  const download = async () => {
    setPdf(true);
    try {
      const { downloadReport } = await import('@/lib/pdf/report');
      await downloadReport({ ...a, review: { ...a.review, remarks: issued ? a.review.remarks : remarks } }, ev);
    } finally {
      setPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card
        title="Technical valuation report"
        subtitle={issued ? `Issued by ${a.review.issuedBy} on ${new Date(a.review.issuedAt!).toLocaleString('en-IN')}` : 'Draft — review, add remarks and issue.'}
        actions={
          <button className="btn-secondary" onClick={download} disabled={pdf}>
            {pdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
          </button>
        }
      >
        <table className="w-full">
          <tbody>
            <Row k="Application" v={`${a.ref} · ${a.borrower.name}${a.borrower.losRef ? ` · LOS ${a.borrower.losRef}` : ''}`} />
            <Row k="Property" v={`${PROPERTY_TYPE_LABEL[a.property.type]} · ${a.property.address}`} />
            <Row k="Coordinates" v={ev.pin ? `${ev.pin.lat.toFixed(6)}, ${ev.pin.lng.toFixed(6)}` : '—'} />
            <Row k="Usage (declared / seen)" v={`${USAGE_LABEL[a.property.usage]} / ${a.inspection.observedUsage ? USAGE_LABEL[a.inspection.observedUsage] : '—'}${a.inspection.occupancy ? ` · ${OCCUPANCY_LABEL[a.inspection.occupancy]}` : ''}`} />
            <Row k="Land area valued" v={m.landAreaSqft ? sqft(m.landAreaSqft) : '—'} />
            <Row k="Built-up valued" v={`${sqft(m.buaValuedSqft)} — ${m.buaValuedBasis}`} />
            <Row k="Market value" v={v.mv ? <span className="font-bold text-maroon">{inr(v.mv)} <span className="font-normal text-slate-500">({v.words})</span></span> : 'Pending'} />
            <Row k="Forced-sale value" v={v.fsv ? inr(v.fsv) : '—'} />
            <Row k="Max eligible loan" v={v.maxLoan ? `${inr(v.maxLoan)} (LTV ${Math.round(v.ltvCap * 100)}%)` : '—'} />
            <Row k="Site inspection" v={ev.geofence.summary} />
            <Row k="Technical verdict" v={VERDICT_LABEL[ev.sanity.verdict]} />
          </tbody>
        </table>
        {a.inspection.snapshots.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {a.inspection.snapshots.map((s) => {
              const f = ev.geofence.perSnapshot[s.id];
              return (
                <a key={s.id} href={fileUrl(s.fileId)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumb || fileUrl(s.fileId)} alt={s.label} className="aspect-[4/3] w-full object-cover" />
                  <div className="truncate px-1.5 py-1 text-[10px] text-slate-600">
                    {s.label} · {f?.distanceM != null ? metres(f.distanceM) : 'no GPS'}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Technical remarks in the report">
        <ul className="space-y-1.5 text-sm">
          {ev.sanity.checks
            .filter((c) => c.status !== 'PASS')
            .map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <Badge tone={CHECK_TONE[c.status]}>{CHECK_LABEL[c.status]}</Badge>
                <span>
                  <b>{c.title}.</b> {c.finding}
                </span>
              </li>
            ))}
          {ev.sanity.checks.every((c) => c.status === 'PASS') && <li className="text-slate-500">No open remarks.</li>}
        </ul>
      </Card>

      <Card title="Bank remarks & issue">
        {issued ? (
          <div className="space-y-3">
            <Notice tone="green">
              Report issued. The customer’s portal now shows the valuation as completed. {a.review.remarks && <>Remarks: “{a.review.remarks}”</>}
            </Notice>
            <button className="btn-secondary" onClick={() => ctl.run({ op: 'reopenReport' })} disabled={ctl.busy}>
              <RotateCcw className="h-4 w-4" /> Reopen for changes
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea className="input min-h-[96px]" placeholder="Conditions to disbursal, deviations noted, clarifications obtained from the customer…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            {!v.ready && <Notice tone="amber">The valuation is not complete yet ({v.missing.join(' · ')}). The report cannot be issued.</Notice>}
            {v.ready && needsRemarks && <Notice tone="red">There are {ev.sanity.blockers} blocker(s). Record how they are being handled in the remarks before issuing.</Notice>}
            <button className="btn-primary" disabled={!v.ready || needsRemarks || ctl.busy} onClick={() => ctl.run({ op: 'issueReport', remarks })}>
              <BadgeCheck className="h-4 w-4" /> Issue report
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
