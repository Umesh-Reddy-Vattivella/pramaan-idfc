/* Statistics and geometry helpers (pure). */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Population standard deviation. */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/** CV = stdDev / mean (population) */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  return m === 0 ? 0 : stdDev(values) / m;
}

/** Sample CV = s / mean with s = √(Σ(x − mean)² ÷ (n − 1)): unbiased for small samples. 0 when n < 2. */
export function sampleCoefficientOfVariation(values: number[]): number {
  const n = values.length;
  const m = mean(values);
  if (n < 2 || m === 0) return 0;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1)) / m;
}

/** w_i ∝ 1 / σ_i², normalised to sum 1. */
export function inverseVarianceWeights(sigmas: number[]): number[] {
  const inv = sigmas.map((s) => (s > 0 ? 1 / (s * s) : 0));
  const total = inv.reduce((a, b) => a + b, 0);
  return total > 0 ? inv.map((v) => v / total) : inv.map(() => 0);
}

/** Tukey fences: flags values outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR] (only when n ≥ 4). */
export function outlierFlags(values: number[]): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  return values.map((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
}

/* ---------------- geometry ---------------- */

/** Great-circle distance in metres (haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Ray-casting point-in-polygon. Polygon is [lat, lng][]. */
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const M_PER_DEG_LAT = 111320;
export const SQFT_PER_SQM = 10.7639;

/** Local planar projection (metres) around the polygon centroid — accurate for plot-sized parcels. */
function project(poly: [number, number][]): { x: number; y: number }[] {
  const lat0 = mean(poly.map((p) => p[0]));
  const lng0 = mean(poly.map((p) => p[1]));
  const k = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return poly.map(([lat, lng]) => ({ x: (lng - lng0) * k, y: (lat - lat0) * M_PER_DEG_LAT }));
}

/** Polygon area in square metres (shoelace formula on the local projection). */
export function polygonAreaSqm(poly: [number, number][]): number {
  if (poly.length < 3) return 0;
  const p = project(poly);
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Side lengths of the polygon in metres. */
export function polygonSidesM(poly: [number, number][]): number[] {
  if (poly.length < 2) return [];
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return haversineMeters(a[0], a[1], b[0], b[1]);
  });
}

export function centroid(poly: [number, number][]): [number, number] | null {
  if (!poly.length) return null;
  return [mean(poly.map((p) => p[0])), mean(poly.map((p) => p[1]))];
}

/* ---------------- weighted statistics (Valuation Logic v2 §6–7) ---------------- */

/** Weighted median: the value where the cumulative weight first reaches half (average of the two values on an exact tie). */
export function weightedMedian(values: number[], weights: number[]): number {
  const rows = values.map((v, i) => ({ v, w: Math.max(0, weights[i] ?? 0) })).sort((a, b) => a.v - b.v);
  const total = rows.reduce((s, r) => s + r.w, 0);
  if (!rows.length) return 0;
  if (total <= 0) return median(values);
  let cum = 0;
  for (let i = 0; i < rows.length; i++) {
    cum += rows[i].w;
    if (Math.abs(cum - total / 2) <= total * 1e-12 && i + 1 < rows.length) return (rows[i].v + rows[i + 1].v) / 2;
    if (cum >= total / 2) return rows[i].v;
  }
  return rows[rows.length - 1].v;
}

/** Effective number of points n_eff = (Σw)² ÷ Σw². */
export function effectiveN(weights: number[]): number {
  const s = weights.reduce((a, b) => a + b, 0);
  const s2 = weights.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** Sample standard deviation (divides by n − 1). 0 when n < 2. */
export function sampleStdDev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
}
