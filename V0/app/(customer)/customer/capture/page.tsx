'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CaptureSubmission, CaseFileView } from '@/lib/types';
import CustomerShell from '@/components/customer/CustomerShell';
import CaptureFlow from '@/components/customer/CaptureFlow';
import CallWatcher from '@/components/customer/CallWatcher';
import { usePortalLang } from '@/lib/client/portalI18n';

export default function CustomerCapturePage() {
  const router = useRouter();
  const { lang, setLang, t } = usePortalLang();
  const [view, setView] = useState<CaseFileView | null>(null);

  useEffect(() => {
    fetch('/api/portal/case', { cache: 'no-store' }).then(async (r) => {
      if (r.status === 401) return router.replace('/customer/login');
      const j = (await r.json()) as { view?: CaseFileView };
      if (j.view) setView(j.view);
    });
  }, [router]);

  const submit = async (submission: CaptureSubmission) => {
    const r = await fetch('/api/portal/case', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'capture', submission }) });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  };

  return (
    <CustomerShell lang={lang} setLang={setLang} t={t}>
      <CallWatcher lang={lang} />
      {!view ? (
        <p className="flex justify-center py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </p>
      ) : (
        <CaptureFlow
          lang={lang}
          target={{ caseRef: view.caseRef, propertyAddress: view.propertyAddress, lat: view.lat, lng: view.lng, parcel: view.parcel, floors: view.floors }}
          onSubmit={submit}
          onExit={() => router.push('/customer')}
        />
      )}
    </CustomerShell>
  );
}
