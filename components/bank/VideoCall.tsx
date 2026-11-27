'use client';

/**
 * Bank side of the video inspection call. The bank rings the customer inside the portal, sees their rear camera,
 * directs each shot and presses Capture. The snapshot is taken ON THE CUSTOMER'S PHONE at full resolution with
 * the phone's GPS fix. Fallback: grab the frame from the received video (tagged with the last tracked location).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, MapPin, MessageSquare, Phone, PhoneOff, ScanLine, SwitchCamera, Video } from 'lucide-react';
import type { Application } from '@/lib/domain/types';
import { EXTERIOR_SHOTS, floorNames, isBuilt } from '@/lib/domain/catalog';
import { fencePoint } from '@/lib/engines/geofence';
import { metres } from '@/lib/engines/format';
import { getIceServers, grabFrame, iceGatheringDone, type BankToCustomer, type CustomerToBank } from '@/lib/client/rtc';
import { api } from '@/lib/client/api';
import { Badge } from '@/components/ui';

type Phase = 'idle' | 'ringing' | 'connecting' | 'live' | 'ended';
interface Shot {
  label: string;
  area: 'EXTERIOR' | 'INTERIOR';
  floor?: string;
}

const QUICK_SAY = ['Please go outside and stand at the main gate.', 'Show the full front of the building.', 'Walk slowly into the next room.', 'Hold the phone steady, please.', 'Point the camera at the door so I can measure.'];

export default function VideoCall({ app, onChange }: { app: Application; onChange: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; acc: number; at: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [say, setSay] = useState('');
  const [custom, setCustom] = useState('');
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const callId = useRef<string | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const pin = app.property.lat !== null && app.property.lng !== null ? { lat: app.property.lat, lng: app.property.lng } : null;
  const shots: Shot[] = useMemo(
    () => [...EXTERIOR_SHOTS.map((l) => ({ label: l, area: 'EXTERIOR' as const })), ...(isBuilt(app.property.type) ? floorNames(app.property.floors).map((f) => ({ label: `Inside — ${f}`, area: 'INTERIOR' as const, floor: f })) : [])],
    [app.property.type, app.property.floors],
  );
  const taken = useMemo(() => new Set(app.inspection.snapshots.map((s) => s.label)), [app.inspection.snapshots]);
  const fence = geo ? fencePoint({ lat: geo.lat, lng: geo.lng, accuracyM: geo.acc }, pin, app.parcel) : null;

  const cleanup = useCallback(() => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    dc.current?.close();
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    pc.current = null;
    dc.current = null;
    mic.current = null;
  }, []);
  useEffect(() => cleanup, [cleanup]);

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
    onChangeRef.current();
  };

  const start = async () => {
    setErr(null);
    setNote(null);
    setGeo(null);
    setPhase('ringing');
    try {
      const conn = new RTCPeerConnection({ iceServers: await getIceServers() });
      pc.current = conn;
      conn.addTransceiver('video', { direction: 'recvonly' });
      try {
        mic.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.current.getTracks().forEach((t) => conn.addTrack(t, mic.current!));
      } catch {
        conn.addTransceiver('audio', { direction: 'recvonly' });
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
        if (m.t === 'photo-err') {
          setPending(null);
          setErr(`${m.label}: ${m.message}`);
        }
        if (m.t === 'photo-ok') {
          setPending(null);
          onChangeRef.current();
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
          onChangeRef.current();
        }
      }, 1500);
    } catch (e) {
      cleanup();
      setPhase('idle');
      setErr(e instanceof Error ? e.message : 'Call failed');
    }
  };

  const capture = (s: Shot) => {
    setErr(null);
    if (!send({ t: 'capture', label: s.label, area: s.area, floor: s.floor })) return setErr('Not connected to the customer’s phone.');
    setPending(s.label);
    send({ t: 'say', text: `Hold steady — capturing: ${s.label}` });
    setTimeout(() => setPending((p) => (p === s.label ? null : p)), 20000);
  };

  /** Fallback: frame grab from the received video, tagged with the last tracked location. */
  const grabHere = async (s: Shot) => {
    if (!video.current) return;
    setErr(null);
    setPending(s.label);
    try {
      const f = await grabFrame(video.current);
      await api(`/api/applications/${app.id}/snapshot`, { body: { label: s.label, area: s.area, floor: s.floor, full: f.full, thumb: f.thumb, hash: f.hash, width: f.width, height: f.height } });
      onChangeRef.current();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Capture failed');
    } finally {
      setPending(null);
    }
  };

  const sendSay = (text: string) => {
    if (text.trim() && send({ t: 'say', text: text.trim() })) setSay('');
  };

  const live = phase === 'live';
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Video className="h-4 w-4 text-maroon" /> Video inspection call
          </h2>
          <p className="text-xs text-slate-500">The customer answers in their portal with location and camera on. You direct each view and capture it from their camera.</p>
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
      {phase !== 'idle' && (
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
              <video ref={video} autoPlay playsInline className="h-full w-full object-contain" />
              {!live && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                  {phase === 'ended' ? <PhoneOff className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
                  <span className="text-sm">{phase === 'ringing' ? 'Ringing the customer’s portal…' : phase === 'connecting' ? 'Connecting video…' : 'Call ended'}</span>
                </div>
              )}
              {live && (
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> LIVE
                </span>
              )}
              {pending && (
                <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturing {pending}…
                </span>
              )}
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${!fence ? 'bg-slate-100 text-slate-600' : fence.status === 'INSIDE' ? 'bg-emerald-50 text-emerald-800' : fence.status === 'NEAR' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
              <MapPin className="h-4 w-4 shrink-0" />
              {!geo
                ? 'Waiting for the customer’s live location…'
                : `Customer is ${fence?.distanceM === null || fence?.distanceM === undefined ? '?' : metres(fence.distanceM)} from the property pin (GPS ±${Math.round(geo.acc)} m) — ${fence?.status === 'INSIDE' ? 'at the property' : fence?.status === 'NEAR' ? 'near, move closer' : 'NOT at the property'}`}
            </div>
            {note && <p className="text-xs text-slate-500">{note}</p>}
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1" placeholder="Type an instruction for the customer" value={say} onChange={(e) => setSay(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendSay(say)} disabled={!live} />
              <button className="btn-secondary" disabled={!live} onClick={() => sendSay(say)}>
                <MessageSquare className="h-4 w-4" /> Send
              </button>
              <button className="btn-secondary" disabled={!live} onClick={() => send({ t: 'flip' })} title="Switch the customer’s camera">
                <SwitchCamera className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SAY.map((q) => (
                <button key={q} disabled={!live} onClick={() => sendSay(q)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Capture from the customer’s camera</div>
            <ul className="space-y-1.5">
              {shots.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <button disabled={!live || !!pending} onClick={() => capture(s)} className="btn-secondary flex-1 justify-start py-1.5 text-xs">
                    <Camera className="h-3.5 w-3.5" /> {s.label}
                  </button>
                  {taken.has(s.label) && <Badge tone="green">taken</Badge>}
                  <button disabled={!live || !!pending} onClick={() => grabHere(s)} title="Fallback: grab this frame from the video here (uses the last tracked location)" className="btn-ghost px-2 py-1.5">
                    <ScanLine className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              <li className="flex items-center gap-2 pt-1">
                <input className="input flex-1 py-1.5 text-xs" placeholder="Other view (e.g. Kitchen, Staircase)" value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button
                  disabled={!live || !!pending || !custom.trim()}
                  onClick={() => {
                    capture({ label: custom.trim(), area: /outside|road|gate|front|rear|side|meter/i.test(custom) ? 'EXTERIOR' : 'INTERIOR' });
                    setCustom('');
                  }}
                  className="btn-secondary py-1.5 text-xs"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </li>
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">The camera button captures on the phone (full resolution + phone GPS + SHA-256). The scan button is a fallback frame grab on your side.</p>
          </div>
        </div>
      )}
    </section>
  );
}
