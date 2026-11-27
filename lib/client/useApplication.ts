'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Application } from '@/lib/domain/types';
import type { BankOp } from '@/lib/server/applications';
import { api, bankOp } from './api';

/** Loads one application for the bank workspace and polls for changes made by the customer. */
export function useApplication(id: string) {
  const [app, setApp] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rev = useRef(0);

  const accept = useCallback((a: Application) => {
    if (a.rev >= rev.current) {
      rev.current = a.rev;
      setApp(a);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const j = await api<{ app: Application }>(`/api/applications/${id}`);
      accept(j.app);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    }
  }, [id, accept]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 6000);
    return () => clearInterval(t);
  }, [refresh]);

  /** Runs a bank operation; returns false (and sets error) on failure. */
  const run = useCallback(
    async (op: BankOp): Promise<boolean> => {
      setBusy(true);
      try {
        accept(await bankOp(id, op));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [id, accept],
  );

  return { app, error, setError, busy, run, refresh, accept };
}

export type AppCtl = ReturnType<typeof useApplication>;
