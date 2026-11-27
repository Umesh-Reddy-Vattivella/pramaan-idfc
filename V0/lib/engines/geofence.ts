/* ------------------------------------------------------------------
   Property Geo-fence (replaces KYC in the technical journey).
   The bank already did KYC at onboarding; what matters is that the photos
   were taken AT THE PLEDGED PROPERTY, whoever took them. Pure functions only.
   ------------------------------------------------------------------ */
import type { GeoPhoto } from '@/lib/types';
import { haversineMeters, pointInPolygon } from './trust';

/** Base tolerance around the parcel (village maps / GPS drift). */
export const GEOFENCE_BASE_TOLERANCE_M = 25;
/** GPS accuracy credited on top of the base tolerance, capped so poor fixes can't widen the fence much. */
export const GEOFENCE_ACCURACY_CREDIT_MAX_M = 25;
/** Beyond this a photo is clearly elsewhere (e.g. borrower's residence 50 km away). */
export const GEOFENCE_FAIL_M = 100;
/** Image file older than this when attached ⇒ picked from gallery, not shot live. */
export const LIVE_CAPTURE_MAX_FILE_AGE_MS = 2 * 60 * 1000;
/** Minimum exterior shots for a usable identification. */
export const MIN_EXTERIOR_PHOTOS = 4;

export type FenceStatus = 'INSIDE' | 'NEAR' | 'OUTSIDE';

export interface PhotoFenceResult {
  id: string;
  slot: string;
  label: string;
  distanceM: number;
  insidePolygon: boolean;
  allowedM: number;
  status: FenceStatus;
  live: boolean;
}

export interface GeofenceResult {
  photos: PhotoFenceResult[];
  inside: number;
  near: number;
  outside: number;
  galleryUploads: number;
  exteriorCount: number;
  /** Every photo inside the fence, all shot live, and enough exterior coverage. */
  passed: boolean;
  status: 'PASS' | 'WARN' | 'FAIL' | 'NO_CAPTURE';
  maxDistanceM: number;
  summary: string;
}

export function allowedRadiusM(accuracyM: number): number {
  return GEOFENCE_BASE_TOLERANCE_M + Math.min(Math.max(0, accuracyM), GEOFENCE_ACCURACY_CREDIT_MAX_M);
}

export function checkPhoto(p: GeoPhoto, pin: { lat: number; lng: number }, parcel: [number, number][]): PhotoFenceResult {
  const distanceM = haversineMeters(p.lat, p.lng, pin.lat, pin.lng);
  const insidePolygon = parcel.length >= 3 && pointInPolygon(p.lat, p.lng, parcel);
  const allowedM = allowedRadiusM(p.accuracyM);
  const status: FenceStatus = insidePolygon || distanceM <= allowedM ? 'INSIDE' : distanceM <= GEOFENCE_FAIL_M ? 'NEAR' : 'OUTSIDE';
  return {
    id: p.id,
    slot: p.slot,
    label: p.label,
    distanceM,
    insidePolygon,
    allowedM,
    status,
    live: p.fileAgeMs <= LIVE_CAPTURE_MAX_FILE_AGE_MS,
  };
}

export function checkCaptureLocation(
  photos: GeoPhoto[],
  pin: { lat: number; lng: number },
  parcel: [number, number][],
): GeofenceResult {
  if (photos.length === 0) {
    return { photos: [], inside: 0, near: 0, outside: 0, galleryUploads: 0, exteriorCount: 0, passed: false, status: 'NO_CAPTURE', maxDistanceM: 0, summary: 'No geo-tagged photos received yet.' };
  }
  const res = photos.map((p) => checkPhoto(p, pin, parcel));
  const inside = res.filter((r) => r.status === 'INSIDE').length;
  const near = res.filter((r) => r.status === 'NEAR').length;
  const outside = res.filter((r) => r.status === 'OUTSIDE').length;
  const galleryUploads = res.filter((r) => !r.live).length;
  const exteriorCount = photos.filter((p) => !p.slot.startsWith('INTERIOR')).length;
  const maxDistanceM = Math.max(...res.map((r) => r.distanceM));
  const status: GeofenceResult['status'] =
    outside > 0 || galleryUploads > 0 ? 'FAIL' : near > 0 || exteriorCount < MIN_EXTERIOR_PHOTOS ? 'WARN' : 'PASS';
  const parts = [`${inside}/${photos.length} photos inside the pledged-property fence`];
  if (near) parts.push(`${near} within ${GEOFENCE_FAIL_M} m (re-shoot)`);
  if (outside) parts.push(`${outside} taken away from the property (max ${Math.round(maxDistanceM).toLocaleString('en-IN')} m)`);
  if (galleryUploads) parts.push(`${galleryUploads} gallery / old image(s)`);
  if (exteriorCount < MIN_EXTERIOR_PHOTOS) parts.push(`only ${exteriorCount} of ${MIN_EXTERIOR_PHOTOS} exterior shots`);
  return { photos: res, inside, near, outside, galleryUploads, exteriorCount, passed: status === 'PASS', status, maxDistanceM, summary: parts.join(' · ') };
}

/** Distinct floors evidenced by interior photos or room measurements. */
export function floorsEvidenced(photos: GeoPhoto[], rooms: { floorName: string }[], floorNames: string[]): number {
  const seen = new Set<string>();
  for (const r of rooms) seen.add(r.floorName);
  for (const p of photos) {
    if (!p.slot.startsWith('INTERIOR:')) continue;
    seen.add(p.slot.slice('INTERIOR:'.length));
  }
  return floorNames.filter((f) => seen.has(f)).length;
}
