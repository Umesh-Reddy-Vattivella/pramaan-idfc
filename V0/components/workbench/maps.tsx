'use client';

/**
 * Map entry points. Google Maps (JavaScript API) is the primary renderer when
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set; if the key is missing/rejected or the
 * script cannot load (offline), the Leaflet renderer (Esri + OpenStreetMap) is used.
 * Every map component is imported with next/dynamic { ssr: false }.
 */
import dynamic from 'next/dynamic';
import { useMemo, useState, type ReactNode } from 'react';
import type { ComparablePin, PropertyCase } from '@/lib/types';
import { compsSpec, gisSpec, type MapSpec } from '@/lib/mapGeometry';

const GOOGLE_KEY_SET = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const Loading = ({ h }: { h: number }) => (
  <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500" style={{ height: h }}>
    Loading map…
  </div>
);

const GoogleMapView = dynamic(() => import('@/components/maps/GoogleMapView'), { ssr: false, loading: () => <Loading h={300} /> });
const LeafletSatellite = dynamic(() => import('@/components/SatelliteMap'), { ssr: false, loading: () => <Loading h={380} /> });
const LeafletSpec = dynamic(() => import('@/components/maps/LeafletSpecMap'), { ssr: false, loading: () => <Loading h={280} /> });
const LeafletPin = dynamic(() => import('@/components/maps/LeafletPinMap'), { ssr: false, loading: () => <Loading h={300} /> });

/** Google first, Leaflet on failure. */
function useGoogleMaps(): [boolean, () => void] {
  const [failed, setFailed] = useState(false);
  return [GOOGLE_KEY_SET && !failed, () => setFailed(true)];
}

function Provider({ google, children }: { google: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-2 z-[5] -translate-x-1/2 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow">
        {google ? 'Google Maps' : 'Esri / OpenStreetMap'}
      </span>
    </div>
  );
}

/* ---------------- Workbench: GIS & comparables ---------------- */

export function SatelliteMap(props: { caseData: PropertyCase; mode: 'gis' | 'comps'; comparables?: ComparablePin[]; height?: number }) {
  const [useGoogle, fail] = useGoogleMaps();
  const h = props.height ?? 380;
  const spec = useMemo<MapSpec>(
    () => (props.mode === 'gis' ? gisSpec(props.caseData) : compsSpec(props.caseData, props.comparables ?? [])),
    [props.mode, props.caseData, props.comparables],
  );
  return (
    <Provider google={useGoogle}>
      {useGoogle ? <GoogleMapView spec={spec} height={h} onFail={fail} /> : <LeafletSatellite {...props} />}
    </Provider>
  );
}

/* ---------------- Value a New Property: subject pin picker ---------------- */

export function PinMap(props: { center: [number, number]; pin: [number, number] | null; onPick: (lat: number, lng: number) => void; height?: number }) {
  const [useGoogle, fail] = useGoogleMaps();
  const h = props.height ?? 300;
  const spec = useMemo<MapSpec>(
    () => ({
      center: props.pin ?? props.center,
      zoom: 17,
      base: 'satellite',
      polygons: [],
      polylines: [],
      circles: [],
      markers: props.pin ? [{ id: 'subject', pos: props.pin, color: '#9C1D26', size: 9, tooltip: 'Subject pin — drag or click map to move', draggable: true }] : [],
    }),
    [props.center, props.pin],
  );
  return (
    <Provider google={useGoogle}>
      {useGoogle ? (
        <GoogleMapView spec={spec} height={h} onFail={fail} onClick={props.onPick} onMarkerDrag={(_, lat, lng) => props.onPick(lat, lng)} followCenter />
      ) : (
        <LeafletPin {...props} />
      )}
    </Provider>
  );
}

/* ---------------- Generic spec map (geo-fence views: customer link + workbench) ---------------- */

export function SpecMap({ spec, height = 280 }: { spec: MapSpec; height?: number }) {
  const [useGoogle, fail] = useGoogleMaps();
  return (
    <Provider google={useGoogle}>
      {useGoogle ? <GoogleMapView spec={spec} height={height} onFail={fail} followCenter /> : <LeafletSpec spec={spec} height={height} />}
    </Provider>
  );
}
