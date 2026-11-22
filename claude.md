Project: PRAMAAN (IDFC FIRST Bank FAME 6.0 LAP Valuation Prototype).
1. Read only the specific sections of PRD.md requested in the current prompt.
2. Strict rule: ALL valuation math, Authenticity Scoring, Auto-QC, and Routing MUST be pure TypeScript functions under lib/engines/. Never let an LLM compute financial arithmetic.
3. Never alter or invent numbers for the 3 IDFC benchmark reports (R1, R2, R3) — use the exact values in Section 4 of PRD.md.
4. Maps: Google Maps JavaScript API is the primary renderer (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY); Leaflet (Esri/OpenStreetMap) is the automatic fallback. Always import every map component (Google and Leaflet) dynamically with ssr: false via components/workbench/maps.tsx.
5. Run npm run build after finishing each task and fix any TypeScript or build errors before stopping.