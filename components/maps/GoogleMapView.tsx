'use client';

/// <reference types="google.maps" />
/**
 * Google Maps JavaScript API renderer for a declarative MapSpec.
 * Browser-only: import via next/dynamic with { ssr: false } (components/workbench/maps.tsx).
 * Calls onFail() if the key is missing/invalid or the script cannot load — callers then
 * fall back to the Leaflet renderer.
 */
import { useEffect, useRef, useState } from 'react';
import type { MapSpec } from '@/lib/mapGeometry';

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

declare global {
  interface Window {
    __pramaanGmReady?: () => void;
    gm_authFailure?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

export function googleMapsConfigured(): boolean {
  return KEY.length > 0 && !authFailed;
}

function loadGoogleMaps(): Promise<void> {
  if (!KEY) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set'));
  if (window.google?.maps?.Map) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    window.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((f) => f());
    };
    window.__pramaanGmReady = () => resolve();
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&callback=__pramaanGmReady`;
    s.async = true;
    s.onerror = () => {
      loadPromise = null;
      reject(new Error('Google Maps script failed to load (offline?)'));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}

const ll = ([lat, lng]: [number, number]) => ({ lat, lng });
const dashIcons = (color: string, weight: number) => [
  { icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, strokeWeight: weight, scale: 3 }, offset: '0', repeat: '12px' },
];

export interface GoogleMapViewProps {
  spec: MapSpec;
  height: number;
  onFail: (reason: string) => void;
  onClick?: (lat: number, lng: number) => void;
  onMarkerDrag?: (id: string, lat: number, lng: number) => void;
  /** Re-centre when the spec centre changes (pin pickers). */
  followCenter?: boolean;
}

export default function GoogleMapView({ spec, height, onFail, onClick, onMarkerDrag, followCenter }: GoogleMapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([]);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const clickRef = useRef(onClick);
  const dragRef = useRef(onMarkerDrag);
  const [ready, setReady] = useState(false);
  clickRef.current = onClick;
  dragRef.current = onMarkerDrag;

  // Load script + create the map once.
  useEffect(() => {
    let cancelled = false;
    const fail = () => onFail('Google Maps rejected the API key');
    authListeners.add(fail);
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !el.current || authFailed) return;
        map.current = new google.maps.Map(el.current, {
          center: ll(spec.center),
          zoom: spec.zoom,
          mapTypeId: spec.base === 'satellite' ? 'hybrid' : 'roadmap',
          tilt: 0,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'cooperative',
        });
        info.current = new google.maps.InfoWindow();
        map.current.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng && clickRef.current) clickRef.current(e.latLng.lat(), e.latLng.lng());
        });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && onFail(e.message));
    return () => {
      cancelled = true;
      authListeners.delete(fail);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw overlays from the spec.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const iw = info.current!;
    const hover = (o: google.maps.MVCObject, text: string | undefined, anchorPos?: google.maps.LatLngLiteral) => {
      if (!text) return;
      const html = `<div style="font:12px system-ui;white-space:pre-line;max-width:260px">${text.replace(/</g, '&lt;')}</div>`;
      const open = (e?: google.maps.MapMouseEvent) => {
        iw.setContent(html);
        if (o instanceof google.maps.Marker) iw.open({ map: m, anchor: o });
        else {
          iw.setPosition(e?.latLng ?? anchorPos ?? null);
          iw.open({ map: m });
        }
      };
      o.addListener('mouseover', open);
      o.addListener('click', open);
      o.addListener('mouseout', () => iw.close());
    };

    for (const p of spec.polygons) {
      const poly = new google.maps.Polygon({
        map: m,
        paths: p.path.map(ll),
        strokeColor: p.color,
        strokeOpacity: p.dashed ? 0 : 1,
        strokeWeight: p.weight ?? 2,
        fillColor: p.fill ?? p.color,
        fillOpacity: p.fillOpacity ?? 0.2,
        clickable: !!p.tooltip,
      });
      overlays.current.push(poly);
      hover(poly, p.tooltip);
      if (p.dashed) {
        const ring = new google.maps.Polyline({ map: m, path: [...p.path, p.path[0]].map(ll), strokeOpacity: 0, icons: dashIcons(p.color, p.weight ?? 2), clickable: false });
        overlays.current.push(ring);
      }
    }
    for (const l of spec.polylines) {
      const line = new google.maps.Polyline({
        map: m,
        path: l.path.map(ll),
        strokeColor: l.color,
        strokeOpacity: l.dashed ? 0 : 0.9,
        strokeWeight: l.weight ?? 2,
        icons: l.dashed ? dashIcons(l.color, l.weight ?? 2) : undefined,
        clickable: !!l.tooltip,
      });
      overlays.current.push(line);
      hover(line, l.tooltip);
    }
    for (const c of spec.circles) {
      const circ = new google.maps.Circle({ map: m, center: ll(c.center), radius: c.radiusM, strokeColor: c.color, strokeWeight: 1.5, strokeOpacity: 0.8, fillOpacity: 0.03, fillColor: c.color, clickable: false });
      overlays.current.push(circ);
    }
    for (const mk of spec.markers) {
      const marker = new google.maps.Marker({
        map: m,
        position: ll(mk.pos),
        draggable: !!mk.draggable,
        zIndex: mk.permanent ? 1000 : 500,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: mk.size, fillColor: mk.color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
      });
      overlays.current.push(marker);
      if (mk.permanent && mk.tooltip) {
        const pin = new google.maps.InfoWindow({ content: `<div style="font:600 11px system-ui">${mk.tooltip.replace(/</g, '&lt;')}</div>`, disableAutoPan: true });
        pin.open({ map: m, anchor: marker });
        overlays.current.push({ setMap: (x) => (x ? pin.open({ map: x, anchor: marker }) : pin.close()) });
      } else {
        hover(marker, mk.tooltip);
      }
      if (mk.draggable) {
        marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
          if (e.latLng && dragRef.current) dragRef.current(mk.id, e.latLng.lat(), e.latLng.lng());
        });
      }
    }
  }, [ready, spec]);

  useEffect(() => {
    if (ready && followCenter && map.current) map.current.panTo(ll(spec.center));
  }, [ready, followCenter, spec.center]);

  return <div ref={el} style={{ height, width: '100%' }} className="rounded-xl bg-slate-200" />;
}
