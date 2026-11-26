'use client';

/**
 * Customer valuation link (mobile web, no app install).
 * Opened from the SMS / WhatsApp link the bank sends when technical valuation is initiated.
 * Pre-filled from the loan application (LOS): no KYC, no re-typing the address,
 * documents already with the bank are not asked for again. Anyone (owner, family member,
 * tenant, caretaker) can do the capture — what is verified is the PROPERTY, via geo-fence.
 *
 *   ① Identify   — property & documents (pre-filled) → geo-tagged photos at the property
 *   ② Measure    — room-by-room dimensions (AR on supported phones; tape / reference photo otherwise)
 *   ③ Submit     — valuation and sanity checks run at the bank, not on the phone
 */
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Languages,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Ruler,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type { CapturedBy, CaptureSubmission, GeoPhoto, LinkPrefill, LosDocument, RoomMeasurement, RoomMethod } from '@/lib/types';
import { decodePrefill, localSubmissionKey } from '@/lib/data/customerLink';
import { DOC_HELP } from '@/lib/data/losRecords';
import { checkCaptureLocation, checkPhoto, GEOFENCE_BASE_TOLERANCE_M, MIN_EXTERIOR_PHOTOS } from '@/lib/engines/geofence';
import { geofenceSpec } from '@/lib/mapGeometry';
import { SpecMap } from '@/components/workbench/maps';
import { arSupported } from '@/components/customer/ArMeasure';

const ArMeasure = dynamic(() => import('@/components/customer/ArMeasure'), { ssr: false });
const ReferenceMeasure = dynamic(() => import('@/components/customer/ReferenceMeasure'), { ssr: false });

type Lang = 'en' | 'hi';
const T = {
  title: { en: 'Property valuation', hi: 'संपत्ति मूल्यांकन' },
  intro: {
    en: 'Your bank has started the valuation of the property you offered for your loan. This takes about 10 minutes at the property. Anyone in the family can do it for you.',
    hi: 'आपके बैंक ने ऋण के लिए दी गई संपत्ति का मूल्यांकन शुरू किया है। संपत्ति पर लगभग 10 मिनट लगेंगे। परिवार का कोई भी सदस्य यह कर सकता है।',
  },
  noKyc: { en: 'No KYC needed — it was already done when you applied.', hi: 'KYC की ज़रूरत नहीं — आवेदन के समय हो चुका है।' },
  who: { en: 'Who is doing this?', hi: 'यह कौन कर रहा है?' },
  OWNER: { en: 'Owner', hi: 'मालिक' },
  FAMILY: { en: 'Family member', hi: 'परिवार का सदस्य' },
  REPRESENTATIVE: { en: 'Someone else (tenant / caretaker)', hi: 'कोई और (किरायेदार / केयरटेकर)' },
  start: { en: 'Start', hi: 'शुरू करें' },
  next: { en: 'Continue', hi: 'आगे बढ़ें' },
  back: { en: 'Back', hi: 'पीछे' },
  s1: { en: 'Your property', hi: 'आपकी संपत्ति' },
  s2: { en: 'Photos at the property', hi: 'संपत्ति पर फ़ोटो' },
  s3: { en: 'Measure rooms', hi: 'कमरे नापें' },
  s4: { en: 'Check & submit', hi: 'जाँचें और भेजें' },
  fromLoan: { en: 'From your loan application', hi: 'आपके ऋण आवेदन से' },
  wrongProp: { en: 'Not this property? Call your relationship manager.', hi: 'यह संपत्ति नहीं है? अपने रिलेशनशिप मैनेजर को कॉल करें।' },
  docs: { en: 'Documents', hi: 'दस्तावेज़' },
  bankHas: { en: 'Bank already has this', hi: 'बैंक के पास पहले से है' },
  upload: { en: 'Upload', hi: 'अपलोड करें' },
  dontHave: { en: "I don't have it", hi: 'मेरे पास नहीं है' },
  mandatory: { en: 'Required', hi: 'ज़रूरी' },
  planWarn: {
    en: 'The approved building plan is required. Without it the bank cannot accept the property as security.',
    hi: 'स्वीकृत बिल्डिंग प्लान ज़रूरी है। इसके बिना बैंक संपत्ति को गिरवी के रूप में स्वीकार नहीं कर सकता।',
  },
  gpsHint: { en: 'Stand at the property and allow location access. Photos are checked against the property location.', hi: 'संपत्ति पर खड़े हों और लोकेशन की अनुमति दें। फ़ोटो संपत्ति की लोकेशन से मिलाई जाती हैं।' },
  atProp: { en: 'You are at the property', hi: 'आप संपत्ति पर हैं' },
  away: { en: 'away from the property', hi: 'संपत्ति से दूर' },
  take: { en: 'Take photo', hi: 'फ़ोटो लें' },
  retake: { en: 'Retake', hi: 'फिर से लें' },
  rooms: { en: 'Measure each room (length × width). Use AR if your phone supports it, a measuring tape, or a reference photo.', hi: 'हर कमरे की लंबाई × चौड़ाई नापें। AR, टेप या रेफ़रेंस फ़ोटो से।' },
  addRoom: { en: 'Add room', hi: 'कमरा जोड़ें' },
  submit: { en: 'Submit to bank', hi: 'बैंक को भेजें' },
  done: { en: 'Thank you! Sent to the bank.', hi: 'धन्यवाद! बैंक को भेज दिया गया।' },
  doneSub: { en: 'The bank will now check the property and complete the valuation. You do not need to do anything else.', hi: 'बैंक अब संपत्ति की जाँच करके मूल्यांकन पूरा करेगा। आपको और कुछ करने की ज़रूरत नहीं है।' },
} as const;

type Key = keyof typeof T;

interface Slot {
  slot: string;
  label: string;
  hint: string;
  required: boolean;
}

const EXTERIOR: Slot[] = [
  { slot: 'FRONT', label: 'Front of the building', hint: 'Whole front with the entrance', required: true },
  { slot: 'ROAD', label: 'Road in front', hint: 'Stand at the gate, face the road', required: true },
  { slot: 'LEFT', label: 'Left side', hint: 'Left wall / neighbour', required: true },
  { slot: 'RIGHT', label: 'Right side', hint: 'Right wall / neighbour', required: true },
  { slot: 'REAR', label: 'Back side', hint: 'If reachable', required: false },
  { slot: 'METER', label: 'Electricity meter / name plate', hint: 'Meter number visible', required: false },
];

const ROOM_PRESETS = ['Living room', 'Bedroom', 'Kitchen', 'Bathroom', 'Hall', 'Shop', 'Office', 'Store'];
const METHOD_LABEL: Record<RoomMethod, string> = { AR: 'AR', TAPE: 'Tape', REFERENCE_OBJECT: 'Reference photo' };

async function sha(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function thumb(file: File, max = 360): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * s);
    cv.height = Math.round(bmp.height * s);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.6);
  } catch {
    return undefined;
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Location not available on this device'));
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

export default function CustomerLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [lang, setLang] = useState<Lang>('en');
  const t = useCallback((k: Key) => T[k][lang], [lang]);

  const [prefill, setPrefill] = useState<LinkPrefill | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [capturedBy, setCapturedBy] = useState<CapturedBy>('OWNER');
  const [docs, setDocs] = useState<LosDocument[]>([]);
  const [photos, setPhotos] = useState<GeoPhoto[]>([]);
  const [rooms, setRooms] = useState<RoomMeasurement[]>([]);
  const [live, setLive] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [ar, setAr] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<Slot | null>(null);

  /* ---- load prefill: server store first, URL #fragment fallback ---- */
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1)).get('d');
    const fromHash = hash ? decodePrefill(hash) : null;
    (async () => {
      let p: LinkPrefill | null = null;
      try {
        const r = await fetch(`/api/links/${token}`, { cache: 'no-store' });
        if (r.ok) {
          const j = (await r.json()) as { prefill: LinkPrefill; status: string };
          p = j.prefill;
          if (j.status === 'SUBMITTED') setStep(5);
        }
      } catch {
        /* offline — use fragment */
      }
      p = p ?? (fromHash && fromHash.token === token ? fromHash : null);
      if (!p) {
        setLoadErr('This link is not valid or has expired. Please contact your bank.');
        return;
      }
      setPrefill(p);
      setDocs(p.documents);
      fetch(`/api/links/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open', prefill: p }) }).catch(() => undefined);
    })();
    arSupported().then(setAr);
  }, [token]);

  /* ---- live GPS while on the photo step ---- */
  useEffect(() => {
    if (step !== 2 || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoErr(null);
        setLive({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      },
      (e) => setGeoErr(e.code === e.PERMISSION_DENIED ? 'Location permission denied — allow location for this site in browser settings.' : 'Waiting for GPS…'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [step]);

  const liveFence = useMemo(() => {
    if (!prefill || !live) return null;
    return checkPhoto({ id: 'live', slot: 'LIVE', label: 'live', lat: live.lat, lng: live.lng, accuracyM: live.acc, takenAt: '', fileAgeMs: 0, hash: '' }, prefill, prefill.parcel);
  }, [prefill, live]);
  const fence = useMemo(() => (prefill ? checkCaptureLocation(photos, prefill, prefill.parcel) : null), [prefill, photos]);

  const interiorSlots: Slot[] = useMemo(
    () => (prefill?.floors ?? []).map((f) => ({ slot: `INTERIOR:${f}`, label: `Inside — ${f}`, hint: 'One wide photo of the main room', required: true })),
    [prefill],
  );

  const shoot = (s: Slot) => {
    pendingSlot.current = s;
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    const s = pendingSlot.current;
    if (!file || !s) return;
    setBusySlot(s.slot);
    setGeoErr(null);
    try {
      const fileAgeMs = Math.max(0, Date.now() - file.lastModified);
      const [pos, hash, th] = await Promise.all([getPosition(), sha(file), thumb(file)]);
      const ph: GeoPhoto = {
        id: `${s.slot}-${Date.now()}`,
        slot: s.slot,
        label: s.label,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Math.round(pos.coords.accuracy),
        takenAt: new Date().toISOString(),
        fileAgeMs,
        hash,
        thumb: th,
      };
      setPhotos((xs) => [...xs.filter((x) => x.slot !== s.slot), ph]);
    } catch (e) {
      setGeoErr(e instanceof GeolocationPositionError && e.code === e.PERMISSION_DENIED ? 'Location permission is needed to geo-tag the photo.' : 'Could not read GPS. Step outside / wait a moment and retry.');
    } finally {
      setBusySlot(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setDoc = (type: LosDocument['type'], patch: Partial<LosDocument>) => setDocs((ds) => ds.map((d) => (d.type === type ? { ...d, ...patch } : d)));

  const submit = async () => {
    if (!prefill) return;
    setSending(true);
    setSendErr(null);
    const submission: CaptureSubmission = {
      submittedAt: new Date().toISOString(),
      capturedBy,
      photos,
      rooms,
      documents: docs,
      userAgent: navigator.userAgent.slice(0, 160),
      arSupported: ar,
    };
    try {
      localStorage.setItem(localSubmissionKey(token), JSON.stringify(submission));
    } catch {
      /* storage full — server copy is primary */
    }
    try {
      const r = await fetch(`/api/links/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', submission, prefill }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      setStep(5);
    } catch (e) {
      setSendErr(`${e instanceof Error ? e.message : 'Network error'} — please retry.`);
    } finally {
      setSending(false);
    }
  };

  if (loadErr) return <Shell lang={lang} setLang={setLang} t={t}><p className="card p-6 text-center text-sm text-slate-600">{loadErr}</p></Shell>;
  if (!prefill) return <Shell lang={lang} setLang={setLang} t={t}><p className="card flex items-center justify-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p></Shell>;

  const reqExterior = EXTERIOR.filter((s) => s.required).every((s) => photos.some((p) => p.slot === s.slot));
  const reqInterior = interiorSlots.every((s) => photos.some((p) => p.slot === s.slot));
  const planDoc = docs.find((d) => d.type === 'APPROVED_PLAN');
  const planMissing = !!planDoc && planDoc.status !== 'ON_FILE' && planDoc.status !== 'UPLOADED';
  const steps = [t('s1'), t('s2'), t('s3'), t('s4')];

  return (
    <Shell lang={lang} setLang={setLang} t={t}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {step >= 1 && step <= 4 && (
        <div className="mb-3">
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-maroon' : 'bg-slate-200'}`} />
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>
              {step}/4 · <span className="font-semibold text-ink">{steps[step - 1]}</span>
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{step <= 2 ? '① Identify' : step === 3 ? '② Measure' : '③ Submit'}</span>
          </div>
        </div>
      )}

      {/* ---------- 0 · Welcome ---------- */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="card p-5">
            <h1 className="text-xl font-bold text-ink">{t('title')}</h1>
            <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{t('intro')}</p>
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {t('noKyc')}
            </p>
          </div>
          <div className="card p-5">
            <div className="mb-2 text-sm font-semibold text-ink">{t('who')}</div>
            <div className="grid gap-2">
              {(['OWNER', 'FAMILY', 'REPRESENTATIVE'] as CapturedBy[]).map((w) => (
                <button key={w} onClick={() => setCapturedBy(w)} className={`rounded-xl border px-4 py-3 text-left text-base ${capturedBy === w ? 'border-maroon bg-maroon/5 font-semibold text-maroon' : 'border-slate-200'}`}>
                  {t(w)}
                </button>
              ))}
            </div>
          </div>
          <BigButton onClick={() => setStep(1)}>{t('start')}</BigButton>
        </div>
      )}

      {/* ---------- 1 · Property & documents ---------- */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('fromLoan')} · {prefill.loanAppNo}</div>
            <div className="mt-1 flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-maroon" />
              <div className="text-[15px] font-semibold leading-snug text-ink">{prefill.propertyAddress}</div>
            </div>
            <div className="mt-3">
              <SpecMap spec={geofenceSpec(prefill, prefill.parcel, GEOFENCE_BASE_TOLERANCE_M, [])} height={200} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Phone className="h-3.5 w-3.5" /> {t('wrongProp')}
            </p>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <FileText className="h-4 w-4 text-maroon" /> {t('docs')}
            </div>
            <ul className="space-y-2">
              {docs.filter((d) => d.status !== 'NOT_APPLICABLE').map((d) => (
                <li key={d.type} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {d.label} {d.mandatory && <span className="ml-1 rounded bg-maroon/10 px-1 py-0.5 text-[10px] font-bold text-maroon">{t('mandatory')}</span>}
                      </div>
                      <div className="text-xs text-slate-500">{DOC_HELP[d.type]}</div>
                    </div>
                    {(d.status === 'ON_FILE' || d.status === 'UPLOADED') && <CheckCircle2 className="h-5 w-5 shrink-0 text-instant" />}
                  </div>
                  {d.status === 'ON_FILE' ? (
                    <div className="mt-1.5 text-xs font-semibold text-instant">{t('bankHas')}{d.ref ? ` · ${d.ref}` : ''}</div>
                  ) : d.status === 'UPLOADED' ? (
                    <div className="mt-1.5 flex items-center justify-between text-xs text-instant">
                      <span className="font-semibold">✓ {d.fileName}</span>
                      <button onClick={() => setDoc(d.type, { status: 'PENDING', fileName: undefined })} className="text-slate-400">✕</button>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-maroon py-2 text-sm font-semibold text-white">
                        <Upload className="h-4 w-4" /> {t('upload')}
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && setDoc(d.type, { status: 'UPLOADED', fileName: e.target.files[0].name })} />
                      </label>
                      <button onClick={() => setDoc(d.type, { status: 'NOT_AVAILABLE' })} className={`flex-1 rounded-lg border py-2 text-sm ${d.status === 'NOT_AVAILABLE' ? 'border-amber-400 bg-amber-50 font-semibold text-amber-800' : 'border-slate-300 text-slate-600'}`}>
                        {t('dontHave')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {planMissing && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t('planWarn')}
              </p>
            )}
          </div>
          <Nav t={t} onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </div>
      )}

      {/* ---------- 2 · Geo-tagged photos ---------- */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-4">
            <p className="text-sm text-slate-600">{t('gpsHint')}</p>
            <div className="mt-2">
              <SpecMap
                spec={geofenceSpec(
                  prefill,
                  prefill.parcel,
                  GEOFENCE_BASE_TOLERANCE_M,
                  (fence?.photos ?? []).map((p) => ({ id: p.id, label: p.label, lat: photos.find((x) => x.id === p.id)!.lat, lng: photos.find((x) => x.id === p.id)!.lng, status: p.status, distanceM: p.distanceM })),
                  live,
                )}
                height={210}
              />
            </div>
            {liveFence ? (
              <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${liveFence.status === 'INSIDE' ? 'bg-emerald-50 text-emerald-800' : liveFence.status === 'NEAR' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
                {liveFence.status === 'INSIDE' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {liveFence.status === 'INSIDE' ? t('atProp') : `${Math.round(liveFence.distanceM).toLocaleString('en-IN')} m ${t('away')}`}
                <span className="ml-auto text-xs font-normal opacity-70">±{Math.round(live!.acc)} m</span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" /> {geoErr ?? 'Getting your location…'}
              </div>
            )}
          </div>

          <PhotoGrid title="Outside" slots={EXTERIOR} photos={photos} fence={fence} busy={busySlot} onShoot={shoot} t={t} />
          {interiorSlots.length > 0 && <PhotoGrid title="Inside — one per floor" slots={interiorSlots} photos={photos} fence={fence} busy={busySlot} onShoot={shoot} t={t} />}
          {geoErr && photos.length > 0 && <p className="text-sm text-red-700">{geoErr}</p>}
          <Nav t={t} onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!reqExterior} nextHint={!reqExterior ? `Take the ${MIN_EXTERIOR_PHOTOS} required outside photos` : !reqInterior ? 'Tip: add one inside photo per floor' : undefined} />
        </div>
      )}

      {/* ---------- 3 · Rooms ---------- */}
      {step === 3 && <RoomsStep t={t} floors={prefill.floors.length ? prefill.floors : ['Ground Floor']} rooms={rooms} setRooms={setRooms} ar={ar} onBack={() => setStep(2)} onNext={() => setStep(4)} />}

      {/* ---------- 4 · Review ---------- */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="card space-y-2 p-4 text-sm">
            <Row ok label="Done by" value={t(capturedBy)} />
            <Row ok={!planMissing} label="Approved plan" value={planMissing ? 'Not provided' : 'Available'} />
            <Row ok={fence?.status === 'PASS'} warn={fence?.status === 'WARN'} label="Photos at the property" value={fence ? fence.summary : '—'} />
            <Row ok={rooms.length > 0} warn={rooms.length === 0} label="Rooms measured" value={rooms.length ? `${rooms.length} room(s), ${Math.round(rooms.reduce((s, r) => s + r.lengthFt * r.widthFt, 0)).toLocaleString('en-IN')} sqft carpet` : 'None — the bank may ask for a visit'} />
          </div>
          {sendErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{sendErr}</p>}
          <BigButton onClick={submit} disabled={sending}>
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} {t('submit')}
          </BigButton>
          <button onClick={() => setStep(3)} className="w-full py-2 text-sm text-slate-500">{t('back')}</button>
        </div>
      )}

      {/* ---------- 5 · Done ---------- */}
      {step === 5 && (
        <div className="card p-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-instant" />
          <h2 className="mt-3 text-xl font-bold text-ink">{t('done')}</h2>
          <p className="mt-2 text-[15px] text-slate-600">{t('doneSub')}</p>
          <p className="mt-4 text-xs text-slate-400">Ref {prefill.loanAppNo}</p>
        </div>
      )}
    </Shell>
  );
}

/* ---------------- pieces ---------------- */

function Shell({ children, lang, setLang, t }: { children: React.ReactNode; lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }) {
  return (
    <div className="-mx-4 -my-6 min-h-screen bg-canvas lg:-mx-6">
      <header className="sticky top-0 z-[1000] flex items-center justify-between bg-maroon px-4 py-3 text-white">
        <div className="leading-tight">
          <div className="text-sm font-bold">IDFC FIRST Bank</div>
          <div className="text-[11px] text-white/75">{t('title')} · PRAMAAN</div>
        </div>
        <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">
          <Languages className="h-4 w-4" /> {lang === 'en' ? 'हिंदी' : 'English'}
        </button>
      </header>
      <div className="mx-auto max-w-md px-4 py-4">{children}</div>
    </div>
  );
}

function BigButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-4 text-lg font-semibold text-white shadow disabled:opacity-40">
      {children}
    </button>
  );
}

function Nav({ t, onBack, onNext, nextDisabled, nextHint }: { t: (k: Key) => string; onBack: () => void; onNext: () => void; nextDisabled?: boolean; nextHint?: string }) {
  return (
    <div className="space-y-1.5">
      {nextHint && <p className="text-center text-xs text-slate-500">{nextHint}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-4 text-slate-600" aria-label={t('back')}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={onNext} disabled={nextDisabled} className="flex-1 rounded-xl bg-maroon py-4 text-lg font-semibold text-white shadow disabled:opacity-40">
          {t('next')}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-instant" /> : warn ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-remote" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />}
      <div>
        <div className="font-semibold text-ink">{label}</div>
        <div className="text-slate-600">{value}</div>
      </div>
    </div>
  );
}

function PhotoGrid(props: {
  title: string;
  slots: Slot[];
  photos: GeoPhoto[];
  fence: ReturnType<typeof checkCaptureLocation> | null;
  busy: string | null;
  onShoot: (s: Slot) => void;
  t: (k: Key) => string;
}) {
  return (
    <div className="card p-4">
      <div className="mb-2 text-sm font-semibold text-ink">{props.title}</div>
      <div className="grid grid-cols-2 gap-2">
        {props.slots.map((s) => {
          const ph = props.photos.find((p) => p.slot === s.slot);
          const f = ph ? props.fence?.photos.find((x) => x.id === ph.id) : undefined;
          const tone = !f ? 'border-slate-200' : f.status === 'INSIDE' && f.live ? 'border-emerald-500' : f.status === 'NEAR' ? 'border-amber-400' : 'border-red-500';
          return (
            <button key={s.slot} onClick={() => props.onShoot(s)} className={`relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-xl border-2 bg-slate-50 text-center ${tone}`}>
              {ph?.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ph.thumb} alt={s.label} className="absolute inset-0 h-full w-full object-cover" />
              )}
              {props.busy === s.slot ? (
                <Loader2 className="relative h-6 w-6 animate-spin text-maroon" />
              ) : !ph ? (
                <>
                  <Camera className="h-6 w-6 text-maroon" />
                  <span className="mt-1 px-1 text-xs font-semibold text-ink">{s.label}</span>
                  <span className="px-1 text-[10px] text-slate-500">{s.hint}</span>
                  {s.required && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-maroon" />}
                </>
              ) : (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] text-white">
                  {f?.status === 'INSIDE' && f.live ? '✓ ' : '⚠ '}
                  {s.label} · {Math.round(f?.distanceM ?? 0)} m{f && !f.live ? ' · not live' : ''} · {props.t('retake')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoomsStep(props: {
  t: (k: Key) => string;
  floors: string[];
  rooms: RoomMeasurement[];
  setRooms: React.Dispatch<React.SetStateAction<RoomMeasurement[]>>;
  ar: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t, floors, rooms, setRooms, ar } = props;
  const [draft, setDraft] = useState<RoomMeasurement | null>(null);
  const [tool, setTool] = useState<{ kind: 'AR' | 'REF'; dim: 'lengthFt' | 'widthFt' } | null>(null);

  const startNew = () =>
    setDraft({ id: `room-${Date.now()}`, name: ROOM_PRESETS[rooms.length % ROOM_PRESETS.length], floorName: floors[0], lengthFt: 0, widthFt: 0, method: ar ? 'AR' : 'TAPE' });
  const save = () => {
    if (!draft || draft.lengthFt <= 0 || draft.widthFt <= 0) return;
    setRooms((rs) => [...rs.filter((r) => r.id !== draft.id), draft]);
    setDraft(null);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-maroon" /> {t('rooms')}
        </p>
        <p className="mt-1 text-xs text-slate-400">{ar ? 'AR is available on this phone.' : 'AR is not available on this phone — use tape or a reference photo.'}</p>
      </div>

      {floors.map((fl) => {
        const rs = rooms.filter((r) => r.floorName === fl);
        if (!rs.length) return null;
        return (
          <div key={fl} className="card p-4">
            <div className="mb-1 text-sm font-semibold text-ink">{fl}</div>
            <ul className="divide-y divide-slate-100">
              {rs.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <button onClick={() => setDraft(r)} className="text-left">
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="block text-xs text-slate-500">
                      {r.lengthFt} × {r.widthFt} ft = {Math.round(r.lengthFt * r.widthFt)} sqft · {METHOD_LABEL[r.method]}
                    </span>
                  </button>
                  <button onClick={() => setRooms((xs) => xs.filter((x) => x.id !== r.id))} className="p-2 text-slate-400" aria-label="Remove room">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {draft ? (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {ROOM_PRESETS.map((n) => (
              <button key={n} onClick={() => setDraft({ ...draft, name: n })} className={`rounded-full border px-3 py-1 text-xs ${draft.name === n ? 'border-maroon bg-maroon text-white' : 'border-slate-300'}`}>
                {n}
              </button>
            ))}
          </div>
          <select value={draft.floorName} onChange={(e) => setDraft({ ...draft, floorName: e.target.value })} className="input py-2 text-base">
            {floors.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            {(['AR', 'TAPE', 'REFERENCE_OBJECT'] as RoomMethod[]).map((m) => (
              <button key={m} disabled={m === 'AR' && !ar} onClick={() => setDraft({ ...draft, method: m })} className={`rounded-lg py-2 ${draft.method === m ? 'bg-white font-semibold shadow' : 'text-slate-500'} disabled:opacity-30`}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          {(['lengthFt', 'widthFt'] as const).map((dim) => (
            <div key={dim} className="flex items-center gap-2">
              <label className="w-16 text-sm text-slate-600">{dim === 'lengthFt' ? 'Length' : 'Width'}</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={draft[dim] || ''}
                onChange={(e) => setDraft({ ...draft, [dim]: Number(e.target.value) || 0 })}
                className="input flex-1 py-2 text-base"
                placeholder="ft"
              />
              {draft.method !== 'TAPE' && (
                <button onClick={() => setTool({ kind: draft.method === 'AR' ? 'AR' : 'REF', dim })} className="rounded-lg bg-maroon px-3 py-2 text-sm font-semibold text-white">
                  Measure
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setDraft(null)} className="flex-1 rounded-xl border border-slate-300 py-3 text-sm">Cancel</button>
            <button onClick={save} disabled={draft.lengthFt <= 0 || draft.widthFt <= 0} className="flex-1 rounded-xl bg-maroon py-3 text-sm font-semibold text-white disabled:opacity-40">
              Save room {draft.lengthFt > 0 && draft.widthFt > 0 ? `· ${Math.round(draft.lengthFt * draft.widthFt)} sqft` : ''}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={startNew} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-maroon/40 bg-white py-4 text-base font-semibold text-maroon">
          <Plus className="h-5 w-5" /> {t('addRoom')}
        </button>
      )}

      {tool && draft && tool.kind === 'AR' && (
        <ArMeasure
          label={`${draft.name} — ${tool.dim === 'lengthFt' ? 'length' : 'width'}`}
          onResult={(ft) => {
            setDraft((d) => (d ? { ...d, [tool.dim]: ft } : d));
            setTool(null);
          }}
          onClose={() => setTool(null)}
        />
      )}
      {tool && draft && tool.kind === 'REF' && (
        <ReferenceMeasure
          label={`${draft.name} — ${tool.dim === 'lengthFt' ? 'length' : 'width'}`}
          onResult={(ft) => {
            setDraft((d) => (d ? { ...d, [tool.dim]: ft } : d));
            setTool(null);
          }}
          onClose={() => setTool(null)}
        />
      )}

      {!draft && <Nav t={t} onBack={props.onBack} onNext={props.onNext} nextHint={rooms.length === 0 ? 'You can skip, but measured rooms speed up approval' : undefined} />}
    </div>
  );
}
