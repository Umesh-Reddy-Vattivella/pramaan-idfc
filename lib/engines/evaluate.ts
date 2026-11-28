/* ------------------------------------------------------------------
   Orchestrator: Application → every engine result + progress stages.
   Pure: the bank workspace runs it in the browser; the server runs it for
   the customer status view and the dashboard list.
   ------------------------------------------------------------------ */
import type { Application, ApplicationSummary, CustomerView, Stage, StageState } from '@/lib/domain/types';
import { assignedSnapshots, isBuilt, isUnit, PROPERTY_TYPE_LABEL } from '@/lib/domain/catalog';
import { runEvidence, type EvidenceResult } from './evidence';
import { finalRates, purchaseComponent, type FinalRates } from './purchase';
import { liveLocation, MIN_EXTERIOR_SNAPSHOTS, runGeofence, type GeofenceResult } from './geofence';
import { runMeasure, type MeasureResult } from './measure';
import { runSanity, VERDICT_LABEL, type SanityResult } from './sanity';
import { runValuation, type ValuationResult } from './valuation';

export interface Evaluation {
  pin: { lat: number; lng: number } | null;
  geofence: GeofenceResult;
  live: ReturnType<typeof liveLocation>;
  measure: MeasureResult;
  evidence: EvidenceResult;
  /** Final rates per category: market (B) + purchase price (C), official floor (A). */
  rates: FinalRates;
  valuation: ValuationResult;
  sanity: SanityResult;
  stages: Stage[];
}

function stages(a: Application, g: GeofenceResult, m: MeasureResult, v: ValuationResult): Stage[] {
  const built = isBuilt(a.property.type);
  const mandatory = a.documents.filter((d) => d.mandatory);
  const verified = mandatory.filter((d) => d.status === 'VERIFIED').length;
  const anyUploaded = a.documents.some((d) => d.files.length > 0);
  const customerOwed = a.documents.filter((d) => d.from !== 'BANK' && (d.status === 'PENDING' || d.status === 'REJECTED') && (d.mandatory || d.from === 'CUSTOMER'));
  const docsState: StageState = verified === mandatory.length ? 'DONE' : customerOwed.length ? 'ACTION_NEEDED' : anyUploaded ? 'IN_PROGRESS' : 'NOT_STARTED';

  const snaps = a.inspection.snapshots.length;
  const inspDone = g.status === 'PASS' && (!built || g.interiorInside > 0);
  const inspState: StageState = inspDone ? 'DONE' : snaps > 0 ? 'IN_PROGRESS' : 'ACTION_NEEDED';

  const measureDone = built ? m.floorsWithArea > 0 && m.confidence !== null && (isUnit(a.property.type) || m.landAreaSqft !== null) : m.landAreaSqft !== null && a.parcel.length >= 3;
  const measureState: StageState = measureDone ? 'DONE' : m.floorsWithArea || a.parcel.length || (a.footprint?.length ?? 0) ? 'IN_PROGRESS' : 'NOT_STARTED';

  const valState: StageState = v.ready ? 'DONE' : a.market.fetchedAt || a.market.points.length ? 'IN_PROGRESS' : 'NOT_STARTED';
  const issued = a.review.status === 'ISSUED';
  const reportState: StageState = issued ? 'DONE' : v.ready ? 'IN_PROGRESS' : 'NOT_STARTED';

  return [
    { key: 'OPENED', label: 'Application opened', state: 'DONE', detail: `Opened ${new Date(a.createdAt).toLocaleDateString('en-IN')}`, customerNote: 'Your bank has started the property valuation.' },
    {
      key: 'DOCUMENTS',
      label: 'Documents',
      state: docsState,
      detail: `${verified}/${mandatory.length} mandatory verified · ${a.documents.filter((d) => d.files.length).length}/${a.documents.length} slots received`,
      customerNote: docsState === 'DONE' ? 'All required documents received and checked.' : customerOwed.length ? `Please upload: ${customerOwed.map((d) => d.label).join(', ')}.` : 'The bank is checking your documents.',
    },
    {
      key: 'INSPECTION',
      label: 'Location & video inspection',
      state: inspState,
      detail: snaps ? g.summary : 'No snapshots yet',
      customerNote: inspDone ? 'Video inspection completed.' : snaps ? 'Video inspection in progress.' : `Keep your location on and answer the bank’s video call at the property (${MIN_EXTERIOR_SNAPSHOTS}+ outside views and each floor).`,
    },
    {
      key: 'MEASUREMENT',
      label: 'Measurement',
      state: measureState,
      detail: built
        ? `${m.floorsWithArea} floor(s) from the floor plan${m.confidence ? ` · confidence ${m.confidence.total}/100` : ''} · land ${m.landAreaSqft ? Math.round(m.landAreaSqft) + ' sqft' : 'n/a'}`
        : `Plot ${m.landAreaSqft ? Math.round(m.landAreaSqft) + ' sqft' : 'n/a'}`,
      customerNote: measureState === 'DONE' ? 'Measurement completed.' : measureState === 'IN_PROGRESS' ? 'Measurement in progress.' : 'Will start after the video inspection.',
    },
    {
      key: 'VALUATION',
      label: 'Valuation',
      state: valState,
      detail: v.ready ? 'Market value computed' : v.missing.length ? `Needs: ${v.missing.join(', ')}` : 'Not started',
      customerNote: valState === 'DONE' ? 'Valuation completed.' : valState === 'IN_PROGRESS' ? 'Valuation in progress.' : 'Not started yet.',
    },
    {
      key: 'REPORT',
      label: 'Technical review & report',
      state: reportState,
      detail: issued ? `Issued ${new Date(a.review.issuedAt!).toLocaleString('en-IN')}` : 'Not issued',
      customerNote: issued ? 'Your property valuation is complete. Your bank will contact you about the next step.' : reportState === 'IN_PROGRESS' ? 'Technical review in progress.' : 'Not started yet.',
    },
  ];
}

export function evaluate(a: Application, now = new Date()): Evaluation {
  const pin = a.property.lat !== null && a.property.lng !== null ? { lat: a.property.lat, lng: a.property.lng } : null;
  const geofence = runGeofence(assignedSnapshots(a.inspection.snapshots), pin, a.parcel);
  const measure = runMeasure(a);
  const p = a.property;
  const evidence = runEvidence(a.market.points, pin, now, { type: p.type, usage: p.usage, locality: p.locality, city: p.city });
  const rates = finalRates(evidence, purchaseComponent(a, measure, now));
  const valuation = runValuation(a, measure, evidence, rates);
  const sanity = runSanity(a, measure, geofence, evidence, valuation, now, rates);
  return { pin, geofence, live: liveLocation(a.inspection.track, pin, a.parcel), measure, evidence, rates, valuation, sanity, stages: stages(a, geofence, measure, valuation) };
}

export function toCustomerView(a: Application, now = new Date()): CustomerView {
  const e = evaluate(a, now);
  return {
    id: a.id,
    ref: a.ref,
    borrowerFirstName: a.borrower.name.split(/\s+/)[0] ?? '',
    address: a.property.address,
    propertyTypeLabel: PROPERTY_TYPE_LABEL[a.property.type],
    // Documents without the bank's verification remarks other than rejection reasons.
    documents: a.documents.map((d) => ({ ...d, remark: d.status === 'REJECTED' ? d.remark : undefined })),
    stages: e.stages.map((s) => ({ ...s, detail: '' })),
    locationOn: a.inspection.locationOn,
    lastLocationAt: a.inspection.track.at(-1)?.at ?? null,
    snapshotsTaken: assignedSnapshots(a.inspection.snapshots).length,
    completed: a.review.status === 'ISSUED',
  };
}

export function toSummary(a: Application, now = new Date()): ApplicationSummary {
  const e = evaluate(a, now);
  const current = e.stages.find((s) => s.state !== 'DONE');
  return {
    id: a.id,
    ref: a.ref,
    borrowerName: a.borrower.name,
    address: a.property.address,
    type: a.property.type,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    stages: e.stages.map((s) => s.state),
    currentStage: current ? current.label : 'Completed',
    marketValue: e.valuation.mv,
    verdict: VERDICT_LABEL[e.sanity.verdict],
    issued: a.review.status === 'ISSUED',
  };
}
