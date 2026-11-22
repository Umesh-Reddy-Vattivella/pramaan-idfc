'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Languages, MapPin, XCircle } from 'lucide-react';
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { formatIndianNumber, formatPctTrunc } from '@/lib/engines/valuation';
import { SERIES_ACTUAL, SERIES_REFERENCE, SERIES_TEMPORARY } from '@/lib/sourceMeta';
import { Ev } from '@/components/EvidenceDrawer';
import { SatelliteMap } from './maps';

const HAZARD_LABEL: Record<string, string> = {
  in_forest_buffer: 'Forest buffer',
  in_road_widening: 'Road widening',
  in_crz_waterbody: 'CRZ / waterbody',
  near_ht_line: 'HT line',
  caution_area: 'Caution area',
  negative_area: 'Negative area',
  ogl_area: 'OGL area',
};

export default function MeasureTab({ c, e }: { c: PropertyCase; e: EvidencePack }) {
  const m = e.measure;
  const refLabel = m.deviationReference === 'BYLAWS_PERMISSIBLE' ? 'Permissible' : 'Sanctioned';
  const chartData = c.floors.map((f) => ({
    floor: f.floorName.replace(/\s*\(.*\)$/, ''),
    reference: f.sanctionedSqft,
    actual: f.actualSqft,
    temporary: !!f.isTinShedOrTemporary,
  }));

  const areaRows = [
    { label: 'Sale Deed area', value: c.deedPlotAreaSqft, k: undefined as string | undefined, note: 'Deed OCR' },
    { label: 'Patta / Cadastral area', value: c.cadastralPlotAreaSqft, k: undefined, note: 'Land record' },
    { label: 'Road widening loss', value: -c.roadWideningLossSqft, k: undefined, note: c.roadWidthProposedFt ? `${c.roadWidthCurrentFt} ft → ${c.roadWidthProposedFt} ft road` : 'None' },
    { label: 'Net valued area (A_net)', value: m.aNet, k: 'aNet', note: 'min(deed, record) − widening', strong: true },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {/* Area reconciliation */}
      <section className="card p-5">
        <h2 className="text-base font-bold text-ink">Area Reconciliation</h2>
        <p className="mb-3 text-xs text-slate-500">
          A* = {formatIndianNumber(Math.round(m.areaReconciliation.aStar))} sqft · variance flag{' '}
          {m.areaReconciliation.areaVarianceFlag ? <span className="font-semibold text-critical">RAISED (&gt;10%)</span> : <span className="font-semibold text-instant">clear (≤10%)</span>}
        </p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {areaRows.map((r) => (
              <tr key={r.label} className={r.strong ? 'bg-canvas font-semibold' : ''}>
                <td className="py-2 pr-3 text-slate-700">{r.label}</td>
                <td className="py-2 pr-3 text-xs text-slate-500">{r.note}</td>
                <td className="py-2 text-right tabular-nums">
                  {r.k ? <Ev k={r.k}>{formatIndianNumber(r.value)} sqft</Ev> : `${formatIndianNumber(r.value)} sqft`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label="Actual BUA (permanent)" value={`${formatIndianNumber(m.buaActual)} sqft`} />
          <Stat
            label="BUA deviation"
            value={<Ev k="buaDev">{m.buaDeviationPct === null ? 'N/A' : formatPctTrunc(m.buaDeviationPct)}</Ev>}
            sub={m.buaDeviationPctInclTemporary !== null && m.buaActualInclTemporary !== m.buaActual ? `${formatPctTrunc(m.buaDeviationPctInclTemporary)} incl. tin shed` : m.buaDeviationPct === null ? 'No plan / permissible BUA' : `vs ${refLabel.toLowerCase()}`}
            tone={m.buaDeviationPct === null ? 'remote' : m.buaDeviationPct > 30 ? 'critical' : m.buaDeviationPct > 15 ? 'remote' : 'instant'}
          />
          <Stat label="BUA valued" value={<Ev k="buaValued">{formatIndianNumber(m.buaValued)} sqft</Ev>} sub={m.buaBasis.replaceAll('_', ' ')} />
        </div>
      </section>

      {/* Floor-wise chart */}
      <section className="card p-5">
        <h2 className="text-base font-bold text-ink">Floor-wise {refLabel} vs Actual BUA</h2>
        <p className="mb-2 text-xs text-slate-500">
          sqft per floor{m.unapprovedStructures.length ? ` · unapproved: ${m.unapprovedStructures.map((u) => u.floorName).join(', ')}` : ''}
        </p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="floor" tick={{ fontSize: 11, fill: '#475569' }} interval={0} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatIndianNumber(Number(v))} width={56} />
              <Tooltip formatter={(v) => `${formatIndianNumber(Number(v))} sqft`} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="reference" name={refLabel} fill={SERIES_REFERENCE} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="actual" name="Actual (amber = tin shed / temporary)" fill={SERIES_ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={28}>
                {chartData.map((d) => (
                  <Cell key={d.floor} fill={d.temporary ? SERIES_TEMPORARY : SERIES_ACTUAL} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Map */}
      <section className="card p-5 xl:col-span-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-base font-bold text-ink">
              <MapPin className="h-4 w-4 text-maroon" /> Satellite GIS Overlay
            </h2>
            <p className="text-xs text-slate-500">
              Esri World Imagery · parcel footprint (maroon){c.roadWidthProposedFt ? ' · road-widening corridor (amber)' : ''}
              {c.sanctionedMapGeoOffsetMeters ? ` · sanctioned-map geo-tag offset ${c.sanctionedMapGeoOffsetMeters} m (dashed)` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {m.activeHazards.length === 0 ? (
              <span className="badge badge-instant"><CheckCircle2 className="h-3 w-3" /> 0 GIS hazards</span>
            ) : (
              m.activeHazards.map((h) => (
                <span key={h} className="badge badge-remote">
                  <AlertTriangle className="h-3 w-3" /> {HAZARD_LABEL[h]}
                  {h === 'in_forest_buffer' && c.gisHazards.forestRtiCleared ? ' (RTI cleared)' : ''}
                </span>
              ))
            )}
          </div>
        </div>
        <SatelliteMap caseData={c} mode="gis" height={400} />
      </section>

      {/* Boundaries */}
      <section className="card p-5">
        <h2 className="mb-3 text-base font-bold text-ink">4-Direction Boundary Matching</h2>
        {m.boundaries.length === 0 ? (
          <p className="rounded-lg bg-canvas px-3 py-6 text-center text-sm text-slate-500">Boundary schedule not captured in the source report.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Dir.</th>
                <th className="pb-2">As per Deed</th>
                <th className="pb-2">At Site / Satellite</th>
                <th className="pb-2 text-right">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {m.boundaries.map((b) => (
                <tr key={b.direction}>
                  <td className="py-2 font-semibold text-ink">{b.direction}</td>
                  <td className="py-2 pr-2 text-slate-700">{b.asPerDeed}</td>
                  <td className="py-2 pr-2 text-slate-700">{b.atSiteSatellite}</td>
                  <td className="py-2 text-right">
                    {b.matched ? (
                      <span className="badge badge-instant"><CheckCircle2 className="h-3 w-3" /> Match</span>
                    ) : (
                      <span className="badge badge-critical"><XCircle className="h-3 w-3" /> Mismatch</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Vernacular OCR */}
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold text-ink">
          <Languages className="h-4 w-4 text-maroon" /> Vernacular Document OCR
        </h2>
        {c.vernacularDocsParsed?.length ? (
          <div className="space-y-3">
            {c.vernacularDocsParsed.map((d) => (
              <div key={d.docType} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{d.docType}</span>
                  <span className="rounded-full bg-maroon/10 px-2 py-0.5 text-[10px] font-bold uppercase text-maroon">{d.language}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{d.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-canvas px-3 py-6 text-center text-sm text-slate-500">No vernacular documents in this file.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'instant' | 'remote' | 'critical' }) {
  const toneCls = tone === 'critical' ? 'text-critical' : tone === 'remote' ? 'text-remote' : tone === 'instant' ? 'text-instant' : 'text-ink';
  return (
    <div className="rounded-lg bg-canvas p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
