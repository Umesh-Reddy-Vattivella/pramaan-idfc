'use client';

import { Camera, CheckCircle2, Fingerprint, Layers, MapPin, ScanFace, ShieldAlert, Smartphone, Sun, XCircle, type LucideIcon } from 'lucide-react';
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { USAGE_LABEL } from '@/lib/engines/usage';
import { Ev } from '@/components/EvidenceDrawer';

const FRAME_GRADIENT = [
  'from-slate-700 via-slate-600 to-stone-500',
  'from-stone-700 via-amber-900/80 to-stone-500',
  'from-sky-900 via-slate-700 to-slate-500',
];

export default function UsageTrustTab({ c, e }: { c: PropertyCase; e: EvidencePack }) {
  const u = e.usage;
  const t = c.trustChecks;
  const omission = e.trust.omissionFraudBlock;

  const telemetry: { label: string; ok: boolean; detail: string; icon: LucideIcon }[] = [
    { label: 'GPS-in-Parcel', ok: t.gpsInParcel, detail: t.gpsInParcel ? 'Inside polygon / ≤ 25 m centroid' : 'Outside parcel', icon: MapPin },
    { label: 'Live Camera Only', ok: t.liveCameraOnly, detail: t.liveCameraOnly ? 'No gallery / screenshots' : 'Gallery upload detected', icon: Camera },
    { label: 'Device Attestation', ok: t.deviceAttested, detail: t.deviceAttested ? 'Not rooted / emulator / mock-GPS' : 'Attestation failed', icon: Smartphone },
    { label: 'Sun-Angle Forensics', ok: t.sunAngleMatched, detail: t.sunAngleMatched ? 'Shadows match solar azimuth' : 'Shadow mismatch', icon: Sun },
    { label: 'Face Match (KYC)', ok: t.faceMatched, detail: t.faceMatched ? 'Matched to Aadhaar / DigiLocker selfie' : 'No match', icon: ScanFace },
    {
      label: 'Floor Coverage Lock',
      ok: t.floorCoverageLocked && !omission,
      detail: omission ? `OMISSION_FRAUD_BLOCK (${c.interiorWalkedFloors}/${c.exteriorDetectedFloors} floors)` : `${c.interiorWalkedFloors}/${c.exteriorDetectedFloors} floors walked`,
      icon: Layers,
    },
  ];

  const detections = c.cvDetections ?? [];

  const verifyRows = [
    { source: 'Computer Vision (photos)', value: `${USAGE_LABEL[u.cvDetectedUsage]} · ${u.cvConfidencePct}% conf.`, ok: !u.usageConflict },
    { source: 'Utility / Tax / Zoning records', value: `${USAGE_LABEL[u.recordConfirmedUsage]} — ${c.utilitySummary}`, ok: !u.usageConflict },
  ];

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="text-base font-bold text-ink">CV Usage Detections</h2>
        <p className="mb-3 text-xs text-slate-500">Annotated frames from the owner&apos;s guided live capture</p>
        {detections.length === 0 ? (
          <p className="rounded-lg bg-canvas px-3 py-6 text-center text-sm text-slate-500">No annotated frames for this case.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {detections.map((d, i) => (
              <figure key={d.label} className="overflow-hidden rounded-xl border border-slate-200">
                <div className={`relative h-40 bg-gradient-to-br ${FRAME_GRADIENT[i % FRAME_GRADIENT.length]}`}>
                  <div className="absolute inset-x-6 top-6 bottom-8 rounded border-2 border-dashed border-emerald-300" />
                  <span className="absolute left-6 top-2 rounded bg-emerald-400 px-1.5 py-0.5 text-[11px] font-bold text-slate-900 tabular-nums">
                    {d.label} {d.confidencePct}%
                  </span>
                  <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                    <Fingerprint className="h-3 w-3" /> signed frame
                  </span>
                </div>
                <figcaption className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-slate-600">{d.frame}</span>
                  <span className="font-semibold text-ink">{USAGE_LABEL[d.usage]}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-base font-bold text-ink">Dual-Source Usage Verification</h2>
          <div className="space-y-2">
            {verifyRows.map((r) => (
              <div key={r.source} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
                {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-instant" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" />}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.source}</div>
                  <div className="text-sm text-ink">{r.value}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={`mt-3 rounded-lg p-3 ${u.usageConflict ? 'bg-critical-bg' : 'bg-instant-bg'}`}>
            <div className={`text-xs font-bold uppercase ${u.usageConflict ? 'text-critical' : 'text-instant'}`}>
              {u.usageConflict ? (u.severeUsageConflict ? 'Severe usage conflict' : 'Usage conflict') : 'Confirmed by 2 independent sources'}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm text-slate-700">Applied LTV cap:</span>
              <Ev k="maxLoan" className="text-2xl font-bold text-ink">
                {Math.round(u.appliedLtvCap * 100)}%
              </Ev>
              <span className="text-sm text-slate-600">({USAGE_LABEL[u.appliedUsage]})</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{u.explanation}</p>
            <p className="mt-1 text-[11px] text-slate-500">Conflicts never resolve upward toward a higher LTV band.</p>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 text-base font-bold text-ink">Trust Layer Telemetry</h2>
          <p className="mb-3 text-xs text-slate-500">
            {e.trust.allPassed ? 'All checks PASS — capture proven on-parcel, live, by the authorised person.' : `${e.trust.failedChecks.length} check(s) FAILED — routed to Physical Check.`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {telemetry.map(({ label, ok, detail, icon: Icon }) => (
              <div key={label} className={`flex items-start gap-2.5 rounded-lg p-3 ${ok ? 'bg-instant-bg' : 'bg-critical-bg'}`}>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ok ? 'text-instant' : 'text-critical'}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-sm font-semibold text-ink">
                    {label}
                    {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-instant" aria-label="pass" /> : <XCircle className="h-3.5 w-3.5 text-critical" aria-label="fail" />}
                  </div>
                  <div className="text-xs text-slate-600">{detail}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Hindsight audit sampling (3–5% of Instant files): {e.hindsightAuditFlag ? 'this file is SAMPLED for post-disbursal audit.' : 'not sampled.'}
          </p>
        </section>
      </div>
    </div>
  );
}
