'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileUp, Loader2, Sparkles, X } from 'lucide-react';
import { useCases } from '@/lib/state/CasesContext';
import { formatInrShort } from '@/lib/engines/valuation';
import type { AnalyzeLiveResponse } from '@/lib/live/extraction';
import { RouteBadge } from '@/components/StatusBadges';
import type { RouteTier } from '@/lib/types';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic';


export default function LiveUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { upsertCase } = useCases();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeLiveResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const reset = () => {
    setFiles([]);
    setResult(null);
    setError(null);
  };

  const analyze = async () => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      let res: Response | null = null;
      try {
        res = await fetch('/api/analyze-live', { method: 'POST', body: fd });
      } catch {
        res = null;
      }
      if (!res) {
        setError('Server unreachable — documents could not be read. Try again when online, or enter the details manually in “Value New Property”.');
      } else if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Upload failed (HTTP ${res.status})`);
      } else {
        setResult((await res.json()) as AnalyzeLiveResponse);
      }
    } finally {
      setBusy(false);
    }
  };

  const openWorkbench = () => {
    if (!result) return;
    upsertCase(result.case);
    onClose();
    reset();
    router.push(`/cases/${encodeURIComponent(result.case.id)}`);
  };

  const ex = result?.extracted;
  const rows: [string, string | undefined][] = ex
    ? [
        ['Property', ex.title],
        ['Location', [ex.city, ex.state].filter(Boolean).join(', ') || undefined],
        ['Applicant', ex.applicantName],
        ['Plot area (deed / record)', ex.deedPlotAreaSqft ? `${ex.deedPlotAreaSqft.toLocaleString('en-IN')} / ${(ex.recordPlotAreaSqft ?? ex.deedPlotAreaSqft).toLocaleString('en-IN')} sqft` : undefined],
        ['Floors', ex.floors?.length ? `${ex.floors.length} floor rows` : undefined],
        ['Stated land rate', ex.statedLandRatePerSqft ? `Rs. ${ex.statedLandRatePerSqft.toLocaleString('en-IN')}/sqft` : undefined],
        ['Stated value (words)', ex.statedValueWords],
        ['Dates (visit / report / sign)', [ex.visitDate, ex.reportDate, ex.signDate].map((d) => d ?? '—').join(' / ')],
        ['Survey nos. (deed / record)', `${ex.surveyNumbersDeed?.join(', ') ?? '—'} / ${ex.surveyNumbersRecord?.join(', ') ?? '—'}`],
      ]
    : [];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="upload-title" onClick={() => !busy && onClose()}>
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-t-xl bg-maroon px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <div>
              <h2 id="upload-title" className="text-lg font-bold">Upload Live PDF / Photos (AI)</h2>
              <p className="text-xs text-white/75">Vision AI extracts printed values only — every figure is computed by lib/engines</p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-white/15" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {!result && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-maroon/30 bg-canvas px-6 py-8 text-center hover:border-maroon"
              >
                <FileUp className="h-8 w-8 text-maroon" />
                <span className="text-sm font-semibold text-ink">Choose appraisal report PDF and/or property photos</span>
                <span className="text-xs text-slate-500">PDF, JPG, PNG, WEBP, HEIC · up to 8 files · 18 MB total</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              {files.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {files.map((f) => (
                    <li key={f.name} className="flex justify-between rounded-md bg-slate-50 px-3 py-1.5">
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{(f.size / 1024).toFixed(0)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
              {error && <p className="rounded-md bg-critical-bg px-3 py-2 text-sm text-critical">{error}</p>}
              <button
                type="button"
                onClick={analyze}
                disabled={!files.length || busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-maroon py-2.5 text-sm font-bold text-white hover:bg-maroon-deep disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? 'Extracting & running engines…' : 'Extract & Evaluate'}
              </button>
            </>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {result.mode === 'LIVE_AI' ? (
                  <span className="badge badge-instant">Live AI Extraction · {result.model}</span>
                ) : (
                  <span className="badge badge-remote">Simulated Extraction Mode</span>
                )}
                {result.warning && <span className="text-xs text-slate-500">{result.warning}</span>}
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {rows.map(([k, v]) => (
                    <tr key={k}>
                      <td className="w-48 py-1.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</td>
                      <td className={`py-1.5 ${v ? 'text-ink' : 'text-slate-300'}`}>{v ?? 'not found'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas p-3">
                <div className="text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Engine result</div>
                  <div className="font-semibold text-ink tabular-nums">
                    MV {formatInrShort(result.summary.mvFinal)} · S {result.summary.score}/100
                  </div>
                </div>
                <RouteBadge tier={result.summary.tier as RouteTier} />
              </div>
              <div className="flex justify-between gap-2">
                <button type="button" onClick={reset} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:text-maroon">
                  Upload different files
                </button>
                <button type="button" onClick={openWorkbench} className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-bold text-white hover:bg-maroon-deep">
                  Save case &amp; open Workbench <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
