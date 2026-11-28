/* ------------------------------------------------------------------
   Government value (Valuation Logic v2 §1A component A) — pure helpers.
   Telangana: direct lookup in the IGRS Market Value Search (land per sq yd ÷ 9,
   apartment per sqft). Elsewhere: a link to the state's official portal where
   one is known, otherwise nothing (the web-search guideline rate remains).
   ------------------------------------------------------------------ */
import type { GuidelineRef, MarketPoint, PropertyFacts, PropertyType, Usage } from '@/lib/domain/types';

export const SQFT_PER_SQYD = 9;

/** Published rate → Rs./sqft. */
export function govRatePerSqft(printedRate: number, unit: 'SQYD' | 'SQFT'): number {
  return unit === 'SQYD' ? printedRate / SQFT_PER_SQYD : printedRate;
}

/** Telangana from the recorded state, else from the address (state name, Hyderabad / Secunderabad, PIN 50xxxx). */
export function isTelangana(p: Pick<PropertyFacts, 'state' | 'address' | 'city'>): boolean {
  if (p.state) return /telangana/i.test(p.state);
  const t = `${p.address} ${p.city ?? ''}`;
  return /telangana|hyderabad|secunderabad/i.test(t) || /\b50\d{4}\b/.test(t);
}

/** Land value for plots / houses / buildings; apartment value for flats and units. */
export const govBasisFor = (t: PropertyType): 'LAND' | 'APARTMENT' => (t === 'FLAT' || t === 'SHOP_OFFICE' ? 'APARTMENT' : 'LAND');

/** IGRS classification matching the subject's usage ("01(Residential)", "02(Commercial)"). */
export function classificationMatches(classification: string | null | undefined, usage: Usage): boolean | null {
  if (!classification) return null;
  const c = classification.toLowerCase();
  if (usage === 'RESIDENTIAL') return c.includes('residential');
  if (usage === 'COMMERCIAL' || usage === 'INDUSTRIAL') return c.includes('commercial') || c.includes('industrial');
  return true;
}

/** Official portals for guideline / circle rates by state (no automated lookup: link only). */
export const GUIDELINE_PORTALS: { match: RegExp; state: string; name: string; url: string }[] = [
  { match: /maharashtra/i, state: 'Maharashtra', name: 'IGR Maharashtra — Ready Reckoner (ASR)', url: 'https://igrmaharashtra.gov.in/' },
  { match: /karnataka/i, state: 'Karnataka', name: 'Kaveri Online — guidance value', url: 'https://kaveri.karnataka.gov.in/' },
  { match: /tamil\s*nadu/i, state: 'Tamil Nadu', name: 'TNREGINET — guideline value', url: 'https://tnreginet.gov.in/' },
  { match: /andhra/i, state: 'Andhra Pradesh', name: 'IGRS Andhra Pradesh — market value', url: 'https://registration.ap.gov.in/' },
  { match: /gujarat/i, state: 'Gujarat', name: 'GARVI — jantri rates', url: 'https://garvi.gujarat.gov.in/' },
  { match: /uttarakhand/i, state: 'Uttarakhand', name: 'Registration Uttarakhand — circle rates', url: 'https://registration.uk.gov.in/' },
  { match: /uttar\s*pradesh/i, state: 'Uttar Pradesh', name: 'IGRS Uttar Pradesh — circle rates', url: 'https://igrsup.gov.in/' },
  { match: /delhi/i, state: 'Delhi', name: 'Revenue Department Delhi — circle rates', url: 'https://revenue.delhi.gov.in/' },
];

export function guidelinePortalFor(p: Pick<PropertyFacts, 'state' | 'address'>) {
  const t = p.state || p.address;
  return GUIDELINE_PORTALS.find((x) => x.match.test(t)) ?? null;
}

/** The OFFICIAL guideline point for an adopted IGRS row. */
export function officialGuidelinePoint(ref: GuidelineRef): MarketPoint {
  const unit = ref.printedUnit === 'SQYD' ? 'per Sq.Yard' : 'per Sq.Ft';
  return {
    id: ref.basis === 'LAND' ? 'gov-land' : 'gov-apartment',
    category: 'GUIDELINE',
    kind: 'GUIDELINE',
    ratePerSqft: Math.round(govRatePerSqft(ref.printedRate, ref.printedUnit) * 100) / 100,
    locality: ref.locality,
    date: ref.effectiveDate,
    dateSource: 'PRINTED',
    url: ref.url,
    title: `IGRS Telangana market value — ${ref.basis === 'LAND' ? 'land' : 'apartment'}, ${ref.locality}`,
    quote: `₹${ref.printedRate.toLocaleString('en-IN')} ${unit}${ref.classification ? ` · ${ref.classification}` : ''}${ref.effectiveDate ? ` · effective ${ref.effectiveDate}` : ''} · ${[ref.village, ref.mandal, ref.district].filter(Boolean).join(', ')}`,
    origin: 'OFFICIAL',
    included: true,
    guideline: ref,
  };
}
