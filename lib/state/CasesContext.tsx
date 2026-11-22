'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

  useEffect(() => {
    const stored = loadFromStorage();
    if (stored) setCases(stored);
    setHydrated(true);
  }, []);

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
  }, []);

  const resetDemo = useCallback(() => setCases(SEED_CASES), []);

  const value = useMemo<CasesContextValue>(
    () => ({ cases, evaluations, hydrated, getCase, getEvaluation, upsertCase, updateCase, removeCase, resetDemo }),
    [cases, evaluations, hydrated, getCase, getEvaluation, upsertCase, updateCase, removeCase, resetDemo],
  );

  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>;
}

export function useCases(): CasesContextValue {
  const ctx = useContext(CasesContext);
  if (!ctx) throw new Error('useCases must be used within <CasesProvider>');
  return ctx;
}
