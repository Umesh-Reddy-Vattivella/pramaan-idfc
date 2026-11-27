'use client';

/**
 * New case (bank portal): ① borrower & property → ② suggested document checklist, each document
 * uploaded on its own by whichever side has it → ③ share customer-portal access (OTP / access code).
 */
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Building, Building2, Check, Crosshair, Factory, Home, Loader2, MapPin, Store, TreePine } from 'lucide-react';
import type { CaseFileView, PropertyKind } from '@/lib/types';
import { useCases } from '@/lib/state/CasesContext';
import { buildNewCase } from '@/lib/data/newCase';
import { caseFileInitFrom, newCaseRef } from '@/lib/data/caseFileBuild';
import { KIND_USAGE, PROPERTY_KIND_LABEL, suggestDocuments } from '@/lib/data/docCatalog';
import { residualLife, STRUCTURE_LABEL, type StructureType } from '@/lib/engines/valuation';
import { bankApi, syncPatch } from '@/lib/client/caseFileClient';
import AddressAutocomplete, { type PickedPlace } from '@/components/AddressAutocomplete';
import { PinMap } from '@/components/workbench/maps';
import DocumentChecklist from '@/components/bank/DocumentChecklist';
import CustomerAccessPanel from '@/components/bank/CustomerAccessPanel';

const KIND_ICON: Record<PropertyKind, typeof Home> = { HOUSE: Home, FLAT: Building, COMMERCIAL: Store, INDUSTRIAL: Factory, PLOT: TreePine };

interface Form {
  borrowerName: string;
  mobile: string;
  kind: PropertyKind;
  address: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  plotAreaSqft: number;
  floorCount: number;
  approvedSqftPerFloor: number;
  builtSqftPerFloor: number;
  ageYears: number;
  structure: StructureType;
  constructionRatePerSqft: number;
}

const EMPTY: Form = {
  borrowerName: '',
  mobile: '',
  kind: 'HOUSE',
  address: '',
  city: '',
  state: '',
  lat: null,
  lng: null,
  plotAreaSqft: 0,
  floorCount: 1,
  approvedSqftPerFloor: 0,
  builtSqftPerFloor: 0,
  ageYears: 0,
  structure: 'RCC_FRAMED',
  constructionRatePerSqft: 0,
};

export default function NewCasePage() {
  const { upsertCase, getCase, updateCase } = useCases();
  const [step, setStep] = useState(1);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ caseId: string; view: CaseFileView; accessCode: string; storeMode: 'kv' | 'memory' | 'supabase' } | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const hasPin = f.lat !== null && f.lng !== null;
  const mobileOk = f.mobile.replace(/\D/g, '').length === 10;
  const canCreate = hasPin && mobileOk && f.borrowerName.trim().length > 1 && f.plotAreaSqft > 0;
  const preview = suggestDocuments(f.kind, f.state);

  const reverse = async (lat: number, lng: number) => {
    setF((s) => ({ ...s, lat, lng }));
    try {
      const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      const j = (await r.json()) as { result?: PickedPlace | null };
      if (j.result) setF((s) => ({ ...s, address: s.address || j.result!.displayName, city: j.result!.city ?? s.city, state: j.result!.state ?? s.state }));
    } catch {
      /* keep pin */
    }
  };

  const here = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        reverse(p.coords.latitude, p.coords.longitude);
      },
      () => {
        setLocating(false);
        setErr('Location unavailable — search the address instead.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setErr(null);
    try {
      const caseId = `los-${Date.now().toString(36)}`;
      const caseRef = newCaseRef();
      const plot = f.kind === 'PLOT';
      const c = buildNewCase(caseId, caseRef, {
        borrowerName: f.borrowerName.trim(),
        address: f.address,
        city: f.city,
        state: f.state,
        lat: f.lat!,
        lng: f.lng!,
        usage: KIND_USAGE[f.kind],
        plotAreaSqft: f.plotAreaSqft,
        floorCount: plot ? 0 : f.kind === 'FLAT' ? 1 : f.floorCount,
        approvedSqftPerFloor: f.approvedSqftPerFloor,
        builtSqftPerFloor: f.builtSqftPerFloor,
        hasApprovedPlan: !plot,
        ageYears: plot ? 0 : f.ageYears,
        structure: f.structure,
        title: PROPERTY_KIND_LABEL[f.kind],
        constructionRatePerSqft: plot ? 0 : f.constructionRatePerSqft,
      });
      const init = caseFileInitFrom(c, { caseRef, mobile: f.mobile, kind: f.kind, checklist: suggestDocuments(f.kind, f.state), address: f.address });
      const r = await bankApi.create(init);
      const withPortal = { ...c, portal: { caseRef, token: r.view.token, accessCode: r.accessCode, mobileMasked: r.view.mobileMasked, createdAt: r.view.createdAt } };
      upsertCase({ ...withPortal, ...(syncPatch(withPortal, r.view) ?? {}) });
      setCreated({ caseId, view: r.view, accessCode: r.accessCode, storeMode: r.storeMode });
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the case');
    } finally {
      setBusy(false);
    }
  };

  const onView = (v: CaseFileView) => {
    if (!created) return;
    setCreated({ ...created, view: v });
    const c = getCase(created.caseId);
    const p = c && syncPatch(c, v);
    if (p) updateCase(created.caseId, p);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">New technical valuation case</h1>
        <p className="text-sm text-slate-500">Open the case, collect documents from whichever side has them, and give the customer their own portal for the rest.</p>
      </div>

      <ol className="grid grid-cols-3 gap-2">
        {['Borrower & property', 'Documents', 'Customer access'].map((t, i) => (
          <li key={t} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${step === i + 1 ? 'border-maroon bg-maroon text-white' : step > i + 1 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step === i + 1 ? 'bg-white text-maroon' : step > i + 1 ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>
              {step > i + 1 ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="font-semibold">{t}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <section className="card space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Borrower name">
                <input className="input" value={f.borrowerName} onChange={(e) => set('borrowerName', e.target.value)} placeholder="As per loan application" />
              </Field>
              <Field label="Registered mobile (for OTP)">
                <input className="input" inputMode="numeric" value={f.mobile} onChange={(e) => set('mobile', e.target.value.replace(/[^\d+ ]/g, ''))} placeholder="10-digit mobile" />
              </Field>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-500">Property type</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(PROPERTY_KIND_LABEL) as PropertyKind[]).map((k) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <button key={k} onClick={() => set('kind', k)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs ${f.kind === k ? 'border-maroon bg-maroon/5 font-semibold text-maroon' : 'border-slate-200 text-slate-600'}`}>
                      <Icon className="h-4 w-4 shrink-0" /> {PROPERTY_KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500">Property address</div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <AddressAutocomplete onSelect={(p) => setF((s) => ({ ...s, lat: p.lat, lng: p.lng, address: p.displayName, city: p.city ?? s.city, state: p.state ?? s.state }))} placeholder="Search the property address…" />
                </div>
                <button onClick={here} className="inline-flex items-center gap-1 rounded-lg border border-maroon px-3 text-xs font-semibold text-maroon">
                  {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />} I&apos;m at the property
                </button>
              </div>
              <input className="input text-sm" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Address as per sale deed" />
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-sm" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="City" />
                <input className="input text-sm" value={f.state} onChange={(e) => set('state', e.target.value)} placeholder="State" />
              </div>
            </div>

            <details className="rounded-xl border border-slate-200 p-3 text-sm" open>
              <summary className="cursor-pointer text-xs font-semibold text-slate-500">Property details as declared in the loan file (corrected later from documents)</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Plot / land area (sqft)">
                  <input type="number" className="input" value={f.plotAreaSqft || ''} onChange={(e) => set('plotAreaSqft', Number(e.target.value) || 0)} />
                </Field>
                {f.kind !== 'PLOT' && f.kind !== 'FLAT' && (
                  <Field label="Floors">
                    <select className="input" value={f.floorCount} onChange={(e) => set('floorCount', Number(e.target.value))}>
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? 'Ground only' : `G+${n - 1}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {f.kind !== 'PLOT' && (
                  <>
                    <Field label={f.kind === 'FLAT' ? 'Approved built-up area (sqft)' : 'Approved area per floor (sqft)'}>
                      <input type="number" className="input" value={f.approvedSqftPerFloor || ''} onChange={(e) => set('approvedSqftPerFloor', Number(e.target.value) || 0)} />
                    </Field>
                    <Field label={f.kind === 'FLAT' ? 'Built-up area as declared (sqft)' : 'Built area per floor (sqft)'}>
                      <input type="number" className="input" value={f.builtSqftPerFloor || ''} onChange={(e) => set('builtSqftPerFloor', Number(e.target.value) || 0)} />
                    </Field>
                    <Field label="Structure">
                      <select className="input" value={f.structure} onChange={(e) => set('structure', e.target.value as StructureType)}>
                        {(Object.keys(STRUCTURE_LABEL) as StructureType[]).map((s) => (
                          <option key={s} value={s}>
                            {STRUCTURE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Age (years)">
                      <input type="number" className="input" value={f.ageYears || ''} onChange={(e) => set('ageYears', Number(e.target.value) || 0)} />
                    </Field>
                    <Field label="Construction rate, as-valued (Rs./sqft) — optional">
                      <input type="number" className="input" value={f.constructionRatePerSqft || ''} onChange={(e) => set('constructionRatePerSqft', Number(e.target.value) || 0)} placeholder="Valuer to enter" />
                    </Field>
                    <p className="col-span-2 text-[11px] text-slate-500">Residual life: {residualLife(f.structure, f.ageYears).formula}</p>
                  </>
                )}
              </div>
            </details>
          </section>

          <div className="space-y-5">
            <PinMap center={hasPin ? [f.lat!, f.lng!] : [20.5937, 78.9629]} pin={hasPin ? [f.lat!, f.lng!] : null} onPick={reverse} height={280} />
            {hasPin && (
              <p className="-mt-3 flex items-start gap-1 text-xs text-slate-600">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-maroon" /> Pin {f.lat!.toFixed(6)}, {f.lng!.toFixed(6)} — the customer&apos;s photos must be taken here.
              </p>
            )}
            <section className="card p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Suggested documents · {PROPERTY_KIND_LABEL[f.kind]}
                {f.state ? ` · ${f.state}` : ''}
              </div>
              <ul className="space-y-1 text-sm">
                {preview.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink">
                      {d.label} {d.mandatory && <span className="text-[10px] font-bold text-maroon">MANDATORY</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                      {d.assignee === 'BANK' ? <Building2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                      {d.assignee === 'BANK' ? 'bank' : 'customer'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-400">You can move any document between bank and customer, or add more, in the next step.</p>
            </section>
            {err && <p className="text-sm text-critical">{err}</p>}
            <button onClick={create} disabled={!canCreate || busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon py-3 text-base font-semibold text-white disabled:opacity-40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create case &amp; document checklist <ArrowRight className="h-4 w-4" />
            </button>
            {!canCreate && <p className="text-center text-xs text-slate-400">Needs borrower name, 10-digit mobile, property pin and plot area.</p>}
          </div>
        </div>
      )}

      {step === 2 && created && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="text-xs text-slate-500">Case {created.view.caseRef}</div>
              <div className="font-semibold text-ink">{created.view.borrowerName} · {PROPERTY_KIND_LABEL[created.view.propertyKind]}</div>
              <div className="text-xs text-slate-500">{created.view.propertyAddress}</div>
            </div>
            <button onClick={() => setStep(3)} className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white">
              Next: customer access <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <DocumentChecklist caseId={created.caseId} view={created.view} onChange={onView} />
        </div>
      )}

      {step === 3 && created && (
        <div className="space-y-4">
          <CustomerAccessPanel view={created.view} accessCode={created.accessCode} storeMode={created.storeMode} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setStep(2)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              Back to documents
            </button>
            <Link href={`/cases/${encodeURIComponent(created.caseId)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white">
              Open case workbench <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
