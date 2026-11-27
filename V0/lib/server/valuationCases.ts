/* Bank valuation cases (PropertyCase) persisted server-side, so they survive across browsers / devices. */
import type { PropertyCase } from '@/lib/types';
import { kvDel, kvGetJson, kvSetJson } from './store';

const INDEX = 'pramaan:vcases';
const key = (id: string) => `pramaan:vcase:${id}`;
export const MAX_CASE_BYTES = 2_000_000;

export async function listCases(): Promise<PropertyCase[]> {
  const ids = (await kvGetJson<string[]>(INDEX)) ?? [];
  const all = await Promise.all(ids.map((id) => kvGetJson<PropertyCase>(key(id))));
  return all.filter((c): c is PropertyCase => !!c);
}

export async function saveCase(c: PropertyCase): Promise<void> {
  await kvSetJson(key(c.id), c);
  const ids = (await kvGetJson<string[]>(INDEX)) ?? [];
  if (!ids.includes(c.id)) await kvSetJson(INDEX, [...ids, c.id]);
}

export async function deleteCase(id: string): Promise<void> {
  await kvDel(key(id));
  const ids = (await kvGetJson<string[]>(INDEX)) ?? [];
  await kvSetJson(INDEX, ids.filter((x) => x !== id));
}
