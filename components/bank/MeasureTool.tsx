'use client';

/**
 * Known-object measurement on a call snapshot: click the two ends of a reference object in the same plane
 * (door, A4 sheet, tile…), then the two ends of the length to measure. length = target_px × ref_ft / ref_px.
 */
import { useMemo, useRef, useState } from 'react';
import { RotateCcw, Ruler, X } from 'lucide-react';
import type { Snapshot } from '@/lib/domain/types';
import { knownObjectLengthFt, pixelDistance, REFERENCE_OBJECTS, type ReferenceObjectId } from '@/lib/engines/measure';
import { fileUrl } from '@/lib/client/files';

type Pt = { x: number; y: number };

export default function MeasureTool({ snapshots, initialId, onUse, onClose }: { snapshots: Snapshot[]; initialId?: string; onUse: (ft: number, snapshotId: string) => void; onClose: () => void }) {
  const [snapId, setSnapId] = useState(initialId ?? snapshots[0]?.id);
  const [refId, setRefId] = useState<ReferenceObjectId>('DOOR_HEIGHT');
  const [customFt, setCustomFt] = useState('');
  const [pts, setPts] = useState<Pt[]>([]);
  const img = useRef<HTMLImageElement>(null);
  const snap = snapshots.find((s) => s.id === snapId);
  const refFt = refId === 'CUSTOM' ? Number(customFt) || 0 : REFERENCE_OBJECTS[refId].ft;

  const click = (e: React.MouseEvent<HTMLImageElement>) => {
    const el = img.current;
    if (!el || pts.length >= 4) return;
    const r = el.getBoundingClientRect();
    // natural pixel coordinates (independent of display size)
    const x = ((e.clientX - r.left) / r.width) * el.naturalWidth;
    const y = ((e.clientY - r.top) / r.height) * el.naturalHeight;
    setPts([...pts, { x, y }]);
  };

  const result = useMemo(() => {
    if (pts.length < 4 || refFt <= 0) return null;
    const refPx = pixelDistance(pts[0], pts[1]);
    const tgtPx = pixelDistance(pts[2], pts[3]);
    if (refPx < 3) return null;
    return { ft: knownObjectLengthFt(tgtPx, refPx, refFt), refPx, tgtPx };
  }, [pts, refFt]);

  const step = pts.length < 2 ? `Click the ${pts.length === 0 ? 'first' : 'second'} end of the reference (${refId === 'CUSTOM' ? 'custom object' : REFERENCE_OBJECTS[refId as keyof typeof REFERENCE_OBJECTS].label})` : pts.length < 4 ? `Click the ${pts.length === 2 ? 'first' : 'second'} end of the length to measure` : 'Done';

  const pct = (p: Pt) => (img.current ? { left: `${(p.x / img.current.naturalWidth) * 100}%`, top: `${(p.y / img.current.naturalHeight) * 100}%` } : {});

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="flex items-center gap-2 font-bold text-ink">
            <Ruler className="h-4 w-4 text-maroon" /> Measure on snapshot
          </h3>
          <button onClick={onClose} className="btn-ghost px-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3 border-b border-slate-100 px-5 py-3 sm:grid-cols-3">
          <label>
            <span className="label">Snapshot</span>
            <select className="input" value={snapId} onChange={(e) => { setSnapId(e.target.value); setPts([]); }}>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Reference object (same wall / plane)</span>
            <select className="input" value={refId} onChange={(e) => { setRefId(e.target.value as ReferenceObjectId); setPts([]); }}>
              {(Object.keys(REFERENCE_OBJECTS) as (keyof typeof REFERENCE_OBJECTS)[]).map((k) => (
                <option key={k} value={k}>
                  {REFERENCE_OBJECTS[k].label}
                </option>
              ))}
              <option value="CUSTOM">Custom (enter length)</option>
            </select>
          </label>
          {refId === 'CUSTOM' && (
            <label>
              <span className="label">Reference length (ft)</span>
              <input className="input" value={customFt} onChange={(e) => setCustomFt(e.target.value)} inputMode="decimal" />
            </label>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 bg-slate-50 px-5 py-2 text-xs">
          <span className="font-semibold text-slate-700">{step}</span>
          <button className="btn-ghost py-1 text-xs" onClick={() => setPts([])}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset points
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-900 p-3">
          {snap ? (
            <div className="relative mx-auto w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={img} src={fileUrl(snap.fileId)} alt={snap.label} onClick={click} className="max-h-[55vh] cursor-crosshair select-none" draggable={false} />
              {pts.map((p, i) => (
                <span key={i} style={pct(p)} className={`pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${i < 2 ? 'bg-amber-400' : 'bg-sky-500'}`} />
              ))}
              {img.current && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${img.current.naturalWidth} ${img.current.naturalHeight}`} preserveAspectRatio="none">
                  {pts.length >= 2 && <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#fbbf24" strokeWidth={Math.max(2, img.current.naturalWidth / 300)} />}
                  {pts.length >= 4 && <line x1={pts[2].x} y1={pts[2].y} x2={pts[3].x} y2={pts[3].y} stroke="#0ea5e9" strokeWidth={Math.max(2, img.current.naturalWidth / 300)} />}
                </svg>
              )}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-white/70">No snapshots yet — capture views during the video call first.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <div className="text-sm">
            {result ? (
              <>
                <span className="text-2xl font-extrabold tabular-nums text-maroon">{result.ft.toFixed(2)} ft</span>
                <span className="ml-2 text-xs text-slate-500">
                  = {Math.round(result.tgtPx)} px × {refFt} ft ÷ {Math.round(result.refPx)} px
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-500">Accuracy depends on the reference being in the same plane and the camera held square to the wall.</span>
            )}
          </div>
          <button className="btn-primary" disabled={!result || !snap} onClick={() => result && snap && onUse(Math.round(result.ft * 100) / 100, snap.id)}>
            Use this length
          </button>
        </div>
      </div>
    </div>
  );
}
