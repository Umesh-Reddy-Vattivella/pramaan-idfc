'use client';

/* WebRTC helpers for the bank → customer video verification call (non-trickle ICE). */

export async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const r = await fetch('/api/ice', { cache: 'no-store' });
    const j = (await r.json()) as { iceServers?: RTCIceServer[] };
    if (j.iceServers?.length) return j.iceServers;
  } catch {
    /* fall through */
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

/** Resolve once ICE gathering is complete (or after a timeout — candidates so far are used). */
export function iceGatheringDone(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(t);
      res();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const t = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/** Messages on the "ctl" data channel. */
export type BankToCustomer =
  /** Take a photo on the phone. tray = a free snap the bank places on a view later; rid is echoed back. */
  | { t: 'capture'; rid?: string; tray?: boolean; label: string; area: 'EXTERIOR' | 'INTERIOR'; floor?: string }
  | { t: 'say'; text: string }
  | { t: 'flip' };

export type Facing = 'environment' | 'user';

export type CustomerToBank =
  | { t: 'geo'; lat: number; lng: number; acc: number; at: string }
  | { t: 'photo-ok'; rid?: string; label: string; thumb?: string; lat: number; lng: number; acc: number; at: string }
  | { t: 'photo-err'; rid?: string; label: string; message: string }
  | { t: 'status'; text: string }
  /** The customer's own call controls: mic on/off and which camera is live. */
  | { t: 'media'; mic: boolean; facing: Facing };

/** mm:ss (or h:mm:ss) since a start time. */
export function callClock(startMs: number | null, nowMs: number): string {
  if (startMs === null) return '0:00';
  const s = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Grab the current video frame at full resolution → { full JPEG base64, thumb data-URL, sha256 }. */
export async function grabFrame(video: HTMLVideoElement): Promise<{ full: string; thumb: string; hash: string; width: number; height: number }> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Camera not ready');
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  cv.getContext('2d')!.drawImage(video, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Capture failed'))), 'image/jpeg', 0.85));
  const buf = await blob.arrayBuffer();
  const hash = (await sha256Hex(buf)).slice(0, 16);
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const s = Math.min(1, 360 / Math.max(w, h));
  const tc = document.createElement('canvas');
  tc.width = Math.round(w * s);
  tc.height = Math.round(h * s);
  tc.getContext('2d')!.drawImage(video, 0, 0, tc.width, tc.height);
  return { full: btoa(bin), thumb: tc.toDataURL('image/jpeg', 0.6), hash, width: w, height: h };
}
