'use client';

/* Customer portal: status only (no valuation figures), location switch, document uploads, incoming video call. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, LogOut, MapPin, MapPinOff, Video } from 'lucide-react';
import type { CustomerView } from '@/lib/domain/types';
import type { LocationFix } from '@/lib/domain/types';
import { api } from '@/lib/client/api';
import DocumentSlot from '@/components/DocumentSlot';
import CallScreen from '@/components/customer/CallScreen';
import { Badge, Logo, Spinner, STAGE_LABEL, STAGE_TONE, StageDot } from '@/components/ui';

const LOC_KEY = 'pramaan_location_on';

function useLocationSharing(view: CustomerView | null, onView: (v: CustomerView) => void) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  const watch = useRef<number | null>(null);
  const buffer = useRef<LocationFix[]>([]);

  const stop = useCallback(async (report = true) => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setOn(false);
    localStorage.removeItem(LOC_KEY);
    if (report) onView((await api<{ view: CustomerView }>('/api/me', { body: { action: 'location', on: false } })).view);
  }, [onView]);

  const start = useCallback(() => {
    setErr(null);
    if (!('geolocation' in navigator)) return setErr('This browser cannot share location.');
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setAcc(Math.round(p.coords.accuracy));
        buffer.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: new Date(p.timestamp).toISOString() });
        if (!on) {
          setOn(true);
          localStorage.setItem(LOC_KEY, '1');
        }
      },
      (e) => {
        setErr(e.code === 1 ? 'Location permission was denied. Allow location for this website in your browser settings, then try again.' : 'Could not get your location yet — move near a window or outside.');
        if (e.code === 1) stop(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
    setOn(true);
    localStorage.setItem(LOC_KEY, '1');
    api<{ view: CustomerView }>('/api/me', { body: { action: 'location', on: true } }).then((j) => onView(j.view)).catch(() => undefined);
  }, [on, onView, stop]);

  // resume if it was on before a reload (permission already granted → no prompt)
  useEffect(() => {
    if (view && localStorage.getItem(LOC_KEY) === '1' && watch.current === null) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!view]);

  // send the trail every 20 s
  useEffect(() => {
    const id = setInterval(() => {
      const fixes = buffer.current.splice(0, 50);
      if (fixes.length) api<{ view: CustomerView }>('/api/me', { body: { action: 'track', fixes } }).then((j) => onView(j.view)).catch(() => undefined);
    }, 20000);
    const flush = setTimeout(() => {
      const fixes = buffer.current.splice(0, 50);
      if (fixes.length) api('/api/me', { body: { action: 'track', fixes } }).catch(() => undefined);
    }, 4000);
    return () => {
      clearInterval(id);
      clearTimeout(flush);
    };
  }, [on, onView]);

  useEffect(() => () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
  }, []);

  return { on, err, acc, start, stop };
}

export default function CustomerHome() {
  const [view, setView] = useState<CustomerView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setView((await api<{ view: CustomerView }>('/api/me')).view);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load');
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 8000);
    return () => clearInterval(t);
  }, [load]);
  const loc = useLocationSharing(view, setView);

  const signOut = async () => {
    await fetch('/api/auth/customer', { method: 'DELETE' });
    window.location.href = '/customer/login';
  };

  if (!view) return <div className="flex min-h-screen items-center justify-center">{err ? <p className="text-sm text-red-700">{err}</p> : <Spinner label="Loading…" />}</div>;

  // The customer's own list stays stable (status changes in place); everything else is under "All documents".
  const owed = view.documents.filter((d) => d.from !== 'BANK' && (d.mandatory || d.from === 'CUSTOMER'));
  const stillNeeded = owed.filter((d) => d.status === 'PENDING' || d.status === 'REJECTED').length;
  const others = view.documents.filter((d) => !owed.includes(d));
  const done = view.stages.filter((s) => s.state === 'DONE').length;

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-16">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <Logo sub="Customer portal" />
        <button onClick={signOut} className="btn-ghost px-2" title="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="space-y-4 px-4 pt-4">
        <section>
          <p className="text-sm text-slate-500">Namaste{view.borrowerFirstName ? `, ${view.borrowerFirstName}` : ''}</p>
          <h1 className="text-xl font-extrabold text-ink">Your property valuation</h1>
          <p className="mt-1 text-xs text-slate-500">
            Application <span className="font-mono font-semibold text-slate-700">{view.ref}</span> · {view.propertyTypeLabel}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{view.address}</p>
        </section>

        {view.completed ? (
          <div className="card flex items-center gap-3 border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
            <div>
              <div className="font-bold text-emerald-900">Valuation completed</div>
              <div className="text-sm text-emerald-800">Your bank will contact you about the next step of your loan.</div>
            </div>
          </div>
        ) : (
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Status: In progress</span>
              <span className="text-xs text-slate-500">
                {done} of {view.stages.length} steps done
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-maroon transition-all" style={{ width: `${(done / view.stages.length) * 100}%` }} />
            </div>
          </div>
        )}

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-ink">Steps</h2>
          <ol className="space-y-3">
            {view.stages.map((s) => (
              <li key={s.key} className="flex gap-3">
                <StageDot s={s.state} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{s.label}</span>
                    <Badge tone={STAGE_TONE[s.state]}>{STAGE_LABEL[s.state]}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{s.customerNote}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {!view.completed && (
          <section className={`card p-4 ${loc.on ? 'border-emerald-200' : 'border-amber-200'}`}>
            <div className="flex items-start gap-3">
              {loc.on ? <MapPin className="h-6 w-6 shrink-0 text-emerald-600" /> : <MapPinOff className="h-6 w-6 shrink-0 text-amber-600" />}
              <div className="flex-1">
                <h2 className="text-sm font-bold text-ink">Location {loc.on ? 'is on' : 'is off'}</h2>
                <p className="text-xs text-slate-500">
                  The bank checks that the property photos are taken at the property. Your location is used only for this valuation{loc.on && loc.acc ? ` (accuracy ±${loc.acc} m)` : ''}.
                </p>
                {loc.err && <p className="mt-1 text-xs font-medium text-red-700">{loc.err}</p>}
                <div className="mt-3">
                  {loc.on ? (
                    <button className="btn-secondary w-full" onClick={() => loc.stop()}>
                      Turn location off
                    </button>
                  ) : (
                    <button className="btn-green w-full py-2.5" onClick={loc.start}>
                      <MapPin className="h-4 w-4" /> Turn on location
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {!view.completed && (
          <section className="card flex items-start gap-3 p-4">
            <Video className="h-6 w-6 shrink-0 text-maroon" />
            <div>
              <h2 className="text-sm font-bold text-ink">Video call from the bank</h2>
              <p className="text-xs text-slate-500">
                Keep this page open at the property. The bank will call you here, guide you to show the outside of the building and each floor, and take the photos themselves — you only hold the phone.
                {view.snapshotsTaken ? ` ${view.snapshotsTaken} photo(s) taken so far.` : ''}
              </p>
            </div>
          </section>
        )}

        {owed.length > 0 && !view.completed && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-ink">Documents we need from you {stillNeeded ? <span className="font-normal text-slate-500">({stillNeeded} to upload)</span> : <span className="font-normal text-emerald-700">(all received)</span>}</h2>
            {owed.map((d) => (
              <DocumentSlot
                key={d.key}
                slot={d}
                role="CUSTOMER"
                onUpload={async (u) => setView((await api<{ view: CustomerView }>('/api/me', { body: { action: 'upload', ...u } })).view)}
                onRemove={async (fileRowId) => setView((await api<{ view: CustomerView }>('/api/me', { body: { action: 'removeFile', docKey: d.key, fileRowId } })).view)}
              />
            ))}
          </section>
        )}

        <details className="card p-4" open={owed.length === 0}>
          <summary className="cursor-pointer text-sm font-bold text-ink">All documents for this application ({view.documents.filter((d) => d.files.length).length}/{view.documents.length} received)</summary>
          <p className="mt-1 text-xs text-slate-500">Most of these are already with the bank from your loan application. You can add a file if you have it.</p>
          <div className="mt-3 space-y-3">
            {others.map((d) => (
              <DocumentSlot
                key={d.key}
                slot={d}
                role="CUSTOMER"
                onUpload={async (u) => setView((await api<{ view: CustomerView }>('/api/me', { body: { action: 'upload', ...u } })).view)}
                onRemove={async (fileRowId) => setView((await api<{ view: CustomerView }>('/api/me', { body: { action: 'removeFile', docKey: d.key, fileRowId } })).view)}
              />
            ))}
          </div>
        </details>

        <p className="pt-2 text-center text-[11px] text-slate-400">IDFC FIRST Bank · PRAMAAN. No KYC is needed again — your identity was verified when you applied.</p>
      </main>
      <CallScreen onActivity={load} />
    </div>
  );
}
