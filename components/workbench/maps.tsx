'use client';

import dynamic from 'next/dynamic';

/** Leaflet map — dynamically imported with ssr: false (CLAUDE.md rule 4). */
export const SatelliteMap = dynamic(() => import('@/components/SatelliteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500">
      Loading satellite map…
    </div>
  ),
});

/** Self-capture pin picker — dynamically imported with ssr: false. */
export const CaptureMap = dynamic(() => import('@/components/capture/CaptureMap'), {
  ssr: false,
  loading: () => <div className="flex h-[230px] items-center justify-center rounded-lg bg-slate-200 text-xs text-slate-500">Loading satellite…</div>,
});
