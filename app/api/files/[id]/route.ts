/* GET /api/files/:id — streams an uploaded document or snapshot to a signed-in bank user,
   or to the signed-in customer who owns the application. */
import { bankSession, customerSession } from '@/lib/server/auth';
import { readFile } from '@/lib/server/applications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Bad id', { status: 400 });
  const [bank, cust] = await Promise.all([bankSession(), customerSession()]);
  if (!bank && !cust) return new Response('Please sign in', { status: 401 });
  const f = await readFile(id);
  if (!f) return new Response('Not found', { status: 404 });
  if (!bank && cust && cust.appId !== f.caseId) return new Response('Forbidden', { status: 403 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': `inline; filename="${f.fileName.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
