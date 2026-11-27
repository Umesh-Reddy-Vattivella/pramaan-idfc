'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Plus, UserCircle2 } from 'lucide-react';
import { Logo } from '@/components/ui';

export default function BankHeader() {
  const path = usePathname();
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/auth/bank', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { user?: string } | null) => (j?.user ? setUser(j.user) : (window.location.href = '/bank/login')))
      .catch(() => undefined);
  }, []);
  const signOut = async () => {
    await fetch('/api/auth/bank', { method: 'DELETE' });
    window.location.href = '/bank/login';
  };
  const nav = (href: string, label: string, active: boolean) => (
    <Link href={href} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? 'bg-maroon/10 text-maroon' : 'text-slate-600 hover:bg-slate-100'}`}>
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-5">
          <Link href="/bank">
            <Logo sub="Bank portal" />
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">{nav('/bank', 'Applications', path === '/bank')}</nav>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/bank/new" className="btn-primary py-1.5">
            <Plus className="h-4 w-4" /> New application
          </Link>
          <span className="hidden items-center gap-1 text-xs font-medium text-slate-600 md:inline-flex">
            <UserCircle2 className="h-4 w-4" /> {user ?? '…'}
          </span>
          <button onClick={signOut} className="btn-ghost px-2" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
