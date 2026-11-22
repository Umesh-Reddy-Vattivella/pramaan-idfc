/// <reference types="google.maps" />
/* ------------------------------------------------------------------
   Browser-only Google Maps JavaScript API loader (maps + places).
   Shared by the map renderer and the address autocomplete.
   ------------------------------------------------------------------ */

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

declare global {
  interface Window {
    __pramaanGmReady?: () => void;
    gm_authFailure?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

export function googleMapsAvailable(): boolean {
  return GOOGLE_MAPS_KEY.length > 0 && !authFailed;
}

export function onGoogleAuthFailure(fn: () => void): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadGoogleMaps(): Promise<void> {
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set'));
  if (authFailed) return Promise.reject(new Error('Google Maps rejected the API key'));
  if (typeof window !== 'undefined' && window.google?.maps?.Map && window.google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    window.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((f) => f());
    };
    window.__pramaanGmReady = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&v=weekly&libraries=places&region=IN&callback=__pramaanGmReady`;
    s.async = true;
    s.onerror = () => {
      loadPromise = null;
      reject(new Error('Google Maps script failed to load (offline?)'));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}
