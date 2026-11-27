/* Indian Rupee formatting and amount-in-words (pure). */

/* ================= Indian Rupee words (Crores / Lakhs / Thousands) ================= */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

/** Words for 0 <= n < 1,00,00,000 in the Indian system (no currency suffix). */
function belowCroreWords(n: number): string {
  const parts: string[] = [];
  const lakh = Math.floor(n / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(' ');
}

/** Words for any non-negative integer in the Indian system; crore multiples recurse (e.g. "One Hundred Twenty Crore"). */
export function toIndianNumberWords(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('toIndianNumberWords: non-finite input');
  const v = Math.floor(Math.abs(n));
  if (v === 0) return 'Zero';
  const crore = Math.floor(v / 10000000);
  const rest = v % 10000000;
  const parts: string[] = [];
  if (crore) parts.push(`${toIndianNumberWords(crore)} Crore`);
  if (rest) parts.push(belowCroreWords(rest));
  return (n < 0 ? 'Minus ' : '') + parts.join(' ');
}

/**
 * Exact Indian Rupee amount in words. Input is rounded to the nearest rupee.
 * e.g. 33975200 -> "Three Crore Thirty Nine Lakh Seventy Five Thousand Two Hundred Rupees Only"
 */
export function toIndianRupeeWords(amount: number): string {
  return `${toIndianNumberWords(Math.round(amount))} Rupees Only`;
}

/** Indian digit grouping, e.g. 33975200 -> "3,39,75,200" */
export function formatIndianNumber(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/** "₹3,39,75,200" */
export function inr(n: number): string {
  return `₹${formatIndianNumber(Math.round(n))}`;
}

/** "₹3.40 Cr" / "₹55.60 L" */
export function inrShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return inr(n);
}

export const sqft = (n: number) => `${formatIndianNumber(Math.round(n))} sqft`;
export const pct = (v: number, dp = 1) => `${(Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp)}%`;
export const rate = (n: number) => `₹${formatIndianNumber(Math.round(n))}/sqft`;

export function metres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}
