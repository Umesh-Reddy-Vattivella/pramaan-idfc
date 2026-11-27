'use client';

/** Leaflet fallback renderer for a declarative MapSpec. Import via next/dynamic with { ssr: false }. */
import { useEffect, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { MapSpec } from '@/lib/mapGeometry';

const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function Follow({ spec, follow }: { spec: MapSpec; follow?: boolean }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current || follow) map.setView(spec.center, first.current ? spec.zoom : map.getZoom());
    first.current = false;
  }, [map, spec.center, spec.zoom, follow]);
  return null;
}

function Clicks({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function LeafletSpecMap({ spec, height = 300, onClick, followCenter }: { spec: MapSpec; height?: number; onClick?: (lat: number, lng: number) => void; followCenter?: boolean }) {
  const [offline, setOffline] = useState(false);
  return (
    <div className={`relative isolate overflow-hidden rounded-xl border border-slate-200 ${onClick ? 'cursor-crosshair' : ''}`} style={{ height }}>
      <MapContainer center={spec.center} zoom={spec.zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url={spec.base === 'satellite' ? ESRI_SAT : OSM}
          attribution={spec.base === 'satellite' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap contributors'}
          maxZoom={21}
          maxNativeZoom={19}
          eventHandlers={{ tileerror: () => setOffline(true) }}
        />
        <Follow spec={spec} follow={followCenter} />
        <Clicks onClick={onClick} />
        {spec.circles.map((c) => (
          <Circle key={c.id} center={c.center} radius={c.radiusM} pathOptions={{ color: c.color, weight: 2, fillOpacity: 0.06, dashArray: '6 6' }}>
            {c.tooltip && <Tooltip>{c.tooltip}</Tooltip>}
          </Circle>
        ))}
        {spec.polygons.map((p) => (
          <Polygon key={p.id} positions={p.path} pathOptions={{ color: p.color, weight: p.weight ?? 2, fillColor: p.fill ?? p.color, fillOpacity: p.fillOpacity ?? 0.2, dashArray: p.dashed ? '6 6' : undefined }}>
            {p.tooltip && <Tooltip>{p.tooltip}</Tooltip>}
          </Polygon>
        ))}
        {spec.polylines.map((p) => (
          <Polyline key={p.id} positions={p.path} pathOptions={{ color: p.color, weight: p.weight ?? 2, dashArray: p.dashed ? '6 6' : undefined }}>
            {p.tooltip && <Tooltip>{p.tooltip}</Tooltip>}
          </Polyline>
        ))}
        {spec.markers.map((m) => (
          <CircleMarker key={m.id} center={m.pos} radius={m.size} pathOptions={{ color: '#ffffff', weight: 2, fillColor: m.color, fillOpacity: 1 }}>
            {m.tooltip && (
              <Tooltip direction="top" offset={[0, -6]} permanent={m.permanent}>
                {m.tooltip}
              </Tooltip>
            )}
          </CircleMarker>
        ))}
      </MapContainer>
      {offline && <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[1000] rounded-md bg-slate-900/80 px-2 py-1 text-center text-[11px] text-white">Offline — map tiles unavailable.</div>}
    </div>
  );
}
