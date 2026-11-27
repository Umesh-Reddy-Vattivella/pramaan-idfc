'use client';

import { useState } from 'react';
import { CheckCircle2, Clock, FileText, Loader2, MapPin, MinusCircle, Ruler, Smartphone, XCircle } from 'lucide-react';
import type { CaseFileView, LosDocStatus, PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { effectiveDocuments, losRecordFor } from '@/lib/data/losRecords';
import { allowedRadiusM, GEOFENCE_BASE_TOLERANCE_M } from '@/lib/engines/geofence';
import { haversineMeters } from '@/lib/engines/trust';
import { CARPET_TO_BUA_LOADING, PLAN_MATCH_TOLERANCE_PCT, roomsVsPlan } from '@/lib/engines/measure';
import { geofenceSpec, parcelGeometry, FENCE_COLOR } from '@/lib/mapGeometry';
import { SpecMap } from '@/components/workbench/maps';
import DocumentChecklist from '@/components/bank/DocumentChecklist';
import CustomerAccessPanel from '@/components/bank/CustomerAccessPanel';
import VideoCallPanel from '@/components/bank/VideoCallPanel';
import { bankApi } from '@/lib/client/caseFileClient';
import { caseFileInitFrom, checklistFor, kindFromCase, newCaseRef } from '@/lib/data/caseFileBuild';
import { useCases } from '@/lib/state/CasesContext';

export interface PortalState {
  view: CaseFileView | null;
  setView: (v: CaseFileView) => void;
  storeMode: 'kv' | 'memory' | 'supabase' | null;
  state: 'loading' | 'ready' | 'none' | 'error';
  refresh: () => void;
}

const DOC_STATUS: Record<LosDocStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  ON_FILE: { label: 'On file (LOS)', cls: 'text-instant', icon: CheckCircle2 },
  UPLOADED: { label: 'Uploaded by customer', cls: 'text-instant', icon: CheckCircle2 },
  PENDING: { label: 'Pending', cls: 'text-remote', icon: Clock },
  NOT_AVAILABLE: { label: 'Not available', cls: 'text-critical', icon: XCircle },
  NOT_APPLICABLE: { label: 'Not applicable', cls: 'text-slate-400', icon: MinusCircle },
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

export default function IdentifyTab({ c, e, portal }: { c: PropertyCase; e: EvidencePack; portal: PortalState }) {
  const los = losRecordFor(c);
  const docs = effectiveDocuments(c);
  const sub = c.customerLink?.submission;
  const g = e.geofence;
  const parcel = parcelGeometry(c).parcel;
  const track = portal.view?.locationTrack ?? [];
  const points = (g?.photos ?? []).map((p) => {
    const ph = sub!.photos.find((x) => x.id === p.id)!;
    return { id: p.id, label: p.label, lat: ph.lat, lng: ph.lng, status: p.status, distanceM: p.distanceM };
  });

  return (
    <div className="space-y-5">
      {portal.view ? (
        <>
          <VideoCallPanel caseId={c.id} view={portal.view} onCaptured={portal.refresh} />
          <CustomerAccessPanel view={portal.view} accessCode={c.portal?.accessCode} storeMode={portal.storeMode} />
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
              <FileText className="h-4 w-4 text-maroon" /> Document checklist — shared with the customer portal
            </h2>
            <DocumentChecklist caseId={c.id} view={portal.view} onChange={portal.setView} />
          </section>
        </>
      ) : (
        <OpenAccess c={c} portal={portal} />
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <FileText className="h-4 w-4 text-maroon" /> Documents (from loan application {los.loanAppNo})
          </h2>
          <p className="mb-3 text-xs text-slate-500">Collected by sales during origination — the customer is only asked for what is missing. {los.kycStatus}.</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {docs.map((d) => {
                const st = DOC_STATUS[d.status];
                const Icon = st.icon;
                return (
                  <tr key={d.type}>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-ink">
                        {d.label}
                        {d.mandatory && <span className="ml-1.5 rounded bg-maroon/10 px-1 py-0.5 text-[10px] font-bold text-maroon">MANDATORY</span>}
                      </div>
                      {(d.ref || d.fileName || d.coversFromYear) && (
                        <div className="text-[11px] text-slate-500">
                          {[d.ref, d.fileName, d.coversFromYear && `covers ${d.coversFromYear}–${d.coversToYear}`].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className={`whitespace-nowrap py-1.5 text-right text-xs font-semibold ${st.cls}`}>
                      <Icon className="mr-1 inline h-3.5 w-3.5" />
                      {st.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Fact label="Survey no. (deed)" value={c.surveyDeedNumbers?.join(', ') ?? '—'} />
            <Fact label="Survey no. (land record)" value={c.surveyPattaNumbers?.join(', ') ?? '— (fetch from land record)'} />
            <Fact label="Plot area (deed)" value={`${fmt(c.deedPlotAreaSqft)} sqft`} />
            <Fact label="Plot area (land record)" value={`${fmt(c.cadastralPlotAreaSqft)} sqft`} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <MapPin className="h-4 w-4 text-maroon" /> Geo-fence: photos vs pledged property
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            {g ? g.summary : 'No customer-link capture yet. The fence is the parcel plus ' + GEOFENCE_BASE_TOLERANCE_M + ' m (+ GPS accuracy, max 25 m).'} — who took the photos does not matter; where they were taken does.
          </p>
          <SpecMap spec={geofenceSpec({ lat: c.lat, lng: c.lng }, parcel, GEOFENCE_BASE_TOLERANCE_M, points, track.at(-1) ?? null)} height={300} />
          {track.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              Customer shared location {track.length} time(s) · last {new Date(track.at(-1)!.at).toLocaleString('en-IN')} at ±{track.at(-1)!.accuracyM} m, {Math.round(haversineMeters(c.lat, c.lng, track.at(-1)!.lat, track.at(-1)!.lng)).toLocaleString('en-IN')} m from the
              pin (blue dot).
            </p>
          )}
          {g && (
            <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
              {(['INSIDE', 'NEAR', 'OUTSIDE'] as const).map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: FENCE_COLOR[k] }} /> {k.toLowerCase()} ({k === 'INSIDE' ? g.inside : k === 'NEAR' ? g.near : g.outside})
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      {sub && sub.photos.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-base font-bold text-ink">Geo-tagged capture ({sub.photos.length} photos · by {sub.capturedBy.toLowerCase()})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sub.photos.map((p) => {
              const f = g?.photos.find((x) => x.id === p.id);
              const ok = f?.status === 'INSIDE' && f.live;
              return (
                <figure key={p.id} className={`overflow-hidden rounded-lg border-2 ${ok ? 'border-emerald-500' : f?.status === 'NEAR' ? 'border-amber-400' : 'border-red-500'}`}>
                  {p.thumb ? (
                    <a href={p.fileId ? `/api/files/${p.fileId}` : p.thumb} target="_blank" rel="noreferrer" title={p.fileId ? 'Open full-resolution photo' : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt={p.label} className="aspect-[4/3] w-full object-cover" />
                    </a>
                  ) : (
                    <div className="aspect-[4/3] bg-slate-100" />
                  )}
                  <figcaption className="space-y-0.5 p-1.5 text-[10px] leading-tight text-slate-600">
                    <div className="font-semibold text-ink">
                      {p.label}
                      {p.viaCall && <span className="ml-1 rounded bg-sky-100 px-1 text-[9px] font-bold text-sky-700">VIDEO CALL</span>}
                    </div>
                    <div className="tabular-nums">
                      {p.lat.toFixed(6)}, {p.lng.toFixed(6)} ±{p.accuracyM} m
                    </div>
                    <div>
                      {f ? `${Math.round(f.distanceM)} m from pin (fence ${Math.round(allowedRadiusM(p.accuracyM))} m)` : ''}
                      {f && !f.live ? ' · gallery/old image' : ''}
                    </div>
                    <div className="font-mono text-slate-400">#{p.hash} · {new Date(p.takenAt).toLocaleTimeString('en-IN')}</div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export function CustomerRoomsSection({ c }: { c: PropertyCase }) {
  const sub = c.customerLink?.submission;
  if (!sub || sub.rooms.length === 0) return null;
  const r = roomsVsPlan(sub.rooms, c.floors);
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Ruler className="h-4 w-4 text-maroon" /> Rooms measured by the customer
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Implied BUA = carpet × {CARPET_TO_BUA_LOADING} (walls, stairs). Flagged when it exceeds the approved floor area by more than {PLAN_MATCH_TOLERANCE_PCT}%. Measurement cross-checks the
        approved plan; it never replaces it.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1">Room</th>
              <th className="pb-1">Floor</th>
              <th className="pb-1 text-right">L × W (ft)</th>
              <th className="pb-1 text-right">sqft</th>
              <th className="pb-1 text-right">Method</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sub.rooms.map((x) => (
              <tr key={x.id}>
                <td className="py-1">{x.name}</td>
                <td className="py-1 text-slate-600">{x.floorName}</td>
                <td className="py-1 text-right tabular-nums">
                  {x.lengthFt} × {x.widthFt}
                </td>
                <td className="py-1 text-right tabular-nums">{fmt(x.lengthFt * x.widthFt)}</td>
                <td className="py-1 text-right text-xs text-slate-500">{x.method === 'REFERENCE_OBJECT' ? 'Ref. photo' : x.method === 'AR' ? 'AR' : 'Tape'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1">Floor</th>
              <th className="pb-1 text-right">Carpet</th>
              <th className="pb-1 text-right">Implied BUA</th>
              <th className="pb-1 text-right">Approved</th>
              <th className="pb-1 text-right">Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.rows.map((x) => (
              <tr key={x.floorName} className={x.exceeds ? 'bg-critical-bg/50' : ''}>
                <td className="py-1">{x.floorName}</td>
                <td className="py-1 text-right tabular-nums">{fmt(x.carpetSqft)}</td>
                <td className="py-1 text-right tabular-nums">{fmt(x.impliedBuaSqft)}</td>
                <td className="py-1 text-right tabular-nums">{x.approvedSqft ? fmt(x.approvedSqft) : '—'}</td>
                <td className={`py-1 text-right tabular-nums ${x.exceeds ? 'font-semibold text-critical' : ''}`}>{x.excessPct === null ? '—' : `${x.excessPct > 0 ? '+' : ''}${x.excessPct.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OpenAccess({ c, portal }: { c: PropertyCase; portal: PortalState }) {
  const { updateCase } = useCases();
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (portal.state === 'loading' && c.portal) return null;
  const open = async () => {
    setBusy(true);
    setErr(null);
    try {
      const caseRef = c.portal?.caseRef ?? newCaseRef();
      const init = caseFileInitFrom(c, { caseRef, mobile, kind: kindFromCase(c), checklist: checklistFor(c, kindFromCase(c), true) });
      const r = await bankApi.create(init);
      updateCase(c.id, { portal: { caseRef, token: r.view.token, accessCode: r.accessCode, mobileMasked: r.view.mobileMasked, createdAt: r.view.createdAt } });
      portal.setView(r.view);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Smartphone className="h-4 w-4 text-maroon" /> Open customer portal access
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        {c.portal ? 'The shared case file was not found on the server (e.g. server restarted without KV). Re-open it: ' : ''}
        Creates the shared document checklist (documents already in the loan file start as verified) and a customer sign-in by OTP.
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={mobile} onChange={(x) => setMobile(x.target.value)} inputMode="numeric" placeholder="Borrower's registered mobile" className="input w-64" />
        <button onClick={open} disabled={busy || mobile.replace(/\D/g, '').length !== 10} className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open access &amp; checklist
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-critical">{err}</p>}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-canvas px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}
