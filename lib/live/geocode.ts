/* ------------------------------------------------------------------
   Server-only geocoding via OpenStreetMap Nominatim (free, no key).
   Respects the public usage policy: identifying User-Agent, ≤ 1 request/s,
   results cached in memory.
   ------------------------------------------------------------------ */

export interface GeoPlace {
  lat: number;
  lng: number;
  displayName: string;
  locality?: string;
  city?: string;
  state?: string;
}

const UA = 'PRAMAAN-Prototype/1.0 (FAME 6.0 LAP valuation demo)';
const cache = new Map<string, GeoPlace[]>();
let lastCall = 0;

async function throttle() {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

interface NominatimRow {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

function toPlace(r: NominatimRow): GeoPlace {
  const a = r.address ?? {};
  return {
    lat: +r.lat,
    lng: +r.lon,
    displayName: r.display_name,
    locality: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village ?? a.hamlet ?? a.city_district,
    city: a.city ?? a.town ?? a.county ?? a.state_district,
    state: a.state,
  };
}

export async function geocodeSearch(query: string, limit = 5): Promise<GeoPlace[]> {
  const key = `s:${query.toLowerCase().trim()}:${limit}`;
  const hit = cache.get(key);
  if (hit) return hit;
  await throttle();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  const rows = (await res.json()) as NominatimRow[];
  const places = rows.map(toPlace);
  cache.set(key, places);
  return places;
}

export async function geocodeReverse(lat: number, lng: number): Promise<GeoPlace | null> {
  const key = `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit) return hit[0] ?? null;
  await throttle();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  const row = (await res.json()) as NominatimRow & { error?: string };
  if (row.error) return null;
  const place = toPlace(row);
  cache.set(key, [place]);
  return place;
}
