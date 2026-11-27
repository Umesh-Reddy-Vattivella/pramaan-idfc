'use client';

import { useMemo, useState } from 'react';
import { Plus, Ruler, Trash2, Undo2 } from 'lucide-react';
import type { Occupancy, Room, RoomMethod, Usage } from '@/lib/domain/types';
import { assignedSnapshots, floorNames, isBuilt, OCCUPANCY_LABEL, ROOM_METHOD_LABEL, USAGE_LABEL } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { metres, pct, sqft } from '@/lib/engines/format';
import { CARPET_TO_BUA, roomArea } from '@/lib/engines/measure';
import { emptySpec } from '@/lib/mapGeometry';
import { fileUrl } from '@/lib/client/files';
import type { AppCtl } from '@/lib/client/useApplication';
import { SpecMap } from '@/components/workbench/maps';
import { Badge, Card, Field, Notice, type Tone } from '@/components/ui';
import MeasureTool from './MeasureTool';
import VideoCall from './VideoCall';

const FENCE_TONE: Record<string, Tone> = { INSIDE: 'green', NEAR: 'amber', OUTSIDE: 'red', NO_GPS: 'slate' };
const FENCE_LABEL: Record<string, string> = { INSIDE: 'At property', NEAR: 'Near — re-take', OUTSIDE: 'Away from property', NO_GPS: 'No GPS' };

function Snapshots({ ctl, ev, onMeasure }: { ctl: AppCtl; ev: Evaluation; onMeasure: (id: string) => void }) {
  const a = ctl.app!;
  const placed = assignedSnapshots(a.inspection.snapshots);
  const snaps = [...placed].reverse();
  const spec = useMemo(() => {
    const c: [number, number] = ev.pin ? [ev.pin.lat, ev.pin.lng] : [21.15, 79.09];
    const sp = emptySpec(c, 19);
    if (a.parcel.length >= 3) sp.polygons.push({ id: 'parcel', path: a.parcel, color: '#ffffff', fill: '#9C1D26', fillOpacity: 0.2 });
    if (ev.pin) sp.circles.push({ id: 'fence', center: c, radiusM: 25, color: '#16a34a', tooltip: 'Geo-fence base radius 25 m' });
    if (ev.pin) sp.markers.push({ id: 'pin', pos: c, color: '#9C1D26', size: 8, tooltip: 'Property pin' });
    for (const s of placed) {
      const f = ev.geofence.perSnapshot[s.id];
      if (s.lat !== null && s.lng !== null) sp.markers.push({ id: s.id, pos: [s.lat, s.lng], color: f?.status === 'INSIDE' ? '#16a34a' : f?.status === 'NEAR' ? '#f59e0b' : '#dc2626', size: 6, tooltip: `${s.label} · ${f?.distanceM !== null && f?.distanceM !== undefined ? metres(f.distanceM) : '?'}` });
    }
    return sp;
  }, [placed, a.parcel, ev]);

  return (
    <Card title="Snapshots & geo-fence" subtitle={ev.geofence.summary}>
      {snaps.length === 0 ? (
        <p className="text-sm text-slate-500">No views placed yet. Snap during the video call above, then drag each snap onto its designated view.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {snaps.map((s) => {
              const f = ev.geofence.perSnapshot[s.id];
              return (
                <figure key={s.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <a href={fileUrl(s.fileId)} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumb || fileUrl(s.fileId)} alt={s.label} className="h-full w-full object-cover" />
                  </a>
                  <figcaption className="space-y-1 p-2">
                    <div className="truncate text-xs font-semibold text-ink">{s.label}</div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tone={FENCE_TONE[f?.status ?? 'NO_GPS']}>{FENCE_LABEL[f?.status ?? 'NO_GPS']}</Badge>
                      {f?.distanceM !== null && f?.distanceM !== undefined && <span className="text-[10px] text-slate-500">{metres(f.distanceM)}</span>}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(s.takenAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })} · {s.source === 'CUSTOMER_DEVICE' ? 'phone capture' : 'bank-side frame'}
                      {s.accuracyM !== null ? ` · ±${s.accuracyM} m` : ''}
                    </div>
                    <div className="font-mono text-[9px] text-slate-300">sha256 {s.hash}</div>
                    <div className="flex gap-1">
                      <button className="btn-ghost px-1.5 py-1 text-[11px]" onClick={() => onMeasure(s.id)}>
                        <Ruler className="h-3 w-3" /> Measure
                      </button>
                      <button className="btn-ghost px-1.5 py-1 text-[11px]" title="Send back to the snap tray" onClick={() => ctl.run({ op: 'unassignSnapshot', id: s.id })}>
                        <Undo2 className="h-3 w-3" />
                      </button>
                      <button className="btn-ghost px-1.5 py-1 text-[11px] text-red-600" onClick={() => ctl.run({ op: 'deleteSnapshot', id: s.id })}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
          <SpecMap spec={spec} height={360} />
        </div>
      )}
    </Card>
  );
}

function Observations({ ctl }: { ctl: AppCtl }) {
  const a = ctl.app!;
  const i = a.inspection;
  return (
    <Card title="Seen on the call" subtitle="Recorded by the bank during the inspection — compared with the plan and the declaration.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Floors seen">
          <input className="input" defaultValue={i.observedFloors ?? ''} inputMode="numeric" onBlur={(e) => ctl.run({ op: 'setInspection', observedFloors: e.target.value === '' ? null : Number(e.target.value) })} />
        </Field>
        <Field label="Usage seen">
          <select className="input" value={i.observedUsage ?? ''} onChange={(e) => ctl.run({ op: 'setInspection', observedUsage: (e.target.value || null) as Usage | null })}>
            <option value="">— not recorded —</option>
            {(Object.keys(USAGE_LABEL) as Usage[]).map((u) => (
              <option key={u} value={u}>
                {USAGE_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Occupancy">
          <select className="input" value={i.occupancy ?? ''} onChange={(e) => ctl.run({ op: 'setInspection', occupancy: (e.target.value || null) as Occupancy | null })}>
            <option value="">— not recorded —</option>
            {(Object.keys(OCCUPANCY_LABEL) as Occupancy[]).map((u) => (
              <option key={u} value={u}>
                {OCCUPANCY_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Card>
  );
}

function Rooms({ ctl, ev, measureInto }: { ctl: AppCtl; ev: Evaluation; measureInto: (cb: (ft: number, snapshotId: string) => void) => void }) {
  const a = ctl.app!;
  const floors = floorNames(a.property.floors);
  const blank = { floor: floors[0], name: '', l: '', w: '', method: 'TAPE_ON_CALL' as RoomMethod, snapshotId: undefined as string | undefined };
  const [r, setR] = useState(blank);
  const m = ev.measure;
  const add = async () => {
    const room: Room = { id: '', floor: r.floor, name: r.name || 'Room', lengthFt: Number(r.l), widthFt: Number(r.w), method: r.method, snapshotId: r.snapshotId };
    const typed = r;
    setR({ ...blank, floor: r.floor }); // clear at once so the next room can be typed while this one saves
    if (!(await ctl.run({ op: 'upsertRoom', room }))) setR(typed);
  };
  const measure = (k: 'l' | 'w') => measureInto((ft, sid) => setR((x) => ({ ...x, [k]: String(ft), method: 'SNAPSHOT_SCALE', snapshotId: sid })));

  return (
    <Card title="Room measurements" subtitle={`Carpet area per floor × ${CARPET_TO_BUA} loading = built-up area, compared with the approved plan.`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Floor</th>
              <th className="th">Room</th>
              <th className="th">L × W (ft)</th>
              <th className="th">Area</th>
              <th className="th">Method</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {a.rooms.map((x) => (
              <tr key={x.id}>
                <td className="td">{x.floor}</td>
                <td className="td font-medium">{x.name}</td>
                <td className="td tabular-nums">
                  {x.lengthFt} × {x.widthFt}
                </td>
                <td className="td tabular-nums">{sqft(roomArea(x))}</td>
                <td className="td text-xs text-slate-500">{ROOM_METHOD_LABEL[x.method]}</td>
                <td className="td text-right">
                  <button className="btn-ghost px-1.5 text-red-600" onClick={() => ctl.run({ op: 'deleteRoom', id: x.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50/50">
              <td className="td">
                <select className="input py-1.5" value={r.floor} onChange={(e) => setR({ ...r, floor: e.target.value })}>
                  {floors.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </td>
              <td className="td">
                <input className="input py-1.5" placeholder="Hall, Bedroom 1…" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
              </td>
              <td className="td">
                <div className="flex items-center gap-1">
                  <input className="input w-20 py-1.5" placeholder="L" value={r.l} onChange={(e) => setR({ ...r, l: e.target.value, method: r.method === 'SNAPSHOT_SCALE' ? 'TAPE_ON_CALL' : r.method })} inputMode="decimal" />
                  <button title="Measure length on a snapshot" className="btn-ghost px-1" onClick={() => measure('l')}>
                    <Ruler className="h-3.5 w-3.5" />
                  </button>
                  ×
                  <input className="input w-20 py-1.5" placeholder="W" value={r.w} onChange={(e) => setR({ ...r, w: e.target.value })} inputMode="decimal" />
                  <button title="Measure width on a snapshot" className="btn-ghost px-1" onClick={() => measure('w')}>
                    <Ruler className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
              <td className="td tabular-nums text-slate-500">{Number(r.l) > 0 && Number(r.w) > 0 ? sqft(Number(r.l) * Number(r.w)) : '—'}</td>
              <td className="td">
                <select className="input py-1.5 text-xs" value={r.method} onChange={(e) => setR({ ...r, method: e.target.value as RoomMethod })}>
                  {(Object.keys(ROOM_METHOD_LABEL) as RoomMethod[]).map((k) => (
                    <option key={k} value={k}>
                      {ROOM_METHOD_LABEL[k]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="td text-right">
                <button className="btn-primary py-1.5" disabled={!(Number(r.l) > 0 && Number(r.w) > 0) || ctl.busy} onClick={add}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {m.floors.map((f) => (
          <div key={f.floor} className="rounded-lg bg-slate-50 p-3 text-xs">
            <div className="font-semibold text-ink">{f.floor}</div>
            <div className="text-slate-500">
              {f.rooms} room(s) · carpet {sqft(f.carpetSqft)} · BUA {sqft(f.buaSqft)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="label">Measured built-up area</div>
          <div className="text-lg font-bold">{m.measuredBuaSqft ? sqft(m.measuredBuaSqft) : '—'}</div>
          <div className="text-[11px] text-slate-500">Declared: {m.declaredBuaSqft ? sqft(m.declaredBuaSqft) : '—'}</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="label">Approved built-up area</div>
          <div className="text-lg font-bold">{m.approvedBuaSqft ? sqft(m.approvedBuaSqft) : '—'}</div>
          <div className="text-[11px] text-slate-500">Enter in Identification → Facts</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="label">Deviation vs plan</div>
          <div className={`text-lg font-bold ${m.deviationPct !== null && m.deviationPct > 10 ? (m.deviationPct > 30 ? 'text-red-700' : 'text-amber-700') : ''}`}>{m.deviationPct !== null ? pct(m.deviationPct) : '—'}</div>
          <div className="text-[11px] text-slate-500">{m.buaValuedBasis}</div>
        </div>
      </div>
    </Card>
  );
}

export default function InspectTab({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  const [tool, setTool] = useState<{ initial?: string; cb?: (ft: number, sid: string) => void } | null>(null);
  return (
    <div className="space-y-5">
      {!a.inspection.locationOn && <Notice tone="amber">The customer has not switched on location sharing yet. They will be asked for location when they answer the call.</Notice>}
      <VideoCall ctl={ctl} />
      <Snapshots ctl={ctl} ev={ev} onMeasure={(id) => setTool({ initial: id })} />
      {isBuilt(a.property.type) && (
        <>
          <Observations ctl={ctl} />
          <Rooms ctl={ctl} ev={ev} measureInto={(cb) => setTool({ cb })} />
        </>
      )}
      {!isBuilt(a.property.type) && <Notice>Open plot — measurement is the satellite boundary in Identification. No building to measure.</Notice>}
      {tool && (
        <MeasureTool
          snapshots={a.inspection.snapshots}
          initialId={tool.initial}
          onClose={() => setTool(null)}
          onUse={(ft, sid) => {
            tool.cb?.(ft, sid);
            if (!tool.cb) navigator.clipboard?.writeText(String(ft)).catch(() => undefined);
            setTool(null);
          }}
        />
      )}
    </div>
  );
}
