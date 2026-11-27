/* Small helpers shared by the API routes. */
import { NextResponse } from 'next/server';

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export function errorResponse(err: unknown, status = 400) {
  return fail(err instanceof Error ? err.message : 'Request failed', status);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error('Expected a JSON body');
  }
}
