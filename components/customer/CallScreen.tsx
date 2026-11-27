'use client';

/**
 * Customer side of the bank's video inspection call. Listens for an incoming call while the portal is open,
 * rings, and on Answer asks for LOCATION first (it proves the photos are taken at the property), then the camera.
 * Snapshots are taken on this phone when the bank presses capture: full-resolution frame + this phone's GPS.
 * Regular call controls: mic on/off, front / back camera, end call. The bank sees the mic and camera state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, MapPin, Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video } from 'lucide-react';
import type { LocationFix } from '@/lib/domain/types';
import { callClock, getIceServers, grabFrame, iceGatheringDone, type BankToCustomer, type CustomerToBank, type Facing } from '@/lib/client/rtc';

interface IncomingCall {
  id: string;
  status: string;
  offer: string;
}
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
    /* audio blocked until the user taps */
  }
  const vib = setInterval(() => navigator.vibrate?.([400, 200, 400]), 1600);
  return () => {
    stop = true;
    clearInterval(vib);
    ctx?.close().catch(() => undefined);
  };
}

const fixOnce = (maxAge: number, high: boolean, timeout: number) =>
  new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: high, timeout, maximumAge: maxAge }));
const denied = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: number }).code === 1;

/** Recent high-accuracy fix → any recent fix → null (permission granted, GPS not locked yet). Throws only if denied. */
async function bestFix(highAccuracyTimeoutMs = 12000): Promise<GeolocationPosition | null> {
  try {
    return await fixOnce(30000, true, highAccuracyTimeoutMs);
  } catch (e) {
    if (denied(e)) throw e;
  }
  try {
    return await fixOnce(300000, false, 8000);
  } catch (e) {
    if (denied(e)) throw e;
    return null;
  }
}

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function CallScreen({ onActivity }: { onActivity: () => void }) {
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [instruction, setInstruction] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fix, setFix] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [hasMic, setHasMic] = useState(true);
  const [facingState, setFacingState] = useState<Facing>('environment');
  const [flipping, setFlipping] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const dismissed = useRef<Set<string>>(new Set());
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<GeolocationPosition | null>(null);
  const pendingFixes = useRef<LocationFix[]>([]);
  const facing = useRef<Facing>('environment');
  const micRef = useRef(true);
  const flippingRef = useRef(false);
  const stopRing = useRef<(() => void) | null>(null);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  /* poll for an incoming call */
  useEffect(() => {
    if (phase && phase !== 'ringing') return;
    let alive = true;
    const tick = async () => {
      const j = (await fetch('/api/me/call', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { call?: IncomingCall | null } | null;
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
    const id = setInterval(tick, 2500);
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

  /* upload the location trail every 15 s during the call */
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => {
      const fixes = pendingFixes.current.splice(0);
      if (fixes.length) post('/api/me', { action: 'track', fixes }).catch(() => undefined);
    }, 15000);
    return () => clearInterval(id);
  }, [phase]);

  /* the bank may hang up: watch the call status while connected */
  useEffect(() => {
    if (phase !== 'live' && phase !== 'connecting') return;
    const id = setInterval(async () => {
      const j = (await fetch('/api/me/call', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) as { call?: IncomingCall | null } | null;
      const c = j?.call;
      if (c && call && c.id === call.id && c.status !== 'ACTIVE' && c.status !== 'RINGING') {
        const fixes = pendingFixes.current.splice(0);
        if (fixes.length) post('/api/me', { action: 'track', fixes }).catch(() => undefined);
        cleanup();
        setPhase('ended');
        onActivityRef.current();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [phase, call, cleanup]);

  /* call timer */
  useEffect(() => {
    if (phase !== 'live') return;
    setStartedAt((s) => s ?? Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const send = (m: CustomerToBank) => {
    if (dc.current?.readyState === 'open') dc.current.send(JSON.stringify(m));
  };
  const sendMedia = () => send({ t: 'media', mic: micRef.current && !!stream.current?.getAudioTracks().length, facing: facing.current });

  const toggleMic = () => {
    const tracks = stream.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const on = !micRef.current;
    tracks.forEach((t) => (t.enabled = on));
    micRef.current = on;
    setMicOn(on);
    sendMedia();
  };

  const decline = async () => {
    if (!call) return;
    dismissed.current.add(call.id);
    setPhase(null);
    await post('/api/me/call', { action: 'decline', callId: call.id }).catch(() => undefined);
    onActivityRef.current();
  };

  const hangUp = async () => {
    const id = call?.id;
    const fixes = pendingFixes.current.splice(0);
    cleanup();
    setPhase('ended');
    if (fixes.length) await post('/api/me', { action: 'track', fixes }).catch(() => undefined);
    if (id) await post('/api/me/call', { action: 'end', callId: id }).catch(() => undefined);
    onActivityRef.current();
  };

  const videoOnly = (mode: Facing) =>
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false }));
  const camera = (mode: Facing) =>
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: { echoCancellation: true, noiseSuppression: true } })
      .catch(() => videoOnly(mode));

  const takePhoto = async (label: string, area: 'EXTERIOR' | 'INTERIOR', floor?: string, rid?: string, tray?: boolean) => {
    try {
      if (!video.current) throw new Error('Camera not ready');
      const frame = await grabFrame(video.current);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      // The live watch keeps lastFix current; a phone standing still may not report again, so a fix up to
      // 2 minutes old from the active watch is used. Only without one do we ask for a fresh fix.
      const pos = lastFix.current && Date.now() - lastFix.current.timestamp < 120000 ? lastFix.current : ((await bestFix(5000)) ?? lastFix.current);
      if (!pos) throw new Error('No GPS fix yet — step outside or wait a few seconds');
      const at = new Date().toISOString();
      const r = await post('/api/me/call', {
        action: 'photo',
        label,
        area,
        floor,
        unassigned: tray || undefined,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
        hash: frame.hash,
        thumb: frame.thumb,
        full: frame.full,
        width: frame.width,
        height: frame.height,
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Upload failed');
      send({ t: 'photo-ok', rid, label, thumb: frame.thumb, lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at });
      setToast(tray ? 'Photo sent to the bank' : `Photo sent: ${label}`);
      setTimeout(() => setToast(null), 2500);
      onActivityRef.current();
    } catch (e) {
      send({ t: 'photo-err', rid, label, message: e instanceof Error ? e.message : 'Capture failed' });
    }
  };

  /** Front <-> back camera. Many phones cannot open both cameras at once, so the old one is released if the first try fails. */
  const flip = async () => {
    if (flippingRef.current) return;
    flippingRef.current = true;
    setFlipping(true);
    const next: Facing = facing.current === 'environment' ? 'user' : 'environment';
    const old = stream.current?.getVideoTracks()[0];
    const applyTrack = async (track: MediaStreamTrack, mode: Facing) => {
      await pc.current?.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender.replaceTrack(track);
      const merged = new MediaStream([track, ...(stream.current?.getAudioTracks() ?? [])]);
      stream.current = merged;
      if (video.current) video.current.srcObject = merged;
      facing.current = mode;
      setFacingState(mode);
    };
    try {
      let s: MediaStream;
      try {
        s = await videoOnly(next);
        old?.stop();
      } catch {
        old?.stop();
        s = await videoOnly(next);
      }
      await applyTrack(s.getVideoTracks()[0], next);
    } catch {
      // Could not open the other camera: get the previous one back so the call keeps its video.
      if (old?.readyState === 'ended') {
        const back = await videoOnly(facing.current).catch(() => null);
        if (back) await applyTrack(back.getVideoTracks()[0], facing.current).catch(() => undefined);
      }
      send({ t: 'status', text: 'Could not switch camera on this phone.' });
      setToast('Could not switch camera');
      setTimeout(() => setToast(null), 2500);
    } finally {
      flippingRef.current = false;
      setFlipping(false);
      sendMedia();
    }
  };

  const answer = async () => {
    if (!call) return;
    stopRing.current?.();
    setProblem(null);
    setPhase('permissions');
    let first: GeolocationPosition | null;
    try {
      first = await bestFix();
    } catch {
      setProblem('Location is blocked. Turn on location for this website (tap the lock icon next to the address), then press Try again.');
      return;
    }
    if (first) {
      lastFix.current = first;
      setFix({ lat: first.coords.latitude, lng: first.coords.longitude, acc: first.coords.accuracy });
    }
    let s: MediaStream;
    try {
      s = await camera('environment');
    } catch {
      setProblem('Camera is blocked. Allow the camera for this website, then press Try again.');
      return;
    }
    stream.current = s;
    facing.current = 'environment';
    setFacingState('environment');
    const mic = s.getAudioTracks().length > 0;
    micRef.current = true; // every call starts unmuted
    setHasMic(mic);
    s.getAudioTracks().forEach((t) => (t.enabled = micRef.current));
    setMicOn(micRef.current && mic);
    setStartedAt(null);
    setPhase('connecting');
    post('/api/me', { action: 'location', on: true }).catch(() => undefined);
    try {
      const conn = new RTCPeerConnection({ iceServers: await getIceServers() });
      pc.current = conn;
      s.getTracks().forEach((tr) => conn.addTrack(tr, s));
      conn.ontrack = (e) => {
        if (e.track.kind === 'audio' && remoteAudio.current) remoteAudio.current.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      };
      conn.ondatachannel = (e) => {
        dc.current = e.channel;
        e.channel.onopen = () => {
          const p = lastFix.current;
          if (p) send({ t: 'geo', lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: new Date(p.timestamp).toISOString() });
          sendMedia();
          if (!mic) send({ t: 'status', text: 'The customer’s microphone is not available — use written instructions.' });
        };
        e.channel.onmessage = (m) => {
          const msg = JSON.parse(String(m.data)) as BankToCustomer;
          if (msg.t === 'say') setInstruction(msg.text);
          if (msg.t === 'capture') takePhoto(msg.label, msg.area, msg.floor, msg.rid, msg.tray);
          if (msg.t === 'flip') flip();
        };
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === 'connected') setPhase('live');
        if (conn.connectionState === 'failed') setProblem('Connection lost. The bank may call again.');
      };
      watchId.current = navigator.geolocation.watchPosition(
        (p) => {
          lastFix.current = p;
          setFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
          const at = new Date(p.timestamp).toISOString();
          pendingFixes.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at });
          send({ t: 'geo', lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at });
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 3000 },
      );
      if (first) pendingFixes.current.push({ lat: first.coords.latitude, lng: first.coords.longitude, acc: Math.round(first.coords.accuracy), at: new Date(first.timestamp).toISOString() });
      await conn.setRemoteDescription(JSON.parse(call.offer) as RTCSessionDescriptionInit);
      await conn.setLocalDescription(await conn.createAnswer());
      await iceGatheringDone(conn);
      const r = await post('/api/me/call', { action: 'answer', callId: call.id, answer: JSON.stringify(conn.localDescription) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not answer');
    } catch (e) {
      cleanup();
      setProblem(e instanceof Error ? e.message : 'Call failed');
      setPhase('ended');
    }
  };

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
          <h2 className="mt-6 text-2xl font-bold">IDFC FIRST Bank is calling</h2>
          <p className="mt-2 text-[15px] text-white/80">Video check of your property. Please be at the property with your phone.</p>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-white/70">
            <MapPin className="h-4 w-4" /> You will be asked to allow location and camera.
          </p>
        </div>
        <div className="flex w-full max-w-xs justify-between">
          <button onClick={decline} className="flex flex-col items-center gap-2">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600">
              <PhoneOff className="h-7 w-7" />
            </span>
            Decline
          </button>
          <button onClick={answer} className="flex flex-col items-center gap-2">
            <span className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-emerald-500">
              <Phone className="h-7 w-7" />
            </span>
            Answer
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
              <button onClick={answer} className="rounded-xl bg-white px-6 py-3 font-semibold text-ink">
                Try again
              </button>
              <button onClick={decline} className="text-sm text-white/70">
                Decline
              </button>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Please allow location, then the camera.</p>
            </>
          )}
        </div>
      )}
      {(phase === 'connecting' || phase === 'live') && (
        <>
          <div className="relative flex-1">
            <video ref={video} autoPlay playsInline muted className={`h-full w-full object-cover ${facingState === 'user' ? '-scale-x-100' : ''}`} />
            {flash && <div className="absolute inset-0 bg-white" />}
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4">
              <div className="flex items-center gap-2 text-sm">
                {phase === 'live' ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                {phase === 'live' ? 'Connected to the bank — follow the instructions' : 'Connecting…'}
                {phase === 'live' && <span className="ml-auto font-mono tabular-nums text-white/80">{callClock(startedAt, now)}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
                {fix && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location on · ±{Math.round(fix.acc)} m
                  </span>
                )}
                {!micOn && (
                  <span className="flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 font-semibold text-white">
                    <MicOff className="h-3 w-3" /> {hasMic ? 'You are muted' : 'No microphone'}
                  </span>
                )}
                <span>{facingState === 'user' ? 'Front camera' : 'Back camera'}</span>
              </div>
            </div>
            {instruction && (
              <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/75 px-4 py-3 text-center text-lg font-semibold">
                <Camera className="mr-1.5 inline h-5 w-5" /> {instruction}
              </div>
            )}
            {toast && <div className="absolute inset-x-8 top-20 rounded-xl bg-emerald-600 px-3 py-2 text-center text-sm font-semibold">✓ {toast}</div>}
            {problem && <div className="absolute inset-x-8 top-32 rounded-xl bg-amber-600 px-3 py-2 text-center text-sm">{problem}</div>}
          </div>
          <div className="flex items-start justify-center gap-8 bg-black px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-xs">
            <button onClick={toggleMic} disabled={!hasMic} className="flex flex-col items-center gap-1.5 disabled:opacity-40" aria-pressed={!micOn}>
              <span className={`flex h-14 w-14 items-center justify-center rounded-full ${micOn ? 'bg-white/15' : 'bg-white text-ink'}`}>{micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}</span>
              {!hasMic ? 'No mic' : micOn ? 'Mute' : 'Unmute'}
            </button>
            <button onClick={flip} disabled={flipping} className="flex flex-col items-center gap-1.5 disabled:opacity-60">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15">{flipping ? <Loader2 className="h-6 w-6 animate-spin" /> : <SwitchCamera className="h-6 w-6" />}</span>
              {facingState === 'user' ? 'Back camera' : 'Front camera'}
            </button>
            <button onClick={hangUp} className="flex flex-col items-center gap-1.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600">
                <PhoneOff className="h-6 w-6" />
              </span>
              End call
            </button>
          </div>
        </>
      )}
      {phase === 'ended' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-lg">{problem ?? 'Call ended. Thank you!'}</p>
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
            Close
          </button>
        </div>
      )}
    </div>
  );
}
