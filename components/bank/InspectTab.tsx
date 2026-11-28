'use client';

import { useMemo } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import type { Occupancy, Usage } from '@/lib/domain/types';
import { assignedSnapshots, isBuilt, OCCUPANCY_LABEL, USAGE_LABEL } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { metres } from '@/lib/engines/format';
import { emptySpec } from '@/lib/mapGeometry';
import { fileUrl } from '@/lib/client/files';
import type { AppCtl } from '@/lib/client/useApplication';
import { SpecMap } from '@/components/workbench/maps';
import { Badge, Card, Field, Notice, type Tone } from '@/components/ui';
import FloorAreaCard from './FloorAreaCard';
import VideoCall from './VideoCall';

const FENCE_TONE: Record<string, Tone> = { INSIDE: 'green', NEAR: 'amber', OUTSIDE: 'red', NO_GPS: 'slate' };
const FENCE_LABEL: Record<string, string> = { INSIDE: 'At property', NEAR: 'Near — re-take', OUTSIDE: 'Away from property', NO_GPS: 'No GPS' };

function Snapshots({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
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

export default function InspectTab({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  return (
    <div className="space-y-5">
      {!a.inspection.locationOn && <Notice tone="amber">The customer has not switched on location sharing yet. They will be asked for location when they answer the call.</Notice>}
      <VideoCall ctl={ctl} />
      <Snapshots ctl={ctl} ev={ev} />
      {isBuilt(a.property.type) && (
        <>
          <Observations ctl={ctl} />
          <FloorAreaCard ctl={ctl} ev={ev} />
        </>
      )}
      {!isBuilt(a.property.type) && <Notice>Open plot — measurement is the satellite boundary in Identification. No building to measure.</Notice>}
    </div>
  );
}
