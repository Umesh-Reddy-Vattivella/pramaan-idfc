/* ------------------------------------------------------------------
   Loan-origination (LOS) record mock. In production this is fetched from the
   bank's LOS when the technical valuation is initiated; the customer link is
   pre-filled from it so the customer never re-enters address / KYC / documents
   the sales team already collected. Derivation is descriptive only — no numbers
   from the IDFC benchmark reports are changed.
   ------------------------------------------------------------------ */
import type { LosDocType, LosDocument, LosRecord, PropertyCase } from '@/lib/types';

export const DOC_LABEL: Record<LosDocType, string> = {
  SALE_DEED: 'Registered sale deed',
  TITLE_CHAIN: 'Title chain — previous deeds (13 years)',
  ENCUMBRANCE_CERT: 'Encumbrance certificate (13 years)',
  INDEX_II: 'Index II / registration extract',
  APPROVED_PLAN: 'Approved building plan (sanctioned map)',
  LAYOUT_PLAN: 'Approved layout plan (plots)',
  LAND_RECORD: 'Land record (7/12 · Patta · Khatauni · Property card)',
  PROPERTY_TAX: 'Latest property-tax receipt',
  OC_CC: 'Occupancy / completion certificate',
  EB_BILL: 'Latest electricity bill',
  SOCIETY_NOC: 'Society NOC for mortgage',
  SHARE_CERTIFICATE: 'Society share certificate',
  BUILDER_AGREEMENT: 'Registered builder–buyer agreement',
  NA_ORDER: 'NA / land-use conversion order',
  MUTATION: 'Mutation entry in owner’s name',
  TRADE_LICENSE: 'Trade / factory licence',
  OTHER: 'Other document',
};

export const DOC_HELP: Record<LosDocType, string> = {
  SALE_DEED: 'The registered document by which the current owner bought the property.',
  TITLE_CHAIN: 'Earlier sale / gift / partition deeds showing who owned it for the last 13 years.',
  ENCUMBRANCE_CERT: 'From the Sub-Registrar — shows no loans or charges on the property.',
  INDEX_II: 'Registration summary page issued by the Sub-Registrar office.',
  APPROVED_PLAN: 'Building plan approved by the municipality / development authority. Mandatory — the bank can only mortgage what is approved.',
  LAYOUT_PLAN: 'Approved layout showing the plot within the colony / scheme.',
  LAND_RECORD: 'Revenue record with survey / khasra number and area.',
  PROPERTY_TAX: 'Most recent municipal tax receipt.',
  OC_CC: 'Certificate from the authority that construction was completed as approved.',
  EB_BILL: 'Most recent electricity bill for the property (shows meter and usage type).',
  SOCIETY_NOC: 'No-objection letter from the housing society for mortgaging the flat.',
  SHARE_CERTIFICATE: 'Share certificate issued by the cooperative housing society.',
  BUILDER_AGREEMENT: 'Registered agreement between you and the builder (first owner).',
  NA_ORDER: 'Order converting agricultural land to non-agricultural (residential / commercial) use.',
  MUTATION: 'Revenue / municipal record showing the property transferred to the current owner.',
  TRADE_LICENSE: 'Licence for the business / factory run from the premises.',
  OTHER: 'Any other document the bank asks for.',
};

/** Title-chain coverage that is stated in the case documents (only where it is known). */
const KNOWN_CHAIN_FROM: Record<string, number> = {
  'idfc-prm-2026-001': 2009,
  'adr-cbe-july-26-idfc-022': 2010, // Sale Deed Doc No. 5851/2010 (14.06.2010)
};

const KNOWN_PLAN_REF: Record<string, string> = {
  'idfc-ukddn26061359': 'DLDA OC/0015/24-25 & OC/0009/24-25 (31.05.2024)',
};

const KNOWN_LAND_REF: Record<string, string> = {
  'adr-cbe-july-26-idfc-022': 'Tamil Nilam ULPIN 732SH2D9TJ1SH0 · Patta 2021/0103/12/305278',
  'idfc-ukddn26051909': `Khasra ${['2206', '2221'].join(', ')}`,
};

function addressOf(c: PropertyCase): string {
  const d = c.details?.find((x) => x.label === 'Full Address' || x.label === 'Location');
  return d?.value ?? `${c.title}, ${c.city}, ${c.state}`;
}

function doc(type: LosDocType, mandatory: boolean, status: LosDocument['status'], extra: Partial<LosDocument> = {}): LosDocument {
  return { type, label: DOC_LABEL[type], mandatory, status, ...extra };
}

export function deriveLosRecord(c: PropertyCase, now = new Date()): LosRecord {
  const year = now.getFullYear();
  const maharashtra = c.state === 'Maharashtra';
  const chainFrom = KNOWN_CHAIN_FROM[c.id];
  const hasLandRecord = !!c.surveyPattaNumbers?.length || c.cadastralPlotAreaSqft !== c.deedPlotAreaSqft || !!KNOWN_LAND_REF[c.id];
  const vacant = c.floors.every((f) => f.actualSqft === 0);
  const deedRef = c.vernacularDocsParsed?.find((d) => /sale deed/i.test(d.docType))?.docType;

  const documents: LosDocument[] = [
    doc('SALE_DEED', true, 'ON_FILE', deedRef ? { ref: deedRef } : {}),
    doc('TITLE_CHAIN', true, 'ON_FILE', chainFrom ? { coversFromYear: chainFrom, coversToYear: year } : {}),
    doc('INDEX_II', false, maharashtra ? 'ON_FILE' : 'NOT_APPLICABLE'),
    doc('APPROVED_PLAN', true, c.hasSanctionedPlan ? 'ON_FILE' : 'NOT_AVAILABLE', KNOWN_PLAN_REF[c.id] ? { ref: KNOWN_PLAN_REF[c.id] } : {}),
    doc('LAYOUT_PLAN', vacant, vacant ? 'PENDING' : 'NOT_APPLICABLE'),
    doc('LAND_RECORD', false, hasLandRecord ? 'ON_FILE' : 'PENDING', KNOWN_LAND_REF[c.id] ? { ref: KNOWN_LAND_REF[c.id] } : {}),
    doc('PROPERTY_TAX', false, 'ON_FILE'),
  ];

  return {
    loanAppNo: `LAP-${c.caseRefNo}`,
    product: 'LAP',
    borrowerName: c.applicantName,
    propertyAddress: addressOf(c),
    propertyType: c.recordConfirmedUsage,
    kycStatus: 'Completed at onboarding (CKYC / Aadhaar e-KYC) — not repeated',
    sourcedBy: 'Branch sales RM (LOS)',
    documents,
  };
}

export function losRecordFor(c: PropertyCase): LosRecord {
  return c.los ?? deriveLosRecord(c);
}

/** Document statuses after the customer link (uploads / "not available"), else the LOS statuses. */
export function effectiveDocuments(c: PropertyCase): LosDocument[] {
  return c.customerLink?.submission?.documents ?? losRecordFor(c).documents;
}

export const isAvailable = (d: LosDocument) => d.status === 'ON_FILE' || d.status === 'UPLOADED';
