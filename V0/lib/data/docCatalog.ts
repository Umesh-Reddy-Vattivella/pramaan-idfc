/* ------------------------------------------------------------------
   Suggested document checklist for a new LAP technical valuation.
   Depends on property kind and state. Each item says who normally provides it:
   BANK (collected by sales during origination / visit) or CUSTOMER (asked through
   the customer portal). Either side can still upload any item.
   ------------------------------------------------------------------ */
import type { DocRequest, LosDocType, Party, PropertyKind, UsageClass } from '@/lib/types';
import { DOC_HELP, DOC_LABEL } from './losRecords';

export const PROPERTY_KIND_LABEL: Record<PropertyKind, string> = {
  HOUSE: 'Independent house / bungalow',
  FLAT: 'Flat / apartment',
  COMMERCIAL: 'Shop / office / commercial building',
  INDUSTRIAL: 'Factory / warehouse / industrial shed',
  PLOT: 'Vacant plot',
};

export const KIND_USAGE: Record<PropertyKind, UsageClass> = {
  HOUSE: 'RESIDENTIAL',
  FLAT: 'RESIDENTIAL',
  COMMERCIAL: 'COMMERCIAL',
  INDUSTRIAL: 'INDUSTRIAL',
  PLOT: 'RESIDENTIAL',
};

/** Name of the land record by state (shown in the label so customers recognise it). */
export function landRecordName(state: string): string {
  const s = state.toLowerCase();
  if (s.includes('maharashtra')) return '7/12 extract / property card';
  if (s.includes('tamil')) return 'Patta / chitta';
  if (s.includes('karnataka')) return 'RTC / Khata';
  if (s.includes('uttar') || s.includes('uttarakhand')) return 'Khatauni';
  if (s.includes('telangana') || s.includes('andhra')) return 'Pahani / adangal';
  if (s.includes('gujarat')) return '7/12 / 8A';
  if (s.includes('delhi')) return 'Mutation / khasra-girdawari';
  return 'Land record';
}

type Row = [LosDocType, boolean, Party];

export function suggestDocuments(kind: PropertyKind, state: string): DocRequest[] {
  const maharashtra = state.toLowerCase().includes('maharashtra');
  const rows: Row[] = [
    ['SALE_DEED', true, 'BANK'],
    ['TITLE_CHAIN', true, 'CUSTOMER'],
    ['ENCUMBRANCE_CERT', true, 'BANK'],
  ];
  if (maharashtra) rows.push(['INDEX_II', true, 'BANK']);
  if (kind === 'PLOT') {
    rows.push(['LAYOUT_PLAN', true, 'CUSTOMER'], ['NA_ORDER', true, 'CUSTOMER'], ['LAND_RECORD', true, 'BANK']);
  } else {
    rows.push(['APPROVED_PLAN', true, 'CUSTOMER']);
    if (kind === 'FLAT') {
      rows.push(['OC_CC', true, 'CUSTOMER'], ['SOCIETY_NOC', true, 'CUSTOMER'], ['SHARE_CERTIFICATE', false, 'CUSTOMER'], ['BUILDER_AGREEMENT', false, 'CUSTOMER']);
    } else {
      rows.push(['OC_CC', false, 'CUSTOMER'], ['LAND_RECORD', true, 'BANK']);
    }
    rows.push(['EB_BILL', false, 'CUSTOMER']);
    if (kind === 'COMMERCIAL' || kind === 'INDUSTRIAL') rows.push(['TRADE_LICENSE', false, 'CUSTOMER']);
  }
  rows.push(['PROPERTY_TAX', true, 'CUSTOMER'], ['MUTATION', false, 'BANK']);

  return rows.map(([type, mandatory, assignee]) => ({
    id: type.toLowerCase(),
    type,
    label: type === 'LAND_RECORD' ? `${DOC_LABEL.LAND_RECORD.split(' (')[0]} (${landRecordName(state)})` : DOC_LABEL[type],
    help: DOC_HELP[type],
    mandatory,
    assignee,
    status: 'REQUESTED',
    uploads: [],
  }));
}

export function customDocument(label: string, assignee: Party): DocRequest {
  return {
    id: `other-${Date.now().toString(36)}`,
    type: 'OTHER',
    label,
    help: DOC_HELP.OTHER,
    mandatory: false,
    assignee,
    status: 'REQUESTED',
    uploads: [],
  };
}
