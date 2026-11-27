# PRAMAAN — Dev Plan for Final Submission (post-mentor review)

**Window:** 26 Nov → 28 Nov 2026 (2 days). **Source:** mentor review transcript (Rajesh, Ravi).

> **Status (27 Nov).** Two portals, shared case file in a database, live video verification call, no fabricated data. `npm run build` clean, `npm run verify` 158/158.

## 0. End-to-end journey → valuation → final report (current target)

Every number in a customer case comes from what the bank or customer entered, uploaded or captured, or from sourced market evidence. Examples (IDFC R1–R3 reconstructions, Case 1) stay, labelled **EXAMPLE**.

| # | Step | Who | Where | Output | Status |
|---|------|-----|-------|--------|--------|
| 1 | Open case: borrower, mobile, property type, pin | Bank | `/bank/new` step 1 | Valuation case + shared case file (DB) | ✅ |
| 2 | Suggested document checklist; each doc uploaded singly by whoever has it | Bank ⇄ Customer | `/bank/new` step 2, workbench ① Identify, `/customer` | Files in DB storage, verify / ask-again loop | ✅ |
| 3 | Customer access: link + OTP (or access code), no KYC | Customer | `/c/<token>` → `/customer/login` | Session | ✅ (OTP shown on screen until an SMS gateway is set) |
| 4 | Location permission + live location trail | Customer | `/customer` "Turn on location" | `locationTrack` in case file | ✅ |
| 5 | **Live video verification call**: bank rings in-app → customer allows location + camera → bank directs shots → photo taken on customer's phone with GPS + hash | Bank ⇄ Customer | workbench ① Identify "Call customer" / customer ring screen | Geo-tagged full-res photos, geo-fence verdict | ✅ (TURN server needed for some mobile networks) |
| 5b | Self-paced alternative: photos + room sizes without a call | Customer | `/customer/capture` | Same as 5 + room measurements | ✅ |
| 6 | Measurement cross-check vs approved plan | Engine | ② Measure, Sanity S5/S6 | Deviation, FSI | ✅ |
| 7 | **Market evidence** (live web search with quoted sources, or valuer-entered comparables with source URL) | Bank | ③ Value → Market evidence | Weighted price sources | ✅ (valuation stays *Pending* until this is done) |
| 8 | Valuation (land + building, FSV, LTV) — pure TS engines | Engine | Header, ③ Value | MV / FSV / max loan | ✅ |
| 9 | Technical Sanity Report — remarks + upfront actions; unconnected government feeds stay PENDING (never assumed) | Engine | Sanity tab | Mortgageability verdict | ✅ |
| 10 | **Final report** + registered-valuer e-sign (blocked while valuation pending / physical route) | Bank | `/cases/<id>/report`, PDF | Signed report | ✅ (draft watermark until 7 is done) |

**Not yet (next):** real SMS gateway for OTP; staff sign-in for the bank portal; government feeds (ULB notices, DP road widening, land records); OCR auto-fill of checklist uploads into case fields; recording / consent log of the video call.

**Setup for the live demo**
1. Supabase (free): create project → SQL editor → run `supabase/schema.sql` → set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` on Vercel.
2. `PORTAL_SESSION_SECRET` = long random string.
3. TURN (free tier, e.g. metered.ca Open Relay) → `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` — without it calls can fail between a mobile network and an office network.
4. `TAVILY_API_KEY` + `GEMINI_API_KEY` for live market evidence.
5. Rehearse: bank laptop opens case → customer phone signs in → allow location → bank "Call customer" → customer answers → capture 4 exterior + 1 interior per floor → fetch market evidence → Sanity → report.

---
*Earlier plan (26 Nov) below for reference.*

## 1. What the mentors actually said (distilled)

| # | Feedback | What it means for us |
|---|----------|----------------------|
| 1 | Structure everything as **Identification → Measurement → Valuation** (said ~5 times). | The customer flow and the workbench must be visibly organised into these 3 pillars. |
| 2 | **No customer journey exists** — "what does the customer see when he clicks the link?" | Biggest gap. Build a mobile-web link journey (no app download). |
| 3 | **Drop KYC.** Aadhaar/PAN/selfie is already done at loan origination. Anyone (cousin, son) may do the capture. | Remove the Consent & KYC step. Check the **property**, not the person. |
| 4 | **Geo-tag check = photos must be taken at the pledged property address**, not at the KYC address. | New trust check: capture GPS must fall inside a geofence around the LOS property pin/parcel. |
| 5 | **Pre-populate from the loan journey (LOS).** Docs are optional: if already submitted, skip; if not, collect. No re-confirmation needed. | Link opens pre-filled with address, property details and the docs already on file. |
| 6 | If docs are collected, show a **clear checklist**: registered sale deed, **13-year title chain**, **approved/sanctioned plan (mandatory)**, Index II, layout (for plots), tax receipt. | Checklist UI with status: *On file from LOS* / *Pending* / *Uploaded*. |
| 7 | **Approved plan cannot be replaced by measurement.** Irregular/unapproved structures can't be mortgaged. | Remove the "Irregular / non-standard" toggle. No plan → hard stop "Not mortgageable — approved plan required". Measurement only *cross-checks* the plan. |
| 8 | **The bank cares most about sanity / technical remarks** (FSI exceeded, demolition list, no demarcation, layout ≠ site, road-widening loss). Clearing these is what eats TAT, not the valuation itself. | A **Technical Remarks / Sanity Engine**: one check per remark type, each with a data source and an **upfront resolution action**. This is the main feature. |
| 9 | Go through the technical remarks in R1/R2/R3 and map each to a government source / integration. | Build the mapping table (remark → check → source → action). |
| 10 | Measurement demo: camera/AR room dimensions, with a **fallback for non-AR phones**. | WebXR where supported; reference-object / manual-tape fallback otherwise. |
| 11 | Valuation: cross-check comps from 2–4 sources (99acres, Housing, Square Yards, MagicBricks) + circle rate. | Mostly built already (Tavily + market-evidence engine). Polish only. |
| 12 | Remove from the valuation form: **road-widening loss (manual), monthly rent, requested loan**; amenities only where relevant; **explain residual life** ("how did you get 55 years?"). | Form cleanup + show the formula for residual life. Road widening comes from DP/GIS overlay, not user input. |
| 13 | Dashboard is secondary. Demo should be live, end-to-end, presented as "I am the bank's in-house valuer". | Build the demo script around the customer link → bank workbench, then the dashboard briefly. |

## 2. Target flow

```
LOS (loan origination, mocked)            Customer link (mobile web)                      Bank workbench
───────────────────────────────           ────────────────────────────────────            ─────────────────────────
Case created with property address,  ──►  /c/[token]                                ──►   /cases/[id]
docs already on file, borrower            ① IDENTIFY   pre-filled address + pin            Pillar tabs:
                                              docs checklist (On file / Pending)            Identify · Measure · Value
"Send valuation link" button                  geo-fence check: "you are at the property"   + Sanity Report (technical
                                          ② MEASURE    exterior photos (geo-tagged)          remarks, each with source
                                              room-by-room dimensions (AR or fallback)      and resolution action)
                                          ③ SUBMIT     done — no valuation shown to customer → PDF / e-sign
```

## 3. Work items

### P0 — must ship (Day 1)

**P0-1. Mock LOS + "Send link" (bank side)**
- Add an `losRecord` to `PropertyCase` (borrower name, property address, lat/lng, property type, docs on file with status). Seed from the existing cases. **Do not touch R1/R2/R3 numbers.**
- Add a "Send valuation link" button on the case page that generates `/c/[token]`, plus a copy/QR/WhatsApp-share preview.
- Files: `lib/types.ts`, `lib/data/seedCases.ts`, `app/cases/[id]/page.tsx`, `components/workbench/DecisionHeader.tsx`.

**P0-2. Customer link journey `/c/[token]` (new, mobile-first)**
- Rebuild from `app/capture/page.tsx`, reusing `CaptureMap`, `DocumentIntake` and the telemetry. Three steps only, labelled with the pillars:
  1. **Identify**: pre-filled address and map pin (read-only, "Wrong property? Call RM"); document checklist pre-ticked from LOS; upload only for *Pending* items. **Approved plan is mandatory.**
  2. **Measure**: guided exterior shots (front, road, 4 sides), each with GPS; room-by-room dimension capture (P1-1).
  3. **Submit**: summary and thank-you. Big buttons, one action per screen, Hindi/English toggle if time allows (helps older owners).
- **Delete** the Consent & KYC step (Aadhaar OTP, PAN, selfie) and the KYC rows in `UsageTrustTab.tsx` and `TelemetryPanel`.

**P0-3. Property geo-fence check (replaces KYC)**
- New pure function `lib/engines/geofence.ts`: `checkCaptureLocation(capturePoints, parcelPolygon | pin, radiusM)` returns pass/warn/fail with distance. Uses `haversineMeters` and point-in-polygon from `lib/mapGeometry.ts`.
- Every captured photo is stamped with lat/lng, accuracy, timestamp and frame hash, and plotted on the map against the parcel. Keep a mock-GPS/spoof flag.
- Feed the result into `trust.ts` instead of `faceMatched`.

**P0-4. Technical Remarks / Sanity Engine (the main feature)**
- New `lib/engines/sanity.ts` (pure TS). Each check returns `{ id, remark, status, evidence, source, resolutionAction }`:

| Check | Logic | Data source (demo: simulated, labelled as such) |
|-------|-------|------|
| Approved plan present & matches site | plan doc on file; plan geo-tag ≤ X m from pin | LOS docs, OCR |
| Area triangulation | deed vs land record (7/12, property card) vs plan vs measured; flag > tolerance | OCR + Bhu-records (Mahabhumi / Bhulekh) |
| FSI / FAR compliance | built-up ÷ plot vs permissible FSI for the zone | Local DCR / by-laws table |
| BUA deviation vs plan | existing `measure.ts` deviation; > 10% → remark | Measurement |
| Demolition / unauthorised list | address/survey no. against municipal list | ULB demolition notices (mock list) |
| Road widening / DP reservation | parcel ∩ DP road-widening corridor → lost area | DP plan / GIS overlay (**not** user input) |
| Demarcation / boundaries | deed boundaries vs satellite neighbours | Satellite + OCR |
| Title chain (13 yrs) | chain docs cover ≥ 13 yrs without gaps | LOS docs (sale deeds, Index II) |
| Land use / zoning | usage vs zone (resi/comm/ind) | Zoning map |
| Hazards | flood / CRZ / forest buffer, already in `measure.ts` | GIS |

- Output: a **Sanity Report** section with each remark, a ✅/⚠️/❌ status, the source, and *"Action to clear upfront"* (e.g. "Obtain regularisation certificate", "Rectification deed"). This shows directly how we cut TAT.
- Wire it into `evaluateCase.ts` and `routing.ts`, and show it at the top of the workbench and in the PDF.
- **Read through the remarks in R1/R2/R3 and make sure every one maps to a row above.** Add a slide/table that shows this mapping.

**P0-5. Valuation form cleanup (`app/value/page.tsx`)**
- Remove: Road-widening loss input, Monthly rent, Requested loan, the "Irregular / non-standard" toggle.
- Amenities: show only for residential flats/societies.
- Residual life: computed and shown with its formula, e.g. `Residual life = Total economic life (RCC 60 / load-bearing 50 / steel shed 40) − Age`, age taken from the OCR construction year. Keep the function in `valuation.ts`.
- No approved plan → block the valuation with the message "Not mortgageable — approved plan mandatory". Remove the "LAND_ONLY" path from the UI for LAP (keep the engine function so the benchmark checks don't break).

### P1 — should ship (Day 2 morning)

**P1-1. Room measurement with a non-AR fallback**
- Try WebXR `immersive-ar` + hit-test (Android Chrome): tap two points to get a distance.
- Fallback A: the user enters length × width from a tape or laser, with a photo per room.
- Fallback B: reference-object scaling (A4 sheet or a door of known height), using `knownObjectLengthFt` from `measure.ts`.
- Sum the room areas, compare with the plan BUA, and feed the result into the sanity BUA-deviation check. Exterior footprint still comes from satellite.

**P1-2. Workbench restructured into pillars**
- Tabs: **Identify** (docs, OCR facts, geo-fence map, area triangulation) · **Measure** (existing MeasureTab + room capture) · **Value** (PriceTriangulation, comps from 2–4 sources, circle rate) · **Sanity Report**.

**P1-3. PDF report**: add the Sanity Report table and the geo-tagged photo grid to `generateIdfcPdf.ts`.

### P2 — only if time is left
- DigiLocker fetch button (mocked) for sale deed / Index II.
- Hindi UI on the customer link (Sarvam is already integrated).
- Dashboard tweaks (lowest priority, per the mentors).

## 4. Schedule

| When | Who (suggested) | Task |
|------|-----------------|------|
| **Day 1 AM** | A | P0-1 LOS mock + send-link, types and seed |
| | B | P0-4 sanity engine + R1/R2/R3 remark mapping (most important; go through the reports first) |
| | C | P0-5 form cleanup + residual-life formula |
| **Day 1 PM** | A | P0-2 customer link journey (3 steps) |
| | B | P0-4 wiring into evaluateCase/routing + Sanity Report UI |
| | C | P0-3 geo-fence engine + KYC removal |
| **Day 1 night** | all | Integration, `npm run build`, `scripts/verify-engines.ts` must stay green, deploy to Vercel |
| **Day 2 AM** | A | P1-1 measurement (WebXR + fallbacks) on a real phone |
| | B | P1-2 pillar tabs in workbench |
| | C | P1-3 PDF + demo sheet |
| **Day 2 PM** | all | Freeze code by ~4 PM. **Live rehearsal on phone + laptop** ×2. Record a backup video. Update the walkthrough/PPT. Submit. |

## 5. Demo script (≈8 min, "I am the bank's in-house valuer")

1. **Bank side**: open the LOS case (address and docs already on file), then click *Send valuation link* and show the QR code.
2. **Phone, live**: open the link. *Identify* is pre-filled; the checklist shows the docs on file and the approved plan is present.
3. Walk outside and take geo-tagged photos; the geo-fence shows ✅ "at pledged property". Then show what happens when a photo is taken off-site (❌ "320 m from property").
4. *Measure* one room live (AR, or the fallback on a non-AR phone).
5. **Back on the laptop**: the case updates. Show the **Sanity Report** first: the FSI, demolition, road-widening (from DP overlay), area-triangulation and title-chain remarks, each with its source and resolution action. Say: *"These remarks are what take days today; we surface them in minutes."*
6. Value tab: comps from several sources + circle rate, and residual life with its formula.
7. Run R1/R2/R3 to show the remarks our engine catches against the real reports.
8. PDF and e-sign, then a quick look at the dashboard (secondary).

## 6. Questions to prepare answers for
- *Why no KYC?* It's done at onboarding; we verify the **property** (geo-fence + docs), and anyone can capture.
- *No plan?* Not mortgageable; measurement never replaces the approved plan.
- *Non-AR phones?* Tape entry or reference-object fallback, cross-checked against the plan and satellite.
- *Residual life / FSI / road widening, where do they come from?* Formula, DCR table and DP overlay respectively, never user input.
- *What's real vs simulated?* Be upfront: govt integrations (Bhu-records, demolition list, DP plan) are mocked behind adapters. OCR, maps, geo-fence and market comps are live.

## 7. Guardrails (from CLAUDE.md)
- All math, sanity checks, geo-fence and routing are pure TS in `lib/engines/`. No LLM arithmetic.
- R1/R2/R3 numbers are not changed.
- Maps are imported dynamically via `components/workbench/maps.tsx`.
- Run `npm run build` after each task.
