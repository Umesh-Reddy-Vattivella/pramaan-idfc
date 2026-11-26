'use client';

/**
 * Valuation Links — bank side of the customer journey.
 * Technical valuation is initiated from the loan application (LOS). The link the customer
 * receives is pre-filled from it: no KYC (done at onboarding), no re-entering the address,
 * and no re-uploading documents the sales team already holds.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Crosshair, Loader2, MapPin, PlusCircle, Smartphone } from 'lucide-react';
import type { UsageClass } from '@/lib/types';
import { useCases } from '@/lib/state/CasesContext';
import { isAvailable, losRecordFor } from '@/lib/data/losRecords';
import { buildDemoApplication, type DemoApplicationInput } from '@/lib/data/demoApplication';
import { residualLife, STRUCTURE_LABEL, type StructureType } from '@/lib/engines/valuation';
import { RouteBadge } from '@/components/StatusBadges';
import { SanityVerdictBadge } from '@/components/workbench/SanityTab';
import CustomerLinkPanel from '@/components/workbench/CustomerLinkPanel';
import AddressAutocomplete, { type PickedPlace } from '@/components/AddressAutocomplete';
import { PinMap } from '@/components/workbench/maps';

const LINK_LABEL = { SENT: 'Sent', OPENED: 'Opened', SUBMITTED: 'Received' } as const;

export default function ValuationLinksPage() {
  const { cases, evaluations } = useCases();
  const [selected, setSelected] = useState<string | null>(null);
  const sel = cases.find((c) => c.id === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Valuation Links</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Technical valuation starts from the loan application. The customer gets one link, pre-filled from the LOS: they confirm nothing they have already given, do no KYC,
          and upload only missing documents. Anyone at the property (owner, family, tenant) can do the capture — the geo-fence checks the <em>property</em>, not the person.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['① Identify', 'Address, pin and documents pre-filled from the LOS · geo-tagged photos must be taken inside the pledged parcel'],
          ['② Measure', 'Room-by-room dimensions on the phone (AR where supported, tape or reference-photo otherwise) — cross-checked against the approved plan'],
          ['③ Value + Sanity', 'Comparables from multiple sources at the bank, plus the Technical Sanity Report that clears remarks before sanction'],
        ].map(([h, b]) => (
          <div key={h} className="card p-4">
            <div className="text-sm font-bold text-maroon">{h}</div>
            <p className="mt-1 text-xs text-slate-600">{b}</p>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-ink">Loan applications awaiting technical valuation</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2">Loan application</th>
                <th className="px-3 py-2">Property</th>
                <th className="px-3 py-2">Docs on file</th>
                <th className="px-3 py-2">Link</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Sanity</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map((c) => {
                const e = evaluations[c.id];
                const los = losRecordFor(c);
                const docs = los.documents.filter((d) => d.status !== 'NOT_APPLICABLE');
                const plan = los.documents.find((d) => d.type === 'APPROVED_PLAN');
                return (
                  <tr key={c.id} className={selected === c.id ? 'bg-maroon/5' : ''}>
                    <td className="px-5 py-2.5">
                      <div className="font-semibold text-ink">{los.loanAppNo}</div>
                      <div className="text-xs text-slate-500">{c.applicantName}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-ink">{c.title}</div>
                      <div className="text-xs text-slate-500">
                        {c.city}, {c.state}
                        {c.benchmarkLabel && <span className="ml-1 rounded bg-maroon/10 px-1 text-[10px] font-bold text-maroon">IDFC {c.benchmarkLabel}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {docs.filter(isAvailable).length}/{docs.length}
                      {plan && !isAvailable(plan) && <div className="font-semibold text-critical">No approved plan</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{c.customerLink ? LINK_LABEL[c.customerLink.status] : <span className="text-slate-400">Not sent</span>}</td>
                    <td className="px-3 py-2.5">{e && <RouteBadge tier={e.routing.tier} />}</td>
                    <td className="px-3 py-2.5">{e && <SanityVerdictBadge verdict={e.sanity.verdict} />}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button onClick={() => setSelected(selected === c.id ? null : c.id)} className="mr-2 inline-flex items-center gap-1 rounded-lg bg-maroon px-3 py-1.5 text-xs font-semibold text-white">
                        <Smartphone className="h-3.5 w-3.5" /> {c.customerLink ? 'Link' : 'Send link'}
                      </button>
                      <Link href={`/cases/${encodeURIComponent(c.id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-maroon">
                        Workbench <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {sel && <CustomerLinkPanel c={sel} />}

      <DemoApplicationForm onCreated={setSelected} />
    </div>
  );
}

/* ---------------- Quick demo application at the presenter's location ---------------- */

function DemoApplicationForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { upsertCase } = useCases();
  const router = useRouter();
  const [f, setF] = useState<DemoApplicationInput>({
    borrowerName: 'Demo Borrower',
    address: '',
    city: '',
    state: '',
    lat: 0,
    lng: 0,
    usage: 'RESIDENTIAL',
    plotAreaSqft: 1500,
    floorCount: 2,
    approvedSqftPerFloor: 1000,
    builtSqftPerFloor: 1000,
    hasApprovedPlan: true,
    ageYears: 8,
    structure: 'RCC_FRAMED',
  });
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasPin = f.lat !== 0 || f.lng !== 0;
  const set = <K extends keyof DemoApplicationInput>(k: K, v: DemoApplicationInput[K]) => setF((s) => ({ ...s, [k]: v }));

  const place = async (lat: number, lng: number) => {
    setF((s) => ({ ...s, lat, lng }));
    try {
      const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      const j = (await r.json()) as { result?: PickedPlace | null };
      if (j.result) setF((s) => ({ ...s, address: j.result!.displayName, city: j.result!.city ?? s.city, state: j.result!.state ?? s.state }));
    } catch {
      /* keep coordinates */
    }
  };

  const here = () => {
    setLocating(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        place(p.coords.latitude, p.coords.longitude);
      },
      () => {
        setLocating(false);
        setErr('Location unavailable — search the address instead.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const create = (thenOpen: boolean) => {
    const id = `los-${Date.now().toString(36)}`;
    upsertCase(buildDemoApplication(id, f));
    if (thenOpen) router.push(`/cases/${encodeURIComponent(id)}`);
    else onCreated(id);
  };

  const life = residualLife(f.structure, f.ageYears);

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <PlusCircle className="h-4 w-4 text-maroon" /> New loan application (demo LOS entry)
      </h2>
      <p className="mb-3 text-xs text-slate-500">For the live demo: create an application for the property you are standing at, send the link, and capture it on a phone.</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 text-xs">
          <div className="flex gap-2">
            <div className="flex-1">
              <AddressAutocomplete onSelect={(p) => setF((s) => ({ ...s, lat: p.lat, lng: p.lng, address: p.displayName, city: p.city ?? s.city, state: p.state ?? s.state }))} placeholder="Search property address…" />
            </div>
            <button onClick={here} className="inline-flex items-center gap-1 rounded-lg border border-maroon px-3 text-xs font-semibold text-maroon">
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />} Use my location
            </button>
          </div>
          {err && <p className="text-critical">{err}</p>}
          {hasPin && (
            <p className="flex items-start gap-1 text-slate-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-maroon" /> {f.address || `${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}`}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <L label="Borrower">
              <input className="input" value={f.borrowerName} onChange={(e) => set('borrowerName', e.target.value)} />
            </L>
            <L label="Property type">
              <select className="input" value={f.usage} onChange={(e) => set('usage', e.target.value as UsageClass)}>
                <option value="RESIDENTIAL">Residential</option>
                <option value="COMMERCIAL">Commercial</option>
              </select>
            </L>
            <L label="Plot area (sqft, from deed)">
              <input type="number" className="input" value={f.plotAreaSqft} onChange={(e) => set('plotAreaSqft', Number(e.target.value) || 0)} />
            </L>
            <L label="Floors">
              <select className="input" value={f.floorCount} onChange={(e) => set('floorCount', Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Ground only' : `G+${n - 1}`}
                  </option>
                ))}
              </select>
            </L>
            <L label="Approved area / floor (sqft)">
              <input type="number" className="input" disabled={!f.hasApprovedPlan} value={f.approvedSqftPerFloor} onChange={(e) => set('approvedSqftPerFloor', Number(e.target.value) || 0)} />
            </L>
            <L label="Built area / floor (sqft)">
              <input type="number" className="input" value={f.builtSqftPerFloor} onChange={(e) => set('builtSqftPerFloor', Number(e.target.value) || 0)} />
            </L>
            <L label="Structure">
              <select className="input" value={f.structure} onChange={(e) => set('structure', e.target.value as StructureType)}>
                {(Object.keys(STRUCTURE_LABEL) as StructureType[]).map((s) => (
                  <option key={s} value={s}>
                    {STRUCTURE_LABEL[s]}
                  </option>
                ))}
              </select>
            </L>
            <L label="Age (years)">
              <input type="number" className="input" value={f.ageYears} onChange={(e) => set('ageYears', Number(e.target.value) || 0)} />
            </L>
          </div>
          <p className="text-slate-500">Residual life: {life.formula}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[#9C1D26]" checked={f.hasApprovedPlan} onChange={(e) => set('hasApprovedPlan', e.target.checked)} />
            Approved building plan collected by sales
          </label>
          <div className="flex gap-2">
            <button disabled={!hasPin} onClick={() => create(false)} className="rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Create &amp; send link
            </button>
            <button disabled={!hasPin} onClick={() => create(true)} className="rounded-lg border border-maroon px-4 py-2 text-sm font-semibold text-maroon disabled:opacity-40">
              Create &amp; open workbench
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Price evidence for demo applications is an illustrative template; use “Value New Property” for live comparables at a real address.</p>
        </div>
        <PinMap center={hasPin ? [f.lat, f.lng] : [20.5937, 78.9629]} pin={hasPin ? [f.lat, f.lng] : null} onPick={place} height={320} />
      </div>
    </section>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
