'use client';

import { useState } from 'react';
import { ArrowRight, Check, Copy, KeyRound, MapPin, Smartphone } from 'lucide-react';
import type { Evaluation } from '@/lib/engines/evaluate';
import type { AppCtl } from '@/lib/client/useApplication';
import { metres } from '@/lib/engines/format';
import { Badge, Card, CheckIcon, Notice } from '@/components/ui';
import type { TabKey } from './tabs';

function CustomerAccess({ ctl, created }: { ctl: AppCtl; created: boolean }) {
  const a = ctl.app!;
  const [copied, setCopied] = useState(false);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/customer/login?app=${a.ref}` : '';
  const message = `IDFC FIRST Bank: your property valuation for application ${a.ref} has started. Open ${link} and sign in with application no. ${a.ref}. Keep location on — we will video-call you at the property.`;
  const copy = async () => {
    await navigator.clipboard.writeText(message).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-maroon" /> Customer access</span>} subtitle="The customer signs in with the application number and the portal password.">
      {created && <div className="mb-3"><Notice tone="green">Application opened. Share the access details below with the customer.</Notice></div>}
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="label">Application no.</dt>
          <dd className="font-mono font-bold text-ink">{a.ref}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="label">Portal link</dt>
          <dd className="truncate font-mono text-xs text-slate-600">{link}</dd>
        </div>
      </dl>
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{message}</div>
      <button onClick={copy} className="btn-secondary mt-3">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy message'}
      </button>
    </Card>
  );
}

export default function OverviewTab({ ctl, ev, created, go }: { ctl: AppCtl; ev: Evaluation; created: boolean; go: (t: TabKey) => void }) {
  const a = ctl.app!;
  const next = ev.stages.find((s) => s.state !== 'DONE');
  const live = ev.live;
  const issues = ev.sanity.checks.filter((c) => c.status === 'BLOCKER' || c.status === 'WARN');
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        {next && (
          <Card title="Next step">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-ink">{next.label}</div>
                <div className="text-sm text-slate-500">{next.detail}</div>
              </div>
              <button
                className="btn-primary"
                onClick={() => go(next.key === 'DOCUMENTS' ? 'identify' : next.key === 'INSPECTION' || next.key === 'MEASUREMENT' ? 'inspect' : next.key === 'VALUATION' ? 'value' : 'report')}
              >
                Go <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </Card>
        )}
        <Card title="Open technical remarks" subtitle="Blockers and conditions to clear before sanction — details in Technical checks.">
          {issues.length === 0 ? (
            <p className="text-sm text-slate-500">None so far. {ev.sanity.pending} check(s) still pending.</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <CheckIcon s={c.status} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{c.title}:</span> <span className="text-slate-600">{c.finding}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Activity">
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {a.events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-32 shrink-0 text-[11px] text-slate-400">{new Date(e.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <Badge tone={e.by === 'CUSTOMER' ? 'blue' : e.by === 'BANK' ? 'maroon' : 'slate'}>{e.by === 'CUSTOMER' ? 'Customer' : e.by === 'BANK' ? 'Bank' : 'System'}</Badge>
                <span className="text-slate-700">{e.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="space-y-5">
        <CustomerAccess ctl={ctl} created={created} />
        <Card title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-maroon" /> Customer device</span>}>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Location sharing</span>
              <Badge tone={a.inspection.locationOn ? 'green' : 'slate'}>{a.inspection.locationOn ? 'On' : 'Off'}</Badge>
            </div>
            {live ? (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Last fix {new Date(live.fix.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })} (±{live.fix.acc} m):{' '}
                  {live.fence.distanceM === null ? 'pin not set' : `${metres(live.fence.distanceM)} from the property`} —{' '}
                  <b>{live.fence.status === 'INSIDE' ? 'at the property' : live.fence.status === 'NEAR' ? 'near the property' : 'away from the property'}</b>
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No location shared yet.</p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Snapshots captured</span>
              <span className="font-semibold">{a.inspection.snapshots.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Calls</span>
              <span className="text-xs text-slate-500">{a.inspection.calls.length ? `${a.inspection.calls.length} · last ${a.inspection.calls[0].status.toLowerCase()}` : 'none yet'}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
