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
let loadFailed = false;
const authListeners = new Set<() => void>();

export function googleMapsAvailable(): boolean {
  return GOOGLE_MAPS_KEY.length > 0 && !authFailed && !loadFailed;
}

export function onGoogleAuthFailure(fn: () => void): () => void {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadGoogleMaps(timeoutMs = 4000): Promise<void> {
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set'));
  if (authFailed || loadFailed) return Promise.reject(new Error('Google Maps is unavailable'));
  if (typeof window !== 'undefined' && window.google?.maps?.Map) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    window.gm_authFailure = () => {
      cleanup();
      authFailed = true;
      loadPromise = null;
      authListeners.forEach((f) => f());
      reject(new Error('Google Maps rejected the API key'));
    };

    window.__pramaanGmReady = () => {
      cleanup();
      resolve();
    };

    timer = setTimeout(() => {
      loadFailed = true;
      loadPromise = null;
      reject(new Error('Google Maps load timed out'));
    }, timeoutMs);

    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&v=weekly&libraries=places&region=IN&callback=__pramaanGmReady`;
    s.async = true;
    s.onerror = () => {
      cleanup();
      loadFailed = true;
      loadPromise = null;
      reject(new Error('Google Maps script failed to load (offline or blocked)'));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}
