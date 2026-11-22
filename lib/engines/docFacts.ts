/* ------------------------------------------------------------------
   Document facts — pure, deterministic helpers for the OCR autofill.
   The extraction model only COPIES text; classification, unit parsing,
   age arithmetic and usage mapping happen here.
   ------------------------------------------------------------------ */
import type { UsageClass } from '@/lib/types';
import { normaliseDigits } from './marketEvidence';

export type DocType = 'SALE_DEED' | 'LAND_RECORD' | 'SANCTIONED_PLAN' | 'PROPERTY_TAX' | 'EB_BILL' | 'OTHER';

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  SALE_DEED: 'Sale Deed',
  LAND_RECORD: 'Land Record (7/12 · Patta · Property Card)',
  SANCTIONED_PLAN: 'Sanctioned Building Plan',
  PROPERTY_TAX: 'Property Tax Receipt',
  EB_BILL: 'Electricity Bill',
  OTHER: 'Other document',
};

export type FactField =
  | 'OWNER_NAME'
  | 'ADDRESS'
  | 'LOCALITY'
  | 'CITY'
  | 'STATE'
  | 'PINCODE'
  | 'SURVEY_NUMBER'
  | 'PLOT_AREA'
  | 'FLOOR_AREA_SANCTIONED'
  | 'FLOOR_AREA_ACTUAL'
  | 'PLAN_NUMBER'
  | 'CONSTRUCTION_YEAR'
  | 'USAGE'
  | 'ROAD_WIDTH'
  | 'BOUNDARY_EAST'
  | 'BOUNDARY_WEST'
  | 'BOUNDARY_NORTH'
  | 'BOUNDARY_SOUTH';

export const FACT_FIELDS: FactField[] = [
  'OWNER_NAME', 'ADDRESS', 'LOCALITY', 'CITY', 'STATE', 'PINCODE', 'SURVEY_NUMBER', 'PLOT_AREA',
  'FLOOR_AREA_SANCTIONED', 'FLOOR_AREA_ACTUAL', 'PLAN_NUMBER', 'CONSTRUCTION_YEAR', 'USAGE', 'ROAD_WIDTH',
  'BOUNDARY_EAST', 'BOUNDARY_WEST', 'BOUNDARY_NORTH', 'BOUNDARY_SOUTH',
];

export interface DocFact {
  field: FactField;
  /** Text copied verbatim from the document (verified present in its OCR text). */
  value: string;
  /** Index into the documents array. */
  doc: number;
  /** Floor name for FLOOR_AREA_* facts. */
  floorName?: string;
  origin: 'AI' | 'PATTERN';
}

/* ---------------- Language & document type ---------------- */

const SCRIPTS: { re: RegExp; lang: string }[] = [
  { re: /[ऀ-ॿ]/g, lang: 'Hindi / Marathi (Devanagari)' },
  { re: /[஀-௿]/g, lang: 'Tamil' },
  { re: /[ఀ-౿]/g, lang: 'Telugu' },
  { re: /[ಀ-೿]/g, lang: 'Kannada' },
  { re: /[઀-૿]/g, lang: 'Gujarati' },
  { re: /[ঀ-৿]/g, lang: 'Bengali' },
  { re: /[ഀ-ൿ]/g, lang: 'Malayalam' },
  { re: /[਀-੿]/g, lang: 'Punjabi (Gurmukhi)' },
];

/** Dominant Indic script if it makes up ≥ 15% of letters, else English. */
export function detectLanguage(text: string): string {
  const letters = (text.match(/\p{L}/gu) ?? []).length || 1;
  let best = { lang: 'English', n: 0 };
  for (const s of SCRIPTS) {
    const n = (text.match(s.re) ?? []).length;
    if (n > best.n) best = { lang: s.lang, n };
  }
  return best.n / letters >= 0.15 ? best.lang : 'English';
}

const TYPE_RULES: { type: DocType; re: RegExp }[] = [
  { type: 'SALE_DEED', re: /sale\s*deed|conveyance\s*deed|deed\s*of\s*(sale|conveyance)|vendor|purchaser|विक्री\s*पत्र|खरेदी\s*खत|बैनामा|विक्रय\s*पत्र|கிரைய\s*பத்திரம்/i },
  { type: 'LAND_RECORD', re: /7\s*\/\s*12|satbara|sat-bara|७\/१२|सातबारा|patta|பட்டா|property\s*card|khatauni|jamabandi|record\s*of\s*rights|ror\b|fmb|chitta|adangal|khasra\s*girdawari|mutation/i },
  { type: 'SANCTIONED_PLAN', re: /sanction(ed)?\s*(building\s*)?plan|building\s*permission|approved\s*plan|commencement\s*certificate|occupancy\s*certificate|\bBP\s*\/|layout\s*approval/i },
  { type: 'PROPERTY_TAX', re: /property\s*tax|house\s*tax|assessment\s*(no|number)|tax\s*receipt|मालमत्ता\s*कर|संपत्ति\s*कर|சொத்து\s*வரி/i },
  { type: 'EB_BILL', re: /electricity|msedcl|bescom|tneb|tangedco|consumer\s*(no|number)|tariff|kwh|units\s*consumed|बिजली|वीज/i },
];

export function classifyDocType(text: string, fileName = ''): DocType {
  const hay = `${fileName} ${text.slice(0, 3000)}`;
  for (const r of TYPE_RULES) if (r.re.test(hay)) return r.type;
  return 'OTHER';
}

/* ---------------- Conversions ---------------- */

/** Age in completed years from a construction year (null if the year is implausible). */
export function ageFromYear(year: number, now: Date): number | null {
  const y = now.getFullYear();
  return year >= 1800 && year <= y ? y - year : null;
}

export function parseYear(text: string): number | null {
  const m = normaliseDigits(text).match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

/** Usage class from tax class / tariff / zoning text (null if not recognisable). */
export function usageFromText(text: string): UsageClass | null {
  const t = text.toLowerCase();
  if (/mixed|composite/.test(t)) return 'MIXED_USE';
  if (/industrial|factory|\bht\b|lt-?\s*v\b/.test(t)) return 'INDUSTRIAL';
  if (/institution|school|hospital|educational/.test(t)) return 'INSTITUTIONAL';
  if (/commercial|shop|office|non-?domestic|lt-?\s*ii\b|business/.test(t)) return 'COMMERCIAL';
  if (/residential|domestic|dwelling|lt-?\s*i\b|la1a|non-?agricultural\s*-?\s*residential|निवासी|आवासीय|குடியிருப்பு/.test(t)) return 'RESIDENTIAL';
  return null;
}

/** Road width in feet from text like "30 ft road" / "9 m wide road" (null if absent). */
export function parseRoadWidthFt(text: string): number | null {
  const m = normaliseDigits(text).match(/(\d+(?:\.\d+)?)\s*(ft|feet|foot|'|m|mtr|meter|metre)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /^(m|mtr|meter|metre)$/i.test(m[2]) ? Math.round(n * 3.28084 * 100) / 100 : n;
}

/* ---------------- Pattern-based fallback extractor (no AI) ---------------- */

const PATTERNS: { field: FactField; re: RegExp; group: number }[] = [
  { field: 'SURVEY_NUMBER', re: /(?:survey|khasra|s\.\s?no|sf\s?no|gat|cts)\s*(?:no\.?|number|nos\.?)?\s*[:.\-]?\s*([0-9]+[A-Z]?(?:\s*\/\s*[0-9A-Z]+)*)/gi, group: 1 },
  { field: 'PLOT_AREA', re: /(?:area\s+of\s+(?:the\s+)?plot|plot\s+area|land\s+area|area)\s*[:\-]?\s*((?:\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet|m|mtr|yd|yards?)|sqft|sqm|square\s+(?:feet|met(?:er|re)s|yards)|hectares?|acres?))/gi, group: 1 },
  { field: 'CONSTRUCTION_YEAR', re: /(?:constructed|built|construction|year\s+of\s+construction)[^0-9]{0,25}((?:18|19|20)\d{2})/gi, group: 1 },
  { field: 'PLAN_NUMBER', re: /(?:sanction(?:ed)?\s+(?:building\s+)?plan|building\s+permission|plan)\s*(?:no\.?|number)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]{3,})/gi, group: 1 },
  { field: 'PINCODE', re: /\b([1-9]\d{5})\b/g, group: 1 },
  { field: 'USAGE', re: /((?:property\s+)?tax\s+class\s*:\s*[A-Za-z\- ]{3,30}|tariff\s*:\s*[A-Za-z0-9\- ]{3,30})/gi, group: 1 },
];

export function patternFacts(rawText: string, doc: number): DocFact[] {
  const text = normaliseDigits(rawText); // \d is ASCII-only in JS regex
  const out: DocFact[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const value = m[p.group]?.trim();
      if (!value) continue;
      const key = `${p.field}|${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ field: p.field, value, doc, origin: 'PATTERN' });
      if (p.field === 'PINCODE' || p.field === 'CONSTRUCTION_YEAR') break; // first occurrence only
    }
  }
  return out;
}
