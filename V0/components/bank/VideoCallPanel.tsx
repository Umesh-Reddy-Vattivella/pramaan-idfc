'use client';

/**
 * Bank side of the live video verification call. The bank employee rings the customer inside the app,
 * sees their rear camera, directs each shot ("show the front gate", "now the meter") and triggers the capture.
 * The photo is taken ON THE CUSTOMER'S PHONE at full resolution with the phone's GPS fix, hashed and stored
 * in the case file. The customer's live location streams in and is checked against the pledged parcel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, MapPin, MessageSquare, Phone, PhoneOff, RefreshCw, SwitchCamera, Video } from 'lucide-react';
import type { CaseFileView } from '@/lib/types';
import { checkPhoto, GEOFENCE_BASE_TOLERANCE_M } from '@/lib/engines/geofence';
import { geofenceSpec } from '@/lib/mapGeometry';
import { SpecMap } from '@/components/workbench/maps';
import { getIceServers, iceGatheringDone, type BankToCustomer, type CustomerToBank } from '@/lib/client/rtc';

type Phase = 'idle' | 'ringing' | 'connecting' | 'live' | 'ended';
interface Shot {
  slot: string;
  label: string;
}

const EXTERIOR: Shot[] = [
  { slot: 'FRONT', label: 'Front of the building' },
  { slot: 'ROAD', label: 'Road in front' },
  { slot: 'LEFT', label: 'Left side / neighbour' },
  { slot: 'RIGHT', label: 'Right side / neighbour' },
  { slot: 'REAR', label: 'Back side' },
  { slot: 'METER', label: 'Electricity meter / name plate' },
];

export default function VideoCallPanel({ caseId, view, onCaptured }: { caseId: string; view: CaseFileView; onCaptured: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; acc: number; at: string } | null>(null);
  const [shots, setShots] = useState<{ slot: string; label: string; thumb?: string; distanceM: number; status: string; at: string }[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [say, setSay] = useState('');
  const [custom, setCustom] = useState('');
  const [peerNote, setPeerNote] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const callId = useRef<string | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const slots: Shot[] = useMemo(() => [...EXTERIOR, ...view.floors.map((f) => ({ slot: `INTERIOR:${f}`, label: `Inside — ${f}` }))], [view.floors]);
  const fence = useMemo(
    () => (geo ? checkPhoto({ id: 'live', slot: 'LIVE', label: 'live', lat: geo.lat, lng: geo.lng, accuracyM: geo.acc, takenAt: '', fileAgeMs: 0, hash: '' }, view, view.parcel) : null),
    [geo, view],
  );
  const lastTrack = view.locationTrack?.at(-1);

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
    if (dc.current?.readyState === 'open') dc.current.send(JSON.stringify(m));
  };

  const hangUp = async () => {
    const id = callId.current;
    cleanup();
    setPhase('ended');
    if (id) await fetch(`/api/bank/cases/${encodeURIComponent(caseId)}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end', callId: id }) }).catch(() => undefined);
    onCaptured();
  };

  const start = async () => {
    setErr(null);
    setShots([]);
    setGeo(null);
    setPeerNote(null);
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
        setPeerNote('Your microphone is off — the customer will see your written instructions only.');
      }
      conn.ontrack = (ev) => {
        if (video.current && ev.streams[0]) video.current.srcObject = ev.streams[0];
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === 'connected') setPhase('live');
        if (conn.connectionState === 'failed') setErr('Connection failed — both networks may block direct calls. Configure a TURN server (TURN_URLS) and retry.');
      };
      const channel = conn.createDataChannel('ctl');
      dc.current = channel;
      channel.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as CustomerToBank;
        if (m.t === 'geo') setGeo({ lat: m.lat, lng: m.lng, acc: m.acc, at: m.at });
        if (m.t === 'status') setPeerNote(m.text);
        if (m.t === 'photo-err') {
          setPending(null);
          setErr(`${m.slot}: ${m.message}`);
        }
        if (m.t === 'photo-ok') {
          setPending(null);
          const f = checkPhoto({ id: m.slot, slot: m.slot, label: m.label, lat: m.lat, lng: m.lng, accuracyM: m.acc, takenAt: m.at, fileAgeMs: 0, hash: '' }, view, view.parcel);
          setShots((s) => [{ slot: m.slot, label: m.label, thumb: m.thumb, distanceM: f.distanceM, status: f.status, at: m.at }, ...s]);
          onCaptured();
        }
      };
      await conn.setLocalDescription(await conn.createOffer());
      await iceGatheringDone(conn);
      const r = await fetch(`/api/bank/cases/${encodeURIComponent(caseId)}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', offer: JSON.stringify(conn.localDescription) }),
      });
      const j = (await r.json()) as { call?: { id: string }; error?: string };
      if (!r.ok || !j.call) throw new Error(j.error ?? 'Could not start the call');
      callId.current = j.call.id;

      poll.current = setInterval(async () => {
        const g = await fetch(`/api/bank/cases/${encodeURIComponent(caseId)}/call`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null) as { call?: { id: string; status: string; answer?: string } } | null;
        const call = g?.call;
        if (!call || call.id !== callId.current) return;
        if (call.status === 'ACTIVE' && call.answer && conn.signalingState === 'have-local-offer') {
          setPhase('connecting');
          await conn.setRemoteDescription(JSON.parse(call.answer) as RTCSessionDescriptionInit);
        }
        if (call.status === 'DECLINED' || call.status === 'MISSED' || call.status === 'ENDED') {
          setErr(call.status === 'DECLINED' ? 'The customer declined the call.' : call.status === 'MISSED' ? 'No answer — the customer may not have the portal open. Ask them to open the link and sign in.' : 'The customer ended the call.');
          cleanup();
          setPhase('ended');
          onCaptured();
        }
      }, 1500);
    } catch (e) {
      cleanup();
      setPhase('idle');
      setErr(e instanceof Error ? e.message : 'Call failed');
    }
  };

  const capture = (s: Shot) => {
    setPending(s.slot);
    setErr(null);
    send({ t: 'capture', slot: s.slot, label: s.label });
    send({ t: 'say', text: `Hold steady — capturing: ${s.label}` });
  };

  const fenceColor = !fence ? 'bg-slate-100 text-slate-600' : fence.status === 'INSIDE' ? 'bg-emerald-50 text-emerald-800' : fence.status === 'NEAR' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800';

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Video className="h-4 w-4 text-maroon" /> Live video verification
          </h2>
          <p className="text-xs text-slate-500">
            Ring the customer in the app. They allow location + camera; you direct each shot and capture it on their phone with GPS.
            {lastTrack && phase === 'idle' ? ` Last location shared ${new Date(lastTrack.at).toLocaleString('en-IN')}.` : ''}
          </p>
        </div>
        {phase === 'idle' || phase === 'ended' ? (
          <button onClick={start} className="inline-flex items-center gap-1.5 rounded-lg bg-instant px-4 py-2 text-sm font-semibold text-white">
            <Phone className="h-4 w-4" /> {phase === 'ended' ? 'Call again' : 'Call customer'}
          </button>
        ) : (
          <button onClick={hangUp} className="inline-flex items-center gap-1.5 rounded-lg bg-critical px-4 py-2 text-sm font-semibold text-white">
            <PhoneOff className="h-4 w-4" /> {phase === 'ringing' ? 'Cancel' : 'Hang up'}
          </button>
        )}
      </div>

      {phase !== 'idle' && (
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
              <video ref={video} autoPlay playsInline className="h-full w-full object-contain" />
              {phase !== 'live' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                  {phase === 'ended' ? <PhoneOff className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
                  <span className="text-sm">{phase === 'ringing' ? 'Ringing the customer…' : phase === 'connecting' ? 'Connecting video…' : 'Call ended'}</span>
                </div>
              )}
              {phase === 'live' && (
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> LIVE
                </span>
              )}
            </div>
            {peerNote && <p className="text-xs text-slate-500">{peerNote}</p>}

            {phase === 'live' && (
              <>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Direct the shot, then capture</div>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map((s) => {
                      const done = shots.some((x) => x.slot === s.slot);
                      return (
                        <button
                          key={s.slot}
                          onClick={() => capture(s)}
                          disabled={!!pending}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${done ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-maroon text-maroon hover:bg-maroon/5'}`}
                        >
                          {pending === s.slot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} {s.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other shot (e.g. crack in rear wall)" className="input flex-1 text-sm" />
                    <button disabled={!custom.trim() || !!pending} onClick={() => { capture({ slot: `CALL:${custom.trim().slice(0, 40)}`, label: custom.trim().slice(0, 60) }); setCustom(''); }} className="rounded-lg border border-maroon px-3 text-xs font-semibold text-maroon disabled:opacity-40">
                      Capture
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input value={say} onChange={(e) => setSay(e.target.value)} placeholder="Instruction shown on the customer's screen" className="input flex-1 text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && say.trim()) { send({ t: 'say', text: say.trim() }); setSay(''); } }} />
                  <button disabled={!say.trim()} onClick={() => { send({ t: 'say', text: say.trim() }); setSay(''); }} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white disabled:opacity-40">
                    <MessageSquare className="h-3.5 w-3.5" /> Send
                  </button>
                  <button onClick={() => send({ t: 'flip' })} className="rounded-lg border border-slate-300 px-3" title="Switch customer's camera">
                    <SwitchCamera className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${fenceColor}`}>
              <MapPin className="h-4 w-4" />
              {!geo
                ? phase === 'live'
                  ? 'Waiting for the customer’s location…'
                  : 'Location appears once the customer answers'
                : fence!.status === 'INSIDE'
                  ? `At the pledged property (${Math.round(fence!.distanceM)} m from pin, ±${Math.round(geo.acc)} m)`
                  : `${Math.round(fence!.distanceM).toLocaleString('en-IN')} m away from the property (±${Math.round(geo.acc)} m)`}
            </div>
            <SpecMap
              spec={geofenceSpec(
                view,
                view.parcel,
                GEOFENCE_BASE_TOLERANCE_M,
                [],
                geo ? { lat: geo.lat, lng: geo.lng } : lastTrack ? { lat: lastTrack.lat, lng: lastTrack.lng } : null,
              )}
              height={220}
            />
            {shots.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Captured on the customer&apos;s phone ({shots.length})
                  <button onClick={onCaptured} className="text-slate-400" title="Refresh case file">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {shots.map((s, i) => (
                    <figure key={`${s.slot}-${i}`} className={`overflow-hidden rounded-lg border-2 ${s.status === 'INSIDE' ? 'border-emerald-500' : s.status === 'NEAR' ? 'border-amber-400' : 'border-red-500'}`}>
                      {s.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.thumb} alt={s.label} className="aspect-[4/3] w-full object-cover" />
                      ) : (
                        <div className="aspect-[4/3] bg-slate-100" />
                      )}
                      <figcaption className="p-1 text-[10px] leading-tight text-slate-600">
                        {s.label} · {Math.round(s.distanceM)} m
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {err && <p className="border-t border-slate-100 px-5 py-2 text-sm text-critical">{err}</p>}
    </section>
  );
}
