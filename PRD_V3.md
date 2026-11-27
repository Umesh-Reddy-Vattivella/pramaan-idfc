# PRAMAAN v3 — Product Requirements (two-portal rebuild)

IDFC FIRST Bank · FAME 6.0 · Problem Statement 1 (Loan Against Property)
Version 3.0 · 27 Nov 2026 · Supersedes the UI and journeys of v2 (`prd.md`). Engine maths carried over where noted.

---

## 1. Why we are rebuilding

The mentor review (Rajesh, Ravi) said, in short:

1. **Three pillars, in order: Identification → Measurement → Valuation.** The prototype must show all three working end to end.
2. **Two front-ends.** The bank's dashboard is one front-end; the customer needs a separate, simple one.
3. **Don't repeat what the loan journey already did.** No second KYC, no re-typing of details. The bank already holds the documents and the property address; pre-fill them and ask the customer only for what a valuer does on site.
4. **The document list must be explicit.** The minimum set is the registered sale deed, the chain of title for the last 13 years, and the approved plan (layout plan for a plot). An approved plan is mandatory, and only the approved structure can be mortgaged.
5. **Geo-tag the property, not the person.** Photos must be taken at the pledged property's location, whoever takes them (the owner, a relative, a tenant).
6. **Measurement works like a video KYC.** The bank is on a video call, the customer points the phone, and dimensions are captured from it.
7. **Valuation from multiple market sources around the property** (99acres, Housing.com, Square Yards, auctions, guideline rates), cross-checked, with the formula shown.
8. **Technical remarks are the real value.** These are FSI breaches, demolition lists, plan-versus-site mismatches and road widening. Clearing them is where turnaround time is lost today, so surface them on day 0.
9. **Remove:** road-widening loss input, monthly rent, requested loan, the "irregular property" toggle. **Explain** residual life.
10. **Simplicity beats features.** It must be easy for sales, credit and an elderly customer.

The v2 app had every engine but one bank-centric interface, demo seed data and too many screens. v3 is a clean product built around one real application moving through those three pillars.

## 2. Users and what each one sees

| | Bank user (sales / credit / in-house valuer) | Customer (borrower, or anyone on their behalf) |
|---|---|---|
| Login | `/bank/login`: employee ID plus a password (prototype default password) | `/customer/login`: application number plus a password (prototype default password) |
| Sees | Everything: documents, map, video inspection, measurements, market evidence, valuation formulas, technical checks, report | Only their application's **status** (stage by stage: *Completed / In progress / Action needed*), the documents asked of them, the location switch and the incoming video call |
| Never sees | n/a | Any valuation figure, rate, check result or internal remark |
| Does | Opens the application, uploads documents from the loan file, verifies or rejects documents, rings the customer, captures snapshots, measures, fetches market evidence, reviews checks, issues the report | Uploads documents marked for them, turns on location, answers the video call and points the camera as instructed |

Default passwords are set by environment variables `BANK_DEFAULT_PASSWORD` and `CUSTOMER_DEFAULT_PASSWORD`. When they are unset, the prototype uses `Bank@2026` and `Customer@2026` and shows them on the login screens. **This is for the prototype only.** Production uses bank SSO for staff and an OTP for customers.

## 3. End-to-end journey

```
BANK                                              CUSTOMER
1  Sign in
2  New application ── pre-filled from loan file (borrower, mobile, LOS ref,
   address picked on Google Maps → lat/lng, property type, deed area, floors,
   age, structure, construction rate)
3  Document checklist created for the property type (one slot per document)
   Bank uploads what the sales team already holds  ──►  sees "documents" stage;
                                                       uploads slots marked for them
4  Share login: application no. + default password ──►  signs in
                                                       turns ON location (tracked)
5  ① IDENTIFICATION
   verify / reject each document
   confirm the pin, draw the plot boundary on the satellite map
   enter approved-plan facts (approved BUA, floors, FSI) and title-chain start year
6  ② MEASUREMENT — video inspection
   "Call customer" ─────────────────────────────►  rings in the portal; answers
                                                     (location + camera required)
   directs each shot, presses Capture  ◄──────────  photo taken on the phone at full
   (photo + GPS + SHA-256 hash stored)              resolution, with the phone's GPS
   each snapshot checked against the property geo-fence
   measures rooms on snapshots (reference-object scale) or as read out on the call
   records floors seen, usage seen, occupancy
7  ③ VALUATION
   "Fetch market evidence around this location" → live search for land rates,
   built-property rates and guideline rates near the pin; every figure keeps its URL;
   comparables geocoded and plotted by distance; include/exclude; add manual comps
   engine computes consensus rates, Authenticity Score, market value, FSV, max loan,
   with every formula shown with its numbers
8  Technical checks (sanity remarks) — blockers / conditions / pending, each with the
   action that clears it; manual attestations for checks with no public data source
9  Report — preview, PDF, "Issue report"         ──►  status: Completed
```

The customer's portal always shows six stages: **Application opened → Documents → Location & video inspection → Measurement → Valuation → Technical review & report.** Each stage is *Completed*, *In progress*, *Action needed* (only for stages that need the customer) or *Not started*.

## 4. Pillar 1: Identification

### 4.1 Document checklist (one upload slot per document)

Each slot shows its name, why it is needed, whether it is mandatory, and who is expected to provide it (Bank, Customer or Either). Either side can upload to any slot until the bank verifies it. A slot can hold several files (chain documents, multi-page scans). Slot status moves Pending → Received → **Verified** or **Rejected** (with a reason the customer sees). The bank can add a custom slot.

| Document | House / commercial building / industrial | Flat / shop-office unit | Plot | Expected from |
|---|---|---|---|---|
| Registered sale deed (current owner) | Mandatory | Mandatory | Mandatory | Bank (loan file) |
| Chain of title documents, previous deeds covering 13 years | Mandatory | Mandatory | Mandatory | Either |
| Approved / sanctioned building plan | Mandatory | Mandatory | — | Either |
| Approved layout plan | — | — | Mandatory | Either |
| Encumbrance certificate (13 years) | Recommended | Recommended | Recommended | Either |
| Land record extract (7/12, Patta, Khatauni, mutation) | Recommended | — | Recommended | Either |
| Registration extract (Index II or equivalent) | Recommended | Recommended | Recommended | Either |
| Latest property tax receipt | Recommended | Recommended | Recommended | Customer |
| Latest electricity bill | Recommended | Recommended | — | Customer |
| Occupancy / completion certificate | Recommended | Recommended | — | Either |
| Society NOC / share certificate | — | Recommended | — | Customer |

### 4.2 Location and boundary

- The address is picked with Google Places autocomplete (OpenStreetMap Photon as fallback). This gives the latitude/longitude pin, locality, city and state.
- On the satellite map (Google first, Esri/OSM via Leaflet as fallback) the bank clicks the plot corners. The engine computes the **satellite plot area**, compares it with the deed area, and uses the polygon as the geo-fence.

### 4.3 Facts from the documents

- **Approved plan:** approved built-up area (sqft), approved floors, permissible FSI, plan number and authority.
- **Title:** the year the 13-year chain starts from.

No OCR in v3. Documents are read by the bank user, and the facts are typed once. OCR autofill is listed under next steps.

## 5. Pillar 2: Measurement (video inspection)

### 5.1 The call

- WebRTC, peer to peer. Signalling goes through the server store (offer and answer, non-trickle ICE). STUN is always used; TURN is used if configured (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`).
- The customer portal listens for an incoming call. Answering needs **location**, then the **camera** (rear camera by default, with a flip option).
- The bank sends written instructions ("Show the front gate") that appear large on the phone, and uses quick shot buttons:
  - Exterior: front elevation, approach road, left side, right side, rear side, electricity meter / name plate.
  - Interior: each declared floor.
- **Capture** makes the customer's phone grab a full-resolution frame, attach its GPS fix, hash it (SHA-256) and upload it. If the data channel is down, the bank can grab the frame from the video it receives. That snapshot is tagged with the customer's latest tracked location and marked "bank-side frame".
- The customer's live position streams to the bank during the call. The bank sees its distance from the pin.

### 5.2 Geo-fence (pure engine, `lib/engines/geofence.ts`)

```
allowed_m = 25 + min(gps_accuracy_m, 25)
INSIDE  = inside the drawn parcel polygon OR distance(photo, pin) ≤ allowed_m
NEAR    = distance ≤ 100 m (re-shoot)
OUTSIDE = distance > 100 m (blocker: photos not taken at the property)
PASS    = all snapshots INSIDE and ≥ 4 exterior snapshots
```

### 5.3 Measuring on a snapshot (pure engine, `lib/engines/measure.ts`)

This uses known-object scaling (PRD v2 §3.2-6). On a snapshot the bank clicks the two ends of a reference object in the same plane, then the two ends of the length to measure:

```
length_ft = target_pixels × (reference_ft / reference_pixels)
reference objects: door height 7.0 ft · door width 3.0 ft · A4 sheet 0.974 ft ·
                   floor tile 2.0 ft · brick 0.75 ft · custom
```

Rooms are recorded as floor, name, length × width (ft), and method: snapshot scale, tape on call, or from the plan.

```
carpet_sqft(floor)   = Σ length × width
measured_BUA         = Σ carpet × 1.20        (carpet → built-up loading)
BUA deviation %      = (BUA_actual − BUA_approved) / BUA_approved × 100
BUA_actual           = measured_BUA if rooms measured, else declared BUA
```

The bank also records floors seen on the call, usage seen (residential, commercial, industrial or mixed) and occupancy (self, rented or vacant).

## 6. Pillar 3: Valuation (pure engines, `lib/engines/evidence.ts`, `lib/engines/valuation.ts`)

### 6.1 Market evidence around the geolocation

1. The engine starts from the pin's locality, city and state (reverse-geocoded if missing).
2. Live search (Tavily) runs for **land rates** (plots near the locality), **built-property rates** (houses, flats, shops or sheds, depending on property type) and the **guideline / circle rate**.
3. An LLM (Google Gemini) **only copies printed text** (price, area, rate, locality, date) from numbered search results. Every copied number must appear verbatim in its source, or the point is rejected with a reason. Social and product-catalogue sites are rejected outright. If the LLM is unavailable, a deterministic regex parser takes over.
4. Units are parsed deterministically (₹ lakh/crore, sqft/sq yd/sq m/acre/gunta).
5. Each comparable's locality is geocoded (OpenStreetMap Nominatim), and its distance from the pin is computed. Points more than 10 km away are kept in the list but excluded from the consensus.
6. The bank can untick any point or add a manual comparable (rate, area, source URL, location).

### 6.2 Consensus rate (per category: land and built), as in PRD v2 §3.3

```
corrected rate per kind:  LISTING  r × (1 − 0.14)   asking → closing discount (default, uncalibrated)
                          AUCTION  r / 0.80         forced-sale ratio
                          SALE     r × 1.00         k_reg uncalibrated
                          GUIDELINE                 floor check only, weight 0
per-kind rate = median(corrected rates)
weights       w_k ∝ 1 / σ_k²   (σ = standard error; 15 % prior when n = 1)
R_consensus   = Σ w_k × r_k
Tukey outlier fences per kind when n ≥ 4.
```

### 6.3 Authenticity Score S (0–100)

```
agreement 0–35   CV ≤ 0.05 → 35 · CV ≥ 0.25 → 0 · linear between
depth     0–25   min(25, round(n / 20 × 25))
recency   0–20   median age ≤ 3 months → 20 · ≥ 24 → 0 · linear
spatial   0–20   median distance ≤ 1 km 20 · ≤ 3 km 14 · ≤ 10 km 9 · else 4
```

### 6.4 Value

```
Residual life        total_life = 60 (RCC frame) · 50 (load-bearing) · 30 (steel shed)
                     residual   = max(0, total_life − age)
Depreciation         D = min(0.85, age / total_life × 0.90)     (10 % salvage)
Land area used       A_land = min(deed area, satellite area)   (deed area if not drawn)
Built-up valued      BUA_valued = min(BUA_actual, BUA_approved)  — only the approved
                     structure is mortgageable; no approved plan → BUA_valued = 0
Land value           LV = A_land × R_land
Building value       BV = BUA_valued × R_construction × (1 − D)
Method A (cost)      MV_A = LV + BV                     house, commercial bldg, industrial
Method B (compare)   MV_B = BUA_valued × R_built        flat, shop/office (primary);
                                                        house (cross-check only)
Plot                 MV = LV
Market value         MV = primary method; cross-check variance |A − B| / A shown (> 20 % = warning)
Forced-sale value    FSV = 0.80 × MV
Max eligible loan    = LTV cap × MV    (residential 70 %, commercial 60 %, mixed 55 %, industrial 50 %;
                       usage = the more conservative of declared and observed)
Amount in words      Indian Crore/Lakh words
```

Every line is shown in the Valuation tab with the real numbers substituted. If an input is missing, the result says which one rather than guessing.

## 7. Technical checks (sanity remarks): `lib/engines/sanity.ts`

Each check is PASS, WARN (condition), BLOCKER, or PENDING (not yet possible), and comes with the action that clears it.

| # | Check | Rule |
|---|---|---|
| T1 | Sale deed verified | No deed → blocker. Uploaded but not verified → pending |
| T2 | 13-year title chain | Chain docs present and chain start year ≤ current year − 13; otherwise warn or pending |
| T3 | Approved plan (layout for plot) | Missing → **blocker**: only an approved structure can be mortgaged |
| T4 | Encumbrance certificate | Missing → warn |
| T5 | Photos at the property | Any OUTSIDE → blocker; NEAR or fewer than 4 exterior → warn; none yet → pending |
| T6 | Plot area, deed vs satellite | Variance > 10 % → warn |
| T7 | Built-up area vs approved plan | ≤ 10 % pass · 10–30 % warn (only the approved area is valued) · > 30 % blocker (demolition / regularisation risk) |
| T8 | Floors vs approved floors | More floors seen than approved → blocker |
| T9 | FSI | Actual BUA / plot area > permissible FSI → warn; > 10 % over → blocker |
| T10 | Demolition / unauthorised-construction list | No public API → pending until the bank attests "checked with local authority, not listed" |
| T11 | Master-plan road widening / setback | No public API → pending until bank attestation |
| T12 | Usage, declared vs seen | Conflict → warn; LTV uses the lower band |
| T13 | Market evidence depth | < 3 usable comparables or S < 60 → warn; none → pending |
| T14 | Guideline-rate floor | Land rate below guideline → warn |
| T15 | Residual life | < 20 years → warn |
| T16 | Rejected documents | Any rejected → warn until re-uploaded |

Verdict:
- any blocker → **Refer: resolve before sanction**;
- else any pending → **In progress**;
- else any warning → **Clear with conditions**;
- else → **Clear**.

## 8. Report

- A one-page technical valuation report covering:
  - borrower, property and location;
  - documents with their status;
  - inspection snapshots with distance from the pin;
  - measurements;
  - market evidence with source links;
  - formula breakdown;
  - MV, FSV and max loan, with MV in words;
  - technical remarks;
  - bank remarks.
- It is downloadable as a PDF (jsPDF).
- "Issue report" moves the customer's last stage to Completed. Issuing is blocked while the valuation is incomplete; blockers must be acknowledged in the remarks.

## 9. Architecture

- **Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4.**
- **Pure TypeScript engines in `lib/engines/`.** All arithmetic lives there: geo-fence, measurement, evidence, valuation, sanity, progress and evaluate. The LLM never computes.
- **Persistence**, in `lib/server/store.ts`:
  - Supabase Postgres table `pramaan_kv` plus a Storage bucket (falls back to JSON in the bucket if the table is missing);
  - then Upstash KV;
  - then process memory.
  - One JSON document per application (`pramaan3:app:{id}`) plus an index.
  - Writes are serialised per application (mutex plus revision retry).
- **Auth:** HMAC-signed httpOnly cookies `pramaan_bank` and `pramaan_customer`. Middleware redirects unauthenticated page loads; every API route re-verifies.
- **Maps:** Google Maps JS API is the primary renderer, with Leaflet (Esri/OSM) as the automatic fallback, all loaded through `components/workbench/maps.tsx` with `ssr: false`.
- **Files:** uploaded as base64 JSON (images compressed to ≤ 1800 px; PDFs ≤ 3 MB). Served by `/api/files/{id}` to the bank, or to the customer who owns them.

### Routes

| Page | Who |
|---|---|
| `/` | Portal chooser |
| `/bank/login`, `/bank`, `/bank/new`, `/bank/applications/[id]` | Bank |
| `/customer/login`, `/customer` | Customer |

| API | Purpose |
|---|---|
| `POST/DELETE/GET /api/auth/bank`, `/api/auth/customer` | Sign in / out / me |
| `GET/POST /api/applications` | List / create (bank) |
| `GET/PATCH /api/applications/[id]` | Full record / operations (bank) |
| `POST /api/applications/[id]/upload` | Bank document upload |
| `GET/POST /api/applications/[id]/call` | Ring / hang up |
| `POST /api/applications/[id]/snapshot` | Bank-side frame grab |
| `POST /api/applications/[id]/market` | Live market evidence around the pin |
| `GET/POST /api/me` | Customer view; upload, location fixes |
| `GET/POST /api/me/call` | Customer call: answer, decline, end, photo |
| `GET /api/files/[id]`, `GET /api/ice`, `GET /api/geocode` | Files, ICE servers, geocoder |

## 10. Data honesty rules

- No seeded or fabricated applications, comparables or rates. Every number comes from the bank user, the customer's phone, or a cited web source.
- The default corrections (listing discount 14 %, auction ratio 0.80, k_reg 1.00) and policy constants (LTV bands, FSV 80 %, economic life) are labelled as defaults wherever they are shown.
- Checks without a public data source (demolition list, road widening) stay **pending** until a person attests. They are never auto-passed.

## 11. Acceptance criteria

1. A bank user creates an application and sees a type-specific checklist.
2. The bank uploads 2 documents, and the customer signs in and uploads 2 more. Both sides see the same slots and statuses.
3. The customer turns on location; the bank sees the last location and its distance from the pin.
4. The bank rings, the customer answers, and the bank captures ≥ 4 exterior and ≥ 1 interior snapshots from the customer's camera, each with GPS and a fence status.
5. The bank measures a room on a snapshot using a reference object and records rooms; the BUA deviation against the plan is computed.
6. Market evidence is fetched around the pin with source URLs and distances; consensus, S, MV, FSV and max loan are computed with the formulas displayed.
7. Technical checks list blockers, conditions and pending items, each with its action.
8. The report previews and downloads as a PDF; after "Issue report", the customer sees every stage *Completed*, and never sees a valuation figure.
9. `npm run verify` (engine tests) and `npm run build` pass.

## 12. Next steps (out of scope for v3)

- OCR autofill of deed and plan facts (extraction only).
- DigiLocker pull.
- Live LOS integration.
- State land-record (Bhulekh / Bhu-Naksha) and IGR / ULI registration-data APIs.
- Municipal demolition-list feeds.
- A TURN service for carrier-grade NAT.
- OTP login for customers.
- AR (ARCore/LiDAR) measurement on capable phones.
