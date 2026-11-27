/* ------------------------------------------------------------------
   Government-record adapters — NOT CONNECTED in the prototype (no records are invented).
   In production each of these is an API / scraper adapter:
     • ULB unauthorised-construction & demolition notice lists
     • Development Plan (DP) / Master Plan road-widening & reservation layers
     • Revenue land records (Bhulekh / Mahabhumi / Tamil Nilam) and SRO / IGR searches
   The sanity engine takes these records as plain inputs, so swapping the
   simulated list for a live feed changes no engine code.
   ------------------------------------------------------------------ */

export interface DemolitionNotice {
  id: string;
  authority: string;
  address: string;
  lat: number;
  lng: number;
  noticeDate: string;
  reason: string;
}

/**
 * ULB unauthorised-construction / demolition notices. NOT CONNECTED in the prototype:
 * no list is bundled (we do not invent records). When a city feed is integrated it is loaded here
 * and DEMOLITION_LIST_CONNECTED becomes true; until then the sanity check is reported as PENDING.
 */
export const DEMOLITION_NOTICES: DemolitionNotice[] = [];
export const DEMOLITION_LIST_CONNECTED = false;

export const DEMOLITION_MATCH_RADIUS_M = 30;

export const GOV_SOURCE = {
  LOS: { name: 'Bank LOS — documents collected by sales', live: true },
  OCR: { name: 'Document OCR (sale deed / plan / land record)', live: true },
  CAPTURE: { name: 'Customer link — geo-tagged live photos', live: true },
  ROOMS: { name: 'Customer link — room measurements (AR / tape / reference object)', live: true },
  BHULEKH: { name: 'Revenue land record (Bhulekh / Mahabhumi / Tamil Nilam)', live: false },
  SRO: { name: 'SRO / IGR registration search (Index II, EC)', live: false },
  ULB_NOTICES: { name: 'ULB unauthorised-construction / demolition notice list', live: false },
  DP_PLAN: { name: 'Development Plan / Master Plan road-widening layer', live: false },
  DCR: { name: 'Development Control Regulations (permissible FSI) via approved plan', live: true },
  GIS: { name: 'GIS hazard layers (forest, CRZ, HT line, flood)', live: false },
  SATELLITE: { name: 'Satellite imagery (Esri / Google)', live: true },
  ZONING: { name: 'Zoning + utility / tax usage class', live: false },
} as const;

export type GovSourceId = keyof typeof GOV_SOURCE;
