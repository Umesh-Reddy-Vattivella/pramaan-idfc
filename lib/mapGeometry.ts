/* ------------------------------------------------------------------
   Map geometry + declarative map specs shared by the Google Maps renderer
   and the Leaflet fallback. Display geometry only — no valuation math.
   ------------------------------------------------------------------ */
import type { ComparablePin, PropertyCase } from '@/lib/types';
import { SOURCE_COLOR, SOURCE_SHORT } from '@/lib/sourceMeta';

export type LatLng = [number, number];

const M_PER_DEG_LAT = 111320;
const FT = 0.3048;

export function offsetLatLng(lat: number, lng: number, northM: number, eastM: number): LatLng {
  return [lat + northM / M_PER_DEG_LAT, lng + eastM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))];
}

/**
 * Illustrative square parcel sized to the deed plot area, plus the road-widening strip on the
 * approach-road side (depth = (proposed − current road width) / 2; R1: 15.86 ft).
 */
export function parcelGeometry(c: PropertyCase): { parcel: LatLng[]; widening: LatLng[] | null } {
  const sideM = Math.sqrt(Math.max(c.deedPlotAreaSqft, 1)) * FT;
  const h = sideM / 2;
  const box = (n0: number, n1: number, e0: number, e1: number): LatLng[] => [
    offsetLatLng(c.lat, c.lng, n0, e0),
    offsetLatLng(c.lat, c.lng, n0, e1),
    offsetLatLng(c.lat, c.lng, n1, e1),
    offsetLatLng(c.lat, c.lng, n1, e0),
  ];
  let widening: LatLng[] | null = null;
  if (c.roadWidthProposedFt && c.roadWidthProposedFt > c.roadWidthCurrentFt && c.roadSide) {
    const d = ((c.roadWidthProposedFt - c.roadWidthCurrentFt) / 2) * FT;
    widening =
      c.roadSide === 'North' ? box(h - d, h, -h, h)
      : c.roadSide === 'South' ? box(-h, -h + d, -h, h)
      : c.roadSide === 'East' ? box(-h, h, h - d, h)
      : box(-h, h, -h, -h + d);
  }
  return { parcel: box(-h, h, -h, h), widening };
}

/* ---------------- Declarative map spec ---------------- */

export interface SpecMarker {
  id: string;
  pos: LatLng;
  color: string;
  size: number;
  tooltip?: string;
  permanent?: boolean;
  draggable?: boolean;
}
export interface SpecShape {
  id: string;
  path: LatLng[];
  color: string;
  fill?: string;
  fillOpacity?: number;
  weight?: number;
  dashed?: boolean;
  tooltip?: string;
}
export interface SpecCircle {
  id: string;
  center: LatLng;
  radiusM: number;
  color: string;
  tooltip?: string;
}
export interface MapSpec {
  center: LatLng;
  zoom: number;
  base: 'satellite' | 'street';
  markers: SpecMarker[];
  polygons: SpecShape[];
  polylines: SpecShape[];
  circles: SpecCircle[];
}

export function gisSpec(c: PropertyCase): MapSpec {
  const { parcel, widening } = parcelGeometry(c);
  const spec: MapSpec = { center: [c.lat, c.lng], zoom: 19, base: 'satellite', markers: [], polygons: [], polylines: [], circles: [] };
  spec.polygons.push({ id: 'parcel', path: parcel, color: '#ffffff', fill: '#9C1D26', fillOpacity: 0.25, weight: 2, tooltip: `Parcel footprint (illustrative, sized to ${c.deedPlotAreaSqft.toLocaleString('en-IN')} sqft deed area)` });
  if (widening) {
    spec.polygons.push({ id: 'widening', path: widening, color: '#eda100', fill: '#eda100', fillOpacity: 0.55, weight: 2, dashed: true, tooltip: `Road-widening corridor (${c.roadSide}) — ${c.roadWideningLossSqft.toLocaleString('en-IN')} sqft lost` });
  }
  const g = c.sanctionedMapGeoOffsetMeters;
  if (g) {
    const pt = offsetLatLng(c.lat, c.lng, g * Math.SQRT1_2, g * Math.SQRT1_2); // bearing not stated — drawn NE (illustrative)
    spec.polylines.push({ id: 'geo-offset', path: [[c.lat, c.lng], pt], color: '#ffffff', weight: 3, dashed: true });
    spec.markers.push({ id: 'geo-tag', pos: pt, color: '#DC2626', size: 8, tooltip: `Sanctioned-map geo-tag · ${g} m off`, permanent: true });
  }
  spec.markers.push({ id: 'subject', pos: [c.lat, c.lng], color: '#9C1D26', size: 7, tooltip: `Subject · ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` });
  return spec;
}

export function compsSpec(c: PropertyCase, comparables: ComparablePin[]): MapSpec {
  return {
    center: [c.lat, c.lng],
    zoom: 14,
    base: 'street',
    polygons: [],
    polylines: [],
    circles: [],
    markers: [
      ...comparables.map((p) => ({
        id: p.id,
        pos: [p.lat, p.lng] as LatLng,
        color: SOURCE_COLOR[p.source],
        size: 8,
        tooltip: `${SOURCE_SHORT[p.source]} · ${p.distanceKm} km\n${p.note}\nRaw Rs. ${p.rawRate.toLocaleString('en-IN')} → adj. Rs. ${p.adjustedRate.toLocaleString('en-IN')}/sqft · ${p.date}`,
      })),
      { id: 'subject', pos: [c.lat, c.lng], color: '#9C1D26', size: 10, tooltip: 'Subject property', permanent: true },
    ],
  };
}
