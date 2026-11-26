'use client';

/**
 * WebXR AR tape measure (Android Chrome / ARCore phones). No app install:
 * immersive-ar session + hit-test; tap at one end, tap at the other end.
 * The distance itself is computed by lib/engines/measure.distance3dFt.
 * Phones without AR use the tape / reference-object fallbacks instead.
 */
import { useEffect, useRef, useState } from 'react';
import { distance3dFt } from '@/lib/engines/measure';

/* Minimal WebXR typings (not in TS lib.dom). */
interface Vec { x: number; y: number; z: number }
interface XRPoseLike { transform: { position: Vec } }
interface XRHitResultLike { getPose(space: unknown): XRPoseLike | null }
interface XRFrameLike { getHitTestResults(src: unknown): XRHitResultLike[]; session: XRSessionLike }
interface XRSessionLike {
  requestReferenceSpace(t: string): Promise<unknown>;
  requestHitTestSource(o: { space: unknown }): Promise<{ cancel(): void }>;
  updateRenderState(s: { baseLayer: unknown }): void;
  requestAnimationFrame(cb: (t: number, f: XRFrameLike) => void): number;
  addEventListener(type: string, cb: () => void): void;
  end(): Promise<void>;
  renderState: { baseLayer?: { framebuffer: WebGLFramebuffer | null } };
}
interface XRSystemLike {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, opts: Record<string, unknown>): Promise<XRSessionLike>;
}
type XRWebGLLayerCtor = new (s: XRSessionLike, gl: WebGLRenderingContext) => { framebuffer: WebGLFramebuffer | null };

const xrSystem = (): XRSystemLike | undefined => (typeof navigator !== 'undefined' ? (navigator as unknown as { xr?: XRSystemLike }).xr : undefined);

export async function arSupported(): Promise<boolean> {
  try {
    const xr = xrSystem();
    return !!xr && (await xr.isSessionSupported('immersive-ar'));
  } catch {
    return false;
  }
}

export default function ArMeasure({ label, onResult, onClose }: { label: string; onResult: (ft: number) => void; onClose: () => void }) {
  const overlay = useRef<HTMLDivElement>(null);
  const session = useRef<XRSessionLike | null>(null);
  const [state, setState] = useState<'starting' | 'running' | 'error'>('starting');
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);
  const [first, setFirst] = useState<Vec | null>(null);
  const [liveFt, setLiveFt] = useState<number | null>(null);
  const [resultFt, setResultFt] = useState<number | null>(null);
  const cur = useRef<Vec | null>(null);
  const firstRef = useRef<Vec | null>(null);
  const doneRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const xr = xrSystem();
      const Layer = (window as unknown as { XRWebGLLayer?: XRWebGLLayerCtor }).XRWebGLLayer;
      if (!xr || !Layer) {
        setState('error');
        setError('AR is not available on this phone. Use “Tape” or “Reference photo”.');
        return;
      }
      try {
        const s = await xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test', 'local'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: overlay.current },
        });
        if (cancelled) {
          await s.end();
          return;
        }
        session.current = s;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl', { xrCompatible: true } as WebGLContextAttributes) as WebGLRenderingContext;
        s.updateRenderState({ baseLayer: new Layer(s, gl) });
        const local = await s.requestReferenceSpace('local');
        const viewer = await s.requestReferenceSpace('viewer');
        const hitSource = await s.requestHitTestSource({ space: viewer });
        s.addEventListener('select', () => {
          const p = cur.current;
          if (!p || doneRef.current) return;
          if (!firstRef.current) {
            firstRef.current = p;
            setFirst(p);
          } else {
            const ft = distance3dFt(firstRef.current, p);
            doneRef.current = true;
            setResultFt(ft);
          }
        });
        s.addEventListener('end', () => {
          hitSource.cancel();
          session.current = null;
          if (!cancelled) closeRef.current();
        });
        setState('running');
        const onFrame = (_t: number, frame: XRFrameLike) => {
          const fb = frame.session.renderState.baseLayer?.framebuffer ?? null;
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          const hits = frame.getHitTestResults(hitSource);
          const pose = hits.length ? hits[0].getPose(local) : null;
          if (pose) {
            const { x, y, z } = pose.transform.position;
            cur.current = { x, y, z };
            setTracking(true);
            if (firstRef.current && !doneRef.current) setLiveFt(distance3dFt(firstRef.current, cur.current));
          } else {
            cur.current = null;
            setTracking(false);
          }
          frame.session.requestAnimationFrame(onFrame);
        };
        s.requestAnimationFrame(onFrame);
      } catch (e) {
        setState('error');
        setError(e instanceof Error ? `${e.message}. Use “Tape” or “Reference photo”.` : 'Could not start AR.');
      }
    })();
    return () => {
      cancelled = true;
      session.current?.end().catch(() => undefined);
    };
  }, []);

  const finish = (ft: number) => {
    onResult(Math.round(ft * 10) / 10);
    session.current?.end().catch(() => undefined);
  };
  const reset = () => {
    firstRef.current = null;
    doneRef.current = false;
    setFirst(null);
    setResultFt(null);
    setLiveFt(null);
  };

  return (
    <div ref={overlay} className="fixed inset-0 z-[3000] flex flex-col items-center justify-between bg-transparent p-4 text-white" style={state === 'running' ? undefined : { background: 'rgba(15,23,42,0.92)' }}>
      <div className="w-full rounded-xl bg-black/60 px-3 py-2 text-center text-sm">
        <div className="font-semibold">AR measure · {label}</div>
        {state === 'starting' && <div className="text-xs text-white/80">Starting camera… move the phone slowly to detect the floor / wall.</div>}
        {state === 'running' && (
          <div className="text-xs text-white/80">
            {!tracking ? 'Move the phone slowly until the + turns green.' : !first ? 'Point the + at one end and tap the screen.' : resultFt === null ? 'Now point at the other end and tap.' : 'Done.'}
          </div>
        )}
        {state === 'error' && <div className="text-xs text-amber-200">{error}</div>}
      </div>

      {state === 'running' && (
        <div className={`text-4xl font-light ${tracking ? 'text-emerald-400' : 'text-white/60'}`} aria-hidden>
          +
        </div>
      )}

      <div className="w-full space-y-2">
        {(resultFt !== null || liveFt !== null) && (
          <div className="rounded-xl bg-black/70 py-3 text-center text-3xl font-bold tabular-nums">{(resultFt ?? liveFt ?? 0).toFixed(1)} ft</div>
        )}
        <div className="flex gap-2">
          {resultFt !== null ? (
            <>
              <button onClick={reset} className="flex-1 rounded-xl bg-white/20 py-3 text-base font-semibold">Redo</button>
              <button onClick={() => finish(resultFt)} className="flex-1 rounded-xl bg-emerald-500 py-3 text-base font-semibold">Use {resultFt.toFixed(1)} ft</button>
            </>
          ) : (
            <button
              onClick={() => {
                if (session.current) session.current.end().catch(() => undefined);
                else closeRef.current();
              }}
              className="flex-1 rounded-xl bg-white/20 py-3 text-base font-semibold"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
