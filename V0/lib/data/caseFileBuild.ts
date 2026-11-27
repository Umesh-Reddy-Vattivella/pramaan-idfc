/* PropertyCase (bank valuation case) → shared case-file init for the customer portal. */
import type { CaseFileInit, DocRequest, PropertyCase, PropertyKind } from '@/lib/types';
import { parcelGeometry } from '@/lib/mapGeometry';
import { suggestDocuments } from './docCatalog';
import { losRecordFor } from './losRecords';

export function newCaseRef(now = new Date()): string {
  const n = Math.floor(Math.random() * 900000 + 100000);
  return `LAP-${String(now.getFullYear()).slice(2)}-${n}`;
}

export function kindFromCase(c: PropertyCase): PropertyKind {
  if (c.floors.every((f) => f.actualSqft === 0)) return 'PLOT';
  if (c.recordConfirmedUsage === 'INDUSTRIAL') return 'INDUSTRIAL';
  if (c.recordConfirmedUsage === 'COMMERCIAL' || c.recordConfirmedUsage === 'MIXED_USE') return 'COMMERCIAL';
  return 'HOUSE';
}

/** Suggested checklist; for existing cases, documents already in the LOS start as verified (physical copy on file). */
export function checklistFor(c: PropertyCase, kind: PropertyKind, fromLos: boolean): DocRequest[] {
  const list = suggestDocuments(kind, c.state);
  if (!fromLos) return list;
  const los = losRecordFor(c).documents;
  return list.map((d) => {
    const l = los.find((x) => x.type === d.type);
    if (!l) return d;
    if (l.status === 'ON_FILE') return { ...d, status: 'VERIFIED', assignee: 'BANK', note: l.ref ? `On file in LOS — ${l.ref}` : 'On file in LOS (physical copy)' };
    if (l.status === 'NOT_AVAILABLE') return { ...d, status: 'NOT_AVAILABLE' };
    return d;
  });
}

export function caseFileInitFrom(c: PropertyCase, o: { caseRef: string; mobile: string; kind: PropertyKind; checklist: DocRequest[]; address?: string }): CaseFileInit {
  return {
    caseId: c.id,
    caseRef: o.caseRef,
    borrowerName: c.applicantName,
    mobile: o.mobile,
    propertyKind: o.kind,
    propertyType: c.recordConfirmedUsage,
    propertyAddress: o.address ?? losRecordFor(c).propertyAddress,
    city: c.city,
    state: c.state,
    lat: c.lat,
    lng: c.lng,
    parcel: parcelGeometry(c).parcel.map(([a, b]) => [+a.toFixed(7), +b.toFixed(7)] as [number, number]),
    floors: c.floors.filter((f) => !f.isTinShedOrTemporary && f.actualSqft > 0).map((f) => f.floorName),
    checklist: o.checklist,
    captureRequested: true,
  };
}
