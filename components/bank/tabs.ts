export const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'identify', label: '① Identification' },
  { key: 'inspect', label: '② Inspection & measurement' },
  { key: 'value', label: '③ Valuation' },
  { key: 'checks', label: 'Technical checks' },
  { key: 'report', label: 'Report' },
] as const;
export type TabKey = (typeof TABS)[number]['key'];
