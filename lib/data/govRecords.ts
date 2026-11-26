/* ------------------------------------------------------------------
   Government-record adapters — SIMULATED for the prototype.
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

/** Simulated ULB notice list (illustrative entries; none are real properties). */
export const DEMOLITION_NOTICES: DemolitionNotice[] = [
  { id: 'NMC-UC-2026-0412', authority: 'Nagpur Municipal Corporation', address: 'Plot 18, Khamla (illustrative)', lat: 21.1102, lng: 79.0583, noticeDate: '2026-03-14', reason: 'Unauthorised 3rd floor — sec. 53 MRTP notice' },
  { id: 'MCD-UC-2026-1178', authority: 'Dehradun Municipal Corporation', address: 'Haridwar Bypass (illustrative)', lat: 30.2932, lng: 78.0611, noticeDate: '2026-05-02', reason: 'Construction within river-bank setback' },
  { id: 'CCMC-UC-2026-0093', authority: 'Coimbatore City Municipal Corporation', address: 'Gandhipuram (illustrative)', lat: 11.0168, lng: 76.9674, noticeDate: '2026-02-21', reason: 'Building without approved plan' },
];

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
