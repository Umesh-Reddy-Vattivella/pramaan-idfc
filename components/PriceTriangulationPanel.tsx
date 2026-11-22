'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, AlertTriangle, RotateCcw } from 'lucide-react';
import type { PropertyCase, SpatialTier } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';
import { formatIndianNumber } from '@/lib/engines/valuation';
import { SPATIAL_TIER_LABEL } from '@/lib/engines/price';
import { baselineStressInputs, runStressTest, type StressInputs } from '@/lib/engines/stressTest';
import { SERIES_ACTUAL, SERIES_REFERENCE, SOURCE_COLOR, SOURCE_SHORT } from '@/lib/sourceMeta';
import { Ev } from '@/components/EvidenceDrawer';
import { RouteBadge, scoreTone } from '@/components/StatusBadges';
import { SatelliteMap } from '@/components/workbench/maps';

const TONE_HEX = { instant: '#15803D', remote: '#B45309', critical: '#DC2626' } as const;
const TONE_LABEL = { instant: 'Instant-grade', remote: 'Review-grade', critical: 'Physical-grade' } as const;
const TIERS: SpatialTier[] = ['MICRO_1KM', 'WARD_VILLAGE', 'SRO_ZONE', 'DISTRICT'];
const TIER_SHORT: Record<SpatialTier, string> = { MICRO_1KM: '1 km', WARD_VILLAGE: 'Ward', SRO_ZONE: 'SRO', DISTRICT: 'District' };

export default function PriceTriangulationPanel({ c, e }: { c: PropertyCase; e: EvidencePack }) {
  const p = e.price;
  const a = p.authenticity;
  const rs = (n: number) => `Rs. ${formatIndianNumber(Math.round(n))}`;

  const chartData = c.priceSources.map((s) => ({
    name: SOURCE_SHORT[s.id],
    raw: s.rawRatePerSqft,
    corrected: s.correctedRatePerSqft,
  }));

  const subScores = [
    { label: 'Agreement', value: a.agreement, max: 35, note: `CV ${(a.cv * 100).toFixed(2)}%` },
    { label: 'Comps Depth', value: a.depth, max: 25, note: `n = ${a.nComps}` },
    { label: 'Recency', value: a.recency, max: 20, note: `median ${a.medianAgeMonths} mo` },
    { label: 'Spatial Typicality', value: a.spatialTypicality, max: 20, note: SPATIAL_TIER_LABEL[c.spatialFallbackTier] },
  ];

  const sourcesOnMap = Array.from(new Set(c.comparables.map((x) => x.source)));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        {/* Source table + chart */}
        <section className="card p-5">
          <h2 className="text-base font-bold text-ink">6-Source Bias-Correction Triangulation</h2>
          <p className="mb-3 text-xs text-slate-500">
            Consensus <Ev k="consensus" className="font-semibold text-ink">{rs(p.rConsensus)}/sqft</Ev> · range {rs(p.rLow)} – {rs(p.rHigh)}
            {p.circleGapMultiple !== null && (
              <>
                {' '}· circle-rate gap <Ev k="circleGap" className="font-semibold text-ink">{p.circleGapMultiple.toFixed(2)}×</Ev>
              </>
            )}
            {p.belowCircleRateFlag && <span className="ml-1 font-semibold text-critical">· BELOW CIRCLE RATE</span>}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Source</th>
                  <th className="pb-2 text-right">n</th>
                  <th className="pb-2 text-right">Raw</th>
                  <th className="pb-2">Correction</th>
                  <th className="pb-2 text-right">Corrected</th>
                  <th className="pb-2 text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.priceSources.map((s) => (
                  <tr key={s.id} className={s.weight === 0 ? 'text-slate-400' : ''}>
                    <td className="py-2 pr-2">
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: SOURCE_COLOR[s.id] }} aria-hidden />
                      {s.label}
                    </td>
                    <td className="py-2 text-right tabular-nums">{s.count}</td>
                    <td className="py-2 text-right tabular-nums">{formatIndianNumber(s.rawRatePerSqft)}</td>
                    <td className="py-2 pl-3 text-xs">{s.correctionFormulaLabel}</td>
                    <td className="py-2 text-right font-semibold">
                      <Ev k={`src:${s.id}`}>{formatIndianNumber(s.correctedRatePerSqft)}</Ev>
                    </td>
                    <td className="py-2 text-right tabular-nums">{Math.round(s.weight * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => formatIndianNumber(Number(v))} />
                <Tooltip formatter={(v) => `Rs. ${formatIndianNumber(Number(v))}/sqft`} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  y={p.rConsensus}
                  stroke="#1E293B"
                  strokeDasharray="5 4"
                  label={{ value: `Consensus ${formatIndianNumber(Math.round(p.rConsensus))}`, position: 'insideTopRight', fontSize: 11, fill: '#1E293B' }}
                />
                <Bar dataKey="raw" name="Raw rate" fill={SERIES_REFERENCE} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="corrected" name="Bias-corrected" fill={SERIES_ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Gauge + sub-scores */}
        <section className="card p-5">
          <h2 className="text-base font-bold text-ink">Authenticity Score</h2>
          <ScoreGauge score={a.score} threshold={p.instantThreshold} />
          <div className="space-y-3">
            {subScores.map((s) => (
              <div key={s.label}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-slate-700">{s.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {s.note} · <span className="font-semibold text-ink">{s.value.toFixed(1)}</span>/{s.max}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-maroon" style={{ width: `${(s.value / s.max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Instant threshold S ≥ {p.instantThreshold}
            {p.instantThreshold > 80 ? ' (Drift Guard active)' : ''} · Physical below 60.
          </p>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        {/* Comparables map */}
        <section className="card p-5">
          <h2 className="text-base font-bold text-ink">Comparables Map</h2>
          <div className="mb-2 mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-white bg-maroon shadow" /> Subject
            </span>
            {sourcesOnMap.map((id) => (
              <span key={id} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: SOURCE_COLOR[id] }} />
                {SOURCE_SHORT[id]}
              </span>
            ))}
          </div>
          <SatelliteMap caseData={c} mode="comps" comparables={c.comparables} height={340} />
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-maroon">Table view ({c.comparables.length} comparables)</summary>
            <table className="mt-2 w-full">
              <tbody className="divide-y divide-slate-100">
                {c.comparables.map((x) => (
                  <tr key={x.id}>
                    <td className="py-1 pr-2">{SOURCE_SHORT[x.source]}</td>
                    <td className="py-1 pr-2 text-slate-500">{x.note}</td>
                    <td className="py-1 text-right tabular-nums">{x.distanceKm} km</td>
                    <td className="py-1 text-right tabular-nums">{formatIndianNumber(x.adjustedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <StressTestPanel c={c} e={e} />
      </div>
    </div>
  );
}

function ScoreGauge({ score, threshold }: { score: number; threshold: number }) {
  const tone = scoreTone(score, threshold);
  return (
    <div className="relative mx-auto h-[190px] w-full max-w-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="72%" outerRadius="100%" startAngle={210} endAngle={-30} data={[{ value: score }]} barSize={16}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
          <RadialBar dataKey="value" angleAxisId={0} cornerRadius={8} fill={TONE_HEX[tone]} background={{ fill: '#f1f5f9' }} isAnimationActive />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <Ev k="score" className="pointer-events-auto text-5xl font-bold text-ink">
          {score}
        </Ev>
        <span className="text-xs text-slate-500">/ 100</span>
        <span className={`mt-1 badge badge-${tone}`}>{TONE_LABEL[tone]}</span>
      </div>
    </div>
  );
}

function StressTestPanel({ c, e }: { c: PropertyCase; e: EvidencePack }) {
  const base = useMemo(() => baselineStressInputs(e, c), [e, c]);
  const [s, setS] = useState<StressInputs>(base);
  const r = useMemo(() => runStressTest(c, e, s), [c, e, s]);
  const changed = r.tier !== e.routing.tier;
  const tone = scoreTone(r.score, e.price.instantThreshold);
  const tierIdx = TIERS.indexOf(s.spatialTier);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between bg-maroon-deep px-5 py-3 text-white">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <Activity className="h-4 w-4" /> Live Stress-Test &amp; Sensitivity Panel
        </h2>
        <button onClick={() => setS(base)} className="inline-flex items-center gap-1 text-xs text-white/80 hover:text-white">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div className="space-y-4">
          <Slider label="(1) Comps Count" value={s.compsCount} display={`${s.compsCount}`} min={0} max={60} step={1} base={base.compsCount}
            onChange={(v) => setS({ ...s, compsCount: v })} />
          <Slider label="(2) Source Variance (CV %)" value={s.cvPct} display={`${s.cvPct.toFixed(1)}%`} min={0} max={35} step={0.5} base={base.cvPct}
            onChange={(v) => setS({ ...s, cvPct: v })} />
          <Slider label="(3) Spatial Fallback Tier" value={tierIdx} display={TIER_SHORT[s.spatialTier]} min={0} max={3} step={1} base={TIERS.indexOf(base.spatialTier)}
            ticks={TIERS.map((t) => TIER_SHORT[t])} onChange={(v) => setS({ ...s, spatialTier: TIERS[v] })} />
          <Slider label="(4) Market Overstatement (x)" value={s.overstatementPct} display={`${s.overstatementPct}%`} min={0} max={50} step={1} base={0}
            onChange={(v) => setS({ ...s, overstatementPct: v })} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stressed Score S</div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: TONE_HEX[tone] }}>
                {r.score}
                <span className="text-sm font-medium text-slate-400"> / 100</span>
              </div>
            </div>
            <div className="text-right text-[11px] tabular-nums text-slate-500">
              <div>Agreement {r.agreement.toFixed(1)}/35</div>
              <div>Depth {r.depth}/25</div>
              <div>Recency {r.recency.toFixed(1)}/20</div>
              <div>Spatial {r.spatialTypicality}/20</div>
            </div>
          </div>

          <div className="rounded-lg bg-canvas p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Effective LTV</div>
            <div className="mt-0.5 font-mono text-xs text-slate-600">LTV_true = LTV_stated × (1 + x)</div>
            <div className="mt-1 flex items-baseline gap-2 tabular-nums">
              <span className="text-sm text-slate-600">{r.ltvStatedPct.toFixed(1)}% × {(1 + s.overstatementPct / 100).toFixed(2)} =</span>
              <span className={`text-2xl font-bold ${r.ltvBreach ? 'text-critical' : 'text-ink'}`}>{r.ltvTruePct.toFixed(1)}%</span>
            </div>
            <div className="text-[11px] text-slate-500">Cap {r.ltvCapPct.toFixed(0)}% ({e.usage.appliedUsage.replace('_', ' ').toLowerCase()})</div>
          </div>

          <div className={`rounded-lg border-2 p-3 transition-colors ${changed ? 'border-maroon bg-maroon/5' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Routing Cascade</span>
              <span key={r.tier} className="animate-[pulse_0.6s_ease-out_1]">
                <RouteBadge tier={r.tier} />
              </span>
            </div>
            {changed && (
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-maroon">
                <AlertTriangle className="h-3.5 w-3.5" /> Flipped from {e.routing.label}
              </div>
            )}
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
              {[...r.ltvTriggers, ...r.routing.physicalTriggers, ...r.routing.remoteTriggers].slice(0, 5).map((t) => (
                <li key={t}>{t}</li>
              ))}
              {r.tier === 'INSTANT' && <li>All 6 Instant gates pass.</li>}
            </ul>
          </div>
        </div>
      </div>
      <p className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-500">
        Deterministic re-score via lib/engines/stressTest.ts. Prototype policy: LTV_true above cap → Remote Review; ≥ 10 pts above cap → Physical Check.
      </p>
    </section>
  );
}

function Slider(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  base: number;
  ticks?: string[];
  onChange: (v: number) => void;
}) {
  const moved = props.value !== props.base;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{props.label}</span>
        <span className={`font-semibold tabular-nums ${moved ? 'text-maroon' : 'text-ink'}`}>{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(ev) => props.onChange(Number(ev.target.value))}
        className="mt-1 w-full accent-[#9C1D26]"
      />
      {props.ticks && (
        <span className="flex justify-between text-[10px] text-slate-400">
          {props.ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
      )}
    </label>
  );
}
