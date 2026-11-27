'use client';

/** Leaflet fallback renderer for a declarative MapSpec. Import via next/dynamic with { ssr: false }. */
import { useEffect, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { MapSpec } from '@/lib/mapGeometry';

const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function Fit({ spec }: { spec: MapSpec }) {
  const map = useMap();
  useEffect(() => {
    map.setView(spec.center, spec.zoom);
  }, [map, spec.center, spec.zoom]);
  return null;
}

export default function LeafletSpecMap({ spec, height = 300 }: { spec: MapSpec; height?: number }) {
  const [offline, setOffline] = useState(false);
  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <MapContainer center={spec.center} zoom={spec.zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url={spec.base === 'satellite' ? ESRI_SAT : OSM}
          attribution={spec.base === 'satellite' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap contributors'}
          maxZoom={21}
          maxNativeZoom={19}
          eventHandlers={{ tileerror: () => setOffline(true) }}
        />
        <Fit spec={spec} />
        {spec.circles.map((c) => (
          <Circle key={c.id} center={c.center} radius={c.radiusM} pathOptions={{ color: c.color, weight: 2, fillOpacity: 0.08, dashArray: '6 6' }}>
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
      {offline && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[1000] rounded-md bg-slate-900/80 px-2 py-1 text-center text-[11px] text-white">
          Offline — map tiles unavailable.
        </div>
      )}
    </div>
  );
}
