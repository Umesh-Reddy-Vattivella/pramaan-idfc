'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, MessageSquareText, ShieldCheck } from 'lucide-react';
import CustomerShell from '@/components/customer/CustomerShell';
import { usePortalLang } from '@/lib/client/portalI18n';

interface Resolved {
  caseRef: string;
  mobileMasked: string;
  borrowerFirstName: string;
}

async function auth(body: Record<string, unknown>) {
  const r = await fetch('/api/portal/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('t') ?? undefined;
  const { lang, setLang, t } = usePortalLang();
  const [refInput, setRefInput] = useState('');
  const [app, setApp] = useState<Resolved | null>(null);
  const [method, setMethod] = useState<'otp' | 'code'>('otp');
  const [otpSent, setOtpSent] = useState(false);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const who = () => (token ? { token } : { caseRef: app?.caseRef ?? refInput.trim() });

  useEffect(() => {
    if (!token) return;
    setBusy(true);
    auth({ action: 'resolve', token })
      .then((j) => setApp(j as unknown as Resolved))
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [token]);

  const step = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const findApp = () => step(async () => setApp((await auth({ action: 'resolve', caseRef: refInput.trim() })) as unknown as Resolved));
  const sendOtp = () =>
    step(async () => {
      const j = await auth({ action: 'sendOtp', ...who() });
      setOtpSent(true);
      setDemoOtp(typeof j.demoOtp === 'string' ? j.demoOtp : null);
      setOtp('');
    });
  const verify = () =>
    step(async () => {
      await auth(method === 'otp' ? { action: 'verifyOtp', ...who(), otp } : { action: 'code', ...who(), accessCode: code });
      router.replace('/customer');
    });

  return (
    <CustomerShell lang={lang} setLang={setLang} t={t}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <ShieldCheck className="h-8 w-8 text-maroon" />
          <h1 className="mt-2 text-2xl font-bold text-ink">{t('signIn')}</h1>
          <p className="mt-1 text-[15px] text-slate-600">{t('signInSub')}</p>
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {t('noKyc')}
          </p>
        </div>

        {!app ? (
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            {busy && token ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> …
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="text-sm font-semibold text-ink">{t('ref')}</span>
                  <input value={refInput} onChange={(e) => setRefInput(e.target.value.toUpperCase())} placeholder="LAP-26-123456" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg tracking-wide" />
                  <span className="text-xs text-slate-500">{t('refHint')}</span>
                </label>
                <button onClick={findApp} disabled={busy || refInput.trim().length < 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-4 text-lg font-semibold text-white disabled:opacity-40">
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />} {t('findApp')}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <div className="text-lg font-semibold text-ink">
                {t('hello')}, {app.borrowerFirstName}
              </div>
              <div className="text-sm text-slate-500">
                {t('ref')}: <span className="font-mono font-semibold">{app.caseRef}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm">
              {(['otp', 'code'] as const).map((m) => (
                <button key={m} onClick={() => setMethod(m)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 ${method === m ? 'bg-white font-semibold shadow' : 'text-slate-500'}`}>
                  {m === 'otp' ? <MessageSquareText className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                  {m === 'otp' ? t('otpTab') : t('codeTab')}
                </button>
              ))}
            </div>

            {method === 'otp' ? (
              !otpSent ? (
                <button onClick={sendOtp} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-4 text-lg font-semibold text-white disabled:opacity-40">
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />} {t('sendOtp')} · {app.mobileMasked}
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    {t('otpSentTo')} {app.mobileMasked}
                  </p>
                  {demoOtp && (
                    <p className="rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Demo mode (SMS gateway not connected): your OTP is <span className="font-mono text-base font-bold tracking-widest">{demoOtp}</span>
                    </p>
                  )}
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={t('enterOtp')}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.5em]"
                  />
                  <button onClick={verify} disabled={busy || otp.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-4 text-lg font-semibold text-white disabled:opacity-40">
                    {busy && <Loader2 className="h-5 w-5 animate-spin" />} {t('verify')}
                  </button>
                  <button onClick={sendOtp} disabled={busy} className="w-full py-1 text-sm text-maroon">
                    {t('resend')}
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="ABC123"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl font-mono tracking-[0.4em]"
                />
                <p className="text-xs text-slate-500">{t('codeHint')}</p>
                <button onClick={verify} disabled={busy || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-4 text-lg font-semibold text-white disabled:opacity-40">
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />} {t('signIn')}
                </button>
              </div>
            )}
          </div>
        )}
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
      </div>
    </CustomerShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
