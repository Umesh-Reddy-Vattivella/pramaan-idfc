'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Globe2, Loader2, Plus, Sigma, Trash2 } from 'lucide-react';
import type { Application, EvidenceCategory, EvidenceKind, MarketPoint } from '@/lib/domain/types';
import { hasLand, isUnit } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { CATEGORY_LABEL, correctionText, EVIDENCE_DEFAULTS, KIND_LABEL, MAX_COMPARABLE_KM, SPATIAL_LABEL, type Consensus } from '@/lib/engines/evidence';
import { inr, inrShort, rate } from '@/lib/engines/format';
import { FSV_RATIO, LTV_CAP, METHOD_LABEL } from '@/lib/engines/valuation';
import { emptySpec } from '@/lib/mapGeometry';
import { api } from '@/lib/client/api';
import type { AppCtl } from '@/lib/client/useApplication';
import { SpecMap } from '@/components/workbench/maps';
import { Badge, Card, Field, Notice, Stat } from '@/components/ui';

const CAT_COLOR: Record<EvidenceCategory, string> = { LAND: '#16a34a', BUILT: '#2563eb', GUIDELINE: '#a855f7' };

function ConsensusCard({ c, title }: { c: Consensus | null; title: string }) {
  if (!c) return <Card title={title}><p className="text-sm text-slate-500">No usable data points in this category yet.</p></Card>;
  return (
    <Card title={title} subtitle={`${c.n} data point(s) · median distance ${c.medianDistanceKm !== null ? `${c.medianDistanceKm.toFixed(1)} km` : 'unknown'} · median age ${c.medianAgeMonths.toFixed(0)} months`}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Source type</th>
            <th className="th text-right">n</th>
            <th className="th text-right">Median rate</th>
            <th className="th">Correction</th>
            <th className="th text-right">Corrected</th>
            <th className="th text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.kind}>
              <td className="td">{KIND_LABEL[r.kind]}</td>
              <td className="td text-right tabular-nums">{r.n}</td>
              <td className="td text-right tabular-nums">{rate(r.medianRate)}</td>
              <td className="td text-xs text-slate-500">{correctionText(r.kind)}</td>
              <td className="td text-right tabular-nums">{rate(r.correctedRate)}</td>
              <td className="td text-right tabular-nums">{(r.weight * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <div className="font-mono">
          R = Σ wₖ × rₖ = {c.rows.map((r) => `${(r.weight * 100).toFixed(1)}% × ${Math.round(r.correctedRate).toLocaleString('en-IN')}`).join(' + ')} ≈ <b className="text-ink">{rate(c.rate)}</b> (rounded to ₹10)
        </div>
        <div className="mt-1">Weights wₖ ∝ 1/σₖ² (σ = standard error of each source type; 15% prior when n = 1). Range {rate(c.low)} – {rate(c.high)} (± CV).</div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
        {[
          ['Agreement', c.score.agreement, 35, `CV ${(c.cv * 100).toFixed(1)}%`],
          ['Depth', c.score.depth, 25, `n = ${c.n}`],
          ['Recency', c.score.recency, 20, `${c.medianAgeMonths.toFixed(0)} mo`],
          ['Spatial', c.score.spatial, 20, SPATIAL_LABEL[c.tier].split(' (')[0]],
        ].map(([l, v, max, sub]) => (
          <div key={l as string} className="rounded-lg border border-slate-200 p-2">
            <div className="text-[10px] font-semibold uppercase text-slate-500">{l}</div>
            <div className="font-bold tabular-nums">
              {Math.round(v as number)}/{max}
            </div>
            <div className="text-[10px] text-slate-400">{sub}</div>
          </div>
        ))}
        <div className={`rounded-lg p-2 ${c.score.total >= 80 ? 'bg-emerald-50' : c.score.total >= 60 ? 'bg-amber-50' : 'bg-red-50'}`}>
          <div className="text-[10px] font-semibold uppercase text-slate-500">Authenticity S</div>
          <div className="text-lg font-extrabold tabular-nums">{c.score.total}</div>
        </div>
      </div>
    </Card>
  );
}

function ManualPoint({ ctl }: { ctl: AppCtl }) {
  const a = ctl.app!;
  const [open, setOpen] = useState(false);
  const [p, setP] = useState({ category: (isUnit(a.property.type) ? 'BUILT' : 'LAND') as EvidenceCategory, kind: 'SALE' as EvidenceKind, rate: '', price: '', area: '', locality: '', date: '', url: '', title: '', lat: '', lng: '' });
  const add = async () => {
    const point = {
      id: '',
      category: p.category,
      kind: p.category === 'GUIDELINE' ? ('GUIDELINE' as EvidenceKind) : p.kind,
      ratePerSqft: p.rate ? Number(p.rate) : undefined,
      priceInr: p.price ? Number(p.price) : undefined,
      areaSqft: p.area ? Number(p.area) : undefined,
      locality: p.locality,
      date: p.date,
      url: p.url,
      title: p.title,
      lat: p.lat ? Number(p.lat) : undefined,
      lng: p.lng ? Number(p.lng) : undefined,
      origin: 'MANUAL' as const,
      included: true,
    } satisfies MarketPoint;
    if (await ctl.run({ op: 'addPoint', point })) setOpen(false);
  };
  if (!open)
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add comparable manually
      </button>
    );
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP({ ...p, [k]: e.target.value });
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-sm font-semibold">Manual comparable (e.g. a registered sale from IGR, an auction notice, a past bank valuation)</div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Category">
          <select className="input" value={p.category} onChange={set('category')}>
            {(['LAND', 'BUILT', 'GUIDELINE'] as EvidenceCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        {p.category !== 'GUIDELINE' && (
          <Field label="Type">
            <select className="input" value={p.kind} onChange={set('kind')}>
              {(['SALE', 'LISTING', 'AUCTION'] as EvidenceKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Rate (₹/sqft)" hint="or price + area">
          <input className="input" value={p.rate} onChange={set('rate')} inputMode="decimal" />
        </Field>
        <Field label="Price (₹)">
          <input className="input" value={p.price} onChange={set('price')} inputMode="decimal" />
        </Field>
        <Field label="Area (sqft)">
          <input className="input" value={p.area} onChange={set('area')} inputMode="decimal" />
        </Field>
        <Field label="Locality">
          <input className="input" value={p.locality} onChange={set('locality')} />
        </Field>
        <Field label="Date (YYYY-MM)">
          <input className="input" value={p.date} onChange={set('date')} placeholder="2026-10" />
        </Field>
        <Field label="Latitude, longitude" hint="for distance; optional">
          <div className="flex gap-1">
            <input className="input" value={p.lat} onChange={set('lat')} placeholder="lat" />
            <input className="input" value={p.lng} onChange={set('lng')} placeholder="lng" />
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Source URL / document reference">
            <input className="input" value={p.url} onChange={set('url')} placeholder="https://…" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description">
            <input className="input" value={p.title} onChange={set('title')} placeholder="e.g. Regd. sale deed no. 1234/2026, 1,500 sqft plot" />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" onClick={add} disabled={ctl.busy}>
          Add
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function EvidenceTable({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const rows = ev.evidence.assessed;
  if (!rows.length) return <p className="text-sm text-slate-500">No data points yet.</p>;
  const cats: EvidenceCategory[] = ['LAND', 'BUILT', 'GUIDELINE'];
  return (
    <div className="space-y-4">
      {cats.map((cat) => {
        const list = rows.filter((r) => r.point.category === cat);
        if (!list.length) return null;
        return (
          <div key={cat} className="overflow-x-auto rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOR[cat] }} /> {CATEGORY_LABEL[cat]} · {list.filter((r) => r.used).length} used of {list.length}
            </div>
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <th className="th w-10">Use</th>
                  <th className="th">Data point</th>
                  <th className="th">Type</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-right">Corrected</th>
                  <th className="th text-right">Distance</th>
                  <th className="th">Date</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {list.map(({ point: p, rate: r, corrected, distanceKm, used, excludedReason }) => (
                  <tr key={p.id} className={used ? '' : 'opacity-60'}>
                    <td className="td">
                      <input type="checkbox" checked={p.included} onChange={(e) => ctl.run({ op: 'togglePoint', id: p.id, included: e.target.checked })} />
                    </td>
                    <td className="td max-w-[340px]">
                      <div className="line-clamp-2 text-xs font-medium text-ink">{p.title ?? p.propertyType}</div>
                      <div className="text-[11px] text-slate-500">
                        {p.propertyType ? `${p.propertyType} · ` : ''}
                        {p.locality ?? ''}
                        {p.quote ? ` · “${p.quote}”` : ''}
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline">
                          {(() => {
                            try {
                              return new URL(p.url).hostname.replace(/^www\./, '');
                            } catch {
                              return p.url.slice(0, 40);
                            }
                          })()}{' '}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {excludedReason && <div className="text-[11px] font-medium text-amber-700">Not used: {excludedReason}</div>}
                    </td>
                    <td className="td text-xs">
                      {KIND_LABEL[p.kind]}
                      {p.origin === 'MANUAL' && <div><Badge>manual</Badge></div>}
                    </td>
                    <td className="td text-right tabular-nums">{r ? rate(r) : '—'}</td>
                    <td className="td text-right tabular-nums">{corrected && cat !== 'GUIDELINE' ? rate(corrected) : '—'}</td>
                    <td className="td text-right tabular-nums text-xs">{distanceKm !== null ? `${distanceKm.toFixed(1)} km` : 'unknown'}</td>
                    <td className="td text-xs">{p.date ?? 'undated'}</td>
                    <td className="td text-right">
                      <button className="btn-ghost px-1.5 text-red-600" onClick={() => ctl.run({ op: 'deletePoint', id: p.id })} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export default function ValuationTab({ ctl, ev }: { ctl: AppCtl; ev: Evaluation }) {
  const a = ctl.app!;
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = a.market;
  const v = ev.valuation;

  const fetchLive = async () => {
    setFetching(true);
    setErr(null);
    try {
      const j = await api<{ app: Application }>(`/api/applications/${a.id}/market`, { method: 'POST', body: {} });
      ctl.accept(j.app);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Live search failed');
    } finally {
      setFetching(false);
    }
  };

  const spec = useMemo(() => {
    const c: [number, number] = ev.pin ? [ev.pin.lat, ev.pin.lng] : [21.15, 79.09];
    const sp = emptySpec(c, 13, 'street');
    if (ev.pin) {
      sp.markers.push({ id: 'pin', pos: c, color: '#9C1D26', size: 9, tooltip: 'Subject property', permanent: true });
      sp.circles.push({ id: 'c1', center: c, radiusM: 1000, color: '#16a34a', tooltip: '1 km' }, { id: 'c3', center: c, radiusM: 3000, color: '#f59e0b', tooltip: '3 km' }, { id: 'c10', center: c, radiusM: MAX_COMPARABLE_KM * 1000, color: '#94a3b8', tooltip: `${MAX_COMPARABLE_KM} km — farther points not used` });
    }
    // Several points can share a locality centroid: jitter slightly so each is visible.
    ev.evidence.assessed.forEach((x, i) => {
      const p = x.point;
      if (p.lat === undefined || p.lng === undefined) return;
      const j = 0.0004 * ((i % 5) - 2);
      sp.markers.push({ id: p.id, pos: [p.lat + j, p.lng - j], color: x.used ? CAT_COLOR[p.category] : '#94a3b8', size: 6, tooltip: `${CATEGORY_LABEL[p.category]} · ${x.rate ? rate(x.rate) : ''}\n${p.title ?? ''}${x.distanceKm !== null ? `\n${x.distanceKm.toFixed(1)} km from property` : ''}` });
    });
    return sp;
  }, [ev]);

  return (
    <div className="space-y-5">
      <Card
        title={<span className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-maroon" /> Market evidence around the property</span>}
        subtitle={
          m.fetchedAt
            ? `Searched ${m.searchedFor ? `“${m.searchedFor}”` : 'around the pin'} on ${new Date(m.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · ${m.model}`
            : 'Live search for land rates, built-property rates and the guideline rate near the pin. Every number keeps its source link; the AI only copies printed text and the engine does all the maths.'
        }
        actions={
          <button className="btn-primary" onClick={fetchLive} disabled={fetching || !ev.pin}>
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />} {fetching ? 'Searching (up to 60 s)…' : m.fetchedAt ? 'Fetch again' : 'Fetch market evidence'}
          </button>
        }
      >
        {err && <div className="mb-3"><Notice tone="red">{err}</Notice></div>}
        {m.warning && <div className="mb-3"><Notice tone="amber">{m.warning}</Notice></div>}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <SpecMap spec={spec} height={380} />
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
              {(['LAND', 'BUILT', 'GUIDELINE'] as EvidenceCategory[]).map((c) => (
                <span key={c} className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOR[c] }} /> {CATEGORY_LABEL[c]}
                </span>
              ))}
              <span>Grey = not used. Pins sit at the locality centre printed in the source.</span>
            </div>
            <Notice>
              Defaults (uncalibrated, shown so they can be challenged): listings × (1 − {EVIDENCE_DEFAULTS.listingDiscount}) asking→closing; auctions ÷ {EVIDENCE_DEFAULTS.auctionForcedSaleRatio}; reported sales × {EVIDENCE_DEFAULTS.kReg.toFixed(2)}; guideline rate = floor check only; points beyond {MAX_COMPARABLE_KM} km, duplicates and statistical outliers are not used.
            </Notice>
            <ManualPoint ctl={ctl} />
            {m.rejected.length > 0 && (
              <details className="rounded-lg border border-slate-200 p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-600">{m.rejected.length} search result(s) rejected — why</summary>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-slate-500">
                  {m.rejected.map((r, i) => (
                    <li key={i}>
                      {r.url ? (
                        <a className="text-sky-700 hover:underline" href={r.url} target="_blank" rel="noreferrer">
                          {r.title ?? r.url}
                        </a>
                      ) : (
                        (r.title ?? 'Item')
                      )}{' '}
                      — {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
        <div className="mt-4">
          <EvidenceTable ctl={ctl} ev={ev} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {hasLand(a.property.type) && <ConsensusCard c={ev.evidence.land} title="Consensus land rate" />}
        {a.property.type !== 'PLOT' && <ConsensusCard c={ev.evidence.built} title={isUnit(a.property.type) ? 'Consensus built-property rate' : 'Built-property rate (cross-check)'} />}
      </div>

      <Card title={<span className="flex items-center gap-2"><Sigma className="h-4 w-4 text-maroon" /> Valuation — {METHOD_LABEL[v.method]}</span>} subtitle="Every figure below is computed by deterministic code from the inputs shown. Nothing is estimated by AI.">
        {v.missing.length > 0 && (
          <div className="mb-4">
            <Notice tone="amber">Still needed for the valuation: {v.missing.join(' · ')}.</Notice>
          </div>
        )}
        {v.lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Step</th>
                  <th className="th">Formula</th>
                  <th className="th">With the numbers</th>
                  <th className="th text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l, i) => (
                  <tr key={i} className={l.label.startsWith('Market value adopted') ? 'bg-rose-50/50 font-semibold' : ''}>
                    <td className="td font-medium">{l.label}</td>
                    <td className="td font-mono text-xs text-slate-600">{l.formula}</td>
                    <td className="td font-mono text-xs text-slate-600">{l.working}</td>
                    <td className="td text-right tabular-nums font-semibold">{l.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {v.ready && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Stat label="Market value" value={inrShort(v.mv!)} sub={inr(v.mv!)} tone="maroon" />
              <Stat label={`Forced-sale value (${Math.round(FSV_RATIO * 100)}%)`} value={inrShort(v.fsv!)} sub={inr(v.fsv!)} />
              <Stat label={`Max loan (LTV ${Math.round(v.ltvCap * 100)}%)`} value={inrShort(v.maxLoan!)} sub={inr(v.maxLoan!)} tone="green" />
              <Stat label="Residual life" value={v.residualLife !== null ? `${v.residualLife} yrs` : '—'} sub={v.totalLife ? `economic life ${v.totalLife} yrs` : 'open plot'} />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              <span className="font-semibold">In words:</span> {v.words}
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              Policy defaults: FSV {Math.round(FSV_RATIO * 100)}% of MV; LTV caps residential {Math.round(LTV_CAP.RESIDENTIAL * 100)}% · commercial {Math.round(LTV_CAP.COMMERCIAL * 100)}% · mixed {Math.round(LTV_CAP.MIXED * 100)}% · industrial {Math.round(LTV_CAP.INDUSTRIAL * 100)}%; economic life RCC 60 / load-bearing 50 / steel shed 30 years; 10% salvage.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
