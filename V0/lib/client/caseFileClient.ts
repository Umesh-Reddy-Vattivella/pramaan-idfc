'use client';

/* Bank-side access to the shared case file + folding it into the valuation case. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseFileInit, CaseFileView, DocRequest, LosDocStatus, LosDocument, PropertyCase } from '@/lib/types';
import type { BankOp } from '@/lib/server/caseFiles';
import { applySubmission } from '@/lib/data/customerLink';
import type { PreparedUpload } from './files';

async function json<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export const bankApi = {
  create: (init: CaseFileInit) =>
    fetch('/api/bank/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ init }) }).then((r) =>
      json<{ view: CaseFileView; accessCode: string; storeMode: 'kv' | 'memory' | 'supabase' }>(r),
    ),
  get: (caseId: string) => fetch(`/api/bank/cases/${encodeURIComponent(caseId)}`, { cache: 'no-store' }).then((r) => json<{ view: CaseFileView; storeMode: 'kv' | 'memory' | 'supabase' }>(r)),
  op: (caseId: string, op: BankOp) =>
    fetch(`/api/bank/cases/${encodeURIComponent(caseId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) }).then((r) => json<{ view: CaseFileView }>(r)),
  upload: (caseId: string, docId: string, f: PreparedUpload) =>
    fetch(`/api/bank/cases/${encodeURIComponent(caseId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload: { docId, ...f } }),
    }).then((r) => json<{ view: CaseFileView }>(r)),
};

export const customerPortalUrl = (origin: string, token: string) => `${origin}/c/${token}`;

const STATUS_MAP: Record<DocRequest['status'], LosDocStatus> = {
  VERIFIED: 'ON_FILE',
  UPLOADED: 'UPLOADED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  REQUESTED: 'PENDING',
  REJECTED: 'PENDING',
};

/** Case-file checklist → the LOS document list the sanity engine reads. */
export function checklistToLos(view: CaseFileView): LosDocument[] {
  return view.checklist.map((d) => ({
    type: d.type,
    label: d.label,
    mandatory: d.mandatory,
    status: STATUS_MAP[d.status],
    fileName: d.uploads.at(-1)?.fileName,
  }));
}

/** Patch for the valuation case when the shared case file changed. */
export function syncPatch(c: PropertyCase, view: CaseFileView): Partial<PropertyCase> | null {
  const los = checklistToLos(view);
  const losChanged = JSON.stringify(los) !== JSON.stringify(c.los?.documents ?? null);
  const captureNew = !!view.capture && view.capture.submittedAt !== c.customerLink?.submission?.submittedAt;
  if (!losChanged && !captureNew) return null;
  const base: Partial<PropertyCase> = {
    los: {
      loanAppNo: view.caseRef,
      product: 'LAP',
      borrowerName: view.borrowerName,
      propertyAddress: view.propertyAddress,
      propertyType: view.propertyType,
      kycStatus: 'Completed at onboarding (CKYC / Aadhaar e-KYC) — not repeated',
      sourcedBy: 'Bank portal',
      documents: los,
    },
  };
  if (!captureNew) return base;
  const withDocs = { ...c, ...base };
  const link = c.customerLink ?? { token: view.token, url: '', sentAt: view.createdAt, status: 'SENT' as const };
  return { ...base, ...applySubmission(withDocs, link, { ...view.capture!, documents: los }) };
}

/** Poll the shared case file every few seconds (bank portal). */
export function useBankCaseFile(caseId: string | undefined, enabled = true) {
  const [view, setView] = useState<CaseFileView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');
  const [storeMode, setStoreMode] = useState<'kv' | 'memory' | 'supabase' | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!caseId) return;
    try {
      const j = await bankApi.get(caseId);
      if (!alive.current) return;
      setView(j.view);
      setStoreMode(j.storeMode);
      setState('ready');
    } catch (e) {
      if (!alive.current) return;
      setState(e instanceof Error && e.message === 'No case file' ? 'none' : 'error');
    }
  }, [caseId]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [refresh, enabled]);

  return { view, setView, state, storeMode, refresh };
}
