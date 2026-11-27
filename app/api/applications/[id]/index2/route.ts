/* Bank: POST { fileName, mime, dataBase64 } → { fileId, fileName, draft?, warning? }
   Stores an Index II printout / PDF with the case and (if Gemini is configured) returns the fields copied from it.
   Nothing is added to the market evidence here: the valuer reviews the draft, then adds it with op 'addPoint'. */
import { NextResponse } from 'next/server';
import { bankSession } from '@/lib/server/auth';
import { getApplication, ID_RE, storeUpload } from '@/lib/server/applications';
import { errorResponse, fail, readJson } from '@/lib/server/http';
import { readIndexII } from '@/lib/server/indexII';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await bankSession())) return fail('Please sign in', 401);
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return fail('Bad id');
  try {
    const b = await readJson<{ fileName?: string; mime?: string; dataBase64?: string }>(req);
    if (!b.dataBase64 || !b.mime) return fail('No file');
    if (!(await getApplication(id))) return fail('Application not found', 404);
    const f = await storeUpload(id, { docKey: 'INDEX_II', fileName: b.fileName || 'index-ii', mime: b.mime, dataBase64: b.dataBase64 }, 'BANK');
    const key = process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ fileId: f.fileId, fileName: f.name, warning: 'Gemini is not configured (GEMINI_API_KEY) — type the fields from the document.' });
    try {
      const draft = await readIndexII(key, f.mime, b.dataBase64);
      return NextResponse.json({ fileId: f.fileId, fileName: f.name, draft });
    } catch (err) {
      return NextResponse.json({ fileId: f.fileId, fileName: f.name, warning: `Could not read the document automatically (${err instanceof Error ? err.message : 'extraction failed'}) — type the fields from it.` });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
