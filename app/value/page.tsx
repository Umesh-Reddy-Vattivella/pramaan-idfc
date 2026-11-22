'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe,
  History,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { LiveEvidenceSnapshot, MarketDataPoint, MarketPointKind, UsageClass } from '@/lib/types';
import { useCases } from '@/lib/state/CasesContext';
import { aggregateLiveEvidence, distanceKm, pointRate } from '@/lib/engines/marketEvidence';
import { evaluateCase } from '@/lib/engines/evaluateCase';
import { formatIndianNumber, formatInr, formatInrShort } from '@/lib/engines/valuation';
import { SPATIAL_TIER_LABEL } from '@/lib/engines/price';
import { USAGE_LABEL } from '@/lib/engines/usage';
import { buildNewPropertyCase, EMPTY_FORM, snapshotMode, type NewPropertyForm } from '@/lib/data/newPropertyCase';
import { PinMap } from '@/components/workbench/maps';
import { RouteBadge, ScorePill } from '@/components/StatusBadges';

interface GeoPlace {
  lat: number;
  lng: number;
  displayName: string;
  locality?: string;
  city?: string;
  state?: string;
}

const SNAP_KEY = 'pramaan.marketSnapshots';
const KIND_LABEL: Record<MarketPointKind, string> = { SALE: 'Reported sale', LISTING: 'Listing', AUCTION: 'Auction', RERA: 'RERA / builder', GUIDELINE: 'Guideline rate' };
const USAGES: UsageClass[] = ['RESIDENTIAL', 'COMMERCIAL', 'MIXED_USE', 'INDUSTRIAL', 'INSTITUTIONAL'];

const snapKey = (lat: number, lng: number, usage: string) => `${lat.toFixed(3)},${lng.toFixed(3)}|${usage}`;
function loadSnaps(): Record<string, LiveEvidenceSnapshot> {
  try {
    return JSON.parse(localStorage.getItem(SNAP_KEY) ?? '{}') as Record<string, LiveEvidenceSnapshot>;
  } catch {
    return {};
  }
}
function saveSnap(key: string, s: LiveEvidenceSnapshot) {
  try {
    const all = loadSnaps();
    all[key] = s;
    localStorage.setItem(SNAP_KEY, JSON.stringify(all));
  } catch {
    /* storage full — ignore */
  }
}
const host = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

export default function ValueNewPropertyPage() {
  const router = useRouter();
  const { upsertCase } = useCases();
  const startedAt = useRef(0);
  const [f, setF] = useState<NewPropertyForm>(EMPTY_FORM);
  const set = <K extends keyof NewPropertyForm>(k: K, v: NewPropertyForm[K]) => setF((s) => ({ ...s, [k]: v }));

  const [query, setQuery] = useState('');
  const [geo, setGeo] = useState<{ busy: boolean; results: GeoPlace[]; error: string | null }>({ busy: false, results: [], error: null });
  const [snapshot, setSnapshot] = useState<LiveEvidenceSnapshot | null>(null);
  const [fetchState, setFetchState] = useState<{ busy: boolean; error: string | null; cached: LiveEvidenceSnapshot | null }>({ busy: false, error: null, cached: null });

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  /* ---------------- Location ---------------- */

  const search = async () => {
    if (query.trim().length < 3) return;
    setGeo({ busy: true, results: [], error: null });
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const j = (await r.json()) as { results?: GeoPlace[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setGeo({ busy: false, results: j.results ?? [], error: j.results?.length ? null : 'No matches — try a broader address, or click the map.' });
    } catch (e) {
      setGeo({ busy: false, results: [], error: `Geocoder unavailable (${e instanceof Error ? e.message : 'error'}) — click the map or type coordinates.` });
    }
  };

  const choose = (p: GeoPlace) => {
    setF((s) => ({
      ...s,
      lat: p.lat,
      lng: p.lng,
      address: p.displayName,
      locality: p.locality ?? s.locality,
      city: p.city ?? s.city,
      state: p.state ?? s.state,
      title: s.title || `Property — ${[p.locality, p.city].filter(Boolean).join(', ')}`,
    }));
    setGeo((g) => ({ ...g, results: [] }));
  };

  const pick = async (lat: number, lng: number) => {
    setF((s) => ({ ...s, lat, lng }));
    try {
      const r = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
      const j = (await r.json()) as { result?: GeoPlace | null };
      const p = j.result;
      if (p) setF((s) => ({ ...s, address: p.displayName, locality: p.locality ?? s.locality, city: p.city ?? s.city, state: p.state ?? s.state, title: s.title || `Property — ${[p.locality, p.city].filter(Boolean).join(', ')}` }));
    } catch {
      /* offline — keep coordinates */
    }
  };

  /* ---------------- Market evidence ---------------- */

  const fetchEvidence = async () => {
    if (f.lat === null || f.lng === null) return;
    const key = snapKey(f.lat, f.lng, f.usage);
    setFetchState({ busy: true, error: null, cached: null });
    try {
      const r = await fetch('/api/market-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: f.lat, lng: f.lng, address: f.address, locality: f.locality, city: f.city, state: f.state, usage: f.usage }),
      });
      const raw = (await r.json()) as Omit<Partial<LiveEvidenceSnapshot>, 'mode'> & { mode?: string; reason?: string; error?: string };
      if (!r.ok || raw.mode === 'UNAVAILABLE' || !Array.isArray(raw.points)) throw new Error(raw.reason ?? raw.error ?? `HTTP ${r.status}`);
      const j = raw as unknown as LiveEvidenceSnapshot;
      const manual = snapshot?.points.filter((p) => p.origin === 'MANUAL') ?? [];
      const merged: LiveEvidenceSnapshot = { ...j, points: [...j.points, ...manual], mode: snapshotMode([...j.points, ...manual]) };
      setSnapshot(merged);
      saveSnap(key, merged);
      setFetchState({ busy: false, error: null, cached: null });
    } catch (e) {
      setFetchState({ busy: false, error: e instanceof Error ? e.message : 'Live search failed', cached: loadSnaps()[key] ?? null });
    }
  };

  const updatePoints = (fn: (pts: MarketDataPoint[]) => MarketDataPoint[]) =>
    setSnapshot((s) => {
      const base: LiveEvidenceSnapshot = s ?? { fetchedAt: new Date().toISOString(), mode: 'MANUAL', queries: [], citations: [], points: [], rejected: [] };
      const points = fn(base.points);
      return { ...base, points, mode: snapshotMode(points) };
    });

  const addManual = async (p: Omit<MarketDataPoint, 'id' | 'origin' | 'included'>) => {
    let coords: { lat?: number; lng?: number } = {};
    if (p.locality) {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent([p.locality, f.city, f.state].filter(Boolean).join(', '))}`);
        const j = (await r.json()) as { results?: GeoPlace[] };
        const hit = j.results?.[0];
        if (hit) coords = { lat: hit.lat, lng: hit.lng };
      } catch {
        /* keep without coordinates */
      }
    }
    updatePoints((pts) => [...pts, { ...p, ...coords, id: `manual-${Date.now().toString(36)}`, origin: 'MANUAL', included: true }]);
  };

  /* ---------------- Live engine preview ---------------- */

  const subject = f.lat !== null && f.lng !== null ? { lat: f.lat, lng: f.lng } : null;
  const agg = useMemo(() => aggregateLiveEvidence(snapshot?.points ?? [], subject ?? { lat: 0, lng: 0 }, new Date()), [snapshot, subject?.lat, subject?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => {
    const c = buildNewPropertyCase('preview-000000', f, agg, snapshot, 1);
    return { c, e: evaluateCase(c) };
  }, [f, agg, snapshot]);

  const hasBuilding = f.floors.some((x) => x.actualSqft > 0);
  const blockers = [
    !subject && 'Set the property location (search or click the map).',
    !(f.deedPlotAreaSqft > 0) && 'Enter the plot area.',
    hasBuilding && !(f.constructionRatePerSqft > 0) && 'Enter the construction rate (as-valued) for the built-up area.',
    agg.usable === 0 && 'Add at least one priced market data point (live search or manual).',
  ].filter(Boolean) as string[];

  const create = () => {
    if (blockers.length) return;
    const id = `live-market-${Date.now().toString(36)}`;
    const tat = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    upsertCase(buildNewPropertyCase(id, f, agg, snapshot, tat));
    router.push(`/cases/${encodeURIComponent(id)}`);
  };

  const pe = preview.e;
  const points = snapshot?.points ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Value a New Property — Live Market Evidence</h1>
        <p className="text-sm text-slate-500">
          Any address in India. Live search extracts printed prices with source links; Engine 2 computes every rate, correction, weight and score.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        {/* ================= LEFT: property ================= */}
        <div className="space-y-5">
          <Card title="1 · Location" icon={<MapPin className="h-4 w-4 text-maroon" />}>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="e.g. Civil Lines, Nagpur  or  Koramangala 5th Block, Bengaluru"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button onClick={search} disabled={geo.busy} className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {geo.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find
              </button>
            </div>
            {geo.error && <p className="mt-1 text-xs text-remote">{geo.error}</p>}
            {geo.results.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {geo.results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button onClick={() => choose(r)} className="w-full px-3 py-2 text-left text-xs hover:bg-canvas">
                      {r.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <PinMap center={subject ? [subject.lat, subject.lng] : [21.1458, 79.0882]} pin={subject ? [subject.lat, subject.lng] : null} onPick={pick} height={280} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Field label="Latitude">
                <input type="number" step="0.000001" value={f.lat ?? ''} onChange={(e) => set('lat', e.target.value === '' ? null : Number(e.target.value))} className="input" />
              </Field>
              <Field label="Longitude">
                <input type="number" step="0.000001" value={f.lng ?? ''} onChange={(e) => set('lng', e.target.value === '' ? null : Number(e.target.value))} className="input" />
              </Field>
              <Field label="Locality">
                <input value={f.locality} onChange={(e) => set('locality', e.target.value)} className="input" />
              </Field>
              <Field label="City">
                <input value={f.city} onChange={(e) => set('city', e.target.value)} className="input" />
              </Field>
            </div>
          </Card>

          <Card title="2 · Property details (from deed / plan / owner)" icon={<Database className="h-4 w-4 text-maroon" />}>
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <Field label="Title" wide>
                <input value={f.title} onChange={(e) => set('title', e.target.value)} className="input" />
              </Field>
              <Field label="Usage">
                <select value={f.usage} onChange={(e) => set('usage', e.target.value as UsageClass)} className="input">
                  {USAGES.map((u) => (
                    <option key={u} value={u}>{USAGE_LABEL[u]}</option>
                  ))}
                </select>
              </Field>
              <NumField label="Plot area — deed (sqft)" value={f.deedPlotAreaSqft} onChange={(v) => set('deedPlotAreaSqft', v ?? 0)} />
              <NumField label="Plot area — land record (sqft, optional)" value={f.recordPlotAreaSqft} onChange={(v) => set('recordPlotAreaSqft', v)} />
              <NumField label="Road-widening loss (sqft)" value={f.roadWideningLossSqft} onChange={(v) => set('roadWideningLossSqft', v ?? 0)} />
              <NumField label="Approach road (ft)" value={f.roadWidthFt} onChange={(v) => set('roadWidthFt', v ?? 0)} />
              <NumField label="Age (years)" value={f.ageYears} onChange={(v) => set('ageYears', v ?? 0)} />
              <NumField label="Residual life (years)" value={f.residualLifeYears} onChange={(v) => set('residualLifeYears', v ?? 0)} />
              <NumField label="Construction rate, as-valued (Rs./sqft)" value={f.constructionRatePerSqft} onChange={(v) => set('constructionRatePerSqft', v ?? 0)} />
              <NumField label="Amenities (Rs.)" value={f.amenitiesValueInr} onChange={(v) => set('amenitiesValueInr', v ?? 0)} />
              <Field label="FSV ratio">
                <select value={f.fsvRatio} onChange={(e) => set('fsvRatio', Number(e.target.value))} className="input">
                  <option value={0.8}>80%</option>
                  <option value={0.85}>85%</option>
                </select>
              </Field>
              <NumField label="Requested loan (Rs., optional)" value={f.requestedLoanInr} onChange={(v) => set('requestedLoanInr', v)} />
              <NumField label="Monthly rent (Rs., if leased)" value={f.monthlyRentInr} onChange={(v) => set('monthlyRentInr', v)} />
            </div>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <Check label="Sanctioned plan available" checked={f.hasSanctionedPlan} onChange={(v) => set('hasSanctionedPlan', v)} />
              {!f.hasSanctionedPlan && (
                <label className="flex items-center gap-1.5">
                  No-plan policy:
                  <select value={f.noPlanPolicy} onChange={(e) => set('noPlanPolicy', e.target.value as NewPropertyForm['noPlanPolicy'])} className="rounded border border-slate-300 px-1 py-0.5">
                    <option value="LAND_ONLY">Land only</option>
                    <option value="INSTITUTIONAL_EXCEPTION">Exception (value BUA)</option>
                  </select>
                </label>
              )}
              <Check label="Irregular / non-standard property" checked={!f.isTypicalProperty} onChange={(v) => set('isTypicalProperty', !v)} />
            </div>

            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Floors (sqft)</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-1">Floor</th>
                    <th className="pb-1">{f.hasSanctionedPlan ? 'Sanctioned' : 'Permissible'}</th>
                    <th className="pb-1">Actual</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {f.floors.map((fl, i) => (
                    <tr key={i}>
                      <td className="pr-1 py-0.5"><input value={fl.floorName} onChange={(e) => set('floors', f.floors.map((x, j) => (j === i ? { ...x, floorName: e.target.value } : x)))} className="input" /></td>
                      <td className="pr-1 py-0.5"><input type="number" min={0} value={fl.sanctionedSqft || ''} onChange={(e) => set('floors', f.floors.map((x, j) => (j === i ? { ...x, sanctionedSqft: Number(e.target.value) || 0 } : x)))} className="input" /></td>
                      <td className="pr-1 py-0.5"><input type="number" min={0} value={fl.actualSqft || ''} onChange={(e) => set('floors', f.floors.map((x, j) => (j === i ? { ...x, actualSqft: Number(e.target.value) || 0 } : x)))} className="input" /></td>
                      <td>
                        <button onClick={() => set('floors', f.floors.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-critical" aria-label="Remove floor">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => set('floors', [...f.floors, { floorName: `Floor ${f.floors.length}`, sanctionedSqft: 0, actualSqft: 0 }])} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-maroon">
                <Plus className="h-3.5 w-3.5" /> Add floor
              </button>
            </div>

            <label className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-slate-300 p-2.5 text-xs">
              <input type="checkbox" checked={f.captureCompleted} onChange={(e) => set('captureCompleted', e.target.checked)} className="mt-0.5 accent-[#9C1D26]" />
              <span>
                <span className="font-semibold text-ink">Owner self-capture completed (demo simulation)</span>
                <span className="block text-slate-500">Marks all Trust Layer checks as passed. Leave unticked to show the conservative route until the owner completes capture.</span>
              </span>
            </label>
          </Card>
        </div>

        {/* ================= RIGHT: market evidence ================= */}
        <div className="space-y-5">
          <Card title="3 · Live market evidence (Engine 2 input)" icon={<Globe className="h-4 w-4 text-maroon" />}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={fetchEvidence}
                disabled={!subject || fetchState.busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-maroon-deep disabled:opacity-40"
              >
                {fetchState.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                {fetchState.busy ? 'Searching the web…' : 'Fetch live market evidence'}
              </button>
              {snapshot && snapshot.mode !== 'MANUAL' && (
                <span className="text-xs text-slate-500">
                  Fetched {new Date(snapshot.fetchedAt).toLocaleString('en-IN')} · {snapshot.model} · {snapshot.citations.length} cited pages
                </span>
              )}
            </div>
            {!subject && <p className="mt-1 text-xs text-slate-400">Set the location first.</p>}
            {fetchState.error && (
              <div className="mt-2 rounded-lg bg-remote-bg px-3 py-2 text-xs text-remote">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Live search unavailable: {fetchState.error} Add comparables manually below.</span>
                </div>
                {fetchState.cached && (
                  <button onClick={() => setSnapshot(fetchState.cached)} className="mt-1.5 inline-flex items-center gap-1 font-semibold text-maroon">
                    <History className="h-3.5 w-3.5" /> Use cached snapshot from {new Date(fetchState.cached.fetchedAt).toLocaleString('en-IN')}
                  </button>
                )}
              </div>
            )}
            {snapshot && snapshot.queries.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">Searches run: {snapshot.queries.map((q) => `"${q}"`).join(' · ')}</p>
            )}

            {points.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                      <th className="pb-1.5">Use</th>
                      <th className="pb-1.5">Type</th>
                      <th className="pb-1.5">Locality / title</th>
                      <th className="pb-1.5 text-right">Price</th>
                      <th className="pb-1.5 text-right">Area</th>
                      <th className="pb-1.5 text-right">Rate /sqft</th>
                      <th className="pb-1.5 text-right">Dist.</th>
                      <th className="pb-1.5">Date</th>
                      <th className="pb-1.5">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {points.map((p) => {
                      const r = pointRate(p);
                      const out = agg.outliers.includes(p.id);
                      const d = subject && p.lat !== undefined && p.lng !== undefined ? distanceKm(subject, { lat: p.lat, lng: p.lng }) : null;
                      return (
                        <tr key={p.id} className={!p.included ? 'text-slate-300' : out ? 'bg-remote-bg/50' : ''}>
                          <td className="py-1.5">
                            <input type="checkbox" checked={p.included} onChange={(e) => updatePoints((pts) => pts.map((x) => (x.id === p.id ? { ...x, included: e.target.checked } : x)))} className="accent-[#9C1D26]" />
                          </td>
                          <td className="py-1.5 pr-2">
                            {KIND_LABEL[p.kind]}
                            {p.origin === 'MANUAL' && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px]">manual</span>}
                          </td>
                          <td className="max-w-[180px] truncate py-1.5 pr-2" title={p.title}>
                            {p.locality ?? '—'}
                            {p.title && <span className="block truncate text-[10px] text-slate-400">{p.title}</span>}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{p.priceInr ? formatInrShort(p.priceInr) : '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{p.areaSqft ? formatIndianNumber(p.areaSqft) : '—'}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">
                            {r === null ? '—' : formatIndianNumber(Math.round(r))}
                            {out && <span className="block text-[10px] font-normal text-remote">outlier — excluded</span>}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{d === null ? '—' : `${d.toFixed(1)} km`}</td>
                          <td className="py-1.5">{p.date ?? '—'}</td>
                          <td className="py-1.5">
                            {p.url ? (
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-maroon hover:underline">
                                {host(p.url) || 'link'} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {snapshot && snapshot.rejected.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-slate-500">{snapshot.rejected.length} result(s) rejected by verification</summary>
                <ul className="mt-1 space-y-0.5 text-slate-500">
                  {snapshot.rejected.map((x, i) => (
                    <li key={i} className="flex gap-1.5">
                      <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-critical" />
                      <span>
                        {x.title ?? host(x.url) ?? 'Item'} — {x.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <ManualEntry onAdd={addManual} />
          </Card>

          {/* Live engine preview */}
          <Card title="4 · Live engine preview" icon={<CheckCircle2 className="h-4 w-4 text-maroon" />}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Consensus land rate" value={pe.price.rConsensus > 0 ? `Rs. ${formatIndianNumber(Math.round(pe.price.rConsensus))}` : '—'} sub={pe.price.rConsensus > 0 ? `range ${formatIndianNumber(Math.round(pe.price.rLow))}–${formatIndianNumber(Math.round(pe.price.rHigh))}` : 'no priced evidence'} />
              <Stat label="Authenticity" value={<ScorePill score={pe.price.authenticity.score} />} sub={`${pe.price.authenticity.nComps} pts · ${SPATIAL_TIER_LABEL[agg.spatialTier].split(':')[0]}`} />
              <Stat label="Market Value" value={pe.valuation.mvFinal > 0 ? formatInrShort(pe.valuation.mvFinal) : '—'} sub={pe.valuation.mvFinal > 0 ? formatInr(pe.valuation.mvFinal) : ''} />
              <Stat label="Route" value={<RouteBadge tier={pe.routing.tier} />} sub={pe.routing.sla} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {agg.priceSources.filter((s) => s.weight > 0).map((s) => `${s.label}: n=${s.count}, w=${Math.round(s.weight * 100)}%`).join(' · ') || 'No sources yet.'}
              {agg.circleRatePerSqft > 0 && ` · guideline Rs. ${formatIndianNumber(agg.circleRatePerSqft)}/sqft`}
            </p>
            {blockers.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-xs text-remote">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <button
              onClick={create}
              disabled={blockers.length > 0}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-maroon py-2.5 text-sm font-bold text-white hover:bg-maroon-deep disabled:opacity-40"
            >
              Create case &amp; open Workbench <ArrowRight className="h-4 w-4" />
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- small UI pieces ---------------- */

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold text-ink">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'col-span-2' : ''}`}>
      <span className="mb-0.5 block font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        value={value === null || value === 0 ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
        className="input"
      />
    </Field>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#9C1D26]" />
      {label}
    </label>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg bg-canvas p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-ink tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 tabular-nums">{sub}</div>}
    </div>
  );
}

function ManualEntry({ onAdd }: { onAdd: (p: Omit<MarketDataPoint, 'id' | 'origin' | 'included'>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState({ kind: 'LISTING' as MarketPointKind, locality: '', price: '', area: '', rate: '', date: '', url: '', title: '' });
  const n = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/[,\s]/g, '')) || undefined);
  const valid = !!(n(m.rate) || (n(m.price) && n(m.area)));
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    await onAdd({ kind: m.kind, locality: m.locality || undefined, priceInr: n(m.price), areaSqft: n(m.area), statedRatePerSqft: n(m.rate), date: m.date || undefined, url: m.url || undefined, title: m.title || undefined });
    setM({ ...m, locality: '', price: '', area: '', rate: '', url: '', title: '' });
    setBusy(false);
  };
  return (
    <div className="mt-3 rounded-lg border border-slate-200">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-maroon">
        <Plus className="h-3.5 w-3.5" /> Add comparable manually {open ? '' : '(fallback if live search is unavailable)'}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 text-xs sm:grid-cols-4">
          <Field label="Type">
            <select value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value as MarketPointKind })} className="input">
              {(Object.keys(KIND_LABEL) as MarketPointKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Locality">
            <input value={m.locality} onChange={(e) => setM({ ...m, locality: e.target.value })} className="input" />
          </Field>
          <Field label="Price (Rs.)">
            <input value={m.price} onChange={(e) => setM({ ...m, price: e.target.value })} inputMode="numeric" className="input" />
          </Field>
          <Field label="Area (sqft)">
            <input value={m.area} onChange={(e) => setM({ ...m, area: e.target.value })} inputMode="numeric" className="input" />
          </Field>
          <Field label="…or rate (Rs./sqft)">
            <input value={m.rate} onChange={(e) => setM({ ...m, rate: e.target.value })} inputMode="numeric" className="input" />
          </Field>
          <Field label="Date (YYYY-MM)">
            <input value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} placeholder="2026-10" className="input" />
          </Field>
          <Field label="Source URL" wide>
            <input value={m.url} onChange={(e) => setM({ ...m, url: e.target.value })} placeholder="https://…" className="input" />
          </Field>
          <div className="col-span-2 flex items-end justify-end sm:col-span-4">
            <button onClick={submit} disabled={!valid || busy} className="inline-flex items-center gap-1 rounded-lg bg-maroon px-3 py-1.5 font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add data point
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
