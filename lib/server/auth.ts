/* ------------------------------------------------------------------
   Two separate logins (PRD_V3 §2). Prototype: one default password per portal
   (env BANK_DEFAULT_PASSWORD / CUSTOMER_DEFAULT_PASSWORD). Sessions are
   HMAC-signed, httpOnly cookies. Production: bank SSO + customer OTP.
   ------------------------------------------------------------------ */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const BANK_COOKIE = 'pramaan_bank';
export const CUSTOMER_COOKIE = 'pramaan_customer';
export const DEFAULT_BANK_PASSWORD = 'Bank@2026';
export const DEFAULT_CUSTOMER_PASSWORD = 'Customer@2026';
export const bankPassword = () => process.env.BANK_DEFAULT_PASSWORD || DEFAULT_BANK_PASSWORD;
export const customerPassword = () => process.env.CUSTOMER_DEFAULT_PASSWORD || DEFAULT_CUSTOMER_PASSWORD;
/** Whether the login screens may display the default password (only when not overridden). */
export const showDefaultPasswords = () => !process.env.BANK_DEFAULT_PASSWORD && !process.env.CUSTOMER_DEFAULT_PASSWORD;

const SECRET = process.env.PORTAL_SESSION_SECRET ?? 'pramaan-v3-prototype-session-secret';
export const SESSION_TTL_S = 12 * 3600;

export interface BankSession {
  role: 'BANK';
  user: string;
  exp: number;
}
export interface CustomerSession {
  role: 'CUSTOMER';
  appId: string;
  exp: number;
}

function sign(payload: object): string {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}`;
}

function verify<T extends { exp: number }>(token: string | undefined): T | null {
  if (!token) return null;
  const [p, mac] = token.split('.');
  if (!p || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(createHmac('sha256', SECRET).update(p).digest('base64url'));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const v = JSON.parse(Buffer.from(p, 'base64url').toString()) as T;
    return v.exp > Date.now() ? v : null;
  } catch {
    return null;
  }
}

export function passwordMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const bankToken = (user: string) => sign({ role: 'BANK', user, exp: Date.now() + SESSION_TTL_S * 1000 } satisfies BankSession);
export const customerToken = (appId: string) => sign({ role: 'CUSTOMER', appId, exp: Date.now() + SESSION_TTL_S * 1000 } satisfies CustomerSession);

export async function bankSession(): Promise<BankSession | null> {
  const s = verify<BankSession>((await cookies()).get(BANK_COOKIE)?.value);
  return s?.role === 'BANK' ? s : null;
}

export async function customerSession(): Promise<CustomerSession | null> {
  const s = verify<CustomerSession>((await cookies()).get(CUSTOMER_COOKIE)?.value);
  return s?.role === 'CUSTOMER' ? s : null;
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_S,
};
