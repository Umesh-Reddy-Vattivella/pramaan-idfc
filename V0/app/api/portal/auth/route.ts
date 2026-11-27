/*
  Customer sign-in.
  POST { action: 'resolve', token? , caseRef? }            → { caseRef, mobileMasked, borrowerFirstName }
  POST { action: 'sendOtp', token? , caseRef? }            → { sent, demoOtp? }  (demoOtp only when no SMS gateway)
  POST { action: 'verifyOtp', token?, caseRef?, otp }      → sets session cookie
  POST { action: 'code', token?, caseRef?, accessCode }    → sets session cookie
  DELETE                                                   → signs out
*/
import { NextResponse } from 'next/server';
import { checkAccessCode, getRecord, noteLogin, resolveCaseId, withCase, type CaseFileRecord } from '@/lib/server/caseFiles';
import { newOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS, sha, SESSION_COOKIE, SESSION_TTL_MS, signSession, smsConfigured } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

function withSession(r: CaseFileRecord) {
  const res = NextResponse.json({ ok: true, caseRef: r.caseRef });
  res.cookies.set(SESSION_COOKIE, signSession(r.caseId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}

/** Generic SMS gateway hook (MSG91 / Twilio / Gupshup adapter behind SMS_GATEWAY_URL). */
async function sendSms(to: string, text: string) {
  const r = await fetch(process.env.SMS_GATEWAY_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_GATEWAY_TOKEN ?? ''}` },
    body: JSON.stringify({ to: `+91${to}`, text }),
  });
  if (!r.ok) throw new Error('SMS could not be sent');
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { action?: string; token?: string; caseRef?: string; otp?: string; accessCode?: string };
    const caseId = await resolveCaseId({ token: b.token, caseRef: b.caseRef });
    const r = caseId ? await getRecord(caseId) : null;
    if (!r) return fail('We could not find this application. Check the reference number or the link from your bank.', 404);

    if (b.action === 'resolve') {
      return NextResponse.json({ caseRef: r.caseRef, mobileMasked: r.mobileMasked, borrowerFirstName: r.borrowerName.split(' ')[0], smsConfigured });
    }

    if (b.action === 'sendOtp') {
      const otp = newOtp();
      await withCase(r.caseId, (x) => {
        x.otp = { hash: sha(`otp|${x.caseId}|${otp}`), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 };
      });
      if (smsConfigured) {
        await sendSms(r.mobile, `${otp} is your IDFC FIRST Bank property-valuation login code. Valid 5 minutes. Do not share it.`);
        return NextResponse.json({ sent: true, mobileMasked: r.mobileMasked });
      }
      return NextResponse.json({ sent: true, mobileMasked: r.mobileMasked, demoOtp: otp });
    }

    if (b.action === 'verifyOtp') {
      const o = r.otp;
      if (!o || o.expiresAt < Date.now()) return fail('The code has expired. Request a new one.');
      if (o.attempts >= OTP_MAX_ATTEMPTS) return fail('Too many attempts. Request a new code.', 429);
      if (sha(`otp|${r.caseId}|${(b.otp ?? '').trim()}`) !== o.hash) {
        await withCase(r.caseId, (x) => {
          if (x.otp) x.otp.attempts++;
        });
        o.attempts++;
        return fail(`Incorrect code. ${OTP_MAX_ATTEMPTS - o.attempts} attempt(s) left.`);
      }
      await withCase(r.caseId, (x) => {
        x.otp = undefined;
        noteLogin(x, 'OTP');
      });
      return withSession(r);
    }

    if (b.action === 'code') {
      if (!b.accessCode || !checkAccessCode(r, b.accessCode)) return fail('Incorrect access code.');
      await withCase(r.caseId, (x) => noteLogin(x, 'access code'));
      return withSession(r);
    }
    return fail('Unknown action');
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Sign-in failed', 502);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
