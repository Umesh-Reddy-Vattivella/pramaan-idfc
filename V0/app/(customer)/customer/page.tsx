'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, Clock, FileText, Loader2, MapPin, Plus, Trash2, Upload } from 'lucide-react';
import type { CaseFileView, DocRequest } from '@/lib/types';
import CustomerShell from '@/components/customer/CustomerShell';
import { usePortalLang, type TKey } from '@/lib/client/portalI18n';
import { fileUrl, prepareUpload } from '@/lib/client/files';
import CallWatcher from '@/components/customer/CallWatcher';
import LocationShare from '@/components/customer/LocationShare';

async function call(body?: Record<string, unknown>): Promise<CaseFileView> {
  const r = await fetch('/api/portal/case', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as { view?: CaseFileView; error?: string };
  if (r.status === 401) throw new Error('401');
  if (!r.ok || !j.view) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j.view;
}

const isOpen = (d: DocRequest) => d.status === 'REQUESTED' || d.status === 'REJECTED';

export default function CustomerHome() {
  const router = useRouter();
  const { lang, setLang, t } = usePortalLang();
  const [view, setView] = useState<CaseFileView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await call());
    } catch (e) {
      if (e instanceof Error && e.message === '401') router.replace('/customer/login');
      else setErr(e instanceof Error ? e.message : 'Could not load');
    }
  }, [router]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (key: string, body: () => Promise<Record<string, unknown>>) => {
    setBusy(key);
    setErr(null);
    try {
      setView(await call(await body()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    await fetch('/api/portal/auth', { method: 'DELETE' });
    router.replace('/customer/login');
  };

  if (!view) {
    return (
      <CustomerShell lang={lang} setLang={setLang} t={t}>
        <p className="flex items-center justify-center gap-2 py-10 text-slate-500">{err ?? <Loader2 className="h-5 w-5 animate-spin" />}</p>
      </CustomerShell>
    );
  }

  const mine = view.checklist.filter((d) => d.assignee === 'CUSTOMER');
  const todo = mine.filter(isOpen);
  const sent = mine.filter((d) => !isOpen(d));
  const bankDocs = view.checklist.filter((d) => d.assignee === 'BANK');
  const docsDone = mine.filter((d) => d.mandatory).every((d) => !isOpen(d));
  const siteDone = !view.captureRequested || !!view.capture;
  const reviewDone = view.checklist.filter((d) => d.mandatory).every((d) => d.status === 'VERIFIED');
  const steps: [TKey, boolean][] = [
    ['stepDocs', docsDone],
    ['stepSite', siteDone],
    ['stepReview', reviewDone],
    ['stepValued', false],
  ];
  const current = steps.findIndex(([, ok]) => !ok);

  return (
    <CustomerShell lang={lang} setLang={setLang} t={t} onSignOut={signOut}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {t('hello')}, {view.borrowerName.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500">
            {t('ref')}: <span className="font-mono">{view.caseRef}</span>
          </p>
        </div>

        <CallWatcher lang={lang} onPhoto={load} />
        <LocationShare lang={lang} />

        {/* progress */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('progress')}</div>
          <ol className="flex items-start">
            {steps.map(([k, ok], i) => (
              <li key={k} className="flex flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : ok || i <= current ? 'bg-maroon' : 'bg-slate-200'}`} />
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${ok ? 'bg-instant text-white' : i === current ? 'bg-maroon text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {ok ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'invisible' : ok ? 'bg-maroon' : 'bg-slate-200'}`} />
                </div>
                <span className={`mt-1 text-[11px] ${i === current ? 'font-semibold text-ink' : 'text-slate-500'}`}>{t(k)}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* property */}
        <div className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-maroon" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('yourProperty')}</div>
            <div className="text-[15px] font-semibold leading-snug text-ink">{view.propertyAddress}</div>
          </div>
        </div>

        {/* to-do */}
        <section>
          <h2 className="mb-2 text-lg font-bold text-ink">{t('todo')}</h2>
          <div className="space-y-3">
            {view.captureRequested && !view.capture && (
              <Link href="/customer/capture" className="flex items-center gap-3 rounded-2xl border-2 border-maroon bg-white p-4 shadow-sm">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-maroon/10">
                  <Camera className="h-6 w-6 text-maroon" />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold text-ink">{t('sitePhotos')}</span>
                  <span className="block text-sm text-slate-500">{t('sitePhotosSub')}</span>
                </span>
                <span className="rounded-lg bg-maroon px-3 py-2 text-sm font-semibold text-white">{t('start')}</span>
              </Link>
            )}
            {todo.map((d) => (
              <DocCard key={d.id} d={d} t={t} busy={busy} act={act} />
            ))}
            {todo.length === 0 && (!view.captureRequested || view.capture) && (
              <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-4 text-[15px] text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {t('allDone')}
              </p>
            )}
          </div>
        </section>

        {(sent.length > 0 || view.capture) && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('done')}</h2>
            <div className="space-y-2">
              {view.capture && (
                <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-instant" />
                  <div className="flex-1 text-sm">
                    <div className="font-semibold text-ink">{t('sitePhotos')}</div>
                    <div className="text-xs text-slate-500">
                      {view.capture.photos.length} photos · {view.capture.rooms.length} rooms · {new Date(view.capture.submittedAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              )}
              {sent.map((d) => (
                <DocCard key={d.id} d={d} t={t} busy={busy} act={act} compact />
              ))}
            </div>
          </section>
        )}

        {bankDocs.length > 0 && (
          <details className="rounded-2xl bg-white p-4 shadow-sm">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-ink">
              {t('withBank')} ({bankDocs.length}) <ChevronDown className="h-4 w-4 text-slate-400" />
            </summary>
            <ul className="mt-2 space-y-1.5 text-sm">
              {bankDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">{d.label}</span>
                  <StatusText d={d} t={t} />
                </li>
              ))}
            </ul>
          </details>
        )}
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
      </div>
    </CustomerShell>
  );
}

function StatusText({ d, t }: { d: DocRequest; t: (k: TKey) => string }) {
  const m: Record<DocRequest['status'], [TKey, string, typeof Clock]> = {
    REQUESTED: ['upload', 'text-slate-400', Clock],
    UPLOADED: ['received', 'text-amber-700', Clock],
    VERIFIED: ['verified', 'text-instant', CheckCircle2],
    REJECTED: ['askedAgain', 'text-critical', AlertTriangle],
    NOT_AVAILABLE: ['notAvail', 'text-critical', AlertTriangle],
  };
  const [k, cls, Icon] = m[d.status];
  if (d.status === 'REQUESTED') return <Clock className="h-4 w-4 text-slate-300" />;
  return (
    <span className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" /> {t(k)}
    </span>
  );
}

function DocCard(props: {
  d: DocRequest;
  t: (k: TKey) => string;
  busy: string | null;
  act: (key: string, body: () => Promise<Record<string, unknown>>) => void;
  compact?: boolean;
}) {
  const { d, t, busy, act, compact } = props;
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const uploading = busy === `${d.id}:up`;
  const onFile = (f: File | undefined) => {
    if (!f) return;
    act(`${d.id}:up`, async () => ({ action: 'upload', upload: { docId: d.id, ...(await prepareUpload(f)) } }));
  };
  const canEdit = d.status !== 'VERIFIED';

  return (
    <div className={`rounded-2xl bg-white shadow-sm ${compact ? 'p-3' : 'p-4'} ${d.status === 'REJECTED' ? 'ring-2 ring-red-300' : ''}`}>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pick} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-semibold text-ink ${compact ? 'text-sm' : 'text-[16px]'}`}>
            {d.label} {d.mandatory && !compact && <span className="ml-1 rounded bg-maroon/10 px-1.5 py-0.5 text-[10px] font-bold text-maroon">{t('required')}</span>}
          </div>
          {!compact && <div className="mt-0.5 text-sm text-slate-500">{d.help}</div>}
          {d.note && d.status === 'REJECTED' && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {d.note}
            </div>
          )}
        </div>
        {compact && <StatusText d={d} t={t} />}
      </div>

      {d.uploads.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {d.uploads.map((u) => (
            <li key={u.id} className="relative">
              <a href={fileUrl(u.id)} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {u.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.preview} alt={u.fileName} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center text-[9px] text-slate-500">
                    <FileText className="h-6 w-6 text-maroon" /> PDF
                  </span>
                )}
              </a>
              {canEdit && u.uploadedBy === 'CUSTOMER' && (
                <button
                  onClick={() => act(`${d.id}:rm`, async () => ({ action: 'removeUpload', docId: d.id, uploadId: u.id }))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-1 text-slate-500 shadow"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && d.status !== 'NOT_AVAILABLE' && (
        <div className={`mt-3 grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2'}`}>
          <button onClick={() => cam.current?.click()} disabled={uploading} className="flex items-center justify-center gap-1.5 rounded-xl bg-maroon py-3 text-[15px] font-semibold text-white disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : d.uploads.length ? <Plus className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {uploading ? t('uploading') : d.uploads.length ? t('addMore') : t('takePhoto')}
          </button>
          <button onClick={() => pick.current?.click()} disabled={uploading} className="flex items-center justify-center gap-1.5 rounded-xl border border-maroon py-3 text-[15px] font-semibold text-maroon disabled:opacity-50">
            <Upload className="h-4 w-4" /> {t('upload')}
          </button>
        </div>
      )}
      {canEdit && !compact && d.uploads.length === 0 && (
        <button onClick={() => act(`${d.id}:na`, async () => ({ action: 'notAvailable', docId: d.id, on: true }))} className="mt-2 w-full py-1.5 text-sm text-slate-500 underline">
          {t('dontHave')}
        </button>
      )}
      {d.status === 'NOT_AVAILABLE' && (
        <button onClick={() => act(`${d.id}:na`, async () => ({ action: 'notAvailable', docId: d.id, on: false }))} className="mt-2 text-sm font-semibold text-maroon">
          {t('undo')}
        </button>
      )}
    </div>
  );
}
