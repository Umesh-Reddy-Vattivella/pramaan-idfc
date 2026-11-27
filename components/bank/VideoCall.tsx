'use client';

/**
 * Bank side of the video inspection call. The bank rings the customer inside the portal, sees their camera and
 * presses the shutter whenever the view is right. Each snap is taken ON THE CUSTOMER'S PHONE at full resolution
 * with the phone's GPS fix and lands in the snap tray, from where the bank drags it onto its designated view.
 * Fallback: grab the frame from the received video (tagged with the last tracked location).
 * Call controls: mute, switch the customer's camera, portrait / landscape frame, full screen, hang up.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, MapPin, Maximize2, MessageSquare, Mic, MicOff, Minimize2, Phone, PhoneOff, RectangleHorizontal, RectangleVertical, ScanLine, SwitchCamera, Video } from 'lucide-react';
import { fencePoint } from '@/lib/engines/geofence';
import { metres } from '@/lib/engines/format';
import { callClock, getIceServers, grabFrame, iceGatheringDone, type BankToCustomer, type CustomerToBank, type Facing } from '@/lib/client/rtc';
import { api } from '@/lib/client/api';
import type { Application } from '@/lib/domain/types';
import type { AppCtl } from '@/lib/client/useApplication';
import SnapBoard from './SnapBoard';

type Phase = 'idle' | 'ringing' | 'connecting' | 'live' | 'ended';
type Orient = 'auto' | 'portrait' | 'landscape';

const QUICK_SAY = ['Please go outside and stand at the main gate.', 'Show the full front of the building.', 'Walk slowly into the next room.', 'Hold the phone steady, please.', 'Point the camera at the door so I can measure.'];
const SNAP_TIMEOUT_MS = 20000;

function CtlButton({ onClick, disabled, active, danger, title, label, children }: { onClick: () => void; disabled?: boolean; active?: boolean; danger?: boolean; title: string; label: string; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="flex flex-col items-center gap-1 text-[10px] text-white/80 disabled:opacity-40">
      <span className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : active ? 'bg-white text-ink' : 'bg-white/15 hover:bg-white/25'}`}>{children}</span>
      {label}
    </button>
  );
}

export default function VideoCall({ ctl }: { ctl: AppCtl }) {
  const app = ctl.app!;
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; acc: number; at: string } | null>(null);
  const [pendingN, setPendingN] = useState(0);
  const [say, setSay] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [hasMic, setHasMic] = useState(false);
  const [remote, setRemote] = useState<{ mic: boolean; facing: Facing } | null>(null);
  const [orient, setOrient] = useState<Orient>('auto');
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [full, setFull] = useState(false);
  const [flash, setFlash] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const callId = useRef<string | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;

  const pin = app.property.lat !== null && app.property.lng !== null ? { lat: app.property.lat, lng: app.property.lng } : null;
  const fence = geo ? fencePoint({ lat: geo.lat, lng: geo.lng, accuracyM: geo.acc }, pin, app.parcel) : null;
  const live = phase === 'live';
  const feed = dims ? (dims.h > dims.w ? 'portrait' : 'landscape') : null;
  const frame: 'portrait' | 'landscape' = orient === 'auto' ? (feed ?? 'landscape') : orient;

  const settle = (rid?: string) => {
    const key = rid && pending.current.has(rid) ? rid : pending.current.keys().next().value;
    if (key === undefined) return;
    clearTimeout(pending.current.get(key));
    pending.current.delete(key);
    setPendingN(pending.current.size);
  };
  const clearPending = () => {
    pending.current.forEach((t) => clearTimeout(t));
    pending.current.clear();
    setPendingN(0);
  };

  const cleanup = useCallback(() => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    dc.current?.close();
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    pc.current = null;
    dc.current = null;
    mic.current = null;
    pending.current.forEach((t) => clearTimeout(t));
    pending.current.clear();
    setPendingN(0);
    setRemote(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => cleanup, [cleanup]);

  /* call timer */
  useEffect(() => {
    if (!live) return;
    setStartedAt((s) => s ?? Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  /* full screen state */
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stage.current && !!stage.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const send = (m: BankToCustomer) => {
    if (dc.current?.readyState === 'open') {
      dc.current.send(JSON.stringify(m));
      return true;
    }
    return false;
  };

  const hangUp = async () => {
    const id = callId.current;
    cleanup();
    setPhase('ended');
    if (id) await api(`/api/applications/${app.id}/call`, { body: { action: 'end', callId: id } }).catch(() => undefined);
    ctlRef.current.refresh();
  };

  const start = async () => {
    setErr(null);
    setNote(null);
    setGeo(null);
    setDims(null);
    setStartedAt(null);
    setMicOn(true);
    clearPending();
    setPhase('ringing');
    try {
      const conn = new RTCPeerConnection({ iceServers: await getIceServers() });
      pc.current = conn;
      conn.addTransceiver('video', { direction: 'recvonly' });
      try {
        mic.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        mic.current.getTracks().forEach((t) => conn.addTrack(t, mic.current!));
        setHasMic(true);
      } catch {
        conn.addTransceiver('audio', { direction: 'recvonly' });
        setHasMic(false);
        setNote('Your microphone is off — the customer will see your written instructions.');
      }
      conn.ontrack = (e) => {
        if (video.current && e.streams[0]) video.current.srcObject = e.streams[0];
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === 'connected') setPhase('live');
        if (conn.connectionState === 'failed') setErr('Connection failed — the two networks may block direct calls. Configure a TURN server (TURN_URLS) and retry.');
      };
      const ch = conn.createDataChannel('ctl');
      dc.current = ch;
      ch.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as CustomerToBank;
        if (m.t === 'geo') setGeo({ lat: m.lat, lng: m.lng, acc: m.acc, at: m.at });
        if (m.t === 'status') setNote(m.text);
        if (m.t === 'media') setRemote({ mic: m.mic, facing: m.facing });
        if (m.t === 'photo-err') {
          settle(m.rid);
          setErr(`Snap failed: ${m.message}`);
        }
        if (m.t === 'photo-ok') {
          settle(m.rid);
          ctlRef.current.refresh();
        }
      };
      await conn.setLocalDescription(await conn.createOffer());
      await iceGatheringDone(conn);
      const j = await api<{ call: { id: string } }>(`/api/applications/${app.id}/call`, { body: { action: 'start', offer: JSON.stringify(conn.localDescription) } });
      callId.current = j.call.id;
      poll.current = setInterval(async () => {
        const g = await api<{ call: { id: string; status: string; answer?: string } | null }>(`/api/applications/${app.id}/call`).catch(() => null);
        const c = g?.call;
        if (!c || c.id !== callId.current) return;
        if (c.status === 'ACTIVE' && c.answer && conn.signalingState === 'have-local-offer') {
          setPhase('connecting');
          await conn.setRemoteDescription(JSON.parse(c.answer) as RTCSessionDescriptionInit);
        }
        if (c.status === 'DECLINED' || c.status === 'MISSED' || c.status === 'ENDED') {
          setErr(c.status === 'DECLINED' ? 'The customer declined the call.' : c.status === 'MISSED' ? 'No answer — ask the customer to keep the portal open (signed in) and try again.' : 'The customer ended the call.');
          cleanup();
          setPhase('ended');
          ctlRef.current.refresh();
        }
      }, 1500);
    } catch (e) {
      cleanup();
      setPhase('idle');
      setErr(e instanceof Error ? e.message : 'Call failed');
    }
  };

  /** Shutter: the customer's phone takes the photo (full-res + GPS) and it lands in the snap tray. */
  const snap = () => {
    if (!live) return;
    setErr(null);
    const rid = Math.random().toString(36).slice(2, 10);
    if (!send({ t: 'capture', rid, tray: true, label: 'Unassigned snap', area: 'EXTERIOR' })) return setErr('Not connected to the customer’s phone.');
    send({ t: 'say', text: 'Hold steady — taking a photo' });
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    pending.current.set(
      rid,
      setTimeout(() => {
        if (!pending.current.delete(rid)) return;
        setPendingN(pending.current.size);
        setErr('A snap did not arrive from the customer’s phone — try again, or use the frame-grab button.');
      }, SNAP_TIMEOUT_MS),
    );
    setPendingN(pending.current.size);
  };

  /** Fallback: frame grab from the received video, tagged with the last tracked location. */
  const grabHere = async () => {
    if (!video.current) return;
    setErr(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    try {
      const f = await grabFrame(video.current);
      const j = await api<{ app: Application }>(`/api/applications/${app.id}/snapshot`, { body: { unassigned: true, label: 'Unassigned snap', area: 'EXTERIOR', full: f.full, thumb: f.thumb, hash: f.hash, width: f.width, height: f.height } });
      ctlRef.current.accept(j.app);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Capture failed');
    }
  };

  const toggleMic = () => {
    const tracks = mic.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const on = !micOn;
    tracks.forEach((t) => (t.enabled = on));
    setMicOn(on);
  };

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else stage.current?.requestFullscreen().catch(() => setErr('Full screen is not available in this browser.'));
  };

  const sendSay = (text: string) => {
    if (text.trim() && send({ t: 'say', text: text.trim() })) setSay('');
  };

  /* keyboard: S = snap (when not typing) */
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        snap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const frameClass = full ? 'min-h-0 w-full flex-1' : frame === 'portrait' ? 'mx-auto aspect-[9/16] h-[min(72vh,680px)] max-w-full' : 'aspect-video w-full';

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Video className="h-4 w-4 text-maroon" /> Video inspection call
          </h2>
          <p className="text-xs text-slate-500">The customer answers in their portal with location and camera on. Snap whenever the view is right, then drag each snap onto its designated view.</p>
        </div>
        {phase === 'idle' || phase === 'ended' ? (
          <button onClick={start} className="btn-green">
            <Phone className="h-4 w-4" /> {phase === 'ended' ? 'Call again' : 'Call customer'}
          </button>
        ) : (
          <button onClick={hangUp} className="btn-red">
            <PhoneOff className="h-4 w-4" /> {phase === 'ringing' ? 'Cancel' : 'Hang up'}
          </button>
        )}
      </div>
      {err && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs font-medium text-red-700">{err}</p>}
      <div className="space-y-5 p-5">
        {phase !== 'idle' && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-3">
              <div ref={stage} className={`flex flex-col overflow-hidden rounded-xl bg-slate-900 ${full ? 'h-screen w-screen rounded-none' : ''}`}>
                <div className={`relative bg-black ${frameClass}`}>
                  <video ref={video} autoPlay playsInline onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} onResize={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} className="h-full w-full object-contain" />
                  {flash && <div className="pointer-events-none absolute inset-0 bg-white/70" />}
                  {!live && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                      {phase === 'ended' ? <PhoneOff className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
                      <span className="text-sm">{phase === 'ringing' ? 'Ringing the customer’s portal…' : phase === 'connecting' ? 'Connecting video…' : 'Call ended'}</span>
                    </div>
                  )}
                  {live && (
                    <div className="absolute inset-x-3 top-3 flex flex-wrap items-start gap-1.5 text-xs font-semibold text-white">
                      <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> LIVE <span className="font-mono tabular-nums">{callClock(startedAt, now)}</span>
                      </span>
                      <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                        {remote && !remote.mic && (
                          <span className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1">
                            <MicOff className="h-3.5 w-3.5 text-red-400" /> Customer muted
                          </span>
                        )}
                        {remote && <span className="rounded-full bg-black/70 px-2.5 py-1">{remote.facing === 'user' ? 'Front camera' : 'Back camera'}</span>}
                        {!micOn && (
                          <span className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1">
                            <MicOff className="h-3.5 w-3.5 text-red-400" /> You are muted
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {pendingN > 0 && (
                    <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturing {pendingN > 1 ? `${pendingN} snaps` : 'snap'} on the phone…
                    </span>
                  )}
                </div>
                {/* control bar */}
                <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-2 bg-slate-900 px-3 py-3">
                  <CtlButton onClick={toggleMic} disabled={!hasMic || phase === 'ended'} active={!micOn} title={micOn ? 'Mute your microphone' : 'Unmute your microphone'} label={micOn ? 'Mute' : 'Unmute'}>
                    {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </CtlButton>
                  <CtlButton onClick={() => send({ t: 'flip' })} disabled={!live} title="Switch the customer’s camera (front / back)" label="Flip camera">
                    <SwitchCamera className="h-5 w-5" />
                  </CtlButton>
                  <button onClick={snap} disabled={!live} title="Snap (S)" aria-label="Snap" className="flex flex-col items-center gap-1 text-[10px] text-white/80 disabled:opacity-40">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/40 bg-white transition-transform active:scale-90">
                      <span className="h-10 w-10 rounded-full border-2 border-slate-900/10 bg-white" />
                    </span>
                    Snap (S)
                  </button>
                  <CtlButton onClick={grabHere} disabled={!live} title="Fallback: grab this frame from the video here (uses the last tracked location)" label="Frame grab">
                    <ScanLine className="h-5 w-5" />
                  </CtlButton>
                  <CtlButton onClick={() => setOrient(frame === 'portrait' ? 'landscape' : 'portrait')} disabled={phase === 'ended'} title={`Switch to ${frame === 'portrait' ? 'landscape' : 'portrait'} view`} label={orient === 'auto' ? `Auto · ${frame === 'portrait' ? 'Portrait' : 'Landscape'}` : frame === 'portrait' ? 'Portrait' : 'Landscape'}>
                    {frame === 'portrait' ? <RectangleVertical className="h-5 w-5" /> : <RectangleHorizontal className="h-5 w-5" />}
                  </CtlButton>
                  <CtlButton onClick={toggleFull} disabled={phase === 'ended'} title={full ? 'Exit full screen' : 'Full screen'} label={full ? 'Exit full' : 'Full screen'}>
                    {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </CtlButton>
                  {phase !== 'ended' && (
                    <CtlButton onClick={hangUp} danger title={phase === 'ringing' ? 'Cancel the call' : 'Hang up'} label={phase === 'ringing' ? 'Cancel' : 'Hang up'}>
                      <PhoneOff className="h-5 w-5" />
                    </CtlButton>
                  )}
                </div>
              </div>
              {orient !== 'auto' && feed && feed !== frame && live && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  The customer’s camera is sending {feed} video.
                  <button className="font-semibold text-maroon hover:underline" onClick={() => sendSay(frame === 'portrait' ? 'Please hold the phone upright (portrait).' : 'Please turn the phone sideways (landscape).')}>
                    Ask them to turn the phone {frame === 'portrait' ? 'upright' : 'sideways'}
                  </button>
                  <button className="ml-auto text-slate-500 hover:underline" onClick={() => setOrient('auto')}>
                    Back to auto
                  </button>
                </div>
              )}
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${!fence ? 'bg-slate-100 text-slate-600' : fence.status === 'INSIDE' ? 'bg-emerald-50 text-emerald-800' : fence.status === 'NEAR' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
                <MapPin className="h-4 w-4 shrink-0" />
                {!geo
                  ? 'Waiting for the customer’s live location…'
                  : `Customer is ${fence?.distanceM === null || fence?.distanceM === undefined ? '?' : metres(fence.distanceM)} from the property pin (GPS ±${Math.round(geo.acc)} m) — ${fence?.status === 'INSIDE' ? 'at the property' : fence?.status === 'NEAR' ? 'near, move closer' : 'NOT at the property'}`}
              </div>
              {note && <p className="text-xs text-slate-500">{note}</p>}
            </div>
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Instructions to the customer</div>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Type an instruction for the customer" value={say} onChange={(e) => setSay(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendSay(say)} disabled={!live} />
                <button className="btn-secondary" disabled={!live} onClick={() => sendSay(say)}>
                  <MessageSquare className="h-4 w-4" /> Send
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SAY.map((q) => (
                  <button key={q} disabled={!live} onClick={() => sendSay(q)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    {q}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                The shutter takes the photo on the customer’s phone (full resolution + phone GPS + SHA-256) and puts it in the snap tray below. Frame grab is a fallback taken from the video on your side, tagged with the last tracked location.
              </p>
            </div>
          </div>
        )}
        <SnapBoard ctl={ctl} live={live} pending={pendingN} />
      </div>
    </section>
  );
}
