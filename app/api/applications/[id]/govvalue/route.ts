/* Bank: adopt a row of the Telangana IGRS Market Value Search as the case's official government value.
   POST { query: IgrsRateQuery, sno, floor? } → { app }. The row is re-read on the server (cache or portal),
   so the stored rate always comes from the portal, never from the browser.
   DELETE ?basis=LAND|APARTMENT → { app } */
import { NextResponse } from 'next/server';
import type { GuidelineRef } from '@/lib/domain/types';
import { bankSession } from '@/lib/server/auth';
import { getApplication, ID_RE, logEvent, withApp } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';
import { igrsRates, type IgrsRateQuery } from '@/lib/live/igrsTelangana';
import { isTelangana, officialGuidelinePoint } from '@/lib/engines/govValue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
/** The state portal does not answer requests from outside India: run these functions in Mumbai. */
export const preferredRegion = 'bom1';

type Ctx = { params: Promise<{ id: string }> };
const FLOORS = ['ground', 'first', 'other'] as const;

export async function POST(req: Request, ctx: Ctx) {
  const s = await bankSession();
  if (!s) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    const b = await readJson<{ query: IgrsRateQuery; sno: number; floor?: (typeof FLOORS)[number] }>(req);
    const app = await getApplication(id);
    if (!app) return fail('Application not found', 404);
    if (!isTelangana(app.property)) return fail('The Telangana market value search applies only to properties in Telangana');
    const r = await igrsRates(b.query);
    const row = r.rows.find((x) => x.sno === Number(b.sno));
    if (!row) return fail('That row is no longer in the portal result — search again');
    const floor = FLOORS.includes(b.floor as 'ground') ? b.floor! : 'other';
    const printedRate = b.query.searchBy === 'L' ? row.landPerSqYd : (row.apartmentPerSqft?.[floor] ?? null);
    if (!printedRate) return fail('No rate published in that row');
    const ref: GuidelineRef = {
      source: 'IGRS_TELANGANA',
      basis: b.query.searchBy === 'L' ? 'LAND' : 'APARTMENT',
      district: r.query.districtName,
      mandal: r.query.mandalName,
      village: r.query.villageName ?? r.query.localityName,
      locality: row.locality,
      wardBlock: row.wardBlock,
      classification: row.classification ?? undefined,
      effectiveDate: row.effectiveDate ?? undefined,
      printedRate,
      printedUnit: b.query.searchBy === 'L' ? 'SQYD' : 'SQFT',
      fetchedAt: r.fetchedAt,
      url: r.url,
    };
    const res = await withApp(id, (a) => {
      const pt = officialGuidelinePoint(ref);
      a.market.points = [...a.market.points.filter((p) => p.id !== pt.id), pt];
      logEvent(a, 'BANK', `Government value adopted from IGRS Telangana: ${ref.locality} ₹${printedRate.toLocaleString('en-IN')} ${ref.printedUnit === 'SQYD' ? 'per sq yd' : 'per sqft'} (${s.user})`);
    });
    return res ? NextResponse.json({ app: res.app }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err, 502);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const s = await bankSession();
  if (!s) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  const basis = new URL(req.url).searchParams.get('basis') === 'APARTMENT' ? 'gov-apartment' : 'gov-land';
  try {
    const res = await withApp(id, (a) => {
      a.market.points = a.market.points.filter((p) => p.id !== basis);
      logEvent(a, 'BANK', 'Government value removed');
    });
    return res ? NextResponse.json({ app: res.app }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err);
  }
}
