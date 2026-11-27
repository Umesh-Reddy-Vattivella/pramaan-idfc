'use client';

/**
 * Map entry point (CLAUDE.md rule 4). Google Maps JavaScript API is the primary renderer when
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set; if the key is missing/rejected or the script cannot load,
 * the Leaflet renderer (Esri satellite / OpenStreetMap) is used. Both load with next/dynamic { ssr: false }.
 */
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { MapSpec } from '@/lib/mapGeometry';

const GOOGLE_KEY_SET = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const Loading = ({ h }: { h: number }) => (
  <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500" style={{ height: h }}>
    Loading map…
  </div>
);

const GoogleMapView = dynamic(() => import('@/components/maps/GoogleMapView'), { ssr: false, loading: () => <Loading h={320} /> });
const LeafletSpecMap = dynamic(() => import('@/components/maps/LeafletSpecMap'), { ssr: false, loading: () => <Loading h={320} /> });

export function SpecMap({ spec, height = 320, onClick, followCenter }: { spec: MapSpec; height?: number; onClick?: (lat: number, lng: number) => void; followCenter?: boolean }) {
  const [failed, setFailed] = useState(false);
  const google = GOOGLE_KEY_SET && !failed;
  return (
    <div className="relative">
      {google ? (
        <GoogleMapView spec={spec} height={height} onFail={() => setFailed(true)} onClick={onClick} followCenter={followCenter} />
      ) : (
        <LeafletSpecMap spec={spec} height={height} onClick={onClick} followCenter={followCenter} />
      )}
      <span className="pointer-events-none absolute left-1/2 top-2 z-[500] -translate-x-1/2 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow">
        {google ? 'Google Maps' : 'Esri / OpenStreetMap'}
      </span>
    </div>
  );
}
