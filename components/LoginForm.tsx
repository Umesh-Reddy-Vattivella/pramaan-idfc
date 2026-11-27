'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Lock } from 'lucide-react';
import { Logo } from '@/components/ui';

export default function LoginForm({
  portal,
  idLabel,
  idPlaceholder,
  initialId = '',
  defaultPassword,
  next,
}: {
  portal: 'bank' | 'customer';
  idLabel: string;
  idPlaceholder: string;
  initialId?: string;
  defaultPassword: string | null;
  next: string;
}) {
  const [id, setId] = useState(initialId);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = portal === 'bank' ? { userId: id, password: pw } : { applicationNo: id, password: pw };
    const r = await fetch(`/api/auth/${portal}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      setErr(j.error ?? 'Sign-in failed');
      setBusy(false);
      return;
    }
    window.location.href = next;
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/">
          <Logo sub={portal === 'bank' ? 'Bank portal' : 'Customer portal'} />
        </Link>
        <form onSubmit={submit} className="card mt-6 space-y-4 p-6">
          <div>
            <h1 className="text-lg font-bold text-ink">{portal === 'bank' ? 'Staff sign-in' : 'Track your property valuation'}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{portal === 'bank' ? 'Sales, credit and valuation team.' : 'Use the application number shared by your bank.'}</p>
          </div>
          <label className="block">
            <span className="label">{idLabel}</span>
            <input className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder={idPlaceholder} autoComplete="username" required autoFocus={!initialId} />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required autoFocus={!!initialId} />
          </label>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{err}</p>}
          <button className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Sign in
          </button>
          {defaultPassword && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              Prototype default password: <code className="font-mono font-semibold text-slate-700">{defaultPassword}</code>
            </p>
          )}
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          {portal === 'bank' ? (
            <>
              Customer? <Link className="font-semibold text-maroon" href="/customer/login">Customer portal</Link>
            </>
          ) : (
            <>
              Bank staff? <Link className="font-semibold text-maroon" href="/bank/login">Bank portal</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
