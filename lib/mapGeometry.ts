/* Declarative map spec shared by the Google Maps renderer and the Leaflet fallback (display only). */

export type LatLng = [number, number];

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

export const emptySpec = (center: LatLng, zoom = 18, base: MapSpec['base'] = 'satellite'): MapSpec => ({ center, zoom, base, markers: [], polygons: [], polylines: [], circles: [] });
