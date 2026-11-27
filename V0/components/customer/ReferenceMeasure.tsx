'use client';

/**
 * Non-AR fallback: photograph the wall with a known object on it (A4 sheet, door, tile),
 * tap both ends of the object, then both ends of the wall. Scaling is done by
 * lib/engines/measure.knownObjectLengthFt — keep the object flat on the same wall.
 */
import { useMemo, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { knownObjectLengthFt, pixelDistance, REFERENCE_OBJECTS, type ReferenceObjectId } from '@/lib/engines/measure';

type Pt = { x: number; y: number };

export default function ReferenceMeasure({ label, onResult, onClose }: { label: string; onResult: (ft: number) => void; onClose: () => void }) {
  const [refId, setRefId] = useState<ReferenceObjectId>('A4_LONG');
  const [src, setSrc] = useState<string | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const img = useRef<HTMLImageElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const ft = useMemo(() => {
    if (pts.length < 4) return null;
    const refPx = pixelDistance(pts[0], pts[1]);
    const tgtPx = pixelDistance(pts[2], pts[3]);
    if (refPx < 5) return null;
    return knownObjectLengthFt(tgtPx, refPx, REFERENCE_OBJECTS[refId].ft);
  }, [pts, refId]);

  const tap = (e: React.MouseEvent<HTMLImageElement>) => {
    if (pts.length >= 4 || !img.current) return;
    const r = img.current.getBoundingClientRect();
    const sx = img.current.naturalWidth / r.width;
    const sy = img.current.naturalHeight / r.height;
    setPts((p) => [...p, { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }]);
  };

  const prompt = ['Tap one end of the reference object', 'Tap the other end of the reference object', 'Tap one end of the wall', 'Tap the other end of the wall'][pts.length];
  const disp = (p: Pt) => {
    if (!img.current) return { left: 0, top: 0 };
    const r = img.current.getBoundingClientRect();
    return { left: (p.x / img.current.naturalWidth) * r.width, top: (p.y / img.current.naturalHeight) * r.height };
  };

  return (
    <div className="fixed inset-0 z-[3000] flex flex-col bg-slate-900 p-3 text-white">
      <div className="mb-2 text-center text-sm font-semibold">Reference-photo measure · {label}</div>
      <select value={refId} onChange={(e) => setRefId(e.target.value as ReferenceObjectId)} className="mb-2 rounded-lg bg-white/10 px-2 py-2 text-sm">
        {(Object.keys(REFERENCE_OBJECTS) as ReferenceObjectId[]).map((k) => (
          <option key={k} value={k} className="text-ink">
            {REFERENCE_OBJECTS[k].label}
          </option>
        ))}
      </select>
      <input
        ref={file}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setSrc(URL.createObjectURL(f));
            setPts([]);
          }
        }}
      />
      {!src ? (
        <button onClick={() => file.current?.click()} className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/30 text-sm">
          <Camera className="h-8 w-8" />
          Take a photo of the wall with the reference object flat on it
        </button>
      ) : (
        <div className="relative flex-1 overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={img} src={src} alt="Wall to measure" onClick={tap} className="w-full select-none" />
          {pts.map((p, i) => {
            const d = disp(p);
            return (
              <span
                key={i}
                className={`pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${i < 2 ? 'bg-sky-500' : 'bg-emerald-500'}`}
                style={{ left: d.left, top: d.top }}
              />
            );
          })}
        </div>
      )}
      <div className="mt-2 space-y-2">
        {src && <div className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm">{ft === null ? prompt : <span className="text-2xl font-bold tabular-nums">{ft.toFixed(1)} ft</span>}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-white/15 py-3 font-semibold">Cancel</button>
          {src && (
            <button onClick={() => setPts([])} className="rounded-xl bg-white/15 px-4 py-3" aria-label="Reset taps">
              <RotateCcw className="h-5 w-5" />
            </button>
          )}
          <button disabled={ft === null} onClick={() => ft !== null && onResult(Math.round(ft * 10) / 10)} className="flex-1 rounded-xl bg-emerald-500 py-3 font-semibold disabled:opacity-40">
            Use {ft !== null ? `${ft.toFixed(1)} ft` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
