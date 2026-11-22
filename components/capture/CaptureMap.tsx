'use client';

/** Step-2 map pin picker. MUST be imported via next/dynamic with { ssr: false } (components/workbench/maps.tsx). */
import { useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import { CAPTURE_PARCEL, CAPTURE_SITE, offsetLatLng } from '@/lib/data/captureTemplate';

const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export interface CaptureMapProps {
  pin: { lat: number; lng: number } | null;
  /** Spoofed GPS point when Mock-GPS simulation is active. */
  spoofed: { lat: number; lng: number } | null;
  pinInParcel: boolean | null;
  showWidening: boolean;
  showHazards: boolean;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}

function ClickCatcher({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function CaptureMap({ pin, spoofed, pinInParcel, showWidening, showHazards, onPick, height = 230 }: CaptureMapProps) {
  const [tilesOffline, setTilesOffline] = useState(false);
  const { lat, lng } = CAPTURE_SITE;
  // West-side 30 ft road corridor (Master Plan: no widening proposed).
  const roadW = offsetLatLng(lat, lng, 0, -14);
  const road: [number, number][] = [offsetLatLng(roadW[0], roadW[1], -45, 0), offsetLatLng(roadW[0], roadW[1], 45, 0)];
  const parcelColor = pinInParcel === null ? '#ffffff' : pinInParcel ? '#22c55e' : '#ef4444';

  return (
    <div className="relative isolate overflow-hidden rounded-lg" style={{ height }}>
      <MapContainer center={[lat, lng]} zoom={20} maxZoom={21} scrollWheelZoom={false} style={{ height: '100%', width: '100%', cursor: 'crosshair' }}>
        <TileLayer url={ESRI_SAT} attribution="Tiles &copy; Esri" maxZoom={21} maxNativeZoom={19} eventHandlers={{ tileerror: () => setTilesOffline(true) }} />
        <ClickCatcher onPick={onPick} />
        <Polygon positions={CAPTURE_PARCEL} pathOptions={{ color: parcelColor, weight: 3, fillColor: parcelColor, fillOpacity: 0.2 }}>
          <Tooltip sticky>Parcel polygon (cadastral) — tap inside to drop pin</Tooltip>
        </Polygon>
        {showWidening && (
          <Polyline positions={road} pathOptions={{ color: '#eda100', weight: 10, opacity: 0.6, dashArray: '6 6' }}>
            <Tooltip sticky>Master Plan road (30 ft) — no widening proposed; parcel unaffected</Tooltip>
          </Polyline>
        )}
        {showHazards && (
          <Circle center={[lat, lng]} radius={500} pathOptions={{ color: '#38bdf8', weight: 1.5, dashArray: '4 6', fillOpacity: 0.03 }}>
            <Tooltip sticky>Forest / CRZ / HT-line / caution layers: none within 500 m</Tooltip>
          </Circle>
        )}
        {pin && (
          <CircleMarker center={[pin.lat, pin.lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#9C1D26', fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -6]}>Owner pin</Tooltip>
          </CircleMarker>
        )}
        {spoofed && (
          <>
            {pin && <Polyline positions={[[pin.lat, pin.lng], [spoofed.lat, spoofed.lng]]} pathOptions={{ color: '#ef4444', weight: 2, dashArray: '6 5' }} />}
            <CircleMarker center={[spoofed.lat, spoofed.lng]} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}>
              <Tooltip permanent direction="top" offset={[0, -6]}>Mock GPS · {CAPTURE_SITE.mockGpsOffsetM} m</Tooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>
      {tilesOffline && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[1000] rounded-md bg-slate-900/80 px-2 py-1 text-center text-[11px] font-medium text-white">
          Offline — map tiles unavailable. Overlays, pins &amp; all calculations still work.
        </div>
      )}
    </div>
  );
}
