'use client';

/**
 * Address search with live suggestions while typing.
 *  - Google Places Autocomplete (Places API New) when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY works
 *  - Photon (OpenStreetMap, komoot) otherwise — free, built for type-ahead
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { googleMapsAvailable, loadGoogleMaps } from '@/lib/googleMaps';

export interface PickedPlace {
  lat: number;
  lng: number;
  displayName: string;
  locality?: string;
  city?: string;
  state?: string;
}

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  /** Resolves the full place (Google needs a details call; Photon already has coordinates). */
  resolve: () => Promise<PickedPlace | null>;
}

/* ---------------- Photon (OpenStreetMap) ---------------- */

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

async function photonSuggest(q: string, bias: [number, number] | null, signal: AbortSignal): Promise<Suggestion[]> {
  const biasQ = bias ? `&lat=${bias[0]}&lon=${bias[1]}` : '';
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lang=en&bbox=68.1,6.5,97.4,35.7${biasQ}`, { signal });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const j = (await res.json()) as { features: PhotonFeature[] };
  return j.features
    .filter((f) => (f.properties.countrycode ?? 'IN') === 'IN')
    .map((f, i) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const locality = p.district ?? p.locality ?? (p.type === 'district' || p.type === 'locality' ? p.name : undefined);
      const city = p.city ?? p.county;
      const secondary = [p.street && p.street !== p.name ? p.street : undefined, locality !== p.name ? locality : undefined, city, p.state].filter(Boolean).join(', ');
      const place: PickedPlace = { lat, lng, displayName: [p.name, secondary].filter(Boolean).join(', '), locality: locality ?? p.name, city, state: p.state };
      return { id: `p${i}-${lat},${lng}`, main: p.name ?? secondary, secondary, resolve: async () => place };
    });
}

/* ---------------- Google Places (New) ---------------- */

interface GPrediction {
  placeId: string;
  text: { text: string };
  mainText?: { text: string } | null;
  secondaryText?: { text: string } | null;
  toPlace: () => {
    fetchFields: (o: { fields: string[] }) => Promise<unknown>;
    location?: { lat: () => number; lng: () => number } | null;
    formattedAddress?: string | null;
    addressComponents?: { longText: string | null; types: string[] }[] | null;
  };
}
interface GPlacesLib {
  AutocompleteSuggestion: { fetchAutocompleteSuggestions: (r: Record<string, unknown>) => Promise<{ suggestions: { placePrediction: GPrediction | null }[] }> };
  AutocompleteSessionToken: new () => unknown;
}

let sessionToken: unknown = null;

async function googleSuggest(q: string, bias: [number, number] | null): Promise<Suggestion[]> {
  await loadGoogleMaps();
  const lib = (google.maps as unknown as { places: GPlacesLib }).places;
  if (!sessionToken) sessionToken = new lib.AutocompleteSessionToken();
  const req: Record<string, unknown> = { input: q, sessionToken, includedRegionCodes: ['in'] };
  if (bias) req.locationBias = { center: { lat: bias[0], lng: bias[1] }, radius: 50000 };
  const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
  return suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is GPrediction => !!p)
    .map((p) => ({
      id: p.placeId,
      main: p.mainText?.text ?? p.text.text,
      secondary: p.secondaryText?.text ?? '',
      resolve: async () => {
        const place = p.toPlace();
        await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents'] });
        sessionToken = null; // a selection ends the billing session
        if (!place.location) return null;
        const comp = (type: string) => place.addressComponents?.find((c) => c.types.includes(type))?.longText ?? undefined;
        return {
          lat: place.location.lat(),
          lng: place.location.lng(),
          displayName: place.formattedAddress ?? p.text.text,
          locality: comp('sublocality_level_1') ?? comp('sublocality') ?? comp('neighborhood') ?? p.mainText?.text,
          city: comp('locality') ?? comp('administrative_area_level_3') ?? comp('administrative_area_level_2'),
          state: comp('administrative_area_level_1'),
        };
      },
    }));
}

/* ---------------- Component ---------------- */

export default function AddressAutocomplete({ onSelect, bias, placeholder }: { onSelect: (p: PickedPlace) => void; bias?: [number, number] | null; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const [provider, setProvider] = useState<'google' | 'osm'>('osm');
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const term = q.trim();
    if (term.length < 3) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        let res: Suggestion[] | null = null;
        if (googleMapsAvailable()) {
          try {
            res = await googleSuggest(term, bias ?? null);
            setProvider('google');
          } catch {
            res = null; // key rejected / Places API not enabled → fall back
          }
        }
        if (!res) {
          res = await photonSuggest(term, bias ?? null, ctrl.signal);
          setProvider('osm');
        }
        setItems(res);
        setActive(-1);
        setOpen(true);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Suggestions unavailable');
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, bias]);

  useEffect(() => {
    const close = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = async (s: Suggestion) => {
    setOpen(false);
    setBusy(true);
    try {
      const place = await s.resolve();
      if (place) {
        skipNext.current = true;
        setQ([s.main, s.secondary].filter(Boolean).join(', '));
        onSelect(place);
      }
    } catch {
      setError('Could not load that place — try another suggestion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-maroon">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(items[Math.max(0, active)]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder ?? 'Start typing an address, locality or landmark…'}
          className="w-full py-2 text-sm outline-none"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="addr-suggestions"
        />
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
      </div>
      {error && <p className="mt-1 text-xs text-remote">{error}</p>}
      {open && items.length > 0 && (
        <ul id="addr-suggestions" role="listbox" className="absolute z-[1100] mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {items.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left ${i === active ? 'bg-canvas' : ''}`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-maroon" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{s.main}</span>
                  {s.secondary && <span className="block truncate text-xs text-slate-500">{s.secondary}</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-3 py-1 text-right text-[10px] text-slate-400">
            {provider === 'google' ? 'powered by Google' : 'Suggestions © OpenStreetMap contributors (Photon)'}
          </li>
        </ul>
      )}
    </div>
  );
}
