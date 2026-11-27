'use client';

/**
 * Snap tray + designated views. Snaps taken during the call land in the tray (unassigned: not yet in the
 * geo-fence or the report). The bank drags each snap onto its designated view — or, on touch screens,
 * taps a snap and then taps the view. One photo per view: placing a new one sends the old one back to the tray.
 */
import { useMemo, useState, type DragEvent } from 'react';
import { ImagePlus, Plus, Trash2, Undo2 } from 'lucide-react';
import type { Snapshot, SnapshotArea } from '@/lib/domain/types';
import { EXTERIOR_SHOTS, floorNames, isBuilt } from '@/lib/domain/catalog';
import { fencePoint } from '@/lib/engines/geofence';
import { metres } from '@/lib/engines/format';
import { fileUrl } from '@/lib/client/files';
import type { AppCtl } from '@/lib/client/useApplication';
import { Badge, type Tone } from '@/components/ui';

const DRAG_TYPE = 'application/x-pramaan-snap';
const FENCE_TONE: Record<string, Tone> = { INSIDE: 'green', NEAR: 'amber', OUTSIDE: 'red', NO_GPS: 'slate' };
const FENCE_LABEL: Record<string, string> = { INSIDE: 'At property', NEAR: 'Near', OUTSIDE: 'Away', NO_GPS: 'No GPS' };

interface Slot {
  label: string;
  area: SnapshotArea;
  floor?: string;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function SnapBoard({ ctl, live, pending }: { ctl: AppCtl; live: boolean; pending: number }) {
  const a = ctl.app!;
  const pin = a.property.lat !== null && a.property.lng !== null ? { lat: a.property.lat, lng: a.property.lng } : null;
  const [selected, setSelected] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /** Optimistic moves while the server saves: snapshot id → view label, or null for the tray. */
  const [moving, setMoving] = useState<Record<string, string | null>>({});
  const [extra, setExtra] = useState<Slot[]>([]);
  const [customName, setCustomName] = useState('');
  const [customArea, setCustomArea] = useState<SnapshotArea>('INTERIOR');

  const snaps = useMemo(
    () =>
      a.inspection.snapshots.map((s) => {
        if (!(s.id in moving)) return s;
        const to = moving[s.id];
        return to === null ? { ...s, unassigned: true } : { ...s, label: to, unassigned: false };
      }),
    [a.inspection.snapshots, moving],
  );
  const tray = snaps.filter((s) => s.unassigned).sort((x, y) => y.takenAt.localeCompare(x.takenAt));
  const placed = snaps.filter((s) => !s.unassigned);

  const slots: Slot[] = useMemo(() => {
    const base: Slot[] = [
      ...EXTERIOR_SHOTS.map((l) => ({ label: l, area: 'EXTERIOR' as const })),
      ...(isBuilt(a.property.type) ? floorNames(a.property.floors).map((f) => ({ label: `Inside — ${f}`, area: 'INTERIOR' as const, floor: f })) : []),
    ];
    const known = new Set(base.map((s) => s.label));
    for (const s of [...extra, ...a.inspection.snapshots.filter((x) => !x.unassigned).map((x) => ({ label: x.label, area: x.area, floor: x.floor }))]) {
      if (!known.has(s.label)) {
        known.add(s.label);
        base.push(s);
      }
    }
    return base;
  }, [a.property.type, a.property.floors, a.inspection.snapshots, extra]);

  const onSlot = (label: string) => placed.filter((s) => s.label === label).sort((x, y) => y.takenAt.localeCompare(x.takenAt));

  const move = async (id: string, slot: Slot | null) => {
    setSelected(null);
    setMoving((m) => ({ ...m, [id]: slot ? slot.label : null }));
    // The photo already on that view goes back to the tray (mirrors the server rule).
    if (slot) for (const s of onSlot(slot.label)) if (s.id !== id) setMoving((m) => ({ ...m, [s.id]: null }));
    await ctl.run(slot ? { op: 'assignSnapshot', id, label: slot.label, area: slot.area, floor: slot.floor } : { op: 'unassignSnapshot', id });
    setMoving({});
  };

  const dragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData(DRAG_TYPE, id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropProps = (key: string, onDrop: (id: string) => void) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== key) setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id) onDrop(id);
    },
  });

  const fenceBadge = (s: Snapshot) => {
    const f = fencePoint(s, pin, a.parcel);
    return (
      <span className="flex items-center gap-1">
        <Badge tone={FENCE_TONE[f.status]}>{FENCE_LABEL[f.status]}</Badge>
        {f.distanceM !== null && <span className="text-[10px] text-slate-500">{metres(f.distanceM)}</span>}
      </span>
    );
  };

  const addCustom = () => {
    const label = customName.trim();
    if (!label || slots.some((s) => s.label.toLowerCase() === label.toLowerCase())) return;
    setExtra((x) => [...x, { label, area: customArea }]);
    setCustomName('');
  };

  const filledCount = slots.filter((s) => onSlot(s.label).length).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* ---------- tray ---------- */}
      <div
        {...dropProps('tray', (id) => placed.some((s) => s.id === id) && move(id, null))}
        className={`rounded-xl border-2 border-dashed p-3 transition-colors ${over === 'tray' ? 'border-maroon bg-maroon/5' : 'border-slate-200 bg-slate-50/60'}`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Captured snaps <span className="font-normal normal-case text-slate-400">· {tray.length} to place</span>
          </div>
          <div className="text-[11px] text-slate-400">Drag a snap onto its view → · or tap a snap, then tap the view</div>
        </div>
        {tray.length === 0 && pending === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center text-xs text-slate-400">
            <ImagePlus className="h-6 w-6" />
            {live ? 'Press the shutter button to snap what the customer is showing.' : 'Snaps taken during the video call appear here.'}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: pending }, (_, i) => (
              <div key={`p${i}`} className="flex aspect-[4/3] animate-pulse items-center justify-center rounded-lg bg-slate-200 text-[10px] text-slate-500">
                capturing…
              </div>
            ))}
            {tray.map((s) => (
              <figure
                key={s.id}
                draggable
                onDragStart={(e) => dragStart(e, s.id)}
                onClick={() => setSelected((x) => (x === s.id ? null : s.id))}
                className={`group relative cursor-grab overflow-hidden rounded-lg border bg-white active:cursor-grabbing ${selected === s.id ? 'border-maroon ring-2 ring-maroon' : 'border-slate-200 hover:border-slate-400'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.thumb || fileUrl(s.fileId)} alt="Unassigned snap" draggable={false} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="space-y-0.5 p-1">
                  {fenceBadge(s)}
                  <div className="truncate text-[10px] text-slate-400">
                    {time(s.takenAt)} · {s.source === 'CUSTOMER_DEVICE' ? 'phone' : 'bank frame'}
                  </div>
                </figcaption>
                <button
                  title="Delete this snap"
                  onClick={(e) => {
                    e.stopPropagation();
                    ctl.run({ op: 'deleteSnapshot', id: s.id });
                  }}
                  className="absolute right-1 top-1 hidden rounded-md bg-black/60 p-1 text-white group-hover:block"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <a
                  href={fileUrl(s.fileId)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-1 top-1 hidden rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white group-hover:block"
                >
                  Full size
                </a>
              </figure>
            ))}
          </div>
        )}
      </div>

      {/* ---------- designated views ---------- */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>Designated views</span>
          <span className="font-normal normal-case text-slate-400">
            {filledCount}/{slots.length} placed
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {slots.map((slot) => {
            const here = onSlot(slot.label);
            const s = here[0];
            const key = `slot:${slot.label}`;
            return (
              <li
                key={slot.label}
                {...dropProps(key, (id) => move(id, slot))}
                onClick={() => selected && move(selected, slot)}
                className={`relative overflow-hidden rounded-lg border-2 transition-colors ${over === key ? 'border-maroon bg-maroon/5' : s ? 'border-emerald-200 bg-white' : selected ? 'cursor-pointer border-dashed border-maroon/60 bg-maroon/5' : 'border-dashed border-slate-200 bg-white'}`}
              >
                {s ? (
                  <div draggable onDragStart={(e) => dragStart(e, s.id)} className="cursor-grab active:cursor-grabbing">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.thumb || fileUrl(s.fileId)} alt={slot.label} draggable={false} className="aspect-[4/3] w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 px-2 text-center text-[11px] text-slate-400">
                    <ImagePlus className="h-5 w-5" />
                    {selected ? 'Tap to place here' : 'Drop a snap here'}
                  </div>
                )}
                <div className="space-y-0.5 p-1.5">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[11px] font-semibold text-ink">{slot.label}</span>
                    <span className="ml-auto shrink-0 text-[9px] uppercase text-slate-400">{slot.area === 'EXTERIOR' ? 'ext' : 'int'}</span>
                  </div>
                  {s && (
                    <div className="flex items-center justify-between gap-1">
                      {fenceBadge(s)}
                      <button
                        title="Send back to the tray"
                        onClick={(e) => {
                          e.stopPropagation();
                          move(s.id, null);
                        }}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Undo2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {here.length > 1 && <div className="text-[10px] text-amber-700">+{here.length - 1} older photo(s) on this view</div>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <input className="input flex-1 py-1.5 text-xs" placeholder="Add a view (e.g. Kitchen, Staircase)" value={customName} onChange={(e) => setCustomName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
          <select className="input w-auto py-1.5 text-xs" value={customArea} onChange={(e) => setCustomArea(e.target.value as SnapshotArea)}>
            <option value="INTERIOR">Inside</option>
            <option value="EXTERIOR">Outside</option>
          </select>
          <button className="btn-secondary py-1.5 text-xs" disabled={!customName.trim()} onClick={addCustom}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Only snaps placed on a view count towards the geo-fence check and appear in the report.</p>
      </div>
    </div>
  );
}
