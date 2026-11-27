'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Building2, Copy, ExternalLink, KeyRound, MessageCircle, Smartphone, User } from 'lucide-react';
import type { CaseFileView } from '@/lib/types';
import { customerPortalUrl } from '@/lib/client/caseFileClient';

export default function CustomerAccessPanel({ view, accessCode, storeMode }: { view: CaseFileView; accessCode?: string; storeMode?: 'kv' | 'memory' | 'supabase' | null }) {
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin ? customerPortalUrl(origin, view.token) : '';

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 200, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null));
  }, [url]);

  const message = `IDFC FIRST Bank: please complete the property valuation for your loan ${view.caseRef}. Open ${url} and sign in with the OTP sent to your registered mobile${accessCode ? ` (or access code ${accessCode})` : ''}.`;
  const copy = async (k: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };
  const isLocal = origin && /localhost|127\.0\.0\.1|192\.168\.|\/\/10\./.test(origin);

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Smartphone className="h-4 w-4 text-maroon" /> Customer portal access
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        The customer signs in with an OTP to {view.mobileMasked}
        {accessCode ? ' or the access code' : ''}. No KYC — it was done at onboarding.
        {view.customerLastLoginAt ? ` Last sign-in ${new Date(view.customerLastLoginAt).toLocaleString('en-IN')}.` : ' Not signed in yet.'}
      </p>
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code to the customer portal" className="h-36 w-36 rounded-lg border border-slate-200" />
        )}
        <div className="min-w-0 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-canvas px-2 py-1 text-xs">{url}</code>
            <button onClick={() => copy('url', url)} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs">
              <Copy className="h-3 w-3" /> {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>
              Reference <span className="font-mono font-semibold text-ink">{view.caseRef}</span>
            </span>
            {accessCode && (
              <span className="inline-flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5 text-maroon" /> Access code <span className="font-mono font-semibold tracking-widest text-ink">{accessCode}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <button onClick={() => copy('sms', message)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
              <Copy className="h-3.5 w-3.5" /> {copied === 'sms' ? 'Copied' : 'Copy SMS text'}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
              <ExternalLink className="h-3.5 w-3.5" /> Open customer portal
            </a>
          </div>
          {storeMode === 'memory' && !isLocal && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Server store is in memory: connect the free Supabase database (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) so the customer&apos;s phone and this screen share the same case file and nothing is lost on restart.
            </p>
          )}
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">Activity ({view.events.length})</summary>
        <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-xs">
          {view.events.map((e, i) => (
            <li key={i} className="flex gap-2">
              {e.by === 'BANK' ? <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> : <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-maroon" />}
              <span className="text-slate-400">{new Date(e.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="text-slate-700">{e.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
