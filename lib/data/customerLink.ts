/* ------------------------------------------------------------------
   Customer valuation link — prefill from the LOS record, URL encoding,
   and folding the customer's submission back into the case.
   No valuation math here: trust flags are derived by lib/engines/geofence.
   ------------------------------------------------------------------ */
import type { CaptureSubmission, CustomerLinkState, LinkPrefill, PropertyCase } from '@/lib/types';
import { losRecordFor } from './losRecords';
import { parcelGeometry } from '@/lib/mapGeometry';
import { checkCaptureLocation, floorsEvidenced } from '@/lib/engines/geofence';

export function newToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

export function buildPrefill(c: PropertyCase, token: string, now = new Date()): LinkPrefill {
  const los = losRecordFor(c);
  return {
    token,
    caseId: c.id,
    loanAppNo: los.loanAppNo,
    borrowerName: los.borrowerName,
    propertyAddress: los.propertyAddress,
    propertyType: los.propertyType,
    city: c.city,
    lat: c.lat,
    lng: c.lng,
    parcel: parcelGeometry(c).parcel.map(([a, b]) => [+a.toFixed(7), +b.toFixed(7)] as [number, number]),
    floors: c.floors.filter((f) => !f.isTinShedOrTemporary && f.actualSqft > 0).map((f) => f.floorName),
    documents: los.documents,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(),
  };
}

/* URL-safe base64 of the prefill — carried in the URL #fragment (never sent to the server)
   so the link still opens if the server store is unavailable. */
export function encodePrefill(p: LinkPrefill): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePrefill(s: string): LinkPrefill | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as LinkPrefill;
  } catch {
    return null;
  }
}

export function linkUrl(origin: string, p: LinkPrefill): string {
  return `${origin}/c/${p.token}#d=${encodePrefill(p)}`;
}

/** Same-browser hand-off key (demo on one device without a KV store). */
export const localSubmissionKey = (token: string) => `pramaan.link.${token}`;

/**
 * Fold a customer submission into the case: trust flags come from the geo-fence engine,
 * floor coverage from the floors evidenced by interior photos / rooms.
 */
export function applySubmission(c: PropertyCase, link: CustomerLinkState, sub: CaptureSubmission): Partial<PropertyCase> {
  const g = checkCaptureLocation(sub.photos, { lat: c.lat, lng: c.lng }, parcelGeometry(c).parcel);
  const floorNames = c.floors.filter((f) => !f.isTinShedOrTemporary && f.actualSqft > 0).map((f) => f.floorName);
  const walked = floorsEvidenced(sub.photos, sub.rooms, floorNames);
  const exterior = Math.max(c.exteriorDetectedFloors, 1);
  const planDoc = sub.documents.find((d) => d.type === 'APPROVED_PLAN');
  const planNow = planDoc ? planDoc.status === 'ON_FILE' || planDoc.status === 'UPLOADED' : c.hasSanctionedPlan;
  return {
    customerLink: { ...link, status: 'SUBMITTED', submission: sub, openedAt: link.openedAt ?? sub.submittedAt },
    interiorWalkedFloors: walked,
    hasSanctionedPlan: c.isBenchmarkSample ? c.hasSanctionedPlan : planNow,
    trustChecks: {
      ...c.trustChecks,
      gpsInParcel: g.outside === 0 && g.near === 0 && g.photos.length > 0,
      liveCameraOnly: g.galleryUploads === 0 && g.photos.length > 0,
      // Web capture "attestation": secure-context camera + every photo has a usable GPS fix (≤ 100 m accuracy).
      deviceAttested: sub.photos.length > 0 && sub.photos.every((p) => p.accuracyM > 0 && p.accuracyM <= 100),
      floorCoverageLocked: walked >= exterior,
    },
  };
}
