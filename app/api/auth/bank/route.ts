/* Bank staff sign-in. POST { userId, password } · GET → { user } · DELETE → sign out. */
import { NextResponse } from 'next/server';
import { BANK_COOKIE, bankPassword, bankSession, bankToken, cookieOptions, passwordMatches } from '@/lib/server/auth';
import { fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await bankSession();
  return s ? NextResponse.json({ user: s.user }) : fail('Not signed in', 401);
}

export async function POST(req: Request) {
  const b = await readJson<{ userId?: string; password?: string }>(req).catch(() => ({}) as { userId?: string; password?: string });
  const user = String(b.userId ?? '').trim().slice(0, 40);
  if (!/^[A-Za-z0-9._@-]{2,40}$/.test(user)) return fail('Enter your employee ID');
  if (!passwordMatches(String(b.password ?? ''), bankPassword())) return fail('Incorrect password', 401);
  const res = NextResponse.json({ user });
  res.cookies.set(BANK_COOKIE, bankToken(user), cookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(BANK_COOKIE);
  return res;
}
