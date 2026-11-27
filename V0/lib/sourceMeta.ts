import type { PriceSourceInput } from '@/lib/types';

/** Categorical source colours (dataviz reference palette slots 1, 2, 3, 7, 4 — validated). */
export const SOURCE_COLOR: Record<PriceSourceInput['id'], string> = {
  REGD_DEEDS: '#2a78d6',
  LISTINGS: '#eb6834',
  IDFC_ARCHIVE: '#1baf7a',
  AUCTIONS: '#6250d6',
  RERA_BUILDER: '#eda100',
  CIRCLE_RATE: '#64748b',
};

export const SOURCE_SHORT: Record<PriceSourceInput['id'], string> = {
  REGD_DEEDS: 'Regd. Sale Deed',
  LISTINGS: 'Portal Listing',
  IDFC_ARCHIVE: 'Past IDFC Report',
  AUCTIONS: 'Bank Auction',
  RERA_BUILDER: 'RERA / Builder',
  CIRCLE_RATE: 'Circle Rate',
};

/** Two-series comparison colours (validated: blue = before/reference, maroon = after/actual; amber = temporary structure). */
export const SERIES_REFERENCE = '#4A78B5';
export const SERIES_ACTUAL = '#9C1D26';
export const SERIES_TEMPORARY = '#D97706';
