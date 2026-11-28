/* Bank: Telangana IGRS Market Value Search (public, cached).
   GET ?list=districts | mandals&district= | villages&district=&mandal= | localities&division=&q=  → { options }
   POST IgrsRateQuery → IgrsRateResult (rows parsed in code) */
import { NextResponse } from 'next/server';
import { bankSession } from '@/lib/server/auth';
import { errorResponse, fail, readJson } from '@/lib/server/http';
import { igrsDistricts, igrsLocalities, igrsMandals, igrsRates, igrsVillages, type IgrsRateQuery } from '@/lib/live/igrsTelangana';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  const u = new URL(req.url).searchParams;
  try {
    const list = u.get('list');
    const options =
      list === 'districts'
        ? await igrsDistricts()
        : list === 'mandals'
          ? await igrsMandals(u.get('district') ?? '')
          : list === 'villages'
            ? await igrsVillages(u.get('district') ?? '', u.get('mandal') ?? '')
            : list === 'localities'
              ? await igrsLocalities(u.get('division') ?? '', u.get('q') ?? '')
              : null;
    return options ? NextResponse.json({ options }) : fail('Unknown list');
  } catch (err) {
    return errorResponse(err, 502);
  }
}

export async function POST(req: Request) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  try {
    return NextResponse.json(await igrsRates(await readJson<IgrsRateQuery>(req)));
  } catch (err) {
    return errorResponse(err, 502);
  }
}
