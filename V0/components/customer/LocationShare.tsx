'use client';

/**
 * Asks the customer to turn on location. While on (and the portal is open), GPS fixes are shared with the bank
 * every 30 s — an audit trail that the capture happened at the pledged property. Nothing is tracked without consent.
 */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin } from 'lucide-react';
import type { LocationFix } from '@/lib/types';
import type { Lang } from '@/lib/client/portalI18n';

const L = {
  title: { en: 'Turn on location', hi: 'लोकेशन चालू करें' },
  why: { en: 'The bank uses your phone’s location to confirm the photos are taken at your property.', hi: 'बैंक आपके फ़ोन की लोकेशन से पुष्टि करता है कि फ़ोटो आपकी संपत्ति पर ली गई हैं।' },
  on: { en: 'Location is on — shared with the bank while this page is open', hi: 'लोकेशन चालू है — यह पेज खुला रहने तक बैंक के साथ साझा' },
  btn: { en: 'Allow location', hi: 'लोकेशन की अनुमति दें' },
  denied: { en: 'Location is blocked. Allow it for this website in your browser settings (lock icon next to the address).', hi: 'लोकेशन बंद है। ब्राउज़र सेटिंग में इस वेबसाइट के लिए अनुमति दें (पते के पास लॉक आइकन)।' },
} as const;

export default function LocationShare({ lang }: { lang: Lang }) {
  const [state, setState] = useState<'unknown' | 'off' | 'asking' | 'on' | 'denied'>('unknown');
  const [fix, setFix] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const watch = useRef<number | null>(null);
  const buf = useRef<LocationFix[]>([]);
  const t = (k: keyof typeof L) => L[k][lang];

  const start = () => {
    if (!navigator.geolocation) return setState('denied');
    setState('asking');
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setState('on');
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        buf.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at: new Date(p.timestamp).toISOString(), source: 'PORTAL' });
      },
      (e) => setState(e.code === e.PERMISSION_DENIED ? 'denied' : 'off'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
  };

  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (p.state === 'granted') start();
        else setState(p.state === 'denied' ? 'denied' : 'off');
      })
      .catch(() => setState('off'));
    const flush = setInterval(() => {
      const fixes = buf.current.splice(0).slice(-5);
      if (fixes.length) fetch('/api/portal/case', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'track', fixes }) }).catch(() => undefined);
    }, 30000);
    return () => {
      clearInterval(flush);
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    };
  }, []);

  if (state === 'unknown') return null;
  if (state === 'on')
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {t('on')}
        {fix && <span className="ml-auto text-xs opacity-70">±{Math.round(fix.acc)} m</span>}
      </p>
    );
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="flex-1">
          <div className="font-semibold text-ink">{t('title')}</div>
          <p className="text-sm text-slate-600">{state === 'denied' ? t('denied') : t('why')}</p>
        </div>
      </div>
      {state !== 'denied' && (
        <button onClick={start} disabled={state === 'asking'} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-3 font-semibold text-white disabled:opacity-60">
          {state === 'asking' && <Loader2 className="h-4 w-4 animate-spin" />} {t('btn')}
        </button>
      )}
    </div>
  );
}
