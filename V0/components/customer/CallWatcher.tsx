'use client';

/**
 * Customer side of the bank's video verification call. Polls for an incoming call while the portal is open,
 * rings, and on "Answer" asks for LOCATION first (required — it proves the photos are taken at the property),
 * then the camera. Photos are taken on this phone when the bank employee presses capture.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, MapPin, Phone, PhoneOff, Video } from 'lucide-react';
import type { LocationFix } from '@/lib/types';
import type { Lang } from '@/lib/client/portalI18n';
import { getIceServers, grabFrame, iceGatheringDone, type BankToCustomer, type CustomerToBank } from '@/lib/client/rtc';

interface IncomingCall {
  id: string;
  status: string;
  offer: string;
}

const L = {
  calling: { en: 'IDFC FIRST Bank is calling', hi: 'IDFC FIRST बैंक कॉल कर रहा है' },
  callingSub: { en: 'Video check of your property. Stand at the property and keep the phone ready.', hi: 'आपकी संपत्ति की वीडियो जाँच। संपत्ति पर खड़े रहें और फ़ोन तैयार रखें।' },
  answer: { en: 'Answer', hi: 'उत्तर दें' },
  decline: { en: 'Decline', hi: 'अस्वीकार' },
  needLoc: { en: 'Please allow location. The bank checks that the photos are taken at the property.', hi: 'कृपया लोकेशन की अनुमति दें। बैंक जाँचता है कि फ़ोटो संपत्ति पर ली गई हैं।' },
  locDenied: {
    en: 'Location is blocked. Turn on location for this website in your browser settings (tap the lock icon next to the address), then press Try again.',
    hi: 'लोकेशन बंद है। ब्राउज़र सेटिंग में इस वेबसाइट के लिए लोकेशन चालू करें (पते के पास लॉक आइकन), फिर दोबारा कोशिश करें।',
  },
  camDenied: { en: 'Camera is blocked. Allow camera for this website, then press Try again.', hi: 'कैमरा बंद है। इस वेबसाइट के लिए कैमरा चालू करें, फिर दोबारा कोशिश करें।' },
  retry: { en: 'Try again', hi: 'दोबारा कोशिश करें' },
  connecting: { en: 'Connecting…', hi: 'जुड़ रहा है…' },
  live: { en: 'Connected to the bank — follow the instructions', hi: 'बैंक से जुड़े — निर्देशों का पालन करें' },
  hangUp: { en: 'End call', hi: 'कॉल समाप्त करें' },
  ended: { en: 'Call ended. Thank you!', hi: 'कॉल समाप्त। धन्यवाद!' },
  close: { en: 'Close', hi: 'बंद करें' },
  captured: { en: 'Photo sent to the bank', hi: 'फ़ोटो बैंक को भेजी गई' },
} as const;

type Phase = 'ringing' | 'permissions' | 'connecting' | 'live' | 'ended';

function ring(): () => void {
  let stop = false;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
    const beep = () => {
      if (stop || !ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.35);
      setTimeout(beep, 1400);
    };
    beep();
  } catch {
    /* audio blocked until the user taps — vibration still works */
  }
  const vib = setInterval(() => navigator.vibrate?.([400, 200, 400]), 1600);
  return () => {
    stop = true;
    clearInterval(vib);
    ctx?.close().catch(() => undefined);
  };
}

function currentFix(maxAgeMs: number, highAccuracy = true, timeout = 15000): Promise<GeolocationPosition> {
  return new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: highAccuracy, timeout, maximumAge: maxAgeMs }),
  );
}

const isDenied = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: number }).code === 1;

/** Best available fix: recent high-accuracy → any recent fix → null (permission granted but GPS not locked yet). Throws only if denied. */
async function bestFix(): Promise<GeolocationPosition | null> {
  try {
    return await currentFix(30000, true, 12000);
  } catch (e) {
    if (isDenied(e)) throw e;
  }
  try {
    return await currentFix(300000, false, 8000);
  } catch (e) {
    if (isDenied(e)) throw e;
    return null;
  }
}

export default function CallWatcher({ lang, onPhoto }: { lang: Lang; onPhoto?: () => void }) {
  const t = useCallback((k: keyof typeof L) => L[k][lang], [lang]);
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fix, setFix] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const dismissed = useRef<Set<string>>(new Set());
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<GeolocationPosition | null>(null);
  const pendingFixes = useRef<LocationFix[]>([]);
  const facing = useRef<'environment' | 'user'>('environment');
  const stopRing = useRef<(() => void) | null>(null);

  /* ---- poll for incoming calls ---- */
  useEffect(() => {
    if (phase && phase !== 'ringing') return;
    let alive = true;
    const tick = async () => {
      const j = (await fetch('/api/portal/call', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { call?: IncomingCall | null } | null;
      if (!alive) return;
      const c = j?.call;
      if (c && c.status === 'RINGING' && !dismissed.current.has(c.id)) {
        setCall(c);
        setPhase('ringing');
      } else if (phase === 'ringing' && (!c || c.status !== 'RINGING')) {
        setPhase(null);
        setCall(null);
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === 'ringing') stopRing.current = ring();
    return () => {
      stopRing.current?.();
      stopRing.current = null;
    };
  }, [phase]);

  const cleanup = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    dc.current?.close();
    pc.current?.close();
    stream.current?.getTracks().forEach((x) => x.stop());
    pc.current = null;
    dc.current = null;
    stream.current = null;
  }, []);
  useEffect(() => cleanup, [cleanup]);

  /* ---- upload the location trail every 20 s during the call ---- */
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => {
      const fixes = pendingFixes.current.splice(0);
      if (fixes.length) fetch('/api/portal/case', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'track', fixes }) }).catch(() => undefined);
    }, 20000);
    return () => clearInterval(id);
  }, [phase]);

  const send = (m: CustomerToBank) => {
    if (dc.current?.readyState === 'open') dc.current.send(JSON.stringify(m));
  };

  const decline = async () => {
    if (!call) return;
    dismissed.current.add(call.id);
    setPhase(null);
    await fetch('/api/portal/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decline', callId: call.id }) }).catch(() => undefined);
  };

  const hangUp = async () => {
    const id = call?.id;
    cleanup();
    setPhase('ended');
    if (id) await fetch('/api/portal/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end', callId: id }) }).catch(() => undefined);
  };

  const camera = (mode: 'environment' | 'user') =>
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true }).catch(() =>
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false }),
    );

  const takePhoto = async (slot: string, label: string) => {
    try {
      if (!video.current) throw new Error('Camera not ready');
      const frame = await grabFrame(video.current);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      const pos = lastFix.current && Date.now() - lastFix.current.timestamp < 15000 ? lastFix.current : ((await bestFix()) ?? lastFix.current);
      if (!pos) throw new Error('No GPS fix yet — step outside or wait a few seconds');
      const takenAt = new Date().toISOString();
      const r = await fetch('/api/portal/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'photo',
          full: frame.full,
          photo: { id: `call-${Date.now().toString(36)}`, slot, label, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy), takenAt, fileAgeMs: 0, hash: frame.hash, thumb: frame.thumb },
        }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Upload failed');
      send({ t: 'photo-ok', slot, label, thumb: frame.thumb, lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: takenAt });
      setToast(`${t('captured')}: ${label}`);
      setTimeout(() => setToast(null), 2500);
      onPhoto?.();
    } catch (e) {
      send({ t: 'photo-err', slot, message: e instanceof Error ? e.message : 'Capture failed' });
    }
  };

  const flip = async () => {
    const next = facing.current === 'environment' ? 'user' : 'environment';
    try {
      const s = await camera(next);
      const track = s.getVideoTracks()[0];
      const sender = pc.current?.getSenders().find((x) => x.track?.kind === 'video');
      await sender?.replaceTrack(track);
      stream.current?.getVideoTracks().forEach((x) => x.stop());
      s.getAudioTracks().forEach((x) => x.stop());
      const merged = new MediaStream([track, ...(stream.current?.getAudioTracks() ?? [])]);
      stream.current = merged;
      if (video.current) video.current.srcObject = merged;
      facing.current = next;
    } catch {
      send({ t: 'status', text: 'Could not switch camera on this phone.' });
    }
  };

  const answer = async () => {
    if (!call) return;
    stopRing.current?.();
    setProblem(null);
    setPhase('permissions');
    // 1. Location first — permission is required to authenticate where the photos are taken.
    //    If GPS has not locked yet we still connect; the live watch streams the fix as soon as it arrives.
    let first: GeolocationPosition | null;
    try {
      first = await bestFix();
    } catch {
      setProblem(t('locDenied'));
      return;
    }
    if (first) {
      lastFix.current = first;
      setFix({ lat: first.coords.latitude, lng: first.coords.longitude, acc: first.coords.accuracy });
    }
    // 2. Camera (+ microphone if allowed).
    let s: MediaStream;
    try {
      s = await camera('environment');
    } catch {
      setProblem(t('camDenied'));
      return;
    }
    stream.current = s;
    setPhase('connecting');
    try {
      const conn = new RTCPeerConnection({ iceServers: await getIceServers() });
      pc.current = conn;
      s.getTracks().forEach((tr) => conn.addTrack(tr, s));
      conn.ontrack = (ev) => {
        if (ev.track.kind === 'audio' && remoteAudio.current) remoteAudio.current.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
      };
      conn.ondatachannel = (ev) => {
        dc.current = ev.channel;
        ev.channel.onopen = () => {
          const p = lastFix.current;
          if (p) send({ t: 'geo', lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: new Date(p.timestamp).toISOString() });
        };
        ev.channel.onmessage = (m) => {
          const msg = JSON.parse(String(m.data)) as BankToCustomer;
          if (msg.t === 'say') setInstruction(msg.text);
          if (msg.t === 'capture') takePhoto(msg.slot, msg.label);
          if (msg.t === 'flip') flip();
        };
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === 'connected') setPhase('live');
        if (conn.connectionState === 'failed' || conn.connectionState === 'disconnected') setProblem('Connection lost. The bank may call again.');
      };
      watchId.current = navigator.geolocation.watchPosition(
        (p) => {
          lastFix.current = p;
          setFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
          const at = new Date(p.timestamp).toISOString();
          pendingFixes.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at, source: 'CALL' });
          send({ t: 'geo', lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at });
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 3000 },
      );
      await conn.setRemoteDescription(JSON.parse(call.offer) as RTCSessionDescriptionInit);
      await conn.setLocalDescription(await conn.createAnswer());
      await iceGatheringDone(conn);
      const r = await fetch('/api/portal/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', callId: call.id, answer: JSON.stringify(conn.localDescription) }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not answer');
    } catch (e) {
      cleanup();
      setProblem(e instanceof Error ? e.message : 'Call failed');
      setPhase('ended');
    }
  };

  // attach the local preview once the <video> exists
  useEffect(() => {
    if ((phase === 'connecting' || phase === 'live') && video.current && stream.current) video.current.srcObject = stream.current;
  }, [phase]);

  if (!phase || !call) return null;

  if (phase === 'ringing') {
    return (
      <div className="fixed inset-0 z-[4000] flex flex-col items-center justify-between bg-gradient-to-b from-maroon to-[#4a0d12] px-6 py-16 text-white">
        <div className="text-center">
          <div className="mx-auto flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-white/15">
            <Video className="h-10 w-10" />
          </div>
          <h2 className="mt-6 text-2xl font-bold">{t('calling')}</h2>
          <p className="mt-2 text-[15px] text-white/80">{t('callingSub')}</p>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-white/70">
            <MapPin className="h-4 w-4" /> {t('needLoc')}
          </p>
        </div>
        <div className="flex w-full max-w-xs justify-between">
          <button onClick={decline} className="flex flex-col items-center gap-2">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600">
              <PhoneOff className="h-7 w-7" />
            </span>
            {t('decline')}
          </button>
          <button onClick={answer} className="flex flex-col items-center gap-2">
            <span className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-emerald-500">
              <Phone className="h-7 w-7" />
            </span>
            {t('answer')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[4000] flex flex-col bg-black text-white">
      <audio ref={remoteAudio} autoPlay />
      {phase === 'permissions' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          {problem ? (
            <>
              <MapPin className="h-10 w-10 text-amber-300" />
              <p className="text-[16px]">{problem}</p>
              <button onClick={answer} className="rounded-xl bg-white px-6 py-3 font-semibold text-ink">{t('retry')}</button>
              <button onClick={decline} className="text-sm text-white/70">{t('decline')}</button>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>{t('needLoc')}</p>
            </>
          )}
        </div>
      )}

      {(phase === 'connecting' || phase === 'live') && (
        <>
          <div className="relative flex-1">
            <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
            {flash && <div className="absolute inset-0 bg-white" />}
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4">
              <div className="flex items-center gap-2 text-sm">
                {phase === 'live' ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                {phase === 'live' ? t('live') : t('connecting')}
              </div>
              {fix && (
                <div className="mt-1 flex items-center gap-1 text-xs text-white/70">
                  <MapPin className="h-3 w-3" /> {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} ±{Math.round(fix.acc)} m
                </div>
              )}
            </div>
            {instruction && (
              <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/70 px-4 py-3 text-center text-lg font-semibold">
                <Camera className="mr-1.5 inline h-5 w-5" /> {instruction}
              </div>
            )}
            {toast && <div className="absolute inset-x-8 top-20 rounded-xl bg-emerald-600 px-3 py-2 text-center text-sm font-semibold">✓ {toast}</div>}
            {problem && <div className="absolute inset-x-8 top-32 rounded-xl bg-amber-600 px-3 py-2 text-center text-sm">{problem}</div>}
          </div>
          <div className="flex justify-center bg-black p-5">
            <button onClick={hangUp} className="flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 font-semibold">
              <PhoneOff className="h-5 w-5" /> {t('hangUp')}
            </button>
          </div>
        </>
      )}

      {phase === 'ended' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-lg">{problem ?? t('ended')}</p>
          <button
            onClick={() => {
              if (call) dismissed.current.add(call.id);
              setPhase(null);
              setCall(null);
              setProblem(null);
              setInstruction(null);
            }}
            className="rounded-xl bg-white px-6 py-3 font-semibold text-ink"
          >
            {t('close')}
          </button>
        </div>
      )}
    </div>
  );
}
