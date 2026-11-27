/* GET /api/files/:id — streams an uploaded document. The id is an unguessable UUID (capability URL);
   a signed-in customer can only open files of their own case. */
import { cookies } from 'next/headers';
import { getBlob } from '@/lib/server/caseFiles';
import { readSession, SESSION_COOKIE } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Bad id', { status: 400 });
  const b = await getBlob(id);
  if (!b) return new Response('Not found', { status: 404 });
  const s = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (s && s.caseId !== b.caseId) return new Response('Forbidden', { status: 403 });
  return new Response(new Uint8Array(b.data), {
    headers: {
      'Content-Type': b.mime,
      'Content-Disposition': `inline; filename="${b.fileName.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
