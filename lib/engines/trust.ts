/* ------------------------------------------------------------------
   Trust & Anti-Fraud Layer (PRD §3.1) — pure, deterministic functions.
   ------------------------------------------------------------------ */
import type { PropertyCase } from '@/lib/types';
import { omissionFraudBlock } from './measure';

export type TrustCheckId =
  | 'GPS_IN_PARCEL'
  | 'LIVE_CAMERA_DEVICE_ATTESTATION'
  | 'IMAGE_FORENSICS_SUN_ANGLE'
  | 'IDENTITY_FACE_MATCH'
  | 'FLOOR_COVERAGE_LOCK';

export interface TrustCheckResult {
  id: TrustCheckId;
  label: string;
  passed: boolean;
  detail: string;
}

export interface TrustResult {
  checks: TrustCheckResult[];
  omissionFraudBlock: boolean;
  /** Trust Layer 100% PASS — every check passed and no Omission Block. */
  allPassed: boolean;
  failedChecks: TrustCheckId[];
}

/** GPS centroid fallback tolerance where village maps lack geo-referencing. */
export const GPS_CENTROID_TOLERANCE_M = 25;

/** Great-circle distance in metres (haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Ray-casting point-in-polygon test. Polygon is an array of [lat, lng]. */
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check 1 — capture coordinates inside the parcel polygon, or (when no geo-referenced polygon)
 * within 25 m of the deed/cadastral centroid.
 */
export function gpsInParcel(
  capture: { lat: number; lng: number },
  parcel: { polygon?: [number, number][]; centroid: { lat: number; lng: number } },
): boolean {
  if (parcel.polygon && parcel.polygon.length >= 3) {
    return pointInPolygon(capture.lat, capture.lng, parcel.polygon);
  }
  return haversineMeters(capture.lat, capture.lng, parcel.centroid.lat, parcel.centroid.lng) <= GPS_CENTROID_TOLERANCE_M;
}

export function evaluateTrust(c: PropertyCase): TrustResult {
  const t = c.trustChecks;
  const omission = omissionFraudBlock(c.interiorWalkedFloors, c.exteriorDetectedFloors);
  const checks: TrustCheckResult[] = [
    {
      id: 'GPS_IN_PARCEL',
      label: 'GPS-in-Parcel Polygon',
      passed: t.gpsInParcel,
      detail: t.gpsInParcel
        ? 'Capture coordinates inside parcel polygon / within 25 m of cadastral centroid.'
        : 'Capture coordinates outside parcel polygon (>25 m from centroid).',
    },
    {
      id: 'LIVE_CAMERA_DEVICE_ATTESTATION',
      label: 'Live Camera Only & Device Attestation',
      passed: t.liveCameraOnly && t.deviceAttested,
      detail:
        t.liveCameraOnly && t.deviceAttested
          ? 'Live camera frames only; device attested; cryptographic timestamps attached.'
          : `${!t.liveCameraOnly ? 'Gallery/screenshot upload detected. ' : ''}${!t.deviceAttested ? 'Device attestation failed (rooted/emulator/mock-GPS).' : ''}`.trim(),
    },
    {
      id: 'IMAGE_FORENSICS_SUN_ANGLE',
      label: 'Image Forensics & Sun-Angle Check',
      passed: t.sunAngleMatched,
      detail: t.sunAngleMatched
        ? 'Shadow direction consistent with solar azimuth for GPS + timestamp.'
        : 'Shadow direction inconsistent with solar azimuth — possible edited/replayed media.',
    },
    {
      id: 'IDENTITY_FACE_MATCH',
      label: 'Identity & Representative Verification',
      passed: t.faceMatched,
      detail: t.faceMatched ? 'Face matched against KYC selfie / registered representative.' : 'Face match failed.',
    },
    {
      id: 'FLOOR_COVERAGE_LOCK',
      label: 'Exterior-to-Interior Floor Coverage Lock',
      passed: t.floorCoverageLocked && !omission,
      detail: omission
        ? `OMISSION_FRAUD_BLOCK: interior walked ${c.interiorWalkedFloors} floor(s) < exterior detected ${c.exteriorDetectedFloors}. Submission halted.`
        : t.floorCoverageLocked
          ? `All ${c.exteriorDetectedFloors} exterior-detected floor(s) walked inside.`
          : 'Floor coverage lock not completed.',
    },
  ];
  const failedChecks = checks.filter((x) => !x.passed).map((x) => x.id);
  return { checks, omissionFraudBlock: omission, allPassed: failedChecks.length === 0, failedChecks };
}

/** FNV-1a 32-bit hash — deterministic pseudo-random source for audit sampling. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Check 6 — Hindsight Audit Sampling: flags 3–5% of Instant-approved files (default 4%)
 * for post-disbursal physical audit. Deterministic per case id so results are reproducible.
 */
export function hindsightAuditSampled(caseId: string, isInstant: boolean, samplingRate = 0.04): boolean {
  if (!isInstant) return false;
  const rate = Math.min(0.05, Math.max(0.03, samplingRate));
  return fnv1a(caseId) % 10000 < rate * 10000;
}
