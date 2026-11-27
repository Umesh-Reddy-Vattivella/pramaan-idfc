'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react';
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { formatInr } from '@/lib/engines/valuation';
import { DEMO_OTP, DEMO_VALUERS, SIGNATURE_VALIDITY_DAYS, sha256Hex, signaturePayload, validUntilIso } from '@/lib/esign';
import { useCases } from '@/lib/state/CasesContext';

type Stage = 'review' | 'otp' | 'signing' | 'done';

export default function RemoteESignModal({ c, e, open, onClose }: { c: PropertyCase; e: EvidencePack; open: boolean; onClose: () => void }) {
  const { updateCase } = useCases();
  const [stage, setStage] = useState<Stage>('review');
  const [valuerIdx, setValuerIdx] = useState(0);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  const checklist = useMemo(
    () => [
      { id: 'trust', label: 'Trust Layer telemetry reviewed', detail: e.trust.allPassed ? 'All checks PASS' : `${e.trust.failedChecks.length} check(s) not passed`, ok: e.trust.allPassed },
      { id: 'area', label: 'Area reconciliation & BUA deviation reviewed', detail: `A_net ${e.measure.aNet.toLocaleString('en-IN')} sqft · BUA valued ${e.measure.buaValued.toLocaleString('en-IN')} sqft`, ok: !e.measure.areaReconciliation.areaVarianceFlag },
      { id: 'price', label: 'Price evidence & Authenticity Score reviewed', detail: `S = ${e.price.authenticity.score}/100 · ${e.price.authenticity.nComps} comps`, ok: e.price.authenticity.score >= 60 },
      { id: 'usage', label: 'Usage & LTV cap confirmed', detail: e.usage.explanation, ok: !e.usage.usageConflict },
      { id: 'qc', label: 'Auto-QC findings reviewed & remarks accepted', detail: `${e.autoQc.criticalFailCount} critical · ${e.autoQc.failCount} fail · ${e.autoQc.warnCount} warn`, ok: e.autoQc.criticalFailCount === 0 },
      { id: 'value', label: 'Market Value, FSV & words verified', detail: `${formatInr(e.valuation.mvFinal)} · FSV ${formatInr(e.valuation.fsv)}`, ok: true },
    ],
    [e],
  );
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const allTicked = checklist.every((x) => ticked[x.id]);

  useEffect(() => {
    if (!open) return;
    setStage('review');
    setOtp('');
    setOtpError(null);
    setTicked({});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && stage !== 'signing' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stage, onClose]);

  if (!open) return null;
  const valuer = DEMO_VALUERS[valuerIdx];

  const verifyAndSign = async () => {
    if (otp !== DEMO_OTP) {
      setOtpError('Incorrect OTP. (Demo OTP is shown below.)');
      return;
    }
    setStage('signing');
    const timestamp = new Date().toISOString();
    const signatureHash = await sha256Hex(signaturePayload(c, e, valuer, timestamp));
    await new Promise((r) => setTimeout(r, 700));
    updateCase(c.id, {
      esignStatus: 'SIGNED_BY_VALUER',
      signedByValuer: { name: valuer.name, ibbiRegNo: valuer.ibbiRegNo, timestamp, signatureHash, validUntil: validUntilIso(timestamp) },
    });
    setStage('done');
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="esign-title" onClick={() => stage !== 'signing' && onClose()}>
      <div className="card max-h-[92vh] w-full max-w-xl overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between rounded-t-xl bg-maroon px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <div>
              <h2 id="esign-title" className="text-lg font-bold">Remote Registered Valuer e-Sign</h2>
              <p className="text-xs text-white/75">RBI Phase 1 · empanelled IBBI Registered Valuer · simulated OTP</p>
            </div>
          </div>
          <button onClick={onClose} disabled={stage === 'signing'} className="rounded-md p-1.5 hover:bg-white/15" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {stage === 'review' && (
            <>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Empanelled valuer</span>
                <select value={valuerIdx} onChange={(ev) => setValuerIdx(Number(ev.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {DEMO_VALUERS.map((v, i) => (
                    <option key={v.ibbiRegNo} value={i}>
                      {v.name} — {v.ibbiRegNo}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence checklist (tick each after review)</div>
                <ul className="space-y-1.5">
                  {checklist.map((x) => (
                    <li key={x.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 hover:bg-canvas">
                        <input type="checkbox" checked={!!ticked[x.id]} onChange={(ev) => setTicked((t) => ({ ...t, [x.id]: ev.target.checked }))} className="mt-0.5 accent-[#9C1D26]" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{x.label}</span>
                          <span className="block text-xs text-slate-500">{x.detail}</span>
                        </span>
                        <span className={`badge ${x.ok ? 'badge-instant' : 'badge-remote'}`}>{x.ok ? 'clear' : 'noted'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                disabled={!allTicked}
                onClick={() => setStage('otp')}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-maroon py-2.5 text-sm font-bold text-white hover:bg-maroon-deep disabled:opacity-40"
              >
                <KeyRound className="h-4 w-4" /> Send OTP to registered mobile
              </button>
            </>
          )}

          {stage === 'otp' && (
            <>
              <p className="text-sm text-slate-600">
                OTP sent to the registered mobile of <span className="font-semibold text-ink">{valuer.name}</span> [number masked].
              </p>
              <input
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={otp}
                onChange={(ev) => {
                  setOtp(ev.target.value.replace(/\D/g, ''));
                  setOtpError(null);
                }}
                onKeyDown={(ev) => ev.key === 'Enter' && otp.length === 6 && verifyAndSign()}
                placeholder="••••••"
                aria-label="6-digit OTP"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em]"
              />
              {otpError && <p className="text-sm text-critical">{otpError}</p>}
              <p className="text-center text-xs text-slate-400">Demo OTP: {DEMO_OTP}</p>
              <div className="flex justify-between">
                <button type="button" onClick={() => setStage('review')} className="text-sm font-semibold text-slate-500 hover:text-maroon">
                  Back
                </button>
                <button
                  type="button"
                  disabled={otp.length !== 6}
                  onClick={verifyAndSign}
                  className="rounded-lg bg-maroon px-5 py-2 text-sm font-bold text-white hover:bg-maroon-deep disabled:opacity-40"
                >
                  Verify OTP &amp; Sign
                </button>
              </div>
            </>
          )}

          {stage === 'signing' && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-slate-600">
              <Loader2 className="h-8 w-8 animate-spin text-maroon" /> Sealing evidence pack with SHA-256 and stamping signature block…
            </div>
          )}

          {stage === 'done' && c.signedByValuer && (
            <>
              <div className="rounded-xl border-2 border-instant bg-instant-bg p-4">
                <div className="flex items-center gap-2 text-instant">
                  <BadgeCheck className="h-6 w-6" />
                  <span className="text-base font-bold">SIGNED &amp; READY FOR DISBURSAL</span>
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <Row k="Valuer" v={c.signedByValuer.name} />
                  <Row k="IBBI Reg. No." v={c.signedByValuer.ibbiRegNo} />
                  <Row k="Timestamp" v={new Date(c.signedByValuer.timestamp).toLocaleString('en-IN')} />
                  <Row k="Validity" v={`Valid ${SIGNATURE_VALIDITY_DAYS} Days (until ${c.signedByValuer.validUntil ? new Date(c.signedByValuer.validUntil).toLocaleDateString('en-IN') : '—'})`} />
                </dl>
                <div className="mt-2 break-all rounded bg-white/70 px-2 py-1 font-mono text-[10px] text-slate-600">SHA-256 {c.signedByValuer.signatureHash}</div>
              </div>
              <button type="button" onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-lg bg-maroon py-2.5 text-sm font-bold text-white hover:bg-maroon-deep">
                <CheckCircle2 className="h-4 w-4" /> Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </div>
  );
}
