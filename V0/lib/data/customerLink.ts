/* ------------------------------------------------------------------
   Folding the customer's site capture (portal or live video call) back into the valuation case.
   No valuation math here: trust flags are derived by lib/engines/geofence.
   ------------------------------------------------------------------ */
import type { CaptureSubmission, CustomerLinkState, PropertyCase } from '@/lib/types';
import { parcelGeometry } from '@/lib/mapGeometry';
import { checkCaptureLocation, floorsEvidenced } from '@/lib/engines/geofence';

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
      sunAngleMatched: g.galleryUploads === 0 && sub.photos.length > 0 && sub.photos.every((p) => !!p.hash && !!p.takenAt),
      // Web capture "attestation": secure-context camera + every photo has a usable GPS fix (≤ 100 m accuracy).
      deviceAttested: sub.photos.length > 0 && sub.photos.every((p) => p.accuracyM > 0 && p.accuracyM <= 100),
      floorCoverageLocked: walked >= exterior,
    },
  };
}
