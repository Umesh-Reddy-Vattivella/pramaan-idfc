'use client';

/** Leaflet fallback pin picker (click to place). Import via next/dynamic with { ssr: false }. */
import { useEffect, useState } from 'react';
import { CircleMarker, LayersControl, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function Click({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Follow({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(center);
  }, [map, center]);
  return null;
}

export interface PinMapProps {
  center: [number, number];
  pin: [number, number] | null;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}

export default function LeafletPinMap({ center, pin, onPick, height = 300 }: PinMapProps) {
  const [offline, setOffline] = useState(false);
  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <MapContainer center={center} zoom={17} scrollWheelZoom={false} style={{ height: '100%', width: '100%', cursor: 'crosshair' }}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Esri Satellite">
            <TileLayer url={ESRI_SAT} attribution="Tiles &copy; Esri" maxZoom={20} maxNativeZoom={19} eventHandlers={{ tileerror: () => setOffline(true) }} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer url={OSM} attribution="&copy; OpenStreetMap contributors" maxZoom={20} maxNativeZoom={19} />
          </LayersControl.BaseLayer>
        </LayersControl>
        <Click onPick={onPick} />
        <Follow center={center} />
        {pin && (
          <CircleMarker center={pin} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#9C1D26', fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -8]} permanent>
              Subject pin
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
      {offline && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[1000] rounded-md bg-slate-900/80 px-2 py-1 text-center text-[11px] text-white">
          Offline — map tiles unavailable. Enter coordinates manually if needed.
        </div>
      )}
    </div>
  );
}
