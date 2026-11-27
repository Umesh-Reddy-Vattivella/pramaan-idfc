/* Bank: GET → { applications } (dashboard list) · POST { borrower, property } → { app } */
import { NextResponse } from 'next/server';
import type { Borrower, PropertyFacts } from '@/lib/domain/types';
import { DEFAULT_STRUCTURE, DEFAULT_USAGE, PROPERTY_TYPE_LABEL } from '@/lib/domain/catalog';
import { bankSession } from '@/lib/server/auth';
import { createApplication, listApplications, sanitizeProperty } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';
import { storeMode } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await bankSession())) return fail('Please sign in', 401);
  try {
    return NextResponse.json({ applications: await listApplications(), storeMode });
  } catch (err) {
    return errorResponse(err, 502);
  }
}

export async function POST(req: Request) {
  const s = await bankSession();
  if (!s) return fail('Please sign in', 401);
  try {
    const b = await readJson<{ borrower?: Partial<Borrower>; property?: Partial<PropertyFacts> }>(req);
    const name = String(b.borrower?.name ?? '').trim().slice(0, 120);
    const mobile = String(b.borrower?.mobile ?? '').replace(/\D/g, '').slice(-10);
    if (name.length < 2) return fail('Enter the borrower’s name');
    if (!/^[6-9]\d{9}$/.test(mobile)) return fail('Enter a valid 10-digit Indian mobile number');
    const type = b.property?.type;
    if (!type || !(type in PROPERTY_TYPE_LABEL)) return fail('Choose the property type');
    const p = sanitizeProperty(b.property ?? {});
    if (!p.address || p.lat == null || p.lng == null) return fail('Pick the property address on the map');
    const property: PropertyFacts = {
      type,
      usage: p.usage ?? DEFAULT_USAGE[type],
      structure: p.structure ?? DEFAULT_STRUCTURE[type],
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      locality: p.locality,
      city: p.city,
      state: p.state,
      plotAreaSqft: p.plotAreaSqft ?? null,
      builtUpSqft: p.builtUpSqft ?? null,
      floors: p.floors ?? (type === 'PLOT' ? null : 1),
      ageYears: p.ageYears ?? null,
      constructionRate: p.constructionRate ?? null,
    };
    const app = await createApplication({ borrower: { name, mobile, losRef: String(b.borrower?.losRef ?? '').trim().slice(0, 60) || undefined }, property }, s.user);
    return NextResponse.json({ app });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
