'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  User,
  XCircle,
} from 'lucide-react';
import type { CaseFileView, DocRequest, DocRequestStatus, Party } from '@/lib/types';
import { bankApi } from '@/lib/client/caseFileClient';
import { fileUrl, formatBytes, prepareUpload } from '@/lib/client/files';
import { customDocument } from '@/lib/data/docCatalog';

export const DOC_STATUS_META: Record<DocRequestStatus, { label: string; cls: string; icon: typeof Clock }> = {
  REQUESTED: { label: 'Awaiting', cls: 'bg-slate-100 text-slate-600', icon: Clock },
  UPLOADED: { label: 'Uploaded — to verify', cls: 'bg-amber-50 text-amber-800', icon: Upload },
  VERIFIED: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  REJECTED: { label: 'Asked again', cls: 'bg-red-50 text-red-700', icon: RotateCcw },
  NOT_AVAILABLE: { label: 'Not available', cls: 'bg-red-50 text-red-700', icon: XCircle },
};

export function StatusPill({ status }: { status: DocRequestStatus }) {
  const m = DOC_STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

export default function DocumentChecklist({ caseId, view, onChange }: { caseId: string; view: CaseFileView; onChange: (v: CaseFileView) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newDoc, setNewDoc] = useState('');

  const run = async (key: string, fn: () => Promise<{ view: CaseFileView }>) => {
    setBusy(key);
    setErr(null);
    try {
      onChange((await fn()).view);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const groups: { party: Party; title: string; sub: string; icon: typeof Building2 }[] = [
    { party: 'BANK', title: 'Bank collects', sub: 'Collected by sales / at the branch visit — upload here', icon: Building2 },
    { party: 'CUSTOMER', title: 'Requested from customer', sub: 'Shown in the customer portal — the customer uploads each one', icon: User },
  ];

  const done = view.checklist.filter((d) => d.status === 'VERIFIED' || d.status === 'UPLOADED').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">
          <span className="font-semibold text-ink">{done}/{view.checklist.length}</span> documents received ·{' '}
          {view.checklist.filter((d) => d.status === 'VERIFIED').length} verified
        </div>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-instant" style={{ width: `${(done / Math.max(1, view.checklist.length)) * 100}%` }} />
        </div>
      </div>

      {groups.map((g) => {
        const docs = view.checklist.filter((d) => d.assignee === g.party);
        const Icon = g.icon;
        return (
          <section key={g.party} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <Icon className="h-4 w-4 text-maroon" />
              <div>
                <div className="text-sm font-semibold text-ink">{g.title} <span className="font-normal text-slate-400">({docs.length})</span></div>
                <div className="text-[11px] text-slate-500">{g.sub}</div>
              </div>
            </div>
            {docs.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400">None.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <DocRow key={d.id} d={d} busy={busy} run={run} caseId={caseId} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-start gap-2">
          <Camera className="mt-0.5 h-4 w-4 text-maroon" />
          <div>
            <div className="text-sm font-semibold text-ink">Site photos &amp; room measurements</div>
            <div className="text-[11px] text-slate-500">
              {view.capture
                ? `Received ${new Date(view.capture.submittedAt).toLocaleString('en-IN')} · ${view.capture.photos.length} photos · ${view.capture.rooms.length} rooms`
                : 'Geo-tagged photos taken at the property + room dimensions, by the customer or anyone at the property'}
            </div>
          </div>
        </div>
        {!view.capture && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#9C1D26]"
              checked={view.captureRequested}
              onChange={(e) => run('capture', () => bankApi.op(caseId, { op: 'requestCapture', on: e.target.checked }))}
            />
            Request from customer
          </label>
        )}
      </section>

      <div className="flex gap-2">
        <input value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="Add another document (e.g. partition deed)" className="input flex-1" />
        <button
          disabled={!newDoc.trim() || !!busy}
          onClick={() =>
            run('add', async () => {
              const r = await bankApi.op(caseId, { op: 'addDoc', doc: customDocument(newDoc.trim(), 'CUSTOMER') });
              setNewDoc('');
              return r;
            })
          }
          className="inline-flex items-center gap-1 rounded-lg border border-maroon px-3 text-sm font-semibold text-maroon disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {err && <p className="text-sm text-critical">{err}</p>}
    </div>
  );
}

function DocRow({ d, busy, run, caseId }: { d: DocRequest; busy: string | null; run: (k: string, fn: () => Promise<{ view: CaseFileView }>) => void; caseId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const isBusy = busy?.startsWith(d.id) ?? false;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
            {d.label}
            {d.mandatory && <span className="rounded bg-maroon/10 px-1 py-0.5 text-[10px] font-bold text-maroon">MANDATORY</span>}
            <StatusPill status={d.status} />
          </div>
          <div className="text-[11px] text-slate-500">{d.help}</div>
          {d.note && <div className="mt-0.5 text-[11px] font-medium text-red-700">Note to customer: {d.note}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              run(`${d.id}:up`, async () => bankApi.upload(caseId, d.id, await prepareUpload(f)));
            }}
          />
          <button onClick={() => input.current?.click()} disabled={isBusy} className="inline-flex items-center gap-1 rounded-lg bg-maroon px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy === `${d.id}:up` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
          </button>
          {d.status === 'UPLOADED' && (
            <>
              <button onClick={() => run(`${d.id}:v`, () => bankApi.op(caseId, { op: 'verify', docId: d.id }))} className="inline-flex items-center gap-1 rounded-lg bg-instant px-2.5 py-1.5 text-xs font-semibold text-white">
                <Check className="h-3.5 w-3.5" /> Verify
              </button>
              <button onClick={() => setRejecting((x) => !x)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs">
                Ask again
              </button>
            </>
          )}
          {d.status === 'REQUESTED' && (
            <button onClick={() => run(`${d.id}:na`, () => bankApi.op(caseId, { op: 'notAvailable', docId: d.id, on: true }))} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600">
              Not available
            </button>
          )}
          {d.status === 'NOT_AVAILABLE' && (
            <button onClick={() => run(`${d.id}:na`, () => bankApi.op(caseId, { op: 'notAvailable', docId: d.id, on: false }))} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600">
              Request again
            </button>
          )}
          <button
            title={d.assignee === 'BANK' ? 'Ask the customer for this instead' : 'Bank will collect this instead'}
            onClick={() => run(`${d.id}:as`, () => bankApi.op(caseId, { op: 'assign', docId: d.id, assignee: d.assignee === 'BANK' ? 'CUSTOMER' : 'BANK' }))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-600"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> {d.assignee === 'BANK' ? 'Ask customer' : 'Bank collects'}
          </button>
        </div>
      </div>

      {rejecting && (
        <div className="mt-2 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is wrong? e.g. page 2 missing, not readable" className="input flex-1" />
          <button
            disabled={!note.trim()}
            onClick={() => {
              run(`${d.id}:rj`, () => bankApi.op(caseId, { op: 'reject', docId: d.id, note: note.trim() }));
              setRejecting(false);
              setNote('');
            }}
            className="rounded-lg bg-critical px-3 text-xs font-semibold text-white disabled:opacity-40"
          >
            Send to customer
          </button>
        </div>
      )}

      {d.uploads.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {d.uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-canvas p-1.5 pr-2 text-xs">
              {u.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.preview} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded bg-white">
                  <FileText className="h-5 w-5 text-maroon" />
                </span>
              )}
              <div className="min-w-0">
                <a href={fileUrl(u.id)} target="_blank" rel="noreferrer" className="flex max-w-[200px] items-center gap-1 truncate font-medium text-ink hover:text-maroon">
                  {u.fileName} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <div className="text-[10px] text-slate-500">
                  {u.uploadedBy === 'BANK' ? 'Bank' : 'Customer'} · {formatBytes(u.sizeBytes)} · {new Date(u.uploadedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
              {d.status !== 'VERIFIED' && (
                <button onClick={() => run(`${d.id}:rm`, () => bankApi.op(caseId, { op: 'removeUpload', docId: d.id, uploadId: u.id }))} className="p-1 text-slate-400 hover:text-critical" aria-label="Remove file">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
