'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Gavel, Globe2, Layers, Loader2, Plus, Sigma, Trash2 } from 'lucide-react';
import type { Application, AuctionPlatform, EvidenceCategory, EvidenceKind, MarketPoint } from '@/lib/domain/types';
import { hasLand, isUnit } from '@/lib/domain/catalog';
import type { Evaluation } from '@/lib/engines/evaluate';
import { auctionBenchmark, CATEGORY_LABEL, correctionText, DATE_SOURCE_LABEL, KIND_LABEL, MAX_COMPARABLE_KM, TIER_LABEL, type Consensus, type Estimate } from '@/lib/engines/evidence';
import type { FinalRate } from '@/lib/engines/purchase';
import { VALUATION as V } from '@/config/valuation';
import { inr, inrShort, rate } from '@/lib/engines/format';
import { FSV_RATIO, LTV_CAP, METHOD_LABEL } from '@/lib/engines/valuation';
import { emptySpec } from '@/lib/mapGeometry';
import { api } from '@/lib/client/api';
import { fileUrl } from '@/lib/client/files';
import type { AppCtl } from '@/lib/client/useApplication';
import { SpecMap } from '@/components/workbench/maps';
import { Badge, Card, Field, Notice, Stat } from '@/components/ui';
import RegisteredSale from './RegisteredSale';
import GovValueCard from './GovValueCard';
import { COVERED_LABEL } from './OwnershipFields';

const CAT_COLOR: Record<EvidenceCategory, string> = { LAND: '#16a34a', BUILT: '#2563eb', GUIDELINE: '#a855f7' };
const BAANKNET_URL = 'https://baanknet.com/property-listing';

/** Auction platform from a listing URL (manual entries). */
function platformOf(url: string): AuctionPlatform {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return h === 'baanknet.com' || h.endsWith('.baanknet.com') ? 'BAANKNET' : h === 'ibapi.in' || h.endsWith('.ibapi.in') ? 'IBAPI' : 'OTHER';
  } catch {
    return 'OTHER';
  }
}

const pctTxt = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const SPREAD_LABEL = { MAD: '1.4826 × weighted MAD', SAMPLE_SD: 'sample SD (n − 1) ÷ mean', SINGLE: 'single point: SE 15%' } as const;

function EstimateLine({ label, e }: { label: string; e: Estimate | null }) {
  if (!e) return null;
  return (
    <div>
      {label}: <b className="text-ink">{rate(e.rate)}</b>, u {pctTxt(e.u)}, n_eff {e.nEff.toFixed(1)}
      {e.rows.length > 1 ? ` · Q = ${e.q.toFixed(2)} vs K − 1 = ${e.rows.length - 1}${e.widened ? ` → u widened × √(Q ÷ (K − 1))` : ' (kinds agree)'}` : ''}
    </div>
  );
}

function ConsensusCard({ c, title }: { c: Consensus | null; title: string }) {
  if (!c) return <Card title={title}><p className="text-sm text-slate-500">No usable data points in this category yet.</p></Card>;
  return (
    <Card
      title={title}
      subtitle={`${c.n} point(s) · n_eff ${c.nEff.toFixed(1)} · weight in T1 ${pctTxt(c.tierShare.T1, 0)} / T2 ${pctTxt(c.tierShare.T2, 0)} / T3 ${pctTxt(c.tierShare.T3, 0)} · weighted median age ${c.medianAgeMonths.toFixed(0)} months`}
    >
      {c.thinMarket && (
        <div className="mb-3">
          <Notice tone="red">Thin market: n_eff of T1 + T2 is {c.nEffT1T2.toFixed(1)} (below {V.t13.blockNeffT1T2}). T13 refers the case for a physical check.</Notice>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Source kind</th>
              <th className="th text-right">n / n_eff</th>
              <th className="th text-right">rₖ (w. median)</th>
              <th className="th">Spread sₖ</th>
              <th className="th text-right">SEₖ</th>
              <th className="th text-right">τₖ</th>
              <th className="th text-right">σₖ ÷ rₖ</th>
              <th className="th text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.kind}>
                <td className="td">
                  {KIND_LABEL[r.kind]}
                  <div className="text-[10px] text-slate-400">{correctionText(r.kind)}</div>
                </td>
                <td className="td text-right tabular-nums">
                  {r.n} / {r.nEff.toFixed(1)}
                </td>
                <td className="td text-right tabular-nums">{rate(r.rate)}</td>
                <td className="td text-xs">
                  {r.spread !== null ? pctTxt(r.spread) : '—'}
                  <div className="text-[10px] text-slate-400">{SPREAD_LABEL[r.spreadMethod]}</div>
                </td>
                <td className="td text-right tabular-nums">{pctTxt(r.se)}</td>
                <td className="td text-right tabular-nums">{pctTxt(r.tau)}</td>
                <td className="td text-right tabular-nums">{pctTxt(r.sigmaRel)}</td>
                <td className="td text-right tabular-nums">{pctTxt(r.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <div className="font-mono">σₖ = rₖ √(SEₖ² + τₖ²), SEₖ = 1.25 × sₖ ÷ √n_eff · R = Σ(rₖ ÷ σₖ²) ÷ Σ(1 ÷ σₖ²) · u = 1 ÷ √Σ(1 ÷ σₖ²)</div>
        <EstimateLine label="Same locality (T1)" e={c.local} />
        <EstimateLine label="All tiers" e={c.all} />
        {c.local ? (
          <div className="font-mono">
            Z = {c.nEffT1.toFixed(1)} ÷ ({c.nEffT1.toFixed(1)} + {V.localBlendK}) = {c.z.toFixed(2)} → R = {c.z.toFixed(2)} × {Math.round(c.local.rate).toLocaleString('en-IN')} + {(1 - c.z).toFixed(2)} × {Math.round(c.all.rate).toLocaleString('en-IN')} ≈ <b className="text-ink">{rate(c.rate)}</b>
          </div>
        ) : (
          <div>No same-locality (T1) points: Z = 0, R = R_all ≈ <b className="text-ink">{rate(c.rate)}</b>.</div>
        )}
        <div>
          u = {pctTxt(c.u)} of the rate · 80% range <b className="text-ink">{rate(c.low)} – {rate(c.high)}</b> (R ± {V.rangeZ} u)
        </div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
        {[
          ['Agreement', c.score.agreement, V.agreement.max, `u ${pctTxt(c.u)}`],
          ['Depth', c.score.depth, V.depth.base + V.depth.bonus, `n_eff ${c.nEff.toFixed(1)}`],
          ['Recency', c.score.recency, V.recency.max, `${c.medianAgeMonths.toFixed(0)} mo`],
          ['Spatial', c.score.spatial, V.spatial.max, `T1 ${pctTxt(c.tierShare.T1, 0)}`],
        ].map(([l, v, max, sub]) => (
          <div key={l as string} className="rounded-lg border border-slate-200 p-2">
            <div className="text-[10px] font-semibold uppercase text-slate-500">{l}</div>
            <div className="font-bold tabular-nums">
              {(v as number).toFixed(1).replace(/\.0$/, '')}/{max}
            </div>
            <div className="text-[10px] text-slate-400">{sub}</div>
          </div>
        ))}
        <div className={`rounded-lg p-2 ${c.score.total >= V.routing.instant ? 'bg-emerald-50' : c.score.total >= V.routing.review ? 'bg-amber-50' : 'bg-red-50'}`}>
          <div className="text-[10px] font-semibold uppercase text-slate-500">Authenticity S</div>
          <div className="text-lg font-extrabold tabular-nums">{c.score.total}</div>
        </div>
      </div>
    </Card>
  );
}

/** A + B + C → the rate the valuation uses (Valuation Logic v2 §1A). */
function RateCard({ f, title }: { f: FinalRate | null; title: string }) {
  if (!f) return null;
  const g = f.guideline;
  const c = f.purchase;
  return (
    <Card title={<span className="flex items-center gap-2"><Layers className="h-4 w-4 text-maroon" /> {title}</span>} subtitle="Market rate (B) and the customer’s own purchase price brought to today (C), weighted by precision; C never above 30%. The official government value (A) is a floor with weight 0.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="A · Government value" value={g ? rate(g.rate) : '—'} sub={g ? (g.official ? `official (IGRS) · floor · market ÷ govt ${(f.blended / g.rate).toFixed(2)}` : 'web search · check only, not a floor') : 'not available'} />
        <Stat label="B · Market rate" value={rate(f.market.rate)} sub={`u ${pctTxt(f.market.u)} · weight ${pctTxt(f.wMarket, 0)}`} />
        <Stat label="C · Purchase price, indexed" value={c ? rate(c.rate) : '—'} sub={c ? `u ${pctTxt(c.u)} · ${c.years.toFixed(1)} yrs · weight ${pctTxt(f.wPurchase, 0)}${f.capped ? ' (capped)' : ''}` : 'not recorded / not applicable'} />
      </div>
      {c && (
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100 text-[0px]" title="Weights">
          <div className="bg-sky-600" style={{ width: `${f.wMarket * 100}%` }} />
          <div className="bg-amber-500" style={{ width: `${f.wPurchase * 100}%` }} />
        </div>
      )}
      {c && (
        <table className="mt-3 w-full text-xs">
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={i}>
                <td className="td font-medium">{l.label}</td>
                <td className="td font-mono text-slate-600">{l.formula}</td>
                <td className="td font-mono text-slate-600">{l.working}</td>
                <td className="td text-right font-semibold tabular-nums">{l.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 rounded-lg bg-rose-50/60 p-3 text-sm">
        Rate used: <b className="tabular-nums">{rate(f.rate)}</b> · 80% range {rate(f.low)} – {rate(f.high)} (u {pctTxt(f.u)})
        {f.floorApplied && <span className="font-semibold text-amber-700"> · held at the government value (floor)</span>}
        {u_wide(f) && <span className="font-semibold text-amber-700"> · u above {V.wideRangeU * 100}%: loan sized on the lower edge</span>}
      </div>
      {f.divergence !== null && f.divergence > V.purchase.divergenceWarn && (
        <div className="mt-2">
          <Notice tone="amber">The indexed purchase price and the market rate are {pctTxt(f.divergence, 0)} apart (more than {V.purchase.divergenceWarn * 100}%): either the declared price is wrong or the listings missed something (T21).</Notice>
        </div>
      )}
    </Card>
  );
}
const u_wide = (f: FinalRate) => f.u > V.wideRangeU;

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
      auction: p.category !== 'GUIDELINE' && p.kind === 'AUCTION' ? { platform: platformOf(p.url) } : undefined,
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
      <div className="mb-3 text-sm font-semibold">Manual comparable (e.g. an auction notice, a past bank valuation, a guideline rate)</div>
      {p.category !== 'GUIDELINE' && p.kind === 'AUCTION' && (
        <p className="mb-3 text-xs text-slate-600">
          Bank auction: open{' '}
          <a href={BAANKNET_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-sky-700 hover:underline">
            BAANKNET <ExternalLink className="h-3 w-3" />
          </a>
          , filter by {a.property.city || 'the city'}, open a property with a declared reserve price (not “indicative”), and copy the reserve price, area and page link here.
        </p>
      )}
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
                  <th className="th">Tier · weight</th>
                  <th className="th">Date</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {list.map(({ point: p, rate: r, corrected, distanceKm, used, excludedReason, tier, weight, tau, tauNotes, notes, dateSource, localityAverage }) => (
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
                      {p.registration && (
                        <div className="mt-0.5 text-[11px] text-slate-600">
                          Registered{p.registration.regDate ? ` ${p.registration.regDate}` : ''}
                          {p.registration.considerationInr ? ` · price ${inr(p.registration.considerationInr)}` : ''}
                          {p.registration.govtValueInr ? ` · govt value ${inr(p.registration.govtValueInr)}` : ''}
                          {p.registration.considerationInr && p.registration.govtValueInr && p.registration.considerationInr < p.registration.govtValueInr && <span className="font-semibold text-amber-700"> · below govt value</span>}
                          {p.registration.fileId && (
                            <>
                              {' · '}
                              <a href={fileUrl(p.registration.fileId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-sky-700 hover:underline">
                                Index II <ExternalLink className="h-3 w-3" />
                              </a>
                            </>
                          )}
                        </div>
                      )}
                      {p.auction?.auctionDate && <div className="mt-0.5 text-[11px] text-slate-600">Auction date {p.auction.auctionDate}</div>}
                      {cat !== 'GUIDELINE' && (notes.length > 0 || tauNotes.length > 0) && (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {notes.join(' · ')}
                          {tauNotes.length > 0 && `${notes.length ? ' · ' : ''}τ ${(tau * 100).toFixed(0)}% (+${tauNotes.join(', +')})`}
                        </div>
                      )}
                      {excludedReason && <div className="text-[11px] font-medium text-amber-700">Not used: {excludedReason}</div>}
                    </td>
                    <td className="td text-xs">
                      {KIND_LABEL[p.kind]}
                      <div className="flex flex-wrap gap-1">
                        {p.registration && <Badge tone="green">Index II</Badge>}
                        {p.auction && p.auction.platform !== 'OTHER' && <Badge tone="amber">{p.auction.platform}</Badge>}
                        {p.origin === 'MANUAL' && <Badge>manual</Badge>}
                        {p.origin === 'OFFICIAL' && <Badge tone="green">IGRS official</Badge>}
                        {localityAverage && <Badge tone="blue">locality avg ×3</Badge>}
                        {p.approxLocation && <Badge>approx. location</Badge>}
                      </div>
                    </td>
                    <td className="td text-right tabular-nums">{r ? rate(r) : '—'}</td>
                    <td className="td text-right tabular-nums">{corrected && cat !== 'GUIDELINE' ? rate(corrected) : '—'}</td>
                    <td className="td text-right tabular-nums text-xs">{distanceKm !== null ? `${distanceKm.toFixed(1)} km` : 'unknown'}</td>
                    <td className="td text-xs">{cat === 'GUIDELINE' ? '—' : `${tier} · ${weight.toFixed(2)}`}</td>
                    <td className="td text-xs">
                      {p.date ?? 'undated'}
                      <div className="text-[10px] text-slate-400">{DATE_SOURCE_LABEL[dateSource]}</div>
                    </td>
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

/** Bank e-auction reserves near the property vs the forced-sale rate PRAMAAN implies — a downside reference. */
function AuctionCard({ ev, unit }: { ev: Evaluation; unit: boolean }) {
  const cat = unit ? 'BUILT' : 'LAND';
  const consensus = unit ? ev.evidence.built : ev.evidence.land;
  const b = auctionBenchmark(ev.evidence.assessed, cat, consensus?.rate ?? null, FSV_RATIO);
  if (!b) return null;
  return (
    <Card title={<span className="flex items-center gap-2"><Gavel className="h-4 w-4 text-maroon" /> Bank-auction benchmark ({CATEGORY_LABEL[cat].toLowerCase()})</span>} subtitle="Reserve prices of bank e-auctions near the property (BAANKNET / IBAPI), compared with the forced-sale rate this valuation implies. A downside reference — not part of the market rate.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Median auction reserve (n = ${b.n})`} value={rate(b.medianReserve)} sub="as listed, no correction" />
        <Stat label={`PRAMAAN forced-sale rate (${Math.round(FSV_RATIO * 100)}% × consensus)`} value={b.fsvRate ? rate(b.fsvRate) : '—'} sub={consensus ? `consensus ${rate(consensus.rate)}` : 'no consensus rate yet'} />
        <Stat label="Auction reserve ÷ PRAMAAN FSV rate" value={b.ratio !== null ? `${Math.round(b.ratio * 100)}%` : '—'} sub={b.ratio === null ? '' : b.ratio < 0.7 ? 'auctions clear well below our FSV — review the FSV' : b.ratio > 1.3 ? 'auctions above our FSV — FSV looks conservative' : 'in line with our FSV'} tone={b.ratio !== null && b.ratio < 0.7 ? 'amber' : undefined} />
      </div>
    </Card>
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
      sp.circles.push(
        { id: 'c1', center: c, radiusM: V.tierKm.T1 * 1000, color: '#16a34a', tooltip: TIER_LABEL.T1 },
        { id: 'c3', center: c, radiusM: V.tierKm.T2 * 1000, color: '#f59e0b', tooltip: TIER_LABEL.T2 },
        { id: 'c10', center: c, radiusM: MAX_COMPARABLE_KM * 1000, color: '#94a3b8', tooltip: `${MAX_COMPARABLE_KM} km — farther points not used` },
      );
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
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />} {fetching ? 'Searching (about a minute)…' : m.fetchedAt ? 'Fetch again' : 'Fetch market evidence'}
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
              Valuation Logic v2 defaults (uncalibrated, shown so they can be challenged): listings × (1 − {V.listingDiscount}), τ {V.tau.LISTING}; sales × {V.kReg.toFixed(2)}, τ {V.tau.SALE}; auctions ÷ {V.auctionForcedSaleRatio}, τ {V.tau.AUCTION}, only in T1 / T2. Tiers T1 ≤ {V.tierKm.T1} km or same locality (weight 1), T2 ≤ {V.tierKm.T2} km (0.5), T3 ≤ {V.tierKm.T3} km or unknown (0.25); weight halves every {V.recencyHalfLifeMonths} months; undated = {V.undatedAgeMonths} months. Comparables must match the usage and type; outliers beyond {V.outlierRobustSd} robust SD of the log-rate are dropped.
            </Notice>
            <div className="flex flex-wrap gap-2">
              <RegisteredSale ctl={ctl} />
              <ManualPoint ctl={ctl} />
            </div>
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

      <GovValueCard ctl={ctl} ev={ev} />

      <div className="grid gap-5 xl:grid-cols-2">
        {hasLand(a.property.type) && <ConsensusCard c={ev.evidence.land} title="Market land rate (B)" />}
        {a.property.type !== 'PLOT' && <ConsensusCard c={ev.evidence.built} title={isUnit(a.property.type) ? 'Market built-property rate (B)' : 'Built-property rate (cross-check)'} />}
      </div>

      <RateCard f={isUnit(a.property.type) ? ev.rates.BUILT : ev.rates.LAND} title={`Rate used for the valuation — ${isUnit(a.property.type) ? 'built-up' : 'land'}`} />
      {ev.rates.purchase && !ev.rates.purchase.applicable && (
        <Notice tone="amber">Purchase price not used: {ev.rates.purchase.reason}{a.ownership?.covered ? ` (covered: ${COVERED_LABEL[a.ownership.covered]})` : ''}.</Notice>
      )}

      <AuctionCard ev={ev} unit={isUnit(a.property.type)} />

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
              <Stat label="Market value" value={inrShort(v.mv!)} sub={v.mvLow !== null && v.mvHigh !== null ? `80% range ${inrShort(v.mvLow)} – ${inrShort(v.mvHigh)}` : inr(v.mv!)} tone="maroon" />
              <Stat label={`Forced-sale value (${Math.round(FSV_RATIO * 100)}%)`} value={inrShort(v.fsv!)} sub={inr(v.fsv!)} />
              <Stat label={`Max loan (LTV ${Math.round(v.ltvCap * 100)}%)`} value={inrShort(v.maxLoan!)} sub={v.wideRange ? 'sized on the lower edge (wide range)' : inr(v.maxLoan!)} tone="green" />
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
