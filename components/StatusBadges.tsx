import { AlertOctagon, AlertTriangle, CheckCircle2, Footprints, ShieldCheck, Zap, XCircle, type LucideIcon } from 'lucide-react';
import type { AutoQcFinding, QcStatus, RouteTier } from '@/lib/types';

const ROUTE_STYLE: Record<RouteTier, { cls: string; label: string; icon: LucideIcon }> = {
  INSTANT: { cls: 'badge-instant', label: 'INSTANT', icon: Zap },
  REMOTE_REVIEW: { cls: 'badge-remote', label: 'REMOTE REVIEW', icon: ShieldCheck },
  PHYSICAL_CHECK: { cls: 'badge-critical', label: 'PHYSICAL CHECK', icon: Footprints },
};

export function RouteBadge({ tier }: { tier: RouteTier }) {
  const s = ROUTE_STYLE[tier];
  const Icon = s.icon;
  return (
    <span className={`badge ${s.cls}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {s.label}
    </span>
  );
}

export function scoreTone(score: number, instantThreshold = 80): 'instant' | 'remote' | 'critical' {
  if (score >= instantThreshold) return 'instant';
  if (score >= 60) return 'remote';
  return 'critical';
}

export function ScorePill({ score, instantThreshold = 80 }: { score: number; instantThreshold?: number }) {
  const tone = scoreTone(score, instantThreshold);
  return (
    <span className={`badge badge-${tone}`} title="Authenticity Score S (0–100)">
      S {score}
      <span className="font-normal opacity-70">/100</span>
    </span>
  );
}

const QC_RANK: Record<QcStatus, number> = { PASS: 0, WARN: 1, FAIL: 2, CRITICAL_FAIL: 3 };

export function worstQcStatus(findings: AutoQcFinding[]): QcStatus {
  return findings.reduce<QcStatus>((w, f) => (QC_RANK[f.status] > QC_RANK[w] ? f.status : w), 'PASS');
}

const QC_STYLE: Record<QcStatus, { cls: string; label: string; icon: LucideIcon }> = {
  PASS: { cls: 'badge-instant', label: 'PASS', icon: CheckCircle2 },
  WARN: { cls: 'badge-remote', label: 'WARN', icon: AlertTriangle },
  FAIL: { cls: 'badge-critical', label: 'FAIL', icon: XCircle },
  CRITICAL_FAIL: { cls: 'badge-critical', label: 'CRITICAL FAIL', icon: AlertOctagon },
};

export function QcStatusBadge({ status }: { status: QcStatus }) {
  const s = QC_STYLE[status];
  const Icon = s.icon;
  return (
    <span className={`badge ${s.cls}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {s.label}
    </span>
  );
}

/** Summary badge for a case's 6 Auto-QC findings: "6/6 PASS" or worst status + issue count. */
export function QcSummaryBadge({ findings }: { findings: AutoQcFinding[] }) {
  const worst = worstQcStatus(findings);
  const issues = findings.filter((f) => f.status !== 'PASS').length;
  const s = QC_STYLE[worst];
  const Icon = s.icon;
  return (
    <span className={`badge ${s.cls}`} title={findings.map((f) => `${f.ruleId}: ${f.status}`).join('\n')}>
      <Icon className="h-3 w-3" aria-hidden />
      {issues === 0 ? `${findings.length}/${findings.length} PASS` : `${s.label} · ${issues} issue${issues > 1 ? 's' : ''}`}
    </span>
  );
}
