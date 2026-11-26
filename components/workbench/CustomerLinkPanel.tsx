'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Send, Smartphone, UserCheck } from 'lucide-react';
import type { CaptureSubmission, CustomerLinkState, LinkStatus, PropertyCase } from '@/lib/types';
import { useCases } from '@/lib/state/CasesContext';
import { applySubmission, buildPrefill, linkUrl, localSubmissionKey, newToken } from '@/lib/data/customerLink';
import { isAvailable, losRecordFor } from '@/lib/data/losRecords';

const STATUS_META: Record<LinkStatus, { label: string; cls: string }> = {
  SENT: { label: 'Sent — not opened yet', cls: 'bg-slate-100 text-slate-700' },
  OPENED: { label: 'Opened by customer', cls: 'bg-amber-50 text-amber-800' },
  SUBMITTED: { label: 'Capture received', cls: 'bg-emerald-50 text-emerald-800' },
};

export default function CustomerLinkPanel({ c, compact }: { c: PropertyCase; compact?: boolean }) {
  const { updateCase } = useCases();
  const link = c.customerLink;
  const los = losRecordFor(c);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [storeMode, setStoreMode] = useState<'kv' | 'memory' | null>(null);

  const onFile = los.documents.filter((d) => d.status !== 'NOT_APPLICABLE');
  const onFileCount = onFile.filter(isAvailable).length;

  useEffect(() => {
    if (!link?.url) return setQr(null);
    QRCode.toDataURL(link.url, { margin: 1, width: 220, errorCorrectionLevel: 'L' })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link?.url]);

  const receive = useCallback(
    (sub: CaptureSubmission, l: CustomerLinkState) => {
      updateCase(c.id, applySubmission(c, l, sub));
    },
    [c, updateCase],
  );

  /* Poll the link store while the customer is working. */
  const poll = useCallback(async () => {
    if (!link || link.status === 'SUBMITTED') return;
    try {
      const r = await fetch(`/api/links/${link.token}`, { cache: 'no-store' });
      if (r.ok) {
        const j = (await r.json()) as { status: LinkStatus; openedAt?: string; submission?: CaptureSubmission; storeMode: 'kv' | 'memory' };
        setStoreMode(j.storeMode);
        if (j.submission) return receive(j.submission, { ...link, openedAt: j.openedAt });
        if (j.status !== link.status) updateCase(c.id, { customerLink: { ...link, status: j.status, openedAt: j.openedAt } });
        return;
      }
    } catch {
      /* offline */
    }
    // Same-browser fallback (demo on one device without a KV store).
    try {
      const raw = localStorage.getItem(localSubmissionKey(link.token));
      if (raw) receive(JSON.parse(raw) as CaptureSubmission, link);
    } catch {
      /* ignore */
    }
  }, [link, receive, updateCase, c.id]);

  useEffect(() => {
    if (!link || link.status === 'SUBMITTED') return;
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [link, poll]);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const token = newToken();
      const prefill = buildPrefill(c, token);
      const r = await fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefill }) });
      const j = (await r.json()) as { storeMode?: 'kv' | 'memory'; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setStoreMode(j.storeMode ?? null);
      updateCase(c.id, { customerLink: { token, url: linkUrl(window.location.origin, prefill), sentAt: new Date().toISOString(), status: 'SENT' } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create link');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sub = link?.submission;
  const isLocal = typeof window !== 'undefined' && /^(localhost|127\.|192\.168\.|10\.)/.test(window.location.hostname);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Smartphone className="h-4 w-4 text-maroon" /> Customer valuation link
          </h2>
          <p className="text-xs text-slate-500">
            Pre-filled from loan application <span className="font-semibold">{los.loanAppNo}</span> · {onFileCount}/{onFile.length} documents already on file ·{' '}
            <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3" /> KYC done at onboarding (not repeated)</span>
          </p>
        </div>
        {link && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_META[link.status].cls}`}>{STATUS_META[link.status].label}</span>}
      </div>

      {!link ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={send} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2.5 text-sm font-semibold text-white hover:bg-maroon-deep disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send valuation link to customer
          </button>
          <span className="text-xs text-slate-500">Customer opens it on any phone — no app, no KYC, no re-typing.</span>
        </div>
      ) : (
        <div className={`mt-3 grid gap-4 ${compact ? '' : 'md:grid-cols-[auto_1fr]'}`}>
          {qr && !sub && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for the customer link" className="h-40 w-40 rounded-lg border border-slate-200" />
          )}
          <div className="min-w-0 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-canvas px-2 py-1 text-xs">{link.url.split('#')[0]}</code>
              <button onClick={copy} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs">
                <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`IDFC FIRST Bank: please complete the valuation of your property for loan ${los.loanAppNo}. Takes ~10 minutes at the property: ${link.url}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp
              </a>
              <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
                <ExternalLink className="h-3.5 w-3.5" /> Open as customer
              </a>
              {link.status !== 'SUBMITTED' && (
                <button onClick={poll} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Check now
                </button>
              )}
              <button onClick={send} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-500">
                <Send className="h-3.5 w-3.5" /> Re-send new link
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Sent {new Date(link.sentAt).toLocaleString('en-IN')}
              {link.openedAt ? ` · opened ${new Date(link.openedAt).toLocaleString('en-IN')}` : ''}
            </p>
            {sub && (
              <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Received {new Date(sub.submittedAt).toLocaleString('en-IN')} · by {sub.capturedBy.toLowerCase()} · {sub.photos.length} geo-tagged photos · {sub.rooms.length} rooms measured. See the Identify, Measure and Sanity tabs.
              </p>
            )}
            {storeMode === 'memory' && !isLocal && !sub && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Link store is in server memory. On Vercel, add Upstash Redis / Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN) so the phone&apos;s submission reaches this screen reliably.
              </p>
            )}
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-critical">{err}</p>}
    </section>
  );
}
