'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, RotateCcw, X } from 'lucide-react';
import { computeRoi, ROI_DEFAULTS, type RoiInputs } from '@/lib/engines/roi';
import { formatIndianNumber, formatInrShort } from '@/lib/engines/valuation';

interface SliderDef {
  key: keyof RoiInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderDef[] = [
  { key: 'filesPerMonth', label: 'LAP valuation files / month', min: 250, max: 10000, step: 250, format: (v) => formatIndianNumber(v) },
  { key: 'legacyCostPerFile', label: 'Legacy valuer cost / file', min: 1500, max: 6000, step: 100, format: (v) => `Rs. ${formatIndianNumber(v)}` },
  { key: 'pramaanCostPerFile', label: 'PRAMAAN cost / file', min: 200, max: 1500, step: 20, format: (v) => `Rs. ${formatIndianNumber(v)}` },
  { key: 'instantSharePct', label: 'Instant route share', min: 30, max: 90, step: 1, format: (v) => `${v}%` },
  { key: 'avgTicketInr', label: 'Average LAP ticket', min: 1000000, max: 30000000, step: 500000, format: (v) => formatInrShort(v) },
  { key: 'baseConversionPct', label: 'Baseline conversion', min: 20, max: 90, step: 1, format: (v) => `${v}%` },
  { key: 'conversionUpliftPts', label: 'Conversion uplift (faster TAT)', min: 0, max: 15, step: 0.5, format: (v) => `+${v} pts` },
  { key: 'nimPct', label: 'Net interest margin', min: 1, max: 6, step: 0.1, format: (v) => `${v.toFixed(1)}%` },
  { key: 'processingFeePct', label: 'Processing fee', min: 0, max: 2, step: 0.1, format: (v) => `${v.toFixed(1)}%` },
];

export default function RoiCalculatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [inputs, setInputs] = useState<RoiInputs>(ROI_DEFAULTS);
  const r = useMemo(() => computeRoi(inputs), [inputs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rows: { label: string; value: string; sub?: string }[] = [
    {
      label: 'Valuation cost saving',
      value: formatInrShort(r.valuationCostSaving),
      sub: `${formatIndianNumber(r.annualFiles)} files × Rs. ${formatIndianNumber(inputs.legacyCostPerFile - inputs.pramaanCostPerFile)} (${r.costReductionPct.toFixed(0)}% cheaper)`,
    },
    {
      label: 'Incremental loans (conversion uplift)',
      value: formatIndianNumber(Math.round(r.incrementalLoans)),
      sub: `${formatIndianNumber(Math.round(r.baselineLoans))} → ${formatIndianNumber(Math.round(r.upliftedLoans))} loans / yr`,
    },
    { label: 'Incremental disbursal', value: formatInrShort(r.incrementalDisbursal), sub: `× ${formatInrShort(inputs.avgTicketInr)} avg ticket` },
    { label: 'Year-1 net interest income', value: formatInrShort(r.incrementalNii), sub: `@ ${inputs.nimPct.toFixed(1)}% NIM on incremental book` },
    { label: 'Processing fees', value: formatInrShort(r.incrementalFees), sub: `@ ${inputs.processingFeePct.toFixed(1)}% of incremental disbursal` },
  ];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="roi-title" onClick={onClose}>
      <div className="card max-h-[92vh] w-full max-w-5xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-maroon px-6 py-4 text-white rounded-t-xl">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5" aria-hidden />
            <div>
              <h2 id="roi-title" className="text-lg font-bold">IDFC Business Case / ROI Simulator</h2>
              <p className="text-xs text-white/75">Year-1 P&amp;L impact &amp; conversion uplift — all inputs are adjustable assumptions</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-white/15" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            {SLIDERS.map((s) => (
              <label key={s.key} className="block">
                <span className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-slate-700">{s.label}</span>
                  <span className="font-semibold text-maroon tabular-nums">{s.format(inputs[s.key])}</span>
                </span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={inputs[s.key]}
                  onChange={(e) => setInputs((p) => ({ ...p, [s.key]: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#9C1D26]"
                />
              </label>
            ))}
            <button
              onClick={() => setInputs(ROI_DEFAULTS)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-maroon"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset assumptions
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl bg-maroon-deep p-5 text-white">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Total Year-1 P&amp;L impact</div>
              <div className="mt-1 text-4xl font-bold tabular-nums">{formatInrShort(r.totalYear1Impact)}</div>
              <div className="mt-1 text-xs text-white/70">Cost saving + incremental NII + processing fees</div>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {rows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{row.label}</div>
                    {row.sub && <div className="text-xs text-slate-500">{row.sub}</div>}
                  </div>
                  <div className="text-right text-base font-semibold tabular-nums text-ink">{row.value}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg bg-instant-bg p-3">
                <div className="text-xl font-bold text-instant tabular-nums">{formatIndianNumber(Math.round(r.instantFilesPerYear))}</div>
                <div className="text-xs text-slate-600">files / yr straight-through (Instant)</div>
              </div>
              <div className="rounded-lg bg-canvas p-3">
                <div className="text-xl font-bold text-maroon">41 min vs 7 days</div>
                <div className="text-xs text-slate-600">median TAT per file</div>
              </div>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
              Deterministic calculation (lib/engines/roi.ts). Defaults are illustrative planning assumptions, not IDFC FIRST Bank
              disclosures — adjust to internal figures before presenting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
