'use client';

import { Languages, LogOut } from 'lucide-react';
import type { Lang, TKey } from '@/lib/client/portalI18n';

/** Customer-portal frame: bank brand, language switch, sign-out. No bank navigation. */
export default function CustomerShell(props: {
  children: React.ReactNode;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  onSignOut?: () => void;
}) {
  const { lang, setLang, t } = props;
  return (
    <div className="min-h-screen bg-[#f6f3f0]">
      <header className="sticky top-0 z-[1000] bg-maroon text-white shadow">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="leading-tight">
            <div className="text-[15px] font-bold">{t('bank')}</div>
            <div className="text-[11px] text-white/75">{t('portal')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">
              <Languages className="h-4 w-4" /> {lang === 'en' ? 'हिंदी' : 'English'}
            </button>
            {props.onSignOut && (
              <button onClick={props.onSignOut} className="rounded-full bg-white/15 p-2" aria-label={t('signOut')} title={t('signOut')}>
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-5">{props.children}</main>
      <footer className="mx-auto max-w-lg px-4 pb-8 text-center text-xs text-slate-400">{t('help')}</footer>
    </div>
  );
}
