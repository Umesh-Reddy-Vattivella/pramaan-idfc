/* ------------------------------------------------------------------
   Simulated RBI Phase 1 remote e-sign: canonical payload + SHA-256 seal.
   Prototype only — not a legally valid digital signature.
   ------------------------------------------------------------------ */
import type { PropertyCase } from '@/lib/types';
import type { EvidencePack } from '@/lib/engines/evaluateCase';

export const SIGNATURE_VALIDITY_DAYS = 90;
export const DEMO_OTP = '482613';

/** Clearly fictional empanelled valuers for the demo (no real persons / registration numbers). */
export const DEMO_VALUERS = [
  { name: 'Demo Registered Valuer A (Land & Building)', ibbiRegNo: 'IBBI/RV/DEMO/2026/0001' },
  { name: 'Demo Registered Valuer B (Land & Building)', ibbiRegNo: 'IBBI/RV/DEMO/2026/0002' },
  { name: 'Demo Registered Valuer C (Plant & Machinery)', ibbiRegNo: 'IBBI/RV/DEMO/2026/0003' },
];

export function validUntilIso(signedAtIso: string): string {
  const d = new Date(signedAtIso);
  d.setDate(d.getDate() + SIGNATURE_VALIDITY_DAYS);
  return d.toISOString();
}

/** Deterministic canonical string of what the valuer attests to. */
export function signaturePayload(c: PropertyCase, e: EvidencePack, valuer: { name: string; ibbiRegNo: string }, timestamp: string): string {
  return JSON.stringify({
    caseId: c.id,
    fileNo: c.fileNo ?? null,
    mv: e.valuation.mvFinalRounded,
    fsv: Math.round(e.valuation.fsv),
    route: e.routing.tier,
    score: e.price.authenticity.score,
    qc: e.autoQc.findings.map((f) => `${f.ruleId}:${f.status}`),
    valuer: valuer.ibbiRegNo,
    timestamp,
  });
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
