/* ------------------------------------------------------------------
   Property geo-fence (PRD_V3 §5.2). Replaces a second KYC: what matters is
   that the snapshots were taken AT THE PLEDGED PROPERTY, whoever held the phone.
   ------------------------------------------------------------------ */
import type { LocationFix, Snapshot } from '@/lib/domain/types';
import { haversineMeters, pointInPolygon } from './stats';

export const FENCE_BASE_M = 25;
export const FENCE_ACCURACY_CREDIT_MAX_M = 25;
export const FENCE_FAIL_M = 100;
export const MIN_EXTERIOR_SNAPSHOTS = 4;

export type FenceStatus = 'INSIDE' | 'NEAR' | 'OUTSIDE' | 'NO_GPS';

export const allowedRadiusM = (accuracyM: number | null) => FENCE_BASE_M + Math.min(Math.max(0, accuracyM ?? 0), FENCE_ACCURACY_CREDIT_MAX_M);

export interface PointFence {
  distanceM: number | null;
  insidePolygon: boolean;
  allowedM: number;
  status: FenceStatus;
}

export function fencePoint(
  p: { lat: number | null; lng: number | null; accuracyM: number | null },
  pin: { lat: number; lng: number } | null,
  parcel: [number, number][],
): PointFence {
  const allowedM = allowedRadiusM(p.accuracyM);
  if (p.lat === null || p.lng === null || !pin) return { distanceM: null, insidePolygon: false, allowedM, status: 'NO_GPS' };
  const distanceM = haversineMeters(p.lat, p.lng, pin.lat, pin.lng);
  const insidePolygon = parcel.length >= 3 && pointInPolygon(p.lat, p.lng, parcel);
  const status: FenceStatus = insidePolygon || distanceM <= allowedM ? 'INSIDE' : distanceM <= FENCE_FAIL_M ? 'NEAR' : 'OUTSIDE';
  return { distanceM, insidePolygon, allowedM, status };
}

export interface GeofenceResult {
  perSnapshot: Record<string, PointFence>;
  inside: number;
  near: number;
  outside: number;
  noGps: number;
  exteriorInside: number;
  interiorInside: number;
  status: 'PASS' | 'WARN' | 'FAIL' | 'NO_CAPTURE';
  summary: string;
}

export function runGeofence(snapshots: Snapshot[], pin: { lat: number; lng: number } | null, parcel: [number, number][]): GeofenceResult {
  const perSnapshot: Record<string, PointFence> = {};
  for (const s of snapshots) perSnapshot[s.id] = fencePoint(s, pin, parcel);
  const vals = snapshots.map((s) => ({ s, f: perSnapshot[s.id] }));
  const inside = vals.filter((v) => v.f.status === 'INSIDE').length;
  const near = vals.filter((v) => v.f.status === 'NEAR').length;
  const outside = vals.filter((v) => v.f.status === 'OUTSIDE').length;
  const noGps = vals.filter((v) => v.f.status === 'NO_GPS').length;
  const exteriorInside = vals.filter((v) => v.f.status === 'INSIDE' && v.s.area === 'EXTERIOR').length;
  const interiorInside = vals.filter((v) => v.f.status === 'INSIDE' && v.s.area === 'INTERIOR').length;
  if (!snapshots.length) return { perSnapshot, inside, near, outside, noGps, exteriorInside, interiorInside, status: 'NO_CAPTURE', summary: 'No snapshots captured yet.' };
  const status: GeofenceResult['status'] = outside > 0 ? 'FAIL' : near > 0 || noGps > 0 || exteriorInside < MIN_EXTERIOR_SNAPSHOTS ? 'WARN' : 'PASS';
  const parts = [`${inside} of ${snapshots.length} snapshots inside the property fence`];
  if (near) parts.push(`${near} within ${FENCE_FAIL_M} m (re-take)`);
  if (outside) parts.push(`${outside} taken away from the property`);
  if (noGps) parts.push(`${noGps} without GPS`);
  if (exteriorInside < MIN_EXTERIOR_SNAPSHOTS) parts.push(`${exteriorInside} of ${MIN_EXTERIOR_SNAPSHOTS} exterior views`);
  return { perSnapshot, inside, near, outside, noGps, exteriorInside, interiorInside, status, summary: parts.join(' · ') };
}

/** Latest location fix and where it is relative to the property. */
export function liveLocation(track: LocationFix[], pin: { lat: number; lng: number } | null, parcel: [number, number][]) {
  const last = track.at(-1);
  if (!last) return null;
  return { fix: last, fence: fencePoint({ lat: last.lat, lng: last.lng, accuracyM: last.acc }, pin, parcel) };
}
