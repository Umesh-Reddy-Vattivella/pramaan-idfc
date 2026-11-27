/* Bank: GET → { app } (full record) · PATCH { op, ... } → { app } (see BankOp in lib/server/applications.ts) */
import { NextResponse } from 'next/server';
import { bankSession } from '@/lib/server/auth';
import { applyBankOp, getApplication, ID_RE, withApp, type BankOp } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    const app = await getApplication(id);
    return app ? NextResponse.json({ app }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err, 502);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const s = await bankSession();
  if (!s) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    const op = await readJson<BankOp>(req);
    const res = await withApp(id, (a) => applyBankOp(a, op, s.user));
    return res ? NextResponse.json({ app: res.app }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err);
  }
}
