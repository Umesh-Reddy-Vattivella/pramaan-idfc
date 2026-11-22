'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  CircleDashed,
  Cpu,
  FileText,
  Fingerprint,
  Layers,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Upload,
  Wifi,
} from 'lucide-react';
import { useCases } from '@/lib/state/CasesContext';
import {
  buildCaptureCase,
  CAPTURE_ITEMS,
  CAPTURE_PARCEL,
  CAPTURE_SENSOR,
  CAPTURE_SITE,
  CAPTURE_SURVEY,
  DOC_DEFS,
  offsetLatLng,
  type CaptureItemId,
  type DocId,
} from '@/lib/data/captureTemplate';
import { evaluateTrust, gpsInParcel, haversineMeters } from '@/lib/engines/trust';
import { heightFromShadow, knownObjectLengthFt, reconcileAreaSources } from '@/lib/engines/measure';
import { evaluateCase } from '@/lib/engines/evaluateCase';
import { formatInrShort, formatIndianNumber } from '@/lib/engines/valuation';
import { CaptureMap } from '@/components/workbench/maps';
import TelemetryPanel, { type ExtractionRow, type FraudFlags, type LogEntry, type LogLevel, type TrustBadge } from '@/components/capture/TelemetryPanel';

type Channel = 'OWNER_APP' | 'WHATSAPP_REP';
type Step = 1 | 2 | 3 | 4 | 5;

const STEP_TITLES: Record<Step, string> = {
  1: 'Consent & KYC',
  2: 'Address & Parcel Pin',
  3: 'Smart Document Upload',
  4: 'Guided Capture',
  5: 'Run 3-Engine Pipeline',
};

const PIPELINE = ['Trust Layer', 'Engine 1 · Measure', 'Engine 3 · Usage', 'Engine 2 · Price', 'Auto-QC', 'Risk Cascade'];
const FLOOR_ITEMS: CaptureItemId[] = ['FLOOR_GF', 'FLOOR_FF', 'FLOOR_SF'];

function clock() {
  const d = new Date();
  return `${d.toLocaleTimeString('en-IN', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function frameHash() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function CapturePage() {
  const router = useRouter();
  const { upsertCase } = useCases();

  const [channel, setChannel] = useState<Channel>('OWNER_APP');
  const [step, setStep] = useState<Step>(1);
  const [kyc, setKyc] = useState({ otp: false, pan: false, face: false });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [overlays, setOverlays] = useState({ widening: true, hazards: true });
  const [docs, setDocs] = useState<DocId[]>([]);
  const [captured, setCaptured] = useState<CaptureItemId[]>([]);
  const [fraud, setFraud] = useState<FraudFlags>({ omission: false, mockGps: false, gallery: false });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pipelineStage, setPipelineStage] = useState(-1);
  const startedAt = useRef<number>(0);
  const logId = useRef(0);

  const addLog = useCallback((level: LogLevel, src: string, msg: string) => {
    setLog((l) => [...l, { id: ++logId.current, t: clock(), level, src, msg }]);
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
    addLog('info', 'SESSION', 'Self-capture session opened · device integrity probe started');
    addLog('ok', 'DEVICE', 'Play Integrity / attestation token received · camera sensor stream bound');
  }, [addLog]);

  /* ---------------- Derived trust state (deterministic engines) ---------------- */

  const capturePoint = useMemo(() => {
    if (!pin) return null;
    if (!fraud.mockGps) return pin;
    const [lat, lng] = offsetLatLng(pin.lat, pin.lng, 0, CAPTURE_SITE.mockGpsOffsetM);
    return { lat, lng };
  }, [pin, fraud.mockGps]);

  const parcelGeo = useMemo(() => ({ polygon: CAPTURE_PARCEL, centroid: { lat: CAPTURE_SITE.lat, lng: CAPTURE_SITE.lng } }), []);
  const gpsOk = capturePoint ? gpsInParcel(capturePoint, parcelGeo) : null;
  const pinInParcel = pin ? gpsInParcel(pin, parcelGeo) : null;
  const floorsWalked = captured.filter((c) => FLOOR_ITEMS.includes(c)).length;
  const facade = heightFromShadow(CAPTURE_SENSOR.shadowLengthM, CAPTURE_SENSOR.sunElevationDeg);

  const draft = useMemo(
    () =>
      buildCaptureCase({
        caseId: 'self-capture-draft',
        channel,
        capturePoint,
        gpsInParcel: gpsOk === true,
        liveCameraOnly: !fraud.gallery,
        deviceAttested: !fraud.mockGps,
        sunAngleMatched: !fraud.gallery,
        faceMatched: kyc.face,
        floorsWalked,
        docs,
        startedAt: startedAt.current,
      }),
    [channel, capturePoint, gpsOk, fraud, kyc.face, floorsWalked, docs],
  );
  const trust = useMemo(() => evaluateTrust(draft), [draft]);

  const anyCapture = captured.length > 0;
  const walkComplete = floorsWalked === CAPTURE_SITE.exteriorFloors;
  const badges: TrustBadge[] = [
    {
      key: 'gps',
      label: 'GPS-in-Parcel',
      state: gpsOk === null ? 'pending' : gpsOk ? 'pass' : 'fail',
      detail:
        gpsOk === null ? 'Awaiting map pin'
        : gpsOk ? 'Capture point inside parcel polygon'
        : `${Math.round(haversineMeters(capturePoint!.lat, capturePoint!.lng, CAPTURE_SITE.lat, CAPTURE_SITE.lng))} m from parcel — outside polygon`,
    },
    {
      key: 'camera',
      label: 'Live Camera Only',
      state: fraud.gallery ? 'fail' : anyCapture ? 'pass' : 'pending',
      detail: fraud.gallery ? 'Gallery / AI image injected' : anyCapture ? 'Live sensor frames only' : 'Awaiting first frame',
    },
    {
      key: 'device',
      label: 'Device Attestation',
      state: fraud.mockGps ? 'fail' : 'pass',
      detail: fraud.mockGps ? 'Mock-location provider detected' : 'Not rooted · no emulator · no mock GPS',
    },
    {
      key: 'sun',
      label: 'Sun-Angle Forensics',
      state: fraud.gallery ? 'fail' : anyCapture ? 'pass' : 'pending',
      detail: fraud.gallery ? 'Shadow azimuth mismatch / AI artefacts' : anyCapture ? 'Shadows match solar azimuth' : 'Awaiting exterior frame',
    },
    {
      key: 'face',
      label: channel === 'WHATSAPP_REP' ? 'Rep Face Match' : 'Face Match (KYC)',
      state: kyc.face ? 'pass' : 'pending',
      detail: kyc.face ? (channel === 'WHATSAPP_REP' ? 'Matched to registered representative' : 'Matched to KYC selfie') : 'Awaiting selfie',
    },
    {
      key: 'floors',
      label: 'Floor Coverage Lock',
      // Engine lock (interior < exterior) is "pending" while the walkthrough is in progress, "fail" once the owner ends it short.
      state: fraud.omission && trust.omissionFraudBlock ? 'fail' : walkComplete && !trust.omissionFraudBlock ? 'pass' : 'pending',
      detail: fraud.omission
        ? `OMISSION_FRAUD_BLOCK — walked ${floorsWalked}/${CAPTURE_SITE.exteriorFloors}`
        : `Interior ${floorsWalked} / exterior ${CAPTURE_SITE.exteriorFloors} floors`,
    },
  ];
  const blocked = badges.some((b) => b.state === 'fail');

  /* ---------------- Extraction rows ---------------- */

  const deed = DOC_DEFS.find((d) => d.id === 'SALE_DEED')!;
  const vern = DOC_DEFS.find((d) => d.id === 'VERNACULAR')!;
  const hasDeed = docs.includes('SALE_DEED');
  const hasVern = docs.includes('VERNACULAR');
  const areaRecon = hasDeed && hasVern
    ? reconcileAreaSources([
        { label: 'Sale Deed', areaSqft: deed.fields.areaSqft!, weight: 1 },
        { label: 'Land Record', areaSqft: vern.fields.areaSqft!, weight: 1 },
      ])
    : null;
  const ownerDocs = DOC_DEFS.filter((d) => docs.includes(d.id));
  const extraction: ExtractionRow[] = [
    { field: 'Owner name', value: ownerDocs.length ? deed.fields.owner! : '—', status: ownerDocs.length > 1 ? 'match' : ownerDocs.length ? 'info' : 'pending', note: ownerDocs.length > 1 ? undefined : ownerDocs.length ? '1 source' : undefined },
    {
      field: 'Plot area',
      value: hasDeed ? `${formatIndianNumber(deed.fields.areaSqft!)} sqft${hasVern ? ` vs ${formatIndianNumber(vern.fields.areaSqft!)} sqft` : ''}` : '—',
      status: areaRecon ? 'mismatch' : hasDeed ? 'info' : 'pending',
      note: areaRecon
        ? `Deed ${formatIndianNumber(deed.fields.areaSqft!)} vs land record ${formatIndianNumber(vern.fields.areaSqft!)} sqft — within 10% tolerance (${areaRecon.areaVarianceFlag ? 'FLAGGED' : 'no variance flag'}); least area valued.`
        : hasDeed ? 'deed only' : undefined,
    },
    { field: 'Survey No.', value: hasDeed ? CAPTURE_SURVEY : '—', status: hasDeed && hasVern ? 'match' : hasDeed ? 'info' : 'pending', note: hasDeed && !hasVern ? 'deed only' : undefined },
    { field: 'Sanctioned plan', value: docs.includes('SANCTIONED_PLAN') ? 'G+2 · 2,100 sqft' : '—', status: docs.includes('SANCTIONED_PLAN') ? 'info' : 'pending' },
    { field: 'EB tariff / tax class', value: docs.includes('EB_BILL') || docs.includes('PROPERTY_TAX') ? 'Domestic · Residential' : '—', status: docs.includes('EB_BILL') && docs.includes('PROPERTY_TAX') ? 'match' : docs.includes('EB_BILL') || docs.includes('PROPERTY_TAX') ? 'info' : 'pending' },
    { field: 'Floors (ext / int)', value: `${captured.includes('FACADE') ? facade.estimatedFloors : '—'} / ${floorsWalked}`, status: walkComplete ? 'match' : captured.includes('FACADE') ? 'info' : 'pending' },
  ];

  /* ---------------- Actions ---------------- */

  const kycAction = (k: keyof typeof kyc) => {
    setKyc((s) => ({ ...s, [k]: true }));
    if (k === 'otp') addLog('ok', 'KYC', channel === 'WHATSAPP_REP' ? 'Representative consent: [Aadhaar OTP Verified] via DigiLocker' : 'Owner consent: [Aadhaar OTP Verified] via DigiLocker');
    if (k === 'pan') addLog('ok', 'KYC', '[PAN Verified] — name matches DigiLocker record');
    if (k === 'face') addLog('ok', 'TRUST', channel === 'WHATSAPP_REP' ? 'Liveness ✓ · face matched to registered site representative' : 'Liveness ✓ · selfie face-matched to KYC photo');
  };

  const onPick = (lat: number, lng: number) => {
    setPin({ lat, lng });
    const inside = gpsInParcel({ lat, lng }, parcelGeo);
    addLog(inside ? 'ok' : 'warn', 'GIS', `Pin dropped ${lat.toFixed(6)}, ${lng.toFixed(6)} → ${inside ? 'INSIDE parcel polygon' : 'outside parcel polygon — re-pin inside the boundary'}`);
    if (fraud.mockGps) addLog('block', 'TRUST', `Device GPS reports ${CAPTURE_SITE.mockGpsOffsetM} m east of pin — mock location`);
  };

  const uploadDoc = (d: (typeof DOC_DEFS)[number], fileName?: string) => {
    if (docs.includes(d.id)) return;
    setDocs((s) => [...s, d.id]);
    addLog('info', 'OCR', `${fileName ? `"${fileName}" → ` : ''}${d.label} received · ${d.language} OCR running`);
    const parts = [
      d.fields.owner && `Owner: ${d.fields.owner}`,
      d.fields.areaSqft && `Area: ${formatIndianNumber(d.fields.areaSqft)} sqft`,
      d.fields.surveyNo && `Survey: ${d.fields.surveyNo}`,
      d.fields.other,
    ].filter(Boolean);
    addLog('ok', 'OCR', `${d.label}: ${parts.join(' · ')}`);
    if (d.id === 'VERNACULAR' && docs.includes('SALE_DEED')) addLog('warn', 'XCHECK', 'Area mismatch deed 1,800 vs land record 1,795 sqft — within 10%, least area adopted');
    if (d.id === 'SALE_DEED' && docs.includes('VERNACULAR')) addLog('warn', 'XCHECK', 'Area mismatch deed 1,800 vs land record 1,795 sqft — within 10%, least area adopted');
  };

  const captureItem = (id: CaptureItemId) => {
    if (captured.includes(id)) return;
    if (id === 'FLOOR_SF' && fraud.omission) return;
    setCaptured((s) => [...s, id]);
    const src = fraud.gallery ? 'gallery' : 'live';
    const sig = `frame sha256:${frameHash()}… signed${fraud.gallery ? '' : ' · sun-angle ✓'}`;
    if (id === 'ROAD') {
      const w = knownObjectLengthFt(CAPTURE_SENSOR.roadPixels, CAPTURE_SENSOR.roadRefDoorPixels);
      addLog('ok', 'MEASURE', `Approach road width ${w.toFixed(1)} ft (known-object scale: 7.0 ft door = ${CAPTURE_SENSOR.roadRefDoorPixels}px) · ${sig}`);
    } else if (id === 'FACADE') {
      addLog('ok', 'MEASURE', `Facade: shadow ${CAPTURE_SENSOR.shadowLengthM} m @ sun ${CAPTURE_SENSOR.sunElevationDeg}° → H ${facade.heightM.toFixed(1)} m → ${facade.estimatedFloors} floors detected · ${sig}`);
    } else if (id === 'METER') {
      addLog('ok', 'OCR', `Live prompt "Pan slowly left from main gate to electricity meter" ✓ · MSEDCL meter, Domestic tariff — matches EB bill · ${sig}`);
    } else {
      const item = CAPTURE_ITEMS.find((x) => x.id === id)!;
      const room = knownObjectLengthFt(CAPTURE_SENSOR.roomPixels, CAPTURE_SENSOR.roomRefDoorPixels);
      addLog('ok', 'CAPTURE', `${item.label}: walked · door-scaled room width ${room.toFixed(1)} ft · ${sig}`);
    }
    if (src === 'gallery') addLog('block', 'TRUST', 'Frame rejected: gallery source / AI-generation artefacts — LIVE CAMERA + FORENSICS FAILED');
  };

  const toggleFraud = (k: keyof FraudFlags) => {
    const on = !fraud[k];
    setFraud((f) => ({ ...f, [k]: on }));
    if (!on) {
      addLog('info', 'SIM', `${k === 'omission' ? 'Omission' : k === 'mockGps' ? 'Mock GPS' : 'Gallery upload'} simulation cleared`);
      return;
    }
    if (k === 'omission') {
      setCaptured((s) => s.filter((x) => x !== 'FLOOR_SF'));
      addLog('warn', 'CAPTURE', 'Owner ended walkthrough without entering the top floor');
      addLog('block', 'TRUST', `OMISSION_FRAUD_BLOCK — exterior detected ${CAPTURE_SITE.exteriorFloors} floors (facade + satellite shadow) > interior walked ${captured.filter((c) => FLOOR_ITEMS.includes(c) && c !== 'FLOOR_SF').length}. Submission halted.`);
    } else if (k === 'mockGps') {
      if (!pin) setPin({ lat: CAPTURE_SITE.lat, lng: CAPTURE_SITE.lng });
      addLog('block', 'DEVICE', 'Mock-location provider active (developer options) — DEVICE ATTESTATION FAILED');
      addLog('block', 'TRUST', `Capture GPS ${CAPTURE_SITE.mockGpsOffsetM} m outside parcel polygon — GPS-IN-PARCEL FAILED`);
    } else {
      addLog('block', 'TRUST', 'Frame source = gallery (EXIF/sensor-stream mismatch) — LIVE CAMERA ONLY FAILED');
      addLog('block', 'FORENS', 'AI-generation / ELA artefacts + shadow azimuth ≠ solar azimuth for GPS+time — SUN-ANGLE FORENSICS FAILED');
    }
  };

  const runPipeline = () => {
    // Final gate is the engine's own verdict: Trust Layer 100% PASS.
    if (blocked || !trust.allPassed || pipelineStage >= 0) return;
    setPipelineStage(0);
    addLog('info', 'ENGINE', 'Submitting evidence pack to deterministic pipeline…');
    let i = 0;
    const timer = setInterval(() => {
      addLog('ok', 'ENGINE', `${PIPELINE[i]} ✓`);
      i++;
      setPipelineStage(i);
      if (i >= PIPELINE.length) {
        clearInterval(timer);
        const id = `self-capture-${Date.now().toString(36)}`;
        const finalCase = buildCaptureCase({
          caseId: id,
          channel,
          capturePoint,
          gpsInParcel: gpsOk === true,
          liveCameraOnly: !fraud.gallery,
          deviceAttested: !fraud.mockGps,
          sunAngleMatched: !fraud.gallery,
          faceMatched: kyc.face,
          floorsWalked,
          docs,
          startedAt: startedAt.current,
          finishedAt: Date.now(),
        });
        const ev = evaluateCase(finalCase);
        addLog('ok', 'ROUTE', `${ev.routing.label} · S ${ev.price.authenticity.score}/100 · MV ${formatInrShort(ev.valuation.mvFinal)} → opening Workbench`);
        upsertCase(finalCase);
        setTimeout(() => router.push(`/cases/${encodeURIComponent(id)}`), 400);
      }
    }, 250);
  };

  /* ---------------- Step gating ---------------- */

  const requiredDocs = DOC_DEFS.filter((d) => d.required).map((d) => d.id);
  const stepDone: Record<Step, boolean> = {
    1: kyc.otp && kyc.pan && kyc.face,
    2: pin !== null && pinInParcel === true,
    3: requiredDocs.every((d) => docs.includes(d)),
    4: ['ROAD', 'FACADE', 'METER'].every((x) => captured.includes(x as CaptureItemId)) && (walkComplete || (fraud.omission && floorsWalked === CAPTURE_SITE.exteriorFloors - 1)),
    5: false,
  };

  const isWa = channel === 'WHATSAPP_REP';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Owner Mobile Self-Capture Simulator</h1>
          <p className="text-sm text-slate-500">
            Demo template: G+2 residential house, {CAPTURE_SITE.locality}, {CAPTURE_SITE.city} — every check below is evaluated live by lib/engines.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Capture channel">
          {(['OWNER_APP', 'WHATSAPP_REP'] as Channel[]).map((ch) => (
            <button
              key={ch}
              role="tab"
              aria-selected={channel === ch}
              disabled={pipelineStage >= 0}
              onClick={() => {
                setChannel(ch);
                addLog('info', 'SESSION', `Channel switched → ${ch === 'OWNER_APP' ? 'PRAMAAN Owner App' : 'Zero-Install WhatsApp Rep Link'}`);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${
                channel === ch ? (ch === 'OWNER_APP' ? 'bg-maroon text-white' : 'bg-[#075E54] text-white') : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {ch === 'OWNER_APP' ? <Smartphone className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
              {ch === 'OWNER_APP' ? 'Owner App' : 'Zero-Install WhatsApp Rep Link'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
        {/* ================= Mobile frame ================= */}
        <div className="mx-auto w-[390px]">
          <div className="relative flex h-[780px] w-[390px] flex-col overflow-hidden rounded-[48px] border-[10px] border-slate-900 bg-white shadow-2xl">
            <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" aria-hidden />
            <div className={`flex items-center justify-between px-6 pb-1 pt-2 text-[11px] font-semibold ${isWa ? 'bg-[#075E54] text-white' : 'bg-maroon text-white'}`}>
              <span>9:41</span>
              <span className="flex items-center gap-1">
                <Wifi className="h-3 w-3" /> 5G
              </span>
            </div>
            <div className={`px-4 pb-3 pt-1 text-white ${isWa ? 'bg-[#075E54]' : 'bg-maroon'}`}>
              <div className="flex items-center gap-2">
                {isWa ? <MessageCircle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                <div className="leading-tight">
                  <div className="text-sm font-bold">{isWa ? 'PRAMAAN Verify' : 'PRAMAAN · Owner App'}</div>
                  <div className="flex items-center gap-1 text-[10px] text-white/75">
                    <Lock className="h-2.5 w-2.5" /> {isWa ? 'Zero-install secure link · authorised representative' : 'IDFC FIRST Bank LAP self-valuation'}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex gap-1">
                {([1, 2, 3, 4, 5] as Step[]).map((s) => (
                  <div key={s} className={`h-1 flex-1 rounded-full ${s < step || stepDone[s] ? 'bg-white' : s === step ? 'bg-white/70' : 'bg-white/25'}`} />
                ))}
              </div>
              <div className="mt-1.5 text-xs font-semibold">
                Step {step} of 5 · {STEP_TITLES[step]}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    {isWa
                      ? 'You are capturing on behalf of the owner (NRI / tenant-occupied). Verify yourself as the registered site representative.'
                      : 'Verify your identity to start. Your Aadhaar number is never displayed or stored.'}
                  </p>
                  <KycRow done={kyc.otp} icon={Fingerprint} label="Aadhaar OTP via DigiLocker" doneLabel="[Aadhaar OTP Verified]" action="Send OTP & verify" onClick={() => kycAction('otp')} />
                  <KycRow done={kyc.pan} icon={FileText} label="PAN check" doneLabel="[PAN Verified]" action="Verify PAN" onClick={() => kycAction('pan')} disabled={!kyc.otp} />
                  <KycRow
                    done={kyc.face}
                    icon={ScanFace}
                    label={isWa ? 'Selfie vs registered representative' : 'Selfie face match'}
                    doneLabel="Face Match ✓"
                    action="Take selfie"
                    onClick={() => kycAction('face')}
                    disabled={!kyc.pan}
                  />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-white p-3 text-xs shadow-sm">
                    <div className="font-semibold text-ink">House, {CAPTURE_SITE.locality}</div>
                    <div className="text-slate-500">{CAPTURE_SITE.city}, {CAPTURE_SITE.state} · auto-filled from Sale Deed</div>
                  </div>
                  <p className="text-xs text-slate-600">Tap inside your plot boundary on the satellite map.</p>
                  <CaptureMap
                    pin={pin}
                    spoofed={fraud.mockGps && capturePoint ? capturePoint : null}
                    pinInParcel={pinInParcel}
                    showWidening={overlays.widening}
                    showHazards={overlays.hazards}
                    onPick={onPick}
                  />
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${gpsOk ? 'bg-instant-bg text-instant' : gpsOk === false ? 'bg-critical-bg text-critical' : 'bg-slate-100 text-slate-500'}`}>
                    <MapPin className="h-4 w-4" />
                    GPS-in-Parcel Polygon: {gpsOk === null ? 'awaiting pin' : gpsOk ? 'PASS' : 'FAIL'}
                  </div>
                  <div className="flex gap-2">
                    <OverlayToggle on={overlays.widening} label="Road widening" onClick={() => setOverlays((o) => ({ ...o, widening: !o.widening }))} />
                    <OverlayToggle on={overlays.hazards} label="Forest / hazard GIS" onClick={() => setOverlays((o) => ({ ...o, hazards: !o.hazards }))} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">Upload documents — fields are extracted and cross-checked instantly.</p>
                  {DOC_DEFS.map((d) => {
                    const done = docs.includes(d.id);
                    return (
                      <div key={d.id} className={`flex items-center gap-2 rounded-lg border bg-white p-2.5 ${done ? 'border-instant/40' : 'border-slate-200'}`}>
                        {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-instant" /> : <FileText className="h-4 w-4 shrink-0 text-slate-400" />}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-ink">{d.label}</div>
                          <div className="text-[10px] text-slate-500">{d.required ? 'Required' : 'Optional'} · {d.language} OCR</div>
                        </div>
                        {!done && (
                          <button
                            type="button"
                            onClick={() => uploadDoc(d)}
                            className="flex items-center gap-1 rounded-md bg-maroon px-2 py-1 text-[11px] font-semibold text-white"
                          >
                            <Upload className="h-3 w-3" /> Upload
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {areaRecon && (
                    <div className="rounded-lg bg-remote-bg px-3 py-2 text-[11px] text-remote">
                      ⚠ Area mismatch: deed 1,800 vs land record 1,795 sqft — least area will be valued.
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold ${fraud.gallery ? 'bg-critical-bg text-critical' : 'bg-slate-900 text-emerald-300'}`}>
                    <Camera className="h-3.5 w-3.5" />
                    {fraud.gallery ? 'GALLERY SOURCE DETECTED — frames rejected' : 'LIVE CAMERA · continuous exterior → interior capture'}
                  </div>
                  {CAPTURE_ITEMS.map((it) => {
                    const done = captured.includes(it.id);
                    const skipped = it.id === 'FLOOR_SF' && fraud.omission;
                    return (
                      <div key={it.id} className={`flex items-center gap-2 rounded-lg border bg-white p-2.5 ${skipped ? 'border-critical/50 bg-critical-bg' : done ? 'border-instant/40' : 'border-slate-200'}`}>
                        {skipped ? (
                          <ShieldAlert className="h-4 w-4 shrink-0 text-critical" />
                        ) : done ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-instant" />
                        ) : (
                          <CircleDashed className="h-4 w-4 shrink-0 text-slate-300" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-ink">{it.label}</div>
                          <div className="text-[10px] text-slate-500">
                            {skipped ? 'SKIPPED by owner — omission detected' : it.id === 'FACADE' && done ? `${facade.estimatedFloors} floors auto-counted` : it.hint}
                          </div>
                        </div>
                        {!done && !skipped && (
                          <button type="button" onClick={() => captureItem(it.id)} className="rounded-md bg-maroon px-2 py-1 text-[11px] font-semibold text-white">
                            Capture
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {step === 5 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">All evidence is ready. PRAMAAN now runs the deterministic 3-engine pipeline.</p>
                  <ol className="space-y-1.5">
                    {PIPELINE.map((p, i) => {
                      const state = pipelineStage > i ? 'done' : pipelineStage === i ? 'run' : 'wait';
                      return (
                        <li key={p} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${state === 'done' ? 'bg-instant-bg text-instant' : state === 'run' ? 'bg-maroon/10 text-maroon' : 'bg-white text-slate-400'}`}>
                          {state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : state === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
                          {p}
                        </li>
                      );
                    })}
                  </ol>
                  {blocked ? (
                    <div className="rounded-lg border-2 border-critical bg-critical-bg p-3 text-xs text-critical">
                      <div className="flex items-center gap-1.5 font-bold">
                        <ShieldAlert className="h-4 w-4" /> Submission halted by Trust Layer
                      </div>
                      <ul className="mt-1 list-disc pl-4">
                        {badges.filter((b) => b.state === 'fail').map((b) => (
                          <li key={b.key}>{b.label}: {b.detail}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[10px] text-slate-600">Clear the fraud simulation to continue.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={runPipeline}
                      disabled={pipelineStage >= 0}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-3 text-sm font-bold text-white shadow hover:bg-maroon-deep disabled:opacity-70"
                    >
                      {pipelineStage >= 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
                      {pipelineStage >= 0 ? 'Running pipeline…' : 'Run 3-Engine Pipeline'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                disabled={step === 1 || pipelineStage >= 0}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              {step < 5 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s + 1) as Step)}
                  disabled={!stepDone[step]}
                  className={`flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-40 ${isWa ? 'bg-[#075E54]' : 'bg-maroon'}`}
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mx-auto mb-2 h-1 w-28 rounded-full bg-slate-900" aria-hidden />
          </div>
        </div>

        {/* ================= Telemetry ================= */}
        <TelemetryPanel badges={badges} extraction={extraction} log={log} fraud={fraud} blocked={blocked} onFraud={toggleFraud} />
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Layers className="h-3.5 w-3.5" /> Masked placeholders only — no real Aadhaar / PAN digits are ever shown.
      </p>
    </div>
  );
}

function KycRow(props: {
  done: boolean;
  icon: typeof Fingerprint;
  label: string;
  doneLabel: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = props.icon;
  return (
    <div className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${props.done ? 'border-instant/40' : 'border-slate-200'}`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${props.done ? 'bg-instant-bg text-instant' : 'bg-slate-100 text-slate-500'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-ink">{props.label}</div>
        {props.done && <div className="text-[11px] font-semibold text-instant">{props.doneLabel}</div>}
      </div>
      {!props.done && (
        <button type="button" onClick={props.onClick} disabled={props.disabled} className="rounded-md bg-maroon px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">
          {props.action}
        </button>
      )}
    </div>
  );
}

function OverlayToggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${on ? 'border-maroon bg-maroon/10 text-maroon' : 'border-slate-200 bg-white text-slate-500'}`}
    >
      {on ? '● ' : '○ '}
      {label}
    </button>
  );
}
