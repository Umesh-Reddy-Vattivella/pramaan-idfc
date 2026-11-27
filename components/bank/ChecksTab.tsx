'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { AttestKey } from '@/lib/domain/types';
import type { Evaluation } from '@/lib/engines/evaluate';
import { VERDICT_LABEL } from '@/lib/engines/sanity';
import type { AppCtl } from '@/lib/client/useApplication';
import { Badge, Card, CHECK_LABEL, CHECK_TONE, CheckIcon, Stat } from '@/components/ui';
import type { TabKey } from './tabs';

const GOTO: Record<string, TabKey> = { T1: 'identify', T2: 'identify', T3: 'identify', T4: 'identify', T5: 'inspect', T6: 'identify', T7: 'inspect', T8: 'inspect', T9: 'identify', T12: 'inspect', T13: 'value', T14: 'value', T15: 'identify', T16: 'identify' };
const ATTEST: Record<string, AttestKey> = { T10: 'DEMOLITION_LIST', T11: 'ROAD_WIDENING' };

function Attest({ ctl, k }: { ctl: AppCtl; k: AttestKey }) {
  const cur = ctl.app!.attestations[k];
  const [note, setNote] = useState(cur?.note ?? '');
  if (cur)
    return (
      <button className="btn-ghost py-1 text-xs" onClick={() => ctl.run({ op: 'clearAttest', key: k })}>
        Change
      </button>
    );
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <input className="input flex-1 py-1.5 text-xs" placeholder="Who / what was checked (e.g. NMC town planning, ward office, 26 Nov)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-green py-1.5 text-xs" disabled={ctl.busy} onClick={() => ctl.run({ op: 'attest', key: k, ok: true, note })}>
        Checked — clear
      </button>
      <button className="btn-red py-1.5 text-xs" disabled={ctl.busy} onClick={() => ctl.run({ op: 'attest', key: k, ok: false, note })}>
        Affected
      </button>
    </div>
  );
}

export default function ChecksTab({ ctl, ev, go }: { ctl: AppCtl; ev: Evaluation; go: (t: TabKey) => void }) {
  const s = ev.sanity;
  const order = { BLOCKER: 0, WARN: 1, PENDING: 2, PASS: 3 } as const;
  const checks = [...s.checks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2">
          <Stat label="Technical verdict" value={VERDICT_LABEL[s.verdict]} tone={s.verdict === 'REFER' ? undefined : s.verdict === 'CLEAR' ? 'green' : 'amber'} sub="Blocker → refer · pending → in progress · conditions → clear with conditions" />
        </div>
        <Stat label="Blockers" value={s.blockers} />
        <Stat label="Conditions" value={s.warnings} tone="amber" />
        <Stat label="Pending / passed" value={`${s.pending} / ${s.passed}`} />
      </div>
      <Card
        title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-maroon" /> Technical checks (sanity remarks)</span>}
        subtitle="The remarks a valuer’s report would raise — computed on day 0 from the documents, the inspection and the evidence, each with the action that clears it. Checks with no public data source stay pending until the bank records the result."
      >
        <ul className="divide-y divide-slate-100">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-3 py-3">
              <CheckIcon s={c.status} className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-400">{c.id}</span>
                  <span className="font-semibold text-ink">{c.title}</span>
                  <Badge tone={CHECK_TONE[c.status]}>{CHECK_LABEL[c.status]}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{c.finding}</p>
                {c.action && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    <span className="font-semibold">Action:</span> {c.action}{' '}
                    {GOTO[c.id] && (
                      <button className="font-semibold text-maroon hover:underline" onClick={() => go(GOTO[c.id])}>
                        Open →
                      </button>
                    )}
                  </p>
                )}
                {ATTEST[c.id] && <Attest ctl={ctl} k={ATTEST[c.id]} />}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
