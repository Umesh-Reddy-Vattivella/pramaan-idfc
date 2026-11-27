'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PropertyCase } from '@/lib/types';
import { SEED_CASES, SEED_VERSION } from '@/lib/data/seedCases';
import { evaluateCase, type EvidencePack } from '@/lib/engines/evaluateCase';

const STORAGE_KEY = 'pramaan.cases';

interface StoredState {
  seedVersion: number;
  cases: PropertyCase[];
}

interface CasesContextValue {
  cases: PropertyCase[];
  evaluations: Record<string, EvidencePack>;
  /** true once localStorage has been read (avoids SSR/client mismatch flashes). */
  hydrated: boolean;
  /** Where bank-portal cases are persisted on the server ('supabase' | 'kv' | 'memory'), null until known / offline. */
  serverStore: string | null;
  getCase: (id: string) => PropertyCase | undefined;
  getEvaluation: (id: string) => EvidencePack | undefined;
  /** Insert or replace a case by id. */
  upsertCase: (c: PropertyCase) => void;
  /** Shallow-patch an existing case. */
  updateCase: (id: string, patch: Partial<PropertyCase>) => void;
  /** Remove a non-seed case. */
  removeCase: (id: string) => void;
  /** Restore the 4 golden seed cases and discard all local changes. */
  resetDemo: () => void;
}

const CasesContext = createContext<CasesContextValue | null>(null);

function loadFromStorage(): PropertyCase[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    // Seed data changed since this browser last saved → start fresh from the golden seeds.
    if (parsed.seedVersion !== SEED_VERSION || !Array.isArray(parsed.cases)) return null;
    return parsed.cases;
  } catch {
    return null;
  }
}

export function CasesProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<PropertyCase[]>(SEED_CASES);
  const [hydrated, setHydrated] = useState(false);

  const [serverStore, setServerStore] = useState<string | null>(null);
  const synced = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const stored = loadFromStorage();
    if (stored) setCases(stored);
    setHydrated(true);
    // Server is the source of truth for cases created in the bank portal (database).
    fetch('/api/bank/valuation-cases', { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json()) as { cases?: PropertyCase[]; storeMode?: string };
        if (!r.ok || !j.cases) return;
        setServerStore(j.storeMode ?? null);
        for (const c of j.cases) synced.current.set(c.id, JSON.stringify(c));
        setCases((prev) => {
          const byId = new Map(prev.map((c) => [c.id, c]));
          for (const c of j.cases!) byId.set(c.id, c);
          return [...byId.values()];
        });
      })
      .catch(() => undefined);
  }, []);

  // Push changed non-example cases to the server (debounced).
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      for (const c of cases) {
        if (c.origin === 'SEED') continue;
        const js = JSON.stringify(c);
        if (synced.current.get(c.id) === js) continue;
        synced.current.set(c.id, js);
        fetch('/api/bank/valuation-cases', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case: c }) }).catch(() => synced.current.delete(c.id));
      }
    }, 800);
    return () => clearTimeout(t);
  }, [cases, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const state: StoredState = { seedVersion: SEED_VERSION, cases };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full / disabled — keep in-memory state */
    }
  }, [cases, hydrated]);

  const evaluations = useMemo(() => {
    const out: Record<string, EvidencePack> = {};
    for (const c of cases) out[c.id] = evaluateCase(c);
    return out;
  }, [cases]);

  const getCase = useCallback((id: string) => cases.find((c) => c.id === id), [cases]);
  const getEvaluation = useCallback((id: string) => evaluations[id], [evaluations]);

  const upsertCase = useCallback((c: PropertyCase) => {
    setCases((prev) => {
      const idx = prev.findIndex((x) => x.id === c.id);
      if (idx === -1) return [...prev, c];
      const next = [...prev];
      next[idx] = c;
      return next;
    });
  }, []);

  const updateCase = useCallback((id: string, patch: Partial<PropertyCase>) => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)));
  }, []);

  const removeCase = useCallback((id: string) => {
    setCases((prev) => prev.filter((c) => c.id !== id || c.origin === 'SEED'));
    synced.current.delete(id);
    fetch(`/api/bank/valuation-cases?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  }, []);

  const resetDemo = useCallback(() => setCases(SEED_CASES), []);

  const value = useMemo<CasesContextValue>(
    () => ({ cases, evaluations, hydrated, serverStore, getCase, getEvaluation, upsertCase, updateCase, removeCase, resetDemo }),
    [cases, evaluations, hydrated, serverStore, getCase, getEvaluation, upsertCase, updateCase, removeCase, resetDemo],
  );

  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>;
}

export function useCases(): CasesContextValue {
  const ctx = useContext(CasesContext);
  if (!ctx) throw new Error('useCases must be used within <CasesProvider>');
  return ctx;
}
