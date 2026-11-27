/* Bank-side frame grab (fallback when the phone cannot capture): POST { label, area, floor?, full, thumb, hash, width, height }.
   Tagged with the customer's latest tracked location if it is under 2 minutes old; marked BANK_FRAME. */
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Snapshot } from '@/lib/domain/types';
import { bankSession } from '@/lib/server/auth';
import { addSnapshot, getApplication, ID_RE, storeSnapshotFile, withApp } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    const b = await readJson<{ label?: string; area?: string; floor?: string; full?: string; thumb?: string; hash?: string; width?: number; height?: number }>(req);
    if (!b.full) return fail('No image');
    const app = await getApplication(id);
    if (!app) return fail('Application not found', 404);
    const fileId = await storeSnapshotFile(id, b.full);
    const last = app.inspection.track.at(-1);
    const fresh = last && Date.now() - Date.parse(last.at) < 120_000 ? last : null;
    const snap: Snapshot = {
      id: randomUUID(),
      label: String(b.label ?? 'Snapshot').slice(0, 80),
      area: b.area === 'INTERIOR' ? 'INTERIOR' : 'EXTERIOR',
      floor: b.floor ? String(b.floor).slice(0, 40) : undefined,
      fileId,
      thumb: typeof b.thumb === 'string' && b.thumb.length < 120_000 ? b.thumb : '',
      lat: fresh?.lat ?? null,
      lng: fresh?.lng ?? null,
      accuracyM: fresh?.acc ?? null,
      takenAt: new Date().toISOString(),
      hash: String(b.hash ?? '').slice(0, 64),
      source: 'BANK_FRAME',
      width: Number(b.width) || undefined,
      height: Number(b.height) || undefined,
    };
    const res = await withApp(id, (a) => addSnapshot(a, snap));
    return res ? NextResponse.json({ app: res.app, snapshot: snap }) : fail('Application not found', 404);
  } catch (err) {
    return errorResponse(err);
  }
}
