'use client';

/* Government value (Valuation Logic v2 §1A component A).
   Telangana properties: direct lookup in the IGRS Market Value Search (public, cached); the valuer picks the row that
   matches the property and it becomes the case's official value — a floor, weight 0.
   Other states: a link to the official portal where one is known; otherwise nothing is shown. */
import { useEffect, useState } from 'react';
import { ExternalLink, Landmark, Loader2, Search, Trash2 } from 'lucide-react';
import type { Application } from '@/lib/domain/types';
import { USAGE_LABEL } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { classificationMatches, govBasisFor, govRatePerSqft, guidelinePortalFor, isTelangana } from '@/lib/engines/govValue';
import { rate } from '@/lib/engines/format';
import { api } from '@/lib/client/api';
import type { AppCtl } from '@/lib/client/useApplication';
import type { IgrsOption, IgrsRateQuery, IgrsRateResult } from '@/lib/live/igrsTelangana';
import { Badge, Card, Field, Notice } from '@/components/ui';

const HYD = '16_1';
const DIVISIONS = [
  { code: '1600001', name: 'Hyderabad division' },
  { code: '1600002', name: 'Secunderabad division' },
  { code: '1600003', name: 'Secunderabad Cantonment Board' },
];
type Floor = 'ground' | 'first' | 'other';
const list = (q: string) => api<{ options: IgrsOption[] }>(`/api/igrs/telangana?${q}`).then((r) => r.options);
const pick = (opts: IgrsOption[], text: string) => opts.find((o) => text.toUpperCase().includes(o.name.toUpperCase()))?.code ?? '';

function TelanganaLookup({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  const [searchBy, setSearchBy] = useState<'L' | 'A'>(govBasisFor(a.property.type) === 'LAND' ? 'L' : 'A');
  const [districts, setDistricts] = useState<IgrsOption[]>([]);
  const [mandals, setMandals] = useState<IgrsOption[]>([]);
  const [villages, setVillages] = useState<IgrsOption[]>([]);
  const [localities, setLocalities] = useState<IgrsOption[]>([]);
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [v, setV] = useState('');
  const [div, setDiv] = useState(DIVISIONS[0].code);
  const [locText, setLocText] = useState(a.property.locality ?? '');
  const [loc, setLoc] = useState('');
  const [floor, setFloor] = useState<Floor>('other');
  const [res, setRes] = useState<IgrsRateResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const where = `${a.property.address} ${a.property.city ?? ''} ${a.property.locality ?? ''}`;

  const guard = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'IGRS Telangana did not respond');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    guard('districts', async () => {
      const ds = await list('list=districts');
      setDistricts(ds);
      setD((cur) => cur || pick(ds, where));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setMandals([]);
    setVillages([]);
    setM('');
    setV('');
    setRes(null);
    if (!d || d === HYD) return;
    guard('mandals', async () => {
      const ms = await list(`list=mandals&district=${d}`);
      setMandals(ms);
      setM(pick(ms, where));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);
  useEffect(() => {
    setVillages([]);
    setV('');
    setRes(null);
    if (!d || !m) return;
    guard('villages', async () => {
      const vs = await list(`list=villages&district=${d}&mandal=${m}`);
      setVillages(vs);
      setV(pick(vs, where));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);

  const query = (): IgrsRateQuery => ({
    district: d,
    districtName: districts.find((x) => x.code === d)?.name ?? '',
    mandal: d === HYD ? undefined : m,
    mandalName: mandals.find((x) => x.code === m)?.name,
    village: d === HYD ? undefined : v,
    villageName: villages.find((x) => x.code === v)?.name,
    division: d === HYD ? div : undefined,
    locality: d === HYD ? loc : undefined,
    localityName: localities.find((x) => x.code === loc)?.name,
    searchBy,
  });
  const ready = d && (d === HYD ? div && loc : m && v);

  const adopt = (sno: number) =>
    guard(`use-${sno}`, async () => {
      const j = await api<{ app: Application }>(`/api/applications/${a.id}/govvalue`, { body: { query: res!.query, sno, floor } });
      ctl.accept(j.app);
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Search by">
          <select className="input" value={searchBy} onChange={(e) => (setSearchBy(e.target.value as 'L' | 'A'), setRes(null))}>
            <option value="L">Land value (₹ per sq yd)</option>
            <option value="A">Apartment value (₹ per sqft)</option>
          </select>
        </Field>
        <Field label="District">
          <select className="input" value={d} onChange={(e) => setD(e.target.value)} disabled={!districts.length}>
            <option value="">{busy === 'districts' ? 'Loading…' : 'Select district'}</option>
            {districts.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        {d === HYD ? (
          <>
            <Field label="Division">
              <select className="input" value={div} onChange={(e) => (setDiv(e.target.value), setLocalities([]), setLoc(''))}>
                {DIVISIONS.map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Locality (3+ letters)">
              <div className="flex gap-1">
                <input className="input" value={locText} onChange={(e) => setLocText(e.target.value)} placeholder="e.g. Banjara" />
                <button
                  className="btn-secondary px-2"
                  title="Find localities"
                  disabled={locText.trim().length < 3 || !!busy}
                  onClick={() =>
                    guard('localities', async () => {
                      const ls = await list(`list=localities&division=${div}&q=${encodeURIComponent(locText.trim())}`);
                      setLocalities(ls);
                      setLoc(ls[0]?.code ?? '');
                      if (!ls.length) setErr('No locality found — try fewer letters');
                    })
                  }
                >
                  {busy === 'localities' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {localities.length > 0 && (
              <div className="sm:col-span-2">
                <Field label="Matching locality">
                  <select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
                    {localities.map((x) => (
                      <option key={x.code} value={x.code}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </>
        ) : (
          <>
            <Field label="Mandal">
              <select className="input" value={m} onChange={(e) => setM(e.target.value)} disabled={!mandals.length}>
                <option value="">{busy === 'mandals' ? 'Loading…' : 'Select mandal'}</option>
                {mandals.map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Village / town">
              <select className="input" value={v} onChange={(e) => setV(e.target.value)} disabled={!villages.length}>
                <option value="">{busy === 'villages' ? 'Loading…' : 'Select village'}</option>
                {villages.map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          disabled={!ready || !!busy}
          onClick={() =>
            guard('rates', async () => {
              setRes(await api<IgrsRateResult>('/api/igrs/telangana', { body: query() }));
            })
          }
        >
          {busy === 'rates' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Get market values
        </button>
        {searchBy === 'A' && (
          <select className="input w-auto" value={floor} onChange={(e) => setFloor(e.target.value as Floor)} title="Floor of the flat">
            <option value="ground">Ground floor rate</option>
            <option value="first">First floor rate</option>
            <option value="other">Other floors rate</option>
          </select>
        )}
        <span className="text-[11px] text-slate-500">Rows matching the declared usage ({USAGE_LABEL[a.property.usage].toLowerCase()}) are highlighted. Pick the row for the property’s street or locality.</span>
      </div>
      {err && <Notice tone="red">{err}</Notice>}
      {res && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <div className="bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {res.header || 'Unit rates'} · read {new Date(res.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            {res.cached ? ' (cached)' : ''}
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className="th">Locality</th>
                <th className="th">Ward-block</th>
                <th className="th text-right">{res.query.searchBy === 'L' ? '₹ per sq yd' : '₹ per sqft (G / 1st / other)'}</th>
                <th className="th text-right">₹ per sqft</th>
                <th className="th">Classification</th>
                <th className="th">Effective</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => {
                const printed = res.query.searchBy === 'L' ? r.landPerSqYd : (r.apartmentPerSqft?.[floor] ?? null);
                const match = classificationMatches(r.classification, a.property.usage);
                return (
                  <tr key={r.sno} className={match ? 'bg-emerald-50/50' : ''}>
                    <td className="td text-xs font-medium">{r.locality}</td>
                    <td className="td text-xs">{r.wardBlock}</td>
                    <td className="td text-right tabular-nums text-xs">{res.query.searchBy === 'L' ? (r.landPerSqYd?.toLocaleString('en-IN') ?? '—') : r.apartmentPerSqft ? `${r.apartmentPerSqft.ground ?? '—'} / ${r.apartmentPerSqft.first ?? '—'} / ${r.apartmentPerSqft.other ?? '—'}` : '—'}</td>
                    <td className="td text-right tabular-nums font-semibold">{printed ? rate(govRatePerSqft(printed, res.query.searchBy === 'L' ? 'SQYD' : 'SQFT')) : '—'}</td>
                    <td className="td text-xs">{r.classification ? <Badge tone={match ? 'green' : 'slate'}>{r.classification}</Badge> : '—'}</td>
                    <td className="td text-xs">{r.effectiveDate ?? '—'}</td>
                    <td className="td text-right">
                      <button className="btn-secondary px-2 py-1 text-xs" disabled={!printed || !!busy} onClick={() => adopt(r.sno)}>
                        {busy === `use-${r.sno}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Use'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {ev.evidence.guidelines.LAND && !ev.evidence.guidelines.LAND.official && (
        <p className="text-[11px] text-slate-500">Until an official value is adopted, the guideline rate from the web search ({rate(ev.evidence.guidelines.LAND.rate)}) is used for the T14 check only — not as a floor.</p>
      )}
    </div>
  );
}

export default function GovValueCard({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  const [removing, setRemoving] = useState(false);
  if (!isTelangana(a.property)) {
    const portal = guidelinePortalFor(a.property);
    if (!portal) return null;
    return (
      <Card title={<span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-maroon" /> Government value — {portal.state}</span>}>
        <p className="text-sm text-slate-600">
          Official guideline / circle rate:{' '}
          <a href={portal.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-sky-700 hover:underline">
            {portal.name} <ExternalLink className="h-3 w-3" />
          </a>
          . To use it as the T14 floor check, add it with “Add comparable manually” → category “Guideline”.
        </p>
      </Card>
    );
  }
  const adopted = (['LAND', 'BUILT'] as const).map((k) => ev.evidence.guidelines[k]).filter((g) => g?.official);
  const remove = async (basis: 'LAND' | 'APARTMENT') => {
    setRemoving(true);
    try {
      const j = await api<{ app: Application }>(`/api/applications/${a.id}/govvalue?basis=${basis}`, { method: 'DELETE' });
      ctl.accept(j.app);
    } finally {
      setRemoving(false);
    }
  };
  return (
    <Card
      title={<span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-maroon" /> Government value — IGRS Telangana Market Value Search</span>}
      subtitle="Read directly from registration.telangana.gov.in (public, no login; cached with the read date). It is a stamp-duty minimum, not a price estimate: shown beside the market rate and used as a floor — weight 0 in the blend."
      actions={
        <a href="https://registration.telangana.gov.in/UnitRateMV/getDistrictList.htm" target="_blank" rel="noreferrer" className="btn-ghost text-xs">
          Open portal <ExternalLink className="h-3 w-3" />
        </a>
      }
    >
      {adopted.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {adopted.map((g) => (
            <div key={g!.ref!.basis} className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase text-emerald-800">Adopted — {g!.ref!.basis === 'LAND' ? 'land value' : 'apartment value'}</div>
                <div className="text-lg font-bold tabular-nums">{rate(g!.rate)}</div>
                <div className="text-[11px] text-slate-600">
                  ₹{g!.ref!.printedRate.toLocaleString('en-IN')} {g!.ref!.printedUnit === 'SQYD' ? 'per sq yd ÷ 9' : 'per sqft'} · {g!.ref!.locality} · {g!.ref!.classification ?? ''} · effective {g!.ref!.effectiveDate ?? '—'} · {[g!.ref!.village, g!.ref!.mandal, g!.ref!.district].filter(Boolean).join(', ')}
                </div>
              </div>
              <button className="btn-ghost px-1.5 text-red-600" title="Remove" disabled={removing} onClick={() => remove(g!.ref!.basis)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <TelanganaLookup ctl={ctl} ev={ev} />
    </Card>
  );
}
