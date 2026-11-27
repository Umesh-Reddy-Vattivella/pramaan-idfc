'use client';

/**
 * Collect REAL market evidence for a case: live web search (Tavily + LLM extraction with quoted source text)
 * and/or comparables entered by the valuer WITH a source link. Aggregation is pure TS (lib/engines/marketEvidence).
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Globe, Loader2, Plus, Trash2 } from 'lucide-react';
import type { LiveEvidenceSnapshot, MarketDataPoint, MarketPointKind, PropertyCase } from '@/lib/types';
import { useCases } from '@/lib/state/CasesContext';
import { aggregateLiveEvidence, pointRate } from '@/lib/engines/marketEvidence';
import { snapshotMode } from '@/lib/data/newPropertyCase';
import { formatIndianNumber } from '@/lib/engines/valuation';

const KIND_LABEL: Record<MarketPointKind, string> = { SALE: 'Registered / reported sale', LISTING: 'Portal listing', AUCTION: 'Bank auction', RERA: 'RERA / builder', GUIDELINE: 'Circle / guideline rate' };
const host = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

export default function MarketEvidencePanel({ c, ready }: { c: PropertyCase; ready: boolean }) {
  const { updateCase } = useCases();
  const [snap, setSnap] = useState<LiveEvidenceSnapshot | null>(c.liveEvidence ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [m, setM] = useState({ kind: 'SALE' as MarketPointKind, priceInr: '', areaSqft: '', rate: '', locality: '', date: '', url: '' });

  const agg = useMemo(() => aggregateLiveEvidence(snap?.points ?? [], { lat: c.lat, lng: c.lng }, new Date()), [snap, c.lat, c.lng]);
  const usable = agg.priceSources.filter((s) => s.weight > 0).length;

  const fetchLive = async () => {
    setBusy(true);
    setErr(null);
    try {
      const address = c.details?.find((d) => d.label === 'Full Address')?.value ?? c.title;
      const r = await fetch('/api/market-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: c.lat, lng: c.lng, address, locality: '', city: c.city, state: c.state, usage: c.recordConfirmedUsage }),
      });
      const raw = (await r.json()) as Omit<Partial<LiveEvidenceSnapshot>, 'mode'> & { mode?: string; reason?: string; error?: string };
      if (!r.ok || raw.mode === 'UNAVAILABLE' || !Array.isArray(raw.points)) throw new Error(raw.reason ?? raw.error ?? `HTTP ${r.status}`);
      const manual = snap?.points.filter((p) => p.origin === 'MANUAL') ?? [];
      const points = [...(raw.points as MarketDataPoint[]), ...manual];
      setSnap({ ...(raw as unknown as LiveEvidenceSnapshot), points, mode: snapshotMode(points) });
    } catch (e) {
      setErr(`Live search unavailable: ${e instanceof Error ? e.message : 'error'}. Add sourced comparables manually below.`);
    } finally {
      setBusy(false);
    }
  };

  const addManual = () => {
    const price = Number(m.priceInr) || undefined;
    const area = Number(m.areaSqft) || undefined;
    const rate = Number(m.rate) || undefined;
    if (!m.url.trim() || (!rate && !(price && area))) return;
    const p: MarketDataPoint = {
      id: `manual-${Date.now().toString(36)}`,
      kind: m.kind,
      priceInr: price,
      areaSqft: area,
      statedRatePerSqft: rate,
      locality: m.locality || undefined,
      date: m.date || undefined,
      url: m.url.trim(),
      title: `Entered by valuer · ${host(m.url)}`,
      origin: 'MANUAL',
      included: true,
    };
    setSnap((s) => {
      const base: LiveEvidenceSnapshot = s ?? { fetchedAt: new Date().toISOString(), mode: 'MANUAL', queries: [], citations: [], points: [], rejected: [] };
      const points = [...base.points, p];
      return { ...base, points, mode: snapshotMode(points) };
    });
    setM({ ...m, priceInr: '', areaSqft: '', rate: '', url: '' });
  };

  const toggle = (id: string) =>
    setSnap((s) => (s ? { ...s, points: s.points.map((p) => (p.id === id ? { ...p, included: !p.included } : p)) } : s));
  const remove = (id: string) => setSnap((s) => (s ? { ...s, points: s.points.filter((p) => p.id !== id) } : s));

  const apply = () => {
    if (!snap) return;
    updateCase(c.id, {
      priceSources: agg.priceSources,
      comparables: agg.comparables,
      circleRatePerSqft: agg.circleRatePerSqft,
      spatialFallbackTier: agg.spatialTier,
      liveEvidence: snap,
    });
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Globe className="h-4 w-4 text-maroon" /> Market evidence {ready ? '' : '— needed to value this property'}
          </h2>
          <p className="text-xs text-slate-500">
            Only real data: live search results quote their source page; manual comparables need a source link. Nothing is filled in by default.
          </p>
        </div>
        <button onClick={fetchLive} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Fetch live comparables near the pin
        </button>
      </div>
      {err && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{err}</p>}

      {snap && snap.points.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Use</th>
                <th>Type</th>
                <th>Locality / title</th>
                <th className="pr-4 text-right">Rate (Rs./sqft)</th>
                <th className="pr-3">Date</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snap.points.map((p) => {
                const rate = pointRate(p);
                return (
                  <tr key={p.id} className={p.included ? '' : 'opacity-40'}>
                    <td className="py-1">
                      <input type="checkbox" checked={p.included} onChange={() => toggle(p.id)} className="accent-[#9C1D26]" />
                    </td>
                    <td>{KIND_LABEL[p.kind]}</td>
                    <td className="max-w-[260px] truncate" title={p.quote ?? p.title}>
                      {p.locality ?? p.title ?? '—'}
                      {agg.outliers.includes(p.id) && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">outlier</span>}
                    </td>
                    <td className="pr-4 text-right tabular-nums">{rate ? formatIndianNumber(Math.round(rate)) : '—'}</td>
                    <td className="pr-3">{p.date ?? '—'}</td>
                    <td>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-maroon">
                          {host(p.url)} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button onClick={() => remove(p.id)} className="p-1 text-slate-400 hover:text-critical" aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">Add a comparable you have verified (source link required)</div>
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <select value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value as MarketPointKind })} className="input">
            {(Object.keys(KIND_LABEL) as MarketPointKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input className="input" placeholder="Price (Rs.)" inputMode="numeric" value={m.priceInr} onChange={(e) => setM({ ...m, priceInr: e.target.value.replace(/\D/g, '') })} />
          <input className="input" placeholder="Area (sqft)" inputMode="numeric" value={m.areaSqft} onChange={(e) => setM({ ...m, areaSqft: e.target.value.replace(/\D/g, '') })} />
          <input className="input" placeholder="…or rate Rs./sqft" inputMode="numeric" value={m.rate} onChange={(e) => setM({ ...m, rate: e.target.value.replace(/\D/g, '') })} />
          <input className="input" placeholder="Locality" value={m.locality} onChange={(e) => setM({ ...m, locality: e.target.value })} />
          <input className="input" placeholder="Date (YYYY-MM)" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
          <input className="input col-span-2" placeholder="Source URL (listing / IGR / auction notice)" value={m.url} onChange={(e) => setM({ ...m, url: e.target.value })} />
        </div>
        <button onClick={addManual} disabled={!m.url.trim() || (!m.rate && !(m.priceInr && m.areaSqft))} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-maroon px-3 py-1.5 text-xs font-semibold text-maroon disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" /> Add comparable
        </button>
      </div>

      {snap && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3">
          <p className="text-sm text-slate-700">
            {agg.usable} usable data point(s) → {usable} weighted source(s)
            {agg.medianDistanceKm !== null ? ` · median ${agg.medianDistanceKm.toFixed(1)} km from the pin` : ''}
            {agg.circleRatePerSqft ? ` · circle rate Rs. ${formatIndianNumber(agg.circleRatePerSqft)}/sqft` : ''}
          </p>
          <button onClick={apply} disabled={usable === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-instant px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            <CheckCircle2 className="h-4 w-4" /> Use this evidence for the valuation
          </button>
        </div>
      )}
    </section>
  );
}
