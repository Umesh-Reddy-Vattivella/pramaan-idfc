'use client';

/* One upload slot per document — used by both portals (bank sees verify / reject). */
import { useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, RotateCcw, Trash2, Upload, XCircle } from 'lucide-react';
import type { DocSlot, Party } from '@/lib/domain/types';
import { FROM_LABEL } from '@/lib/domain/catalog';
import { fileUrl, formatBytes, prepareUpload } from '@/lib/client/files';
import { Badge, type Tone } from '@/components/ui';

const STATUS: Record<DocSlot['status'], { label: string; customer: string; tone: Tone }> = {
  PENDING: { label: 'Pending', customer: 'Not received', tone: 'slate' },
  UPLOADED: { label: 'Received — to verify', customer: 'Received', tone: 'blue' },
  VERIFIED: { label: 'Verified', customer: 'Checked by the bank', tone: 'green' },
  REJECTED: { label: 'Rejected', customer: 'Please upload again', tone: 'red' },
};

export default function DocumentSlot({
  slot: d,
  role,
  onUpload,
  onRemove,
  onReview,
}: {
  slot: DocSlot;
  role: Party;
  onUpload: (u: { docKey: string; fileName: string; mime: string; dataBase64: string }) => Promise<void>;
  onRemove: (fileRowId: string) => Promise<void>;
  onReview?: (status: 'VERIFIED' | 'REJECTED' | 'UPLOADED', remark?: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const s = STATUS[d.status];
  const locked = d.status === 'VERIFIED';

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null);
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const p = await prepareUpload(f);
        await onUpload({ docKey: d.key, fileName: p.fileName, mime: p.mime, dataBase64: p.dataBase64 });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${d.status === 'REJECTED' ? 'border-red-200 bg-red-50/40' : d.status === 'VERIFIED' ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{d.label}</span>
            {d.mandatory ? <Badge tone="maroon">Mandatory</Badge> : <Badge>Recommended</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{d.help}</p>
          {role === 'BANK' && <p className="mt-0.5 text-[11px] text-slate-400">Expected from: {FROM_LABEL[d.from]}</p>}
        </div>
        <Badge tone={s.tone}>{role === 'BANK' ? s.label : s.customer}</Badge>
      </div>

      {d.status === 'REJECTED' && d.remark && <p className="mt-2 text-xs font-medium text-red-700">Reason: {d.remark}</p>}

      {d.files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {d.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
              <a href={fileUrl(f.fileId)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 font-medium text-sky-700 hover:underline">
                <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{f.name}</span>
              </a>
              <span className="flex shrink-0 items-center gap-2 text-slate-400">
                {formatBytes(f.size)} · {f.by === 'BANK' ? 'Bank' : 'Customer'}
                {!locked && (role === 'BANK' || f.by === 'CUSTOMER') && (
                  <button title="Remove" onClick={() => act(() => onRemove(f.id))} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!locked && (
          <>
            <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
            <button className="btn-secondary py-1.5 text-xs" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {d.files.length ? 'Add file' : 'Upload'}
            </button>
          </>
        )}
        {role === 'BANK' && onReview && d.files.length > 0 && (
          <>
            {d.status !== 'VERIFIED' && (
              <button className="btn-green py-1.5 text-xs" disabled={busy} onClick={() => act(() => onReview('VERIFIED'))}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Verify
              </button>
            )}
            {d.status !== 'REJECTED' && d.status !== 'VERIFIED' && !rejecting && (
              <button className="btn-ghost py-1.5 text-xs text-red-700" disabled={busy} onClick={() => setRejecting(true)}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
            )}
            {d.status === 'VERIFIED' && (
              <button className="btn-ghost py-1.5 text-xs" disabled={busy} onClick={() => act(() => onReview('UPLOADED'))}>
                <RotateCcw className="h-3.5 w-3.5" /> Undo verification
              </button>
            )}
          </>
        )}
      </div>
      {rejecting && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input flex-1 py-1.5 text-xs" placeholder="Reason shown to the customer (e.g. page 3 missing)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button
            className="btn-red py-1.5 text-xs"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await onReview!('REJECTED', reason);
                setRejecting(false);
                setReason('');
              })
            }
          >
            Reject
          </button>
          <button className="btn-ghost py-1.5 text-xs" onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
}
