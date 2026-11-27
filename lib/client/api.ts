'use client';

/* Browser fetch helpers for both portals. */
import type { Application } from '@/lib/domain/types';
import type { BankOp } from '@/lib/server/applications';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) {
    if (r.status === 401 && typeof window !== 'undefined') {
      const login = window.location.pathname.startsWith('/customer') ? '/customer/login' : `/bank/login?next=${encodeURIComponent(window.location.pathname)}`;
      if (!window.location.pathname.endsWith('/login')) window.location.href = login;
    }
    throw new ApiError(j.error ?? `Request failed (${r.status})`, r.status);
  }
  return j;
}

export const bankOp = (id: string, op: BankOp) => api<{ app: Application }>(`/api/applications/${id}`, { method: 'PATCH', body: op }).then((r) => r.app);
