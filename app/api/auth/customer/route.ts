/* Customer sign-in. POST { applicationNo, password } · GET → { ref } · DELETE → sign out. */
import { NextResponse } from 'next/server';
import { cookieOptions, CUSTOMER_COOKIE, customerPassword, customerSession, customerToken, passwordMatches } from '@/lib/server/auth';
import { findByRef, logEvent, withApp } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await customerSession();
  return s ? NextResponse.json({ appId: s.appId }) : fail('Not signed in', 401);
}

export async function POST(req: Request) {
  try {
    const b = await readJson<{ applicationNo?: string; password?: string }>(req);
    const ref = String(b.applicationNo ?? '').trim().toUpperCase();
    if (!/^PRM-\d{4}-\d{4}$/.test(ref)) return fail('Enter the application number from your bank, e.g. PRM-2611-4821');
    const app = await findByRef(ref);
    if (!app) return fail('We could not find this application number', 404);
    if (!passwordMatches(String(b.password ?? ''), customerPassword())) return fail('Incorrect password', 401);
    await withApp(app.id, (a) => logEvent(a, 'CUSTOMER', 'Customer signed in to the portal'));
    const res = NextResponse.json({ ok: true });
    res.cookies.set(CUSTOMER_COOKIE, customerToken(app.id), cookieOptions);
    return res;
  } catch (err) {
    return errorResponse(err, 502);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CUSTOMER_COOKIE);
  return res;
}
