/* Customer-portal authentication: OTP / access code → signed, httpOnly session cookie. */
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'pramaan_portal';
const SECRET = process.env.PORTAL_SESSION_SECRET ?? 'pramaan-demo-session-secret-change-me';
export const SESSION_TTL_MS = 12 * 3600 * 1000;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** No SMS gateway configured → the OTP is returned to the screen (demo mode). */
export const smsConfigured = !!process.env.SMS_GATEWAY_URL;

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function sha(s: string): string {
  return createHash('sha256').update(`${SECRET}|${s}`).digest('hex');
}

export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function newAccessCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
}

export function signSession(caseId: string): string {
  const payload = b64u(JSON.stringify({ caseId, exp: Date.now() + SESSION_TTL_MS }));
  const mac = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function readSession(cookie: string | undefined): { caseId: string } | null {
  if (!cookie) return null;
  const [payload, mac] = cookie.split('.');
  if (!payload || !mac) return null;
  const expect = createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { caseId: string; exp: number };
    return p.exp > Date.now() ? { caseId: p.caseId } : null;
  } catch {
    return null;
  }
}

export const normMobile = (m: string) => m.replace(/\D/g, '').slice(-10);
export const maskMobile = (m: string) => {
  const d = normMobile(m);
  return d.length >= 4 ? `XXXXXX${d.slice(-4)}` : 'XXXXXXXXXX';
};
