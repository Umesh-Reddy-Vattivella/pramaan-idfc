# PRAMAAN v3: IDFC FIRST Bank LAP technical valuation

This is a two-portal prototype built around the mentors' three pillars: **Identification → Measurement → Valuation**. The full specification is in [PRD_V3.md](PRD_V3.md).

| Portal | Login | What it does |
|---|---|---|
| **Bank** (`/bank`) | Employee ID + password (default `Bank@2026`) | Opens applications from the loan file and manages a per-document upload checklist (verify or reject). Confirms the pin, draws the plot boundary and enters plan and title facts. Runs the **video inspection call**: captures snapshots from the customer's camera with GPS and checks them against the geo-fence. Measures rooms on snapshots, fetches **live market evidence around the pin**, shows every valuation formula with its numbers, runs the technical checks and issues the report as a PDF. |
| **Customer** (`/customer`) | Application no. + password (default `Customer@2026`) | Shows status only, never valuation figures. Lets the customer upload the documents asked of them, turn on location and answer the bank's video call. |

There is no repeat KYC: identity was verified at loan onboarding. Geo-tagging proves the photos were taken **at the property**, whoever holds the phone.

## Run

```bash
npm install
cp .env.example .env.local   # optional keys: Supabase, Tavily/Gemini, Google Maps, TURN
npm run dev                  # http://localhost:3000
npm run verify               # deterministic engine checks
npm run build
```

Without Supabase or KV, data is kept in memory, which only works for local runs. The camera and location need HTTPS, or `localhost`.

## Rules

- All valuation maths, scores, checks and progress live in pure TypeScript under `lib/engines/`. The LLM only copies printed figures from cited search results.
- There are no seeded or invented applications, comparables or rates. Default corrections and policy constants are labelled wherever they are shown.
- Checks that have no public data source (demolition list, road widening) stay pending until a bank user records the result.

The previous version (v2) is in git history and in the sibling folder `pramaan-idfc-backup-v2-2026-11-27`.
