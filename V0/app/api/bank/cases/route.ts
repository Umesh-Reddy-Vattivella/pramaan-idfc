/* POST /api/bank/cases { init } → creates the shared case file. Returns { view, accessCode }.
   Prototype note: bank endpoints are not behind staff SSO here; in production they sit behind the bank's IdP. */
import { NextResponse } from 'next/server';
import type { CaseFileInit } from '@/lib/types';
import { createCaseFile, ID_RE, toView } from '@/lib/server/caseFiles';
import { normMobile } from '@/lib/server/session';
import { storeMode } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { init } = (await req.json()) as { init?: CaseFileInit };
    if (!init || !ID_RE.test(init.caseId) || !init.caseRef || !Number.isFinite(init.lat) || !Number.isFinite(init.lng) || !Array.isArray(init.checklist)) {
      return NextResponse.json({ error: 'Invalid case' }, { status: 400 });
    }
    if (normMobile(init.mobile).length !== 10) return NextResponse.json({ error: "Enter the borrower's 10-digit mobile number" }, { status: 400 });
    const { record, accessCode } = await createCaseFile(init);
    return NextResponse.json({ view: toView(record), accessCode, storeMode });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not create case' }, { status: 502 });
  }
}
