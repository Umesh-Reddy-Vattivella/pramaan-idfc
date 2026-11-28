'use client';

import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Eraser, MapPin, PencilRuler, Plus, Save, Undo2 } from 'lucide-react';
import type { Structure, Usage } from '@/lib/domain/types';
import { isBuilt, STRUCTURE_LABEL, USAGE_LABEL } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { pct, sqft } from '@/lib/engines/format';
import { polygonAreaSqm, polygonSidesM, SQFT_PER_SQM } from '@/lib/engines/stats';
import { emptySpec } from '@/lib/mapGeometry';
import { api } from '@/lib/client/api';
import type { AppCtl } from '@/lib/client/useApplication';
import type { Application } from '@/lib/domain/types';
import DocumentSlot from '@/components/DocumentSlot';
import OwnershipFields, { draftOf, ownershipOf } from './OwnershipFields';
import { SpecMap } from '@/components/workbench/maps';
import { Card, Field, Notice } from '@/components/ui';

const n = (s: string) => (s.trim() === '' ? null : Number(s));
const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function Documents({ ctl }: { ctl: AppCtl }) {
  const a = ctl.app!;
  const [label, setLabel] = useState('');
  const mandatory = a.documents.filter((d) => d.mandatory);
  return (
    <Card
      title="Documents"
      subtitle={`${mandatory.filter((d) => d.status === 'VERIFIED').length}/${mandatory.length} mandatory verified. Upload from the loan file here; the customer can upload to the same slots from their portal.`}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {a.documents.map((d) => (
          <DocumentSlot
            key={d.key}
            slot={d}
            role="BANK"
            onUpload={async (u) => {
              const j = await api<{ app: Application }>(`/api/applications/${a.id}/upload`, { body: u });
              ctl.accept(j.app);
            }}
            onRemove={async (fileRowId) => {
              if (!(await ctl.run({ op: 'removeFile', key: d.key, fileRowId }))) throw new Error(ctl.error ?? 'Failed');
            }}
            onReview={async (status, remark) => {
              await ctl.run({ op: 'reviewDoc', key: d.key, status, remark });
            }}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <input className="input max-w-xs" placeholder="Request another document (e.g. NA order)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button
          className="btn-secondary"
          disabled={!label.trim() || ctl.busy}
          onClick={async () => {
            if (await ctl.run({ op: 'addDocSlot', label, mandatory: false })) setLabel('');
          }}
        >
          <Plus className="h-4 w-4" /> Add slot
        </button>
      </div>
    </Card>
  );
}

function Location({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  const [mode, setMode] = useState<'view' | 'pin' | 'draw'>('view');
  const [draft, setDraft] = useState<[number, number][]>(a.parcel);
  const [pin, setPin] = useState<[number, number] | null>(a.property.lat !== null && a.property.lng !== null ? [a.property.lat, a.property.lng] : null);
  useEffect(() => {
    if (mode === 'view') {
      setDraft(a.parcel);
      setPin(a.property.lat !== null && a.property.lng !== null ? [a.property.lat, a.property.lng] : null);
    }
  }, [a.parcel, a.property.lat, a.property.lng, mode]);

  const spec = useMemo(() => {
    const sp = emptySpec(pin ?? [21.15, 79.09], pin ? 19 : 5);
    if (draft.length >= 3) sp.polygons.push({ id: 'parcel', path: draft, color: '#ffffff', fill: '#9C1D26', fillOpacity: 0.25, weight: 2 });
    else if (draft.length === 2) sp.polylines.push({ id: 'edge', path: draft, color: '#ffffff', weight: 2 });
    draft.forEach((p, i) => sp.markers.push({ id: `v${i}`, pos: p, color: '#f59e0b', size: 5, tooltip: `Corner ${i + 1}` }));
    if (pin) sp.markers.push({ id: 'pin', pos: pin, color: '#9C1D26', size: 8, tooltip: 'Property pin' });
    const live = ev.live;
    if (live) sp.markers.push({ id: 'live', pos: [live.fix.lat, live.fix.lng], color: '#0284c7', size: 7, tooltip: `Customer’s last location (±${live.fix.acc} m)` });
    return sp;
  }, [pin, draft, ev.live]);

  const draftSqft = draft.length >= 3 ? polygonAreaSqm(draft) * SQFT_PER_SQM : null;
  const sides = draft.length >= 3 ? polygonSidesM(draft) : [];
  const deed = a.property.plotAreaSqft;

  return (
    <Card
      title={<span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-maroon" /> Location & plot boundary</span>}
      subtitle="Confirm the pin, then click the plot corners on the satellite image. The boundary is the geo-fence for the video snapshots and gives the satellite plot area."
      actions={
        mode === 'view' ? (
          <>
            <button className="btn-secondary" onClick={() => setMode('pin')}>
              <Crosshair className="h-4 w-4" /> Move pin
            </button>
            <button className="btn-secondary" onClick={() => { setDraft([]); setMode('draw'); }}>
              <PencilRuler className="h-4 w-4" /> {a.parcel.length >= 3 ? 'Redraw boundary' : 'Draw boundary'}
            </button>
          </>
        ) : (
          <>
            {mode === 'draw' && (
              <>
                <button className="btn-ghost" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}>
                  <Undo2 className="h-4 w-4" /> Undo
                </button>
                <button className="btn-ghost" disabled={!draft.length} onClick={() => setDraft([])}>
                  <Eraser className="h-4 w-4" /> Clear
                </button>
              </>
            )}
            <button className="btn-ghost" onClick={() => setMode('view')}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={ctl.busy || (mode === 'draw' && draft.length > 0 && draft.length < 3)}
              onClick={async () => {
                const ok = mode === 'pin' && pin ? await ctl.run({ op: 'setProperty', property: { lat: pin[0], lng: pin[1] } }) : await ctl.run({ op: 'setParcel', parcel: draft });
                if (ok) setMode('view');
              }}
            >
              <Save className="h-4 w-4" /> Save
            </button>
          </>
        )
      }
    >
      {mode !== 'view' && (
        <div className="mb-3">
          <Notice tone="blue">{mode === 'pin' ? 'Click on the map where the property is.' : 'Click each corner of the plot in order (at least 3). Zoom in for accuracy.'}</Notice>
        </div>
      )}
      <SpecMap spec={spec} height={380} onClick={mode === 'pin' ? (lat, lng) => setPin([lat, lng]) : mode === 'draw' ? (lat, lng) => setDraft((d) => [...d, [lat, lng]]) : undefined} />
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="label">Deed plot area</div>
          <div className="font-bold">{deed ? sqft(deed) : '—'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="label">Satellite boundary area</div>
          <div className="font-bold">{draftSqft ? sqft(draftSqft) : '—'}</div>
          {sides.length > 0 && <div className="text-[11px] text-slate-500">Sides: {sides.map((m) => `${(m / 0.3048).toFixed(0)} ft`).join(' · ')}</div>}
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="label">Variance</div>
          <div className={`font-bold ${deed && draftSqft && Math.abs((draftSqft - deed) / deed) > 0.1 ? 'text-amber-700' : ''}`}>{deed && draftSqft ? pct(((draftSqft - deed) / deed) * 100) : '—'}</div>
          <div className="text-[11px] text-slate-500">±10% tolerance; the lower area is valued.</div>
        </div>
      </div>
    </Card>
  );
}

function Facts({ ctl }: { ctl: AppCtl }) {
  const a = ctl.app!;
  const built = isBuilt(a.property.type);
  const [f, setF] = useState(() => ({
    address: a.property.address,
    plot: s(a.property.plotAreaSqft),
    bua: s(a.property.builtUpSqft),
    floors: s(a.property.floors),
    age: s(a.property.ageYears),
    rate: s(a.property.constructionRate),
    structure: a.property.structure,
    usage: a.property.usage,
    approvedBua: s(a.plan.approvedBuaSqft),
    approvedFloors: s(a.plan.approvedFloors),
    fsi: s(a.plan.permissibleFsi),
    planRef: a.plan.planRef ?? '',
    authority: a.plan.authority ?? '',
    chainFrom: s(a.title.chainFromYear),
  }));
  const [own, setOwn] = useState(() => draftOf(a.ownership));
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.value });
  };
  const save = async () => {
    const ok =
      (await ctl.run({
        op: 'setProperty',
        property: { address: f.address, plotAreaSqft: n(f.plot), builtUpSqft: n(f.bua), floors: n(f.floors), ageYears: n(f.age), constructionRate: n(f.rate), structure: f.structure as Structure, usage: f.usage as Usage },
      })) &&
      (await ctl.run({ op: 'setPlan', plan: { approvedBuaSqft: n(f.approvedBua), approvedFloors: n(f.approvedFloors), permissibleFsi: n(f.fsi), planRef: f.planRef, authority: f.authority } })) &&
      (await ctl.run({ op: 'setTitle', title: { chainFromYear: n(f.chainFrom) } })) &&
      (await ctl.run({ op: 'setOwnership', ownership: ownershipOf(own) }));
    setSaved(ok);
  };
  return (
    <Card
      title="Facts from the documents"
      subtitle="Typed once from the deed, the approved plan and the title chain. These drive the checks and the valuation."
      actions={
        <button className="btn-primary" onClick={save} disabled={ctl.busy}>
          <Save className="h-4 w-4" /> {saved ? 'Saved' : 'Save facts'}
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Sale deed</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Field label="Address as per deed">
                <textarea className="input min-h-[60px]" value={f.address} onChange={set('address')} />
              </Field>
            </div>
            <Field label="Plot area (sqft)">
              <input className="input" value={f.plot} onChange={set('plot')} inputMode="decimal" />
            </Field>
            {built && (
              <>
                <Field label="Built-up area (sqft)">
                  <input className="input" value={f.bua} onChange={set('bua')} inputMode="decimal" />
                </Field>
                <Field label="Floors">
                  <input className="input" value={f.floors} onChange={set('floors')} inputMode="numeric" />
                </Field>
                <Field label="Age (years)" hint="From completion certificate / tax records.">
                  <input className="input" value={f.age} onChange={set('age')} inputMode="numeric" />
                </Field>
                <Field label="Structure">
                  <select className="input" value={f.structure} onChange={set('structure')}>
                    {(Object.keys(STRUCTURE_LABEL) as Structure[]).map((x) => (
                      <option key={x} value={x}>
                        {STRUCTURE_LABEL[x]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Construction rate (₹/sqft new)">
                  <input className="input" value={f.rate} onChange={set('rate')} inputMode="decimal" />
                </Field>
              </>
            )}
            <Field label="Declared usage">
              <select className="input" value={f.usage} onChange={set('usage')}>
                {(Object.keys(USAGE_LABEL) as Usage[]).map((x) => (
                  <option key={x} value={x}>
                    {USAGE_LABEL[x]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{built ? 'Approved building plan' : 'Approved layout plan'}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {built && (
              <>
                <Field label="Approved built-up area (sqft)">
                  <input className="input" value={f.approvedBua} onChange={set('approvedBua')} inputMode="decimal" />
                </Field>
                <Field label="Approved floors">
                  <input className="input" value={f.approvedFloors} onChange={set('approvedFloors')} inputMode="numeric" />
                </Field>
                <Field label="Permissible FSI / FAR">
                  <input className="input" value={f.fsi} onChange={set('fsi')} inputMode="decimal" placeholder="e.g. 1.5" />
                </Field>
              </>
            )}
            <Field label="Plan / permit no.">
              <input className="input" value={f.planRef} onChange={set('planRef')} />
            </Field>
            <Field label="Approving authority">
              <input className="input" value={f.authority} onChange={set('authority')} placeholder="e.g. Nagpur Municipal Corporation" />
            </Field>
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Purchase price and claimed value</div>
          <OwnershipFields
            value={own}
            type={a.property.type}
            onChange={(d) => {
              setSaved(false);
              setOwn(d);
            }}
          />
          <p className="mt-2 text-[11px] text-slate-500">The price paid, brought to today, is weighted into the rate (at most 30%, less the older it is). The claimed value is only compared with the result.</p>
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Title chain</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Chain traced from (year)" hint={`Needs ${new Date().getFullYear() - 13} or earlier (13 years).`}>
              <input className="input" value={f.chainFrom} onChange={set('chainFrom')} inputMode="numeric" placeholder="e.g. 2009" />
            </Field>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function IdentifyTab({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  return (
    <div className="space-y-5">
      <Documents ctl={ctl} />
      <Location ctl={ctl} ev={ev} />
      <Facts ctl={ctl} />
    </div>
  );
}
