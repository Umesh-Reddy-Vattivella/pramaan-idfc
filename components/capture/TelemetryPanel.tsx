'use client';

import { useEffect, useRef } from 'react';
import {
  Camera,
  CheckCircle2,
  CircleDashed,
  ImageOff,
  Layers,
  MapPin,
  MapPinOff,
  Radio,
  ScanFace,
  Smartphone,
  Sun,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

export type CheckState = 'pending' | 'pass' | 'fail';
export type LogLevel = 'info' | 'ok' | 'warn' | 'block';

export interface LogEntry {
  id: number;
  t: string;
  level: LogLevel;
  src: string;
  msg: string;
}

export interface TrustBadge {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
}

export interface ExtractionRow {
  field: string;
  value: string;
  status: 'match' | 'mismatch' | 'info' | 'pending';
  note?: string;
}

export interface FraudFlags {
  omission: boolean;
  mockGps: boolean;
  gallery: boolean;
}

const BADGE_ICON: Record<string, LucideIcon> = {
  gps: MapPin,
  camera: Camera,
  device: Smartphone,
  sun: Sun,
  face: ScanFace,
  floors: Layers,
};

const LEVEL_CLS: Record<LogLevel, string> = {
  info: 'text-slate-300',
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  block: 'text-red-400 font-semibold',
};

const LEVEL_TAG: Record<LogLevel, string> = { info: 'INFO', ok: ' OK ', warn: 'WARN', block: 'BLOCK' };

export default function TelemetryPanel(props: {
  badges: TrustBadge[];
  extraction: ExtractionRow[];
  log: LogEntry[];
  fraud: FraudFlags;
  blocked: boolean;
  onFraud: (k: keyof FraudFlags) => void;
}) {
  const { badges, extraction, log, fraud, blocked, onFraud } = props;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);

  const fraudButtons: { k: keyof FraudFlags; label: string; icon: LucideIcon }[] = [
    { k: 'omission', label: 'Simulate Omission Fraud (Skip Top Floor)', icon: Layers },
    { k: 'mockGps', label: 'Simulate Mock GPS (180m Outside Parcel)', icon: MapPinOff },
    { k: 'gallery', label: 'Simulate Gallery Upload / AI Photo', icon: ImageOff },
  ];

  return (
    <div className="card flex h-full min-h-[780px] flex-col overflow-hidden">
      <div className="flex items-center justify-between bg-maroon-deep px-5 py-3 text-white">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <Radio className="h-4 w-4 animate-pulse" /> PRAMAAN Trust &amp; Extraction Telemetry Stream
        </h2>
        {blocked ? (
          <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-bold">SUBMISSION BLOCKED</span>
        ) : (
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold">LIVE</span>
        )}
      </div>

      {/* Trust badges */}
      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-4 lg:grid-cols-3">
        {badges.map((b) => {
          const Icon = BADGE_ICON[b.key] ?? CircleDashed;
          const cls =
            b.state === 'pass' ? 'border-instant/30 bg-instant-bg' : b.state === 'fail' ? 'border-critical/40 bg-critical-bg ring-2 ring-critical/30' : 'border-slate-200 bg-slate-50';
          const tone = b.state === 'pass' ? 'text-instant' : b.state === 'fail' ? 'text-critical' : 'text-slate-400';
          return (
            <div key={b.key} className={`rounded-lg border p-2.5 transition-colors ${cls}`}>
              <div className="flex items-center gap-1.5">
                <Icon className={`h-4 w-4 ${tone}`} />
                <span className="text-xs font-semibold text-ink">{b.label}</span>
                <span className="ml-auto">
                  {b.state === 'pass' ? (
                    <CheckCircle2 className="h-4 w-4 text-instant" aria-label="pass" />
                  ) : b.state === 'fail' ? (
                    <XCircle className="h-4 w-4 text-critical" aria-label="fail" />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-slate-300" aria-label="pending" />
                  )}
                </span>
              </div>
              <div className={`mt-0.5 text-[11px] leading-snug ${b.state === 'fail' ? 'font-semibold text-critical' : 'text-slate-500'}`}>{b.detail}</div>
            </div>
          );
        })}
      </div>

      {/* Extraction */}
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Live extraction &amp; cross-check</h3>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            {extraction.map((r) => (
              <tr key={r.field}>
                <td className="w-36 py-1 pr-2 text-slate-500">{r.field}</td>
                <td className={`py-1 pr-2 font-medium tabular-nums ${r.status === 'pending' ? 'text-slate-300' : 'text-ink'}`}>{r.value}</td>
                <td className="py-1 text-right">
                  {r.status === 'match' && <span className="badge badge-instant">match</span>}
                  {r.status === 'mismatch' && <span className="badge badge-remote" title={r.note}>mismatch</span>}
                  {r.status === 'info' && r.note && <span className="text-[10px] text-slate-500">{r.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {extraction.filter((r) => r.status === 'mismatch' && r.note).map((r) => (
          <p key={r.field} className="mt-1 rounded bg-remote-bg px-2 py-1 text-[11px] text-remote">
            ⚠ {r.field}: {r.note}
          </p>
        ))}
      </div>

      {/* Stream */}
      <div className="min-h-[220px] flex-1 overflow-y-auto bg-slate-950 px-4 py-3 font-mono text-[11px] leading-relaxed" aria-live="polite">
        {log.map((l) => (
          <div key={l.id} className={LEVEL_CLS[l.level]}>
            <span className="text-slate-500">{l.t}</span> <span className="opacity-80">[{LEVEL_TAG[l.level]}]</span>{' '}
            <span className="text-sky-300">{l.src.padEnd(7, ' ')}</span> {l.msg}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Fraud simulation bar */}
      <div className="border-t-4 border-critical bg-critical-bg/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-critical">Fraud Simulation Bar</span>
          <span className="text-[10px] text-slate-500">one-click stage demo · click again to clear</span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {fraudButtons.map(({ k, label, icon: Icon }) => {
            const on = fraud[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => onFraud(k)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  on ? 'border-critical bg-critical text-white' : 'border-critical/40 bg-white text-critical hover:bg-critical hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{on ? `ACTIVE — ${label.replace('Simulate ', '')}` : label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
