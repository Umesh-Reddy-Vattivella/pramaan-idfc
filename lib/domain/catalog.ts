/* Labels, policy constants and the document checklist per property type (PRD_V3 §4.1). */
import type { DocFrom, DocSlot, Occupancy, PropertyType, RoomMethod, Structure, Usage } from './types';

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  HOUSE: 'Independent house / bungalow',
  FLAT: 'Flat / apartment',
  PLOT: 'Open plot',
  SHOP_OFFICE: 'Shop / office unit',
  COMMERCIAL_BUILDING: 'Commercial building (with land)',
  INDUSTRIAL: 'Factory / warehouse / shed',
};

export const DEFAULT_USAGE: Record<PropertyType, Usage> = {
  HOUSE: 'RESIDENTIAL',
  FLAT: 'RESIDENTIAL',
  PLOT: 'RESIDENTIAL',
  SHOP_OFFICE: 'COMMERCIAL',
  COMMERCIAL_BUILDING: 'COMMERCIAL',
  INDUSTRIAL: 'INDUSTRIAL',
};

export const DEFAULT_STRUCTURE: Record<PropertyType, Structure> = {
  HOUSE: 'RCC',
  FLAT: 'RCC',
  PLOT: 'RCC',
  SHOP_OFFICE: 'RCC',
  COMMERCIAL_BUILDING: 'RCC',
  INDUSTRIAL: 'STEEL_SHED',
};

export const USAGE_LABEL: Record<Usage, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  MIXED: 'Mixed use',
  INDUSTRIAL: 'Industrial',
};

export const STRUCTURE_LABEL: Record<Structure, string> = {
  RCC: 'RCC framed',
  LOAD_BEARING: 'Load-bearing masonry',
  STEEL_SHED: 'Steel / PEB shed',
};

export const OCCUPANCY_LABEL: Record<Occupancy, string> = { SELF: 'Self-occupied', RENTED: 'Rented', VACANT: 'Vacant' };

export const ROOM_METHOD_LABEL: Record<RoomMethod, string> = {
  SNAPSHOT_SCALE: 'Measured on snapshot',
  TAPE_ON_CALL: 'Tape on video call',
  PLAN: 'From approved plan',
};

/** Property types that have a building to measure and value. */
export const isBuilt = (t: PropertyType) => t !== 'PLOT';
/** Types valued by Land + Building (cost method). */
export const hasLand = (t: PropertyType) => t === 'HOUSE' || t === 'PLOT' || t === 'COMMERCIAL_BUILDING' || t === 'INDUSTRIAL';
/** Strata units valued by sales comparison. */
export const isUnit = (t: PropertyType) => t === 'FLAT' || t === 'SHOP_OFFICE';

export const floorNames = (n: number | null | undefined): string[] => {
  const k = Math.max(1, Math.min(10, Math.round(n ?? 1)));
  return Array.from({ length: k }, (_, i) => (i === 0 ? 'Ground floor' : i === 1 ? 'First floor' : i === 2 ? 'Second floor' : i === 3 ? 'Third floor' : `Floor ${i}`));
};

/* ---------------- document checklist ---------------- */

interface DocDef {
  key: string;
  label: string;
  help: string;
  from: DocFrom;
  /** mandatory | recommended | not applicable, per type */
  rule: (t: PropertyType) => 'M' | 'R' | null;
}

const BUILT_M = (t: PropertyType) => (isBuilt(t) ? 'M' : null);

export const DOC_DEFS: DocDef[] = [
  { key: 'SALE_DEED', label: 'Registered sale deed', help: 'Current owner’s registered deed. Gives owner, address, survey / plot no., area and boundaries.', from: 'BANK', rule: () => 'M' },
  { key: 'TITLE_CHAIN', label: 'Chain of title documents (13 years)', help: 'All previous deeds / agreements so that ownership can be traced for the last 13 years.', from: 'EITHER', rule: () => 'M' },
  { key: 'APPROVED_PLAN', label: 'Approved / sanctioned building plan', help: 'Plan approved by the local authority. Only the approved structure can be mortgaged.', from: 'EITHER', rule: BUILT_M },
  { key: 'LAYOUT_PLAN', label: 'Approved layout plan', help: 'Layout approved by the planning authority showing this plot.', from: 'EITHER', rule: (t) => (t === 'PLOT' ? 'M' : null) },
  { key: 'EC', label: 'Encumbrance certificate (13 years)', help: 'Shows any existing mortgage or charge on the property.', from: 'EITHER', rule: () => 'R' },
  { key: 'LAND_RECORD', label: 'Land record extract (7/12, Patta, Khatauni, mutation)', help: 'Revenue record confirming the owner and land area.', from: 'EITHER', rule: (t) => (hasLand(t) ? 'R' : null) },
  { key: 'INDEX_II', label: 'Registration extract (Index II or equivalent)', help: 'Sub-registrar extract of the registration.', from: 'EITHER', rule: () => 'R' },
  { key: 'TAX_RECEIPT', label: 'Latest property tax receipt', help: 'Confirms the assessed usage (residential / commercial) and dues.', from: 'CUSTOMER', rule: () => 'R' },
  { key: 'ELECTRICITY_BILL', label: 'Latest electricity bill', help: 'Tariff category confirms the usage of the building.', from: 'CUSTOMER', rule: (t) => (isBuilt(t) ? 'R' : null) },
  { key: 'OC_CC', label: 'Occupancy / completion certificate', help: 'Issued by the authority when the building was completed as approved.', from: 'EITHER', rule: (t) => (isBuilt(t) ? 'R' : null) },
  { key: 'SOCIETY_NOC', label: 'Society NOC / share certificate', help: 'For flats and units in a society or association.', from: 'CUSTOMER', rule: (t) => (isUnit(t) ? 'R' : null) },
];

export function checklistFor(t: PropertyType): DocSlot[] {
  return DOC_DEFS.flatMap((d) => {
    const r = d.rule(t);
    if (!r) return [];
    return [{ key: d.key, label: d.label, help: d.help, mandatory: r === 'M', from: d.from, files: [], status: 'PENDING' as const }];
  });
}

export const FROM_LABEL: Record<DocFrom, string> = { BANK: 'Bank (loan file)', CUSTOMER: 'Customer', EITHER: 'Bank or customer' };

/* ---------------- inspection shot list ---------------- */

export const EXTERIOR_SHOTS = [
  'Front elevation',
  'Approach road',
  'Left side / neighbour',
  'Right side / neighbour',
  'Rear side',
  'Electricity meter / name plate',
];
