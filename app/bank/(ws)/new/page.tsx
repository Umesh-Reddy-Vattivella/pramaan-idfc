'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building, Building2, Factory, Home, LandPlot, Loader2, Store } from 'lucide-react';
import type { Application, PropertyType, Structure, Usage } from '@/lib/domain/types';
import { checklistFor, DEFAULT_STRUCTURE, DEFAULT_USAGE, FROM_LABEL, isBuilt, PROPERTY_TYPE_LABEL, STRUCTURE_LABEL, USAGE_LABEL } from '@/lib/domain/catalog';
import { emptySpec } from '@/lib/mapGeometry';
import { api } from '@/lib/client/api';
import AddressAutocomplete, { type PickedPlace } from '@/components/AddressAutocomplete';
import { SpecMap } from '@/components/workbench/maps';
import { Badge, Card, Field } from '@/components/ui';

const TYPES: { t: PropertyType; icon: typeof Home }[] = [
  { t: 'HOUSE', icon: Home },
  { t: 'FLAT', icon: Building },
  { t: 'PLOT', icon: LandPlot },
  { t: 'SHOP_OFFICE', icon: Store },
  { t: 'COMMERCIAL_BUILDING', icon: Building2 },
  { t: 'INDUSTRIAL', icon: Factory },
];

const INDIA: [number, number] = [21.15, 79.09];

export default function NewApplication() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [losRef, setLosRef] = useState('');
  const [type, setType] = useState<PropertyType>('HOUSE');
  const [usage, setUsage] = useState<Usage>('RESIDENTIAL');
  const [structure, setStructure] = useState<Structure>('RCC');
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [plot, setPlot] = useState('');
  const [bua, setBua] = useState('');
  const [floors, setFloors] = useState('1');
  const [age, setAge] = useState('');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const built = isBuilt(type);
  const docs = useMemo(() => checklistFor(type), [type]);

  const spec = useMemo(() => {
    const s = emptySpec(pin ?? INDIA, pin ? 18 : 5);
    if (pin) s.markers.push({ id: 'pin', pos: pin, color: '#9C1D26', size: 9, tooltip: 'Property pin — click the map to move it' });
    return s;
  }, [pin]);

  const chooseType = (t: PropertyType) => {
    setType(t);
    setUsage(DEFAULT_USAGE[t]);
    setStructure(DEFAULT_STRUCTURE[t]);
  };

  const pick = (p: PickedPlace) => {
    setPlace(p);
    setAddress(p.displayName);
    setPin([p.lat, p.lng]);
  };

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const n = (s: string) => (s.trim() ? Number(s) : null);
      const j = await api<{ app: Application }>('/api/applications', {
        body: {
          borrower: { name, mobile, losRef },
          property: {
            type,
            usage,
            structure,
            address,
            lat: pin?.[0],
            lng: pin?.[1],
            locality: place?.locality,
            city: place?.city,
            state: place?.state,
            plotAreaSqft: n(plot),
            builtUpSqft: built ? n(bua) : null,
            floors: built ? n(floors) : null,
            ageYears: built ? n(age) : null,
            constructionRate: built ? n(rate) : null,
          },
        },
      });
      router.push(`/bank/applications/${j.app.id}?created=1`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the application');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">New application</h1>
        <p className="text-sm text-slate-500">Enter what the loan file already has. The customer is not asked to repeat KYC or re-type any of this.</p>
      </div>

      <Card title="1 · Borrower (from the loan file)">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Borrower name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="As per loan application" />
          </Field>
          <Field label="Registered mobile" hint="Used to reach the customer; never shown in full to others.">
            <input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="numeric" placeholder="10-digit mobile" />
          </Field>
          <Field label="Loan application no. (LOS)" hint="Optional">
            <input className="input" value={losRef} onChange={(e) => setLosRef(e.target.value)} placeholder="e.g. LAP-2026-00123" />
          </Field>
        </div>
      </Card>

      <Card title="2 · Property type" subtitle="Decides the document checklist and the valuation method.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TYPES.map(({ t, icon: Icon }) => (
            <button
              key={t}
              type="button"
              onClick={() => chooseType(t)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${type === t ? 'border-maroon bg-maroon/5 text-maroon' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
            >
              <Icon className="h-5 w-5 shrink-0" /> {PROPERTY_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">Document checklist that will be created ({docs.length} slots)</div>
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d) => (
              <Badge key={d.key} tone={d.mandatory ? 'maroon' : 'slate'}>
                {d.label}
                {d.mandatory ? ' · mandatory' : ''} · {FROM_LABEL[d.from]}
              </Badge>
            ))}
          </div>
        </div>
      </Card>

      <Card title="3 · Property location" subtitle="Pick the address, then click on the satellite map to place the pin exactly on the property.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Search address">
              <AddressAutocomplete onSelect={pick} bias={pin} placeholder="Type the property address, locality or landmark" />
            </Field>
            <Field label="Address as per sale deed" hint="Edit to match the deed exactly.">
              <textarea className="input min-h-[84px]" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <div className="text-xs text-slate-500">
              {pin ? (
                <>
                  Pin: <span className="font-mono">{pin[0].toFixed(6)}, {pin[1].toFixed(6)}</span>
                  {place?.locality ? ` · ${place.locality}` : ''}
                  {place?.city ? `, ${place.city}` : ''}
                </>
              ) : (
                'No pin yet.'
              )}
            </div>
          </div>
          <SpecMap spec={spec} height={300} onClick={(lat, lng) => setPin([lat, lng])} followCenter />
        </div>
      </Card>

      <Card title="4 · Property facts (from the sale deed / loan file)" subtitle="Leave blank what you do not have — the workspace shows what is still missing.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={type === 'FLAT' || type === 'SHOP_OFFICE' ? 'Land / UDS area (sqft, optional)' : 'Plot area as per deed (sqft)'}>
            <input className="input" value={plot} onChange={(e) => setPlot(e.target.value)} inputMode="decimal" />
          </Field>
          {built && (
            <>
              <Field label="Built-up area as per deed (sqft)">
                <input className="input" value={bua} onChange={(e) => setBua(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Number of floors">
                <input className="input" value={floors} onChange={(e) => setFloors(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Age of building (years)">
                <input className="input" value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Structure">
                <select className="input" value={structure} onChange={(e) => setStructure(e.target.value as Structure)}>
                  {(Object.keys(STRUCTURE_LABEL) as Structure[]).map((s) => (
                    <option key={s} value={s}>
                      {STRUCTURE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Construction rate (₹/sqft, new)" hint="Bank panel rate for this structure and finish.">
                <input className="input" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="e.g. 1800" />
              </Field>
            </>
          )}
          <Field label="Declared usage">
            <select className="input" value={usage} onChange={(e) => setUsage(e.target.value as Usage)}>
              {(Object.keys(USAGE_LABEL) as Usage[]).map((u) => (
                <option key={u} value={u}>
                  {USAGE_LABEL[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p>}
      <div className="flex justify-end">
        <button className="btn-primary px-5 py-2.5" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Open application
        </button>
      </div>
    </div>
  );
}
