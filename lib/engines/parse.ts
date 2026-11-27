/* Deterministic parsers for printed Indian price / area / rate text (pure). The LLM only copies text; units are parsed here. */

/* Indic numerals (Devanagari, Bengali, Gurmukhi, Gujarati, Tamil, Telugu, Kannada, Malayalam) → ASCII. */
const INDIC_ZERO = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];

/** "११२/२" → "112/2", "०.०१६७" → "0.0167". Leaves all other characters unchanged. */
export function normaliseDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const zero = INDIC_ZERO.find((z) => cp >= z && cp <= z + 9);
    out += zero === undefined ? ch : String(cp - zero);
  }
  return out;
}

// Unit words in English and Indian languages. NOTE: no \b around Indic words (\b is ASCII-only in JS).
const SQFT_PER: { re: RegExp; factor: number }[] = [
  { re: /(sq\.?\s*(ft|feet|fit)|sqft|sft|square\s*f(ee|oo)t|qs\.?\s*fit|स्क्वेयर\s*फीट|चौ\.?\s*फ[ूु]ट?|चौरस\s*फ[ूु]ट|वर्ग\s*फ[ुी]ट|சதுர\s*அடி|ச\.?\s*அடி)/i, factor: 1 },
  { re: /(sq\.?\s*(yd|yard)s?|square\s*yards?|gaj|वर्ग\s*गज|गज)/i, factor: 9 },
  { re: /(sq\.?\s*m(tr|eter|etre)?s?\b|sqm|square\s*met(er|re)s?|m²|चौ\.?\s*मी|चौरस\s*मीटर|वर्ग\s*मीटर|சதுர\s*மீட்டர்|ச\.?\s*மீ)/i, factor: 10.7639 },
  { re: /(\bacres?\b|एकर|एकड़|ஏக்கர்)/i, factor: 43560 },
  { re: /(\bhectares?\b|हेक्टर|हेक्टेयर|हे\.?\s*आर|हे\.|ஹெக்டேர்)/i, factor: 107639 },
  { re: /(\bgunt(h)?as?\b|गुंठ[ाे]?)/i, factor: 1089 },
  { re: /\bares?\b/i, factor: 1076.39 },
];

/** Square feet per one unit of the area unit named in the text (null if no recognised unit). */
export function sqftPerUnit(text: string): number | null {
  for (const u of SQFT_PER) if (u.re.test(text)) return u.factor;
  return null;
}

/**
 * Parses a printed rupee amount: "₹15 Lac" → 1,500,000 · "₹1.14 Cr" → 11,400,000 ·
 * "Rs. 24,00,000" → 2,400,000 · "INR 8.33 K" → 8,330. Returns null if no number.
 */
export function parseInrAmount(text: string): number | null {
  const t = normaliseDigits(text).replace(/,/g, '').replace(/\/-/g, '');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(crores?|cr\b|lakhs?|lacs?|lac\b|lakh\b|l\b|k\b|thousand)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  const mult = /^cr/.test(unit) ? 1e7 : /^(lakh|lac|l$)/.test(unit) ? 1e5 : /^(k|thousand)/.test(unit) ? 1e3 : 1;
  const v = Math.round(n * mult * 100) / 100; // exact to the paisa (avoids 1.14 × 1e7 = 11399999.999…)
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Parses a printed area into sqft, pairing each number with ITS OWN unit:
 * "5000 sqft" → 5000 · "200 sq yd" → 1800 · "1 acre" → 43560 ·
 * "167.22 sq. m. (1800 sq. ft.)" → 1800 (an explicit sq ft figure is preferred over a conversion).
 */
export function parseAreaSqft(text: string): number | null {
  const t = normaliseDigits(text).replace(/,/g, '');
  const pairs: { index: number; value: number; factor: number }[] = [];
  for (const u of SQFT_PER) {
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${u.re.source})`, 'gi');
    for (const m of t.matchAll(re)) pairs.push({ index: m.index ?? 0, value: parseFloat(m[1]), factor: u.factor });
  }
  if (!pairs.length) return null;
  const sqft = pairs.find((p) => p.factor === 1);
  const pick = sqft ?? pairs.sort((a, b) => a.index - b.index)[0];
  const v = Math.round(pick.value * pick.factor * 10000) / 10000;
  return v > 0 ? v : null;
}

/** Parses a printed rate into Rs./sqft: "₹1,200/sqft" → 1200 · "INR 8.33 K/ sq.ft" → 8330 · "₹45,000 per sq yd" → 5000. */
export function parseRatePerSqft(text: string): number | null {
  const amount = parseInrAmount(text);
  const f = sqftPerUnit(text);
  if (amount === null || f === null) return null;
  return amount / f;
}

/** Whitespace / case / currency-symbol normalised text for "is this quote really in the source?" checks. */
export function normaliseForMatch(s: string): string {
  return normaliseDigits(s).toLowerCase().replace(/₹|rs\.?|inr/g, '').replace(/[\s,]+/g, '');
}

/** True if the quoted text appears verbatim (after normalisation) in the source text. */
export function quoteInSource(quote: string, source: string): boolean {
  const q = normaliseForMatch(quote);
  return q.length >= 2 && normaliseForMatch(source).includes(q);
}

/**
 * Deterministic fallback extractor (no AI): finds explicit "₹X / sqft"-style rates in text.
 * Used when the extraction model is unavailable.
 */
export function extractRatesFromText(text: string): { rateText: string; rate: number }[] {
  const re = /(?:₹|rs\.?|inr)\s*\d[\d,.]*\s*(?:k|lakh|lac)?\s*(?:\/-)?\s*(?:\/|per)\s*(?:sq\.?\s*(?:ft|feet|yd|yard|m)|sqft|sft|square\s*(?:feet|yards?))/gi;
  const out: { rateText: string; rate: number }[] = [];
  for (const m of text.matchAll(re)) {
    const rate = parseRatePerSqft(m[0]);
    if (rate !== null && rate >= 100 && rate <= 500000) out.push({ rateText: m[0].trim(), rate });
  }
  return out;
}

/** Area units offered on the registered-sale form → sqft per unit. */
export const AREA_UNITS = {
  SQFT: { label: 'sq ft', sqft: 1 },
  SQM: { label: 'sq m (चौ.मी.)', sqft: 10.7639 },
  SQYD: { label: 'sq yd / gaj', sqft: 9 },
  GUNTHA: { label: 'guntha (गुंठा)', sqft: 1089 },
  ACRE: { label: 'acre', sqft: 43560 },
  HECTARE: { label: 'hectare (हेक्टर)', sqft: 107639 },
} as const;
export type AreaUnit = keyof typeof AREA_UNITS;

/** value × sqft-per-unit, rounded to 0.01 sqft; null for non-positive input. */
export function areaToSqft(value: number, unit: AreaUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * AREA_UNITS[unit].sqft * 100) / 100;
}

/**
 * Printed Indian date → YYYY-MM-DD: "12/03/2025", "12-03-2025", "12.03.2025", "2025-03-12",
 * Devanagari digits allowed. Day-first (Indian convention). Null if unparseable or impossible.
 */
export function parseIndianDate(text: string | undefined | null): string | null {
  if (!text) return null;
  const t = normaliseDigits(text).trim();
  let y: number, mo: number, d: number;
  let m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else {
    m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) return null;
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
  }
  if (y < 1950 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Months between a printed date (YYYY, YYYY-MM or YYYY-MM-DD) and now; null if unparseable. */
export function monthsSince(date: string | undefined, now: Date): number | null {
  if (!date) return null;
  const m = date.trim().match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return null;
  const y = +m[1];
  const mo = m[2] ? +m[2] - 1 : 5; // year only → assume mid-year
  return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() - mo));
}
