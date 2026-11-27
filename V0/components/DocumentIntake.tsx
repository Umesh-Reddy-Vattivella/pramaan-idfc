'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, FileText, FileUp, Languages, Loader2, ScanText, Sparkles, X, XCircle } from 'lucide-react';
import type { OcrExtractResponse } from '@/app/api/ocr-extract/route';
import { DOC_TYPE_LABEL, type DocFact } from '@/lib/engines/docFacts';
import { payloadBytes, prepareDoc, type PreparedDoc } from '@/lib/docs/clientDocs';

const MAX_FILES = 6;
const MAX_PAYLOAD = 4_000_000; // stay under the ~4.5 MB serverless body limit

const FIELD_LABEL: Record<DocFact['field'], string> = {
  OWNER_NAME: 'Owner',
  ADDRESS: 'Address',
  LOCALITY: 'Locality',
  CITY: 'City',
  STATE: 'State',
  PINCODE: 'PIN code',
  SURVEY_NUMBER: 'Survey / Khasra no.',
  PLOT_AREA: 'Plot area',
  FLOOR_AREA_SANCTIONED: 'Floor area (sanctioned)',
  FLOOR_AREA_ACTUAL: 'Floor area (actual)',
  PLAN_NUMBER: 'Sanctioned plan no.',
  CONSTRUCTION_YEAR: 'Construction year',
  USAGE: 'Usage / tax class',
  ROAD_WIDTH: 'Road width',
  BOUNDARY_EAST: 'Boundary — East',
  BOUNDARY_WEST: 'Boundary — West',
  BOUNDARY_NORTH: 'Boundary — North',
  BOUNDARY_SOUTH: 'Boundary — South',
};

type Stage = 'idle' | 'preparing' | 'reading' | 'done';

export default function DocumentIntake({
  onExtracted,
  conflicts,
  notes,
}: {
  onExtracted: (r: OcrExtractResponse) => void;
  conflicts: string[];
  notes: string[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrExtractResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)].slice(0, MAX_FILES));
    setError(null);
  };

  const read = async () => {
    if (!files.length) return;
    setError(null);
    setResult(null);
    setStage('preparing');
    try {
      const prepared: PreparedDoc[] = [];
      for (const [i, f] of files.entries()) {
        setProgress(`Preparing ${i + 1}/${files.length}: ${f.name}`);
        prepared.push(await prepareDoc(f));
      }
      const size = payloadBytes(prepared);
      if (size > MAX_PAYLOAD) throw new Error(`Upload too large after compression (${(size / 1e6).toFixed(1)} MB) — remove a document or use fewer pages.`);
      setStage('reading');
      const scans = prepared.filter((d) => !d.text).length;
      setProgress(`AI reading ${prepared.length} document(s)${scans ? ` — ${scans} need vision OCR` : ''}…`);
      const res = await fetch('/api/ocr-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs: prepared.map((d) => ({ name: d.name, text: d.text, images: d.images })) }),
      });
      const j = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as OcrExtractResponse & { error?: string };
      if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
      setResult(j);
      setStage('done');
      onExtracted(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Document reading failed');
      setStage('idle');
    }
  };

  const busy = stage === 'preparing' || stage === 'reading';

  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-base font-bold text-ink">
        <ScanText className="h-4 w-4 text-maroon" /> 0 · Upload property documents — AI reads &amp; fills the form
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Sale deed, 7/12 / patta / property card, sanctioned plan, tax receipt, EB bill — PDF or photos, any Indian language. Digital PDFs are read
        locally; scans and photos go through free vision OCR. Every filled field shows its source and stays editable.
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="rounded-xl border-2 border-dashed border-maroon/30 bg-canvas p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-maroon bg-white px-3 py-2 text-sm font-semibold text-maroon hover:bg-maroon/5 disabled:opacity-40">
            <FileUp className="h-4 w-4" /> Choose files
          </button>
          <span className="text-xs text-slate-500">or drag &amp; drop here · up to {MAX_FILES} files</span>
          <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
          <button
            type="button"
            onClick={read}
            disabled={!files.length || busy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-bold text-white hover:bg-maroon-deep disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? 'Reading…' : 'Read documents & fill form'}
          </button>
        </div>
        {files.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs shadow-sm">
                <FileText className="h-3.5 w-3.5 text-maroon" />
                <span className="max-w-[200px] truncate">{f.name}</span>
                <span className="text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                {!busy && (
                  <button type="button" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-slate-400 hover:text-critical">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {busy && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress}</p>}
        {error && <p className="mt-2 rounded bg-critical-bg px-2 py-1 text-xs text-critical">{error}</p>}
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="badge badge-instant"><CheckCircle2 className="h-3 w-3" /> {result.facts.length} facts extracted</span>
            <span className="text-slate-500">
              <Bot className="mr-1 inline h-3.5 w-3.5" />
              {result.model}
            </span>
            {result.warnings.map((w) => (
              <span key={w} className="rounded bg-remote-bg px-2 py-0.5 text-remote">{w}</span>
            ))}
          </div>

          {(conflicts.length > 0 || notes.length > 0) && (
            <div className="space-y-1">
              {conflicts.map((c) => (
                <p key={c} className="flex items-start gap-1.5 rounded-lg bg-remote-bg px-3 py-2 text-xs text-remote">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c}
                </p>
              ))}
              {notes.map((n) => (
                <p key={n} className="rounded-lg bg-canvas px-3 py-1.5 text-xs text-slate-600">ℹ {n}</p>
              ))}
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {/* OCR reading per document */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">OCR reading</h3>
              {result.docs.map((d, i) => (
                <details key={`${d.name}-${i}`} className="rounded-lg border border-slate-200 bg-white" open={i === 0}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">D{i + 1}</span>
                    <span className="font-semibold text-ink">{DOC_TYPE_LABEL[d.docType]}</span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-maroon/10 px-2 py-0.5 text-[10px] font-semibold text-maroon">
                      <Languages className="h-3 w-3" /> {d.language}
                    </span>
                    <span className="truncate text-slate-400">{d.name}</span>
                  </summary>
                  <div className="border-t border-slate-100 px-3 py-2">
                    <p className="mb-1 text-[10px] text-slate-400">{d.method}</p>
                    {d.error ? (
                      <p className="text-xs text-critical">{d.error}</p>
                    ) : (
                      <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950 p-2 font-mono text-[11px] leading-relaxed text-emerald-200">{d.text}</pre>
                    )}
                  </div>
                </details>
              ))}
            </div>

            {/* Extracted facts */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Extracted facts (verified against the OCR text)</h3>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {result.facts.map((f, i) => (
                      <tr key={i}>
                        <td className="w-36 px-2 py-1.5 text-slate-500">
                          {FIELD_LABEL[f.field]}
                          {f.floorName && <span className="block text-[10px]">{f.floorName}</span>}
                        </td>
                        <td className="px-2 py-1.5 font-medium text-ink">{f.value}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          <span className="rounded bg-slate-100 px-1 font-mono text-[10px]">D{f.doc + 1}</span>{' '}
                          <span className={`text-[10px] ${f.origin === 'AI' ? 'text-sky-700' : 'text-slate-500'}`}>{f.origin === 'AI' ? 'AI' : 'pattern'}</span>
                        </td>
                      </tr>
                    ))}
                    {result.facts.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-center text-slate-500">No facts found — fill the form manually.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {result.rejected.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-slate-500">{result.rejected.length} AI value(s) rejected by verification</summary>
                  <ul className="mt-1 space-y-0.5 text-slate-500">
                    {result.rejected.map((r, i) => (
                      <li key={i} className="flex gap-1.5">
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-critical" /> {r.field ? FIELD_LABEL[r.field as DocFact['field']] ?? r.field : 'Item'}
                        {r.value ? ` "${r.value}"` : ''} — {r.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
