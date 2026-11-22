'use client';

/**
 * Leaflet GIS / comparables map. MUST be imported via next/dynamic with { ssr: false }
 * (see components/workbench/maps.tsx) — Leaflet touches `window` at import time.
 */
import { useState } from 'react';
import { CircleMarker, LayersControl, MapContainer, Polygon, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { ComparablePin, PropertyCase } from '@/lib/types';
import { SOURCE_COLOR, SOURCE_SHORT } from '@/lib/sourceMeta';
import { offsetLatLng as offset, parcelGeometry } from '@/lib/mapGeometry';

const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTR = 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics';
const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; OpenStreetMap contributors';

export interface SatelliteMapProps {
  caseData: PropertyCase;
  mode: 'gis' | 'comps';
  comparables?: ComparablePin[];
  height?: number;
}

export default function SatelliteMap({ caseData: c, mode, comparables = [], height = 380 }: SatelliteMapProps) {
  const [tilesOffline, setTilesOffline] = useState(false);
  const onTileError = { tileerror: () => setTilesOffline(true) };
  const center: LatLngExpression = [c.lat, c.lng];
  const { parcel, widening } = parcelGeometry(c);
  const geoOffset = c.sanctionedMapGeoOffsetMeters;
  // Bearing of the mis-tagged map point is not stated in the report; plotted to the north-east (illustrative).
  const offsetPt = geoOffset ? offset(c.lat, c.lng, geoOffset * Math.SQRT1_2, geoOffset * Math.SQRT1_2) : null;

  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-slate-200" style={{ height }}>
      <MapContainer center={center} zoom={mode === 'gis' ? 19 : 15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={mode === 'gis'} name="Esri Satellite">
            <TileLayer url={ESRI_SAT} attribution={ESRI_ATTR} maxZoom={20} maxNativeZoom={19} eventHandlers={onTileError} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={mode === 'comps'} name="OpenStreetMap">
            <TileLayer url={OSM} attribution={OSM_ATTR} maxZoom={20} maxNativeZoom={19} eventHandlers={onTileError} />
          </LayersControl.BaseLayer>
        </LayersControl>

        {mode === 'gis' && (
          <>
            <Polygon positions={parcel} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#9C1D26', fillOpacity: 0.25 }}>
              <Tooltip sticky>Parcel footprint (illustrative, sized to {c.deedPlotAreaSqft.toLocaleString('en-IN')} sqft deed area)</Tooltip>
            </Polygon>
            {widening && (
              <Polygon positions={widening} pathOptions={{ color: '#eda100', weight: 2, fillColor: '#eda100', fillOpacity: 0.55, dashArray: '4 3' }}>
                <Tooltip sticky>
                  Road-widening corridor ({c.roadSide}) — {c.roadWideningLossSqft.toLocaleString('en-IN')} sqft lost
                </Tooltip>
              </Polygon>
            )}
            {offsetPt && (
              <>
                <Polyline positions={[center, offsetPt]} pathOptions={{ color: '#ffffff', weight: 3, dashArray: '8 6' }} />
                <CircleMarker center={offsetPt} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#DC2626', fillOpacity: 1 }}>
                  <Tooltip permanent direction="top" offset={[0, -8]}>
                    Sanctioned-map geo-tag · {geoOffset} m off
                  </Tooltip>
                </CircleMarker>
              </>
            )}
          </>
        )}

        {mode === 'comps' &&
          comparables.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={8}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: SOURCE_COLOR[p.source], fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div className="text-xs">
                  <div className="font-semibold">{SOURCE_SHORT[p.source]} · {p.distanceKm} km</div>
                  <div>{p.note}</div>
                  <div>
                    Raw Rs. {p.rawRate.toLocaleString('en-IN')} → adj. Rs. {p.adjustedRate.toLocaleString('en-IN')}/sqft · {p.date}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}

        <CircleMarker center={center} radius={mode === 'gis' ? 7 : 10} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#9C1D26', fillOpacity: 1 }}>
          <Tooltip permanent={mode === 'comps'} direction="top" offset={[0, -8]}>
            Subject · {c.lat.toFixed(6)}, {c.lng.toFixed(6)}
          </Tooltip>
        </CircleMarker>
      </MapContainer>
      {tilesOffline && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[1000] rounded-md bg-slate-900/80 px-2 py-1 text-center text-[11px] font-medium text-white">
          Offline — map tiles unavailable. Overlays, pins &amp; all calculations still work.
        </div>
      )}
    </div>
  );
}
