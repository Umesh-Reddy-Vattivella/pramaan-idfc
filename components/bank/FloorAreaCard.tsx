'use client';

/* Floor-wise area (replaces room-wise measurement).
   1. Each floor's area is typed from the floor plan — a copy from the authority's website or the customer's upload.
   2. The building's roof outline is drawn on the satellite top view: footprint × floors = expected built-up area.
   3. The delta between the two, the floor count and the plan's source give the measurement confidence score. */
import { useEffect, useMemo, useState } from 'react';
import { Eraser, ExternalLink, FileText, PencilRuler, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import type { FloorArea, FloorPlanFacts, FloorPlanSource } from '@/lib/domain/types';
import { FLOOR_PLAN_DOC, FLOOR_PLAN_SOURCE_LABEL, floorNames, isUnit } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { pct, sqft } from '@/lib/engines/format';
import { CARPET_TO_BUA } from '@/lib/engines/measure';
import { polygonAreaSqm, SQFT_PER_SQM } from '@/lib/engines/stats';
import { VALUATION as V } from '@/config/valuation';
import { emptySpec } from '@/lib/mapGeometry';
import { fileUrl } from '@/lib/client/files';
import type { AppCtl } from '@/lib/client/useApplication';
import { SpecMap } from '@/components/workbench/maps';
import { Badge, Card, Field, Notice } from '@/components/ui';

interface Row {
  floor: string;
  area: string;
}

function initialRows(fp: FloorPlanFacts | undefined, floors: number | null, seen: number | null): Row[] {
  if (fp?.floors.length) return fp.floors.map((f) => ({ floor: f.floor, area: String(f.areaSqft) }));
  return floorNames(Math.max(floors ?? 1, seen ?? 1)).map((f) => ({ floor: f, area: '' }));
}

export default function FloorAreaCard({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  const unit = isUnit(a.property.type);
  const m = ev.measure;
  const [source, setSource] = useState<FloorPlanSource | ''>(a.floorPlan?.source ?? '');
  const [reference, setReference] = useState(a.floorPlan?.reference ?? '');
  const [basis, setBasis] = useState<'BUILT_UP' | 'CARPET'>(a.floorPlan?.basis ?? 'BUILT_UP');
  const [rows, setRows] = useState<Row[]>(() => initialRows(a.floorPlan, a.property.floors, a.inspection.observedFloors));
  const [extra, setExtra] = useState('');
  const [saved, setSaved] = useState(false);

  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<[number, number][]>(a.footprint ?? []);
  useEffect(() => {
    if (!drawing) setDraft(a.footprint ?? []);
  }, [a.footprint, drawing]);

  const planDocs = (['APPROVED_PLAN', 'FLOOR_PLAN'] as const).map((k) => a.documents.find((d) => d.key === k)).filter((d) => !!d);
  const floorSlot = a.documents.find((d) => d.key === 'FLOOR_PLAN');
  const draftTotal = rows.reduce((s, r) => s + (Number(r.area) > 0 ? Number(r.area) : 0), 0) * (basis === 'CARPET' ? CARPET_TO_BUA : 1);
  const draftFootprint = draft.length >= 3 ? polygonAreaSqm(draft) * SQFT_PER_SQM : null;

  const save = async () => {
    const floors: FloorArea[] = rows.filter((r) => r.floor.trim() && Number(r.area) > 0).map((r) => ({ floor: r.floor.trim(), areaSqft: Number(r.area) }));
    const ok = await ctl.run({ op: 'setFloorPlan', floorPlan: { source: source || null, reference, basis, floors } });
    setSaved(ok);
  };

  const spec = useMemo(() => {
    const c: [number, number] = ev.pin ? [ev.pin.lat, ev.pin.lng] : [21.15, 79.09];
    const sp = emptySpec(c, ev.pin ? 20 : 5);
    if (a.parcel.length >= 3) sp.polygons.push({ id: 'parcel', path: a.parcel, color: '#ffffff', fill: '#ffffff', fillOpacity: 0.05, weight: 1 });
    if (draft.length >= 3) sp.polygons.push({ id: 'roof', path: draft, color: '#f59e0b', fill: '#f59e0b', fillOpacity: 0.3, weight: 2 });
    else if (draft.length === 2) sp.polylines.push({ id: 'edge', path: draft, color: '#f59e0b', weight: 2 });
    draft.forEach((p, i) => sp.markers.push({ id: `r${i}`, pos: p, color: '#f59e0b', size: 5, tooltip: `Roof corner ${i + 1}` }));
    if (ev.pin) sp.markers.push({ id: 'pin', pos: c, color: '#9C1D26', size: 7, tooltip: 'Property pin' });
    return sp;
  }, [ev.pin, a.parcel, draft]);

  const cf = m.confidence;
  const set = (i: number, k: keyof Row, v: string) => {
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  };

  return (
    <Card
      title="Floor-wise area — floor plan, checked against the satellite top view"
      subtitle={
        unit
          ? 'Area of the unit from its floor plan, checked against the built-up area on the deed.'
          : `Each floor’s area from the floor plan; the roof outline on the satellite image × floors gives an independent estimate. The delta builds the confidence score (agreement ${V.floorArea.points.agreement} + floor count ${V.floorArea.points.floors} + plan source ${V.floorArea.points.source}).`
      }
      actions={
        <button className="btn-primary" onClick={save} disabled={ctl.busy}>
          <Save className="h-4 w-4" /> {saved ? 'Saved' : 'Save floor plan'}
        </button>
      }
    >
      <div className={`grid gap-5 ${unit ? '' : 'xl:grid-cols-2'}`}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Floor plan from">
              <select className="input" value={source} onChange={(e) => (setSaved(false), setSource(e.target.value as FloorPlanSource | ''))}>
                <option value="">Select source</option>
                {(Object.keys(FLOOR_PLAN_SOURCE_LABEL) as FloorPlanSource[]).map((k) => (
                  <option key={k} value={k}>
                    {FLOOR_PLAN_SOURCE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Area printed as">
              <select className="input" value={basis} onChange={(e) => (setSaved(false), setBasis(e.target.value as 'BUILT_UP' | 'CARPET'))}>
                <option value="BUILT_UP">Built-up / plinth area</option>
                <option value="CARPET">Carpet area (× {CARPET_TO_BUA})</option>
              </select>
            </Field>
            <Field label={source === 'GOVT_PORTAL' ? 'Permit no. / portal link' : 'Plan reference'}>
              <input className="input" value={reference} onChange={(e) => (setSaved(false), setReference(e.target.value))} placeholder={source === 'GOVT_PORTAL' ? 'e.g. BP/1234/2019 or https://…' : 'optional'} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {planDocs.flatMap((d) =>
              d!.files.map((f) => (
                <a key={f.id} href={fileUrl(f.fileId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-sky-700 hover:bg-slate-50">
                  <FileText className="h-3.5 w-3.5" /> {d!.label.split(' (')[0]}: {f.name} <ExternalLink className="h-3 w-3" />
                  {d!.status === 'VERIFIED' && <Badge tone="green">verified</Badge>}
                </a>
              )),
            )}
            {!floorSlot ? (
              <button className="btn-secondary px-2 py-1 text-xs" disabled={ctl.busy} onClick={() => ctl.run({ op: 'requestFloorPlan' })}>
                <Plus className="h-3.5 w-3.5" /> Ask the customer to upload the floor plan
              </button>
            ) : (
              !floorSlot.files.length && <span className="text-slate-500">Floor plan slot open — waiting for the customer’s upload (or upload it in Identification → Documents).</span>
            )}
            {source && !a.documents.find((d) => d.key === FLOOR_PLAN_DOC[source])?.files.length && <span className="text-amber-700">No {source === 'GOVT_PORTAL' ? 'approved plan' : 'floor plan'} file on record yet.</span>}
          </div>

          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Floor</th>
                <th className="th">Area on the plan (sqft)</th>
                <th className="th text-right">Built-up</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="td">
                    <input className="input py-1.5" value={r.floor} onChange={(e) => set(i, 'floor', e.target.value)} />
                  </td>
                  <td className="td">
                    <input className="input w-36 py-1.5" value={r.area} onChange={(e) => set(i, 'area', e.target.value)} inputMode="decimal" placeholder="sqft" />
                  </td>
                  <td className="td text-right tabular-nums text-slate-600">{Number(r.area) > 0 ? sqft(Number(r.area) * (basis === 'CARPET' ? CARPET_TO_BUA : 1)) : '—'}</td>
                  <td className="td text-right">
                    <button className="btn-ghost px-1.5 text-red-600" title="Remove floor" onClick={() => (setSaved(false), setRows(rows.filter((_, j) => j !== i)))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50/50">
                <td className="td">
                  <input className="input py-1.5" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Add a floor (e.g. Basement, Second floor)" />
                </td>
                <td className="td" colSpan={3}>
                  <button
                    className="btn-secondary py-1.5"
                    disabled={!extra.trim() || rows.some((r) => r.floor === extra.trim())}
                    onClick={() => {
                      setRows([...rows, { floor: extra.trim(), area: '' }]);
                      setExtra('');
                      setSaved(false);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add floor
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="td font-semibold">Total built-up (plan)</td>
                <td className="td" />
                <td className="td text-right font-bold tabular-nums">{draftTotal > 0 ? sqft(draftTotal) : '—'}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {!unit && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-ink">Roof outline on the satellite top view</div>
              <div className="flex gap-1">
                {!drawing ? (
                  <button className="btn-secondary" onClick={() => (setDraft([]), setDrawing(true))}>
                    <PencilRuler className="h-4 w-4" /> {(a.footprint?.length ?? 0) >= 3 ? 'Redraw roof' : 'Draw roof outline'}
                  </button>
                ) : (
                  <>
                    <button className="btn-ghost" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}>
                      <Undo2 className="h-4 w-4" />
                    </button>
                    <button className="btn-ghost" disabled={!draft.length} onClick={() => setDraft([])}>
                      <Eraser className="h-4 w-4" />
                    </button>
                    <button className="btn-ghost" onClick={() => setDrawing(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      disabled={ctl.busy || (draft.length > 0 && draft.length < 3)}
                      onClick={async () => {
                        if (await ctl.run({ op: 'setFootprint', footprint: draft })) setDrawing(false);
                      }}
                    >
                      <Save className="h-4 w-4" /> Save
                    </button>
                  </>
                )}
              </div>
            </div>
            {drawing && <Notice tone="blue">Click each corner of the building’s roof (not the plot) in order. Zoom in fully; include balconies and projections seen from above.</Notice>}
            <SpecMap spec={spec} height={340} onClick={drawing ? (lat, lng) => setDraft((d) => [...d, [lat, lng]]) : undefined} />
            <div className="text-xs text-slate-500">
              Roof footprint {draftFootprint ? sqft(draftFootprint) : '—'} × {m.floorsForCheck ?? '?'} floor(s){' '}
              {m.floorsBasis === 'OBSERVED' ? '(seen on the call)' : m.floorsBasis === 'DECLARED' ? '(declared — record the floors seen on the call)' : m.floorsBasis === 'PLAN' ? '(from the plan)' : ''} = {draftFootprint && m.floorsForCheck ? sqft(draftFootprint * m.floorsForCheck) : '—'}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="label">Floor plan total</div>
          <div className="text-lg font-bold">{m.planBuaSqft ? sqft(m.planBuaSqft) : '—'}</div>
          <div className="text-[11px] text-slate-500">
            {m.floorsWithArea} floor(s) · declared {m.declaredBuaSqft ? sqft(m.declaredBuaSqft) : '—'} · approved {m.approvedBuaSqft ? sqft(m.approvedBuaSqft) : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="label">{unit ? 'Deed built-up area' : 'Satellite estimate (roof × floors)'}</div>
          <div className="text-lg font-bold">{unit ? (m.declaredBuaSqft ? sqft(m.declaredBuaSqft) : '—') : m.satelliteBuaSqft ? sqft(m.satelliteBuaSqft) : '—'}</div>
          <div className="text-[11px] text-slate-500">{unit ? 'from Identification → Facts' : m.footprintSqft ? `${sqft(m.footprintSqft)} × ${m.floorsForCheck}` : 'draw the roof outline'}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="label">Delta (plan vs {unit ? 'deed' : 'satellite'})</div>
          <div className={`text-lg font-bold ${m.areaDeltaPct !== null && Math.abs(m.areaDeltaPct) > V.floorArea.fullAt * 100 ? (Math.abs(m.areaDeltaPct) >= V.floorArea.zeroAt * 100 ? 'text-red-700' : 'text-amber-700') : ''}`}>{m.areaDeltaPct !== null ? `${m.areaDeltaPct > 0 ? '+' : ''}${pct(m.areaDeltaPct)}` : '—'}</div>
          <div className="text-[11px] text-slate-500">{m.buaValuedBasis}</div>
        </div>
      </div>

      {cf ? (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          {[
            ['Agreement', cf.agreement, V.floorArea.points.agreement, `|delta| ${pct(Math.abs(m.areaDeltaPct!))} (full ≤ ${V.floorArea.fullAt * 100}%, zero ≥ ${V.floorArea.zeroAt * 100}%)`],
            ['Floor count', cf.floors, V.floorArea.points.floors, unit ? 'unit' : `plan ${m.floorsWithArea} vs ${m.floorsObserved !== null ? `${m.floorsObserved} seen` : `${m.floorsDeclared ?? '?'} declared`}`],
            ['Plan source', cf.source, V.floorArea.points.source, a.floorPlan?.source ? FLOOR_PLAN_SOURCE_LABEL[a.floorPlan.source].split(' (')[0] : 'not recorded'],
          ].map(([l, v, max, sub]) => (
            <div key={l as string} className="rounded-lg border border-slate-200 p-2">
              <div className="text-[10px] font-semibold uppercase text-slate-500">{l}</div>
              <div className="font-bold tabular-nums">
                {Math.round(v as number)}/{max}
              </div>
              <div className="text-[10px] text-slate-400">{sub}</div>
            </div>
          ))}
          <div className={`rounded-lg p-2 ${cf.band === 'HIGH' ? 'bg-emerald-50' : cf.band === 'MEDIUM' ? 'bg-amber-50' : 'bg-red-50'}`}>
            <div className="text-[10px] font-semibold uppercase text-slate-500">Measurement confidence</div>
            <div className="text-lg font-extrabold tabular-nums">{cf.total}</div>
            <div className="text-[10px] text-slate-500">{cf.band === 'HIGH' ? 'high' : cf.band === 'MEDIUM' ? 'medium — condition' : 'low — physical check'}</div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">{!m.planBuaSqft ? 'Enter and save the floor-wise areas to compute the confidence score.' : unit ? 'Enter the deed built-up area (Identification → Facts) to compute the confidence score.' : 'Draw the roof outline to compute the confidence score.'}</p>
      )}
    </Card>
  );
}
