/* ------------------------------------------------------------------
   Time adjustment with the RBI House Price Index (Valuation Logic v2 §3).
   r_today = r_then × HPI_latest ÷ HPI_quarter_of_sale. The latest published
   quarter is carried forward until the next release. Residential only.
   The table ships empty: until it is loaded, points are NOT time-adjusted and
   the engine adds the τ add-on instead (never an invented index).
   ------------------------------------------------------------------ */
import table from '@/lib/data/rbi_hpi.json';

export type HpiTable = Record<string, Record<string, number>>;
export const HPI_TABLE: HpiTable = (table as { series: HpiTable }).series;

const quarterOf = (y: number, m0: number) => `${y}-Q${Math.floor(m0 / 3) + 1}`;

function latest(series: Record<string, number>, upTo: string): number | null {
  const keys = Object.keys(series).filter((k) => k <= upTo).sort();
  return keys.length ? series[keys[keys.length - 1]] : null;
}

export interface HpiFactor {
  factor: number;
  /** CITY = the city's own index; ALL_INDIA = fallback (adds τ). */
  source: 'CITY' | 'ALL_INDIA';
  from: string;
  to: string;
}

/** Index factor from the date (YYYY-MM[-DD]) to `now`, or null when no series covers it. */
export function hpiFactor(city: string | undefined, date: string | undefined, now: Date, t: HpiTable = HPI_TABLE): HpiFactor | null {
  const m = date?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const from = quarterOf(+m[1], +m[2] - 1);
  const to = quarterOf(now.getFullYear(), now.getMonth());
  const key = city ? Object.keys(t).find((k) => k.toLowerCase() === city.trim().toLowerCase()) : undefined;
  for (const [name, source] of [[key, 'CITY'], ['ALL_INDIA', 'ALL_INDIA']] as const) {
    const s = name ? t[name] : undefined;
    if (!s) continue;
    const a = latest(s, from);
    const b = latest(s, to);
    if (a && b) return { factor: b / a, source, from, to };
  }
  return null;
}
