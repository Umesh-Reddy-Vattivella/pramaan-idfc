# PRAMAAN — IDFC FIRST Bank LAP Valuation Prototype (FAME 6.0)

Evidence-backed, confidence-gated property valuation for Loan Against Property: owner self-capture with an anti-fraud Trust Layer, 3 deterministic engines (Measure · Price · Usage), Auto-QC, a Risk Cascade (Instant / Remote Review / Physical Check), an auto-generated IDFC Technical Appraisal Report PDF and simulated remote valuer e-sign.

> **All valuation math, Authenticity Scoring, Auto-QC and routing are pure TypeScript functions in `lib/engines/`.** The optional vision LLM only extracts printed values; it never computes figures.

## Screens

| Tab | Route | What it shows |
|---|---|---|
| 1 · Portfolio Command Center | `/` | KPI strip, filterable case queue, ROI simulator, Live AI upload |
| 2 · Owner Self-Capture | `/capture` | 390px mobile simulator (Owner App / WhatsApp Rep link), live Trust telemetry, 3 one-click fraud simulations |
| 3 · Underwriter Workbench | `/cases/[id]` | Sticky decision header, Measure & GIS map, Price triangulation + Authenticity gauge + live stress-test, Usage & Trust, Auto-QC legacy audit, click-any-number Evidence Drawer |
| 4 · Report & e-Sign | `/cases/[id]/report` | IDFC Technical Appraisal Report, 1-click PDF, RBI Phase 1 remote valuer OTP e-sign |

Seeded cases: a clean Instant showcase (Nagpur) plus digital reconstructions of 3 IDFC sample reports — R1 Dehradun residential, R2 Dehradun commercial, R3 Coimbatore residential.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # asserts the PRD §7.1 Definition-of-Done figures (60 checks)
npm run build
```

Works fully offline in Demo Mode — only map tiles need a network connection.

## Optional: Live Vision AI extraction

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` (optional `GEMINI_MODEL`, default `gemini-2.5-flash`). Without a key, `POST /api/analyze-live` runs in **Simulated Extraction Mode**.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · lucide-react · Recharts · Leaflet / react-leaflet (Esri World Imagery + OpenStreetMap, loaded with `ssr: false`) · jsPDF + jspdf-autotable · React Context + localStorage.

## Disclaimer

Prototype for demonstration. Valuer identities and e-sign are simulated; it is not a legally valid digital signature or a production valuation system.
