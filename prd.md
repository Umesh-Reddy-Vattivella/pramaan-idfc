IDFC FIRST BANK  •  FAME 6.0 OPEN INNOVATION CHALLENGE 2026  •  PROBLEM STATEMENT 1
PRAMAAN
AI-Powered Digital Property Valuation & Technical Due Diligence Engine
Full-Context Product Requirements Document (PRD) & Coding-Agent Blueprint

Property Valuation in 30–55 Minutes Without a Site Visit: AI-Measured • Data-Priced with Proven Authenticity • Usage Verified from Photos • Remotely Valuer-Certified (RBI-Compliant)

Attribute	Specification
Document Type	Comprehensive Product Requirements Document (PRD) & Engineering Specification
Target Audience	AI Coding Agents (Claude Code / Codex / OpenCode / Cline) & Team Famester Engineers
Competition & Track	IDFC FIRST Bank FAME 6.0 — Presentation Round Prototype (Problem Statement 1: LAP)
Team & Institution	Team Famester — IIM Nagpur (Aniket Garud, Umesh Reddy Vattivella, Vivek Antony)
Version & Status	v2.0 (Final Round Edition — Includes All Pitch Logic + 6 Feasibility & Risk Upgrades)
Primary Objective	Build a dual-mode (Offline-Safe Demo + Live Vision AI) full-stack interactive web prototype showcasing PRAMAAN on IDFC's 3 real Technical Appraisal Reports + 1 Clean Instant Case
Key Architecture Rule	Strict Separation of Concerns: Vision LLMs extract/classify unstructured inputs ONLY; ALL valuation math, Authenticity Scoring, Auto-QC, and Routing execute deterministically in TypeScript.

HOW TO USE THIS PRD WITH A CODING AGENT
1. Save this document or its extracted text as PRD.md in the root of your project repository.
2. Do NOT ask the coding agent to build the entire application in a single giant prompt. Follow Section 9 (Phased 6-Prompt Execution Playbook) so every engine, dataset, UI view, and PDF export is verified step-by-step.
3. Every formula, constant, field value from IDFC Sample Reports R1/R2/R3, and UI interaction in this document is authoritative. Do not invent substitute numbers for the 3 IDFC benchmark reports.

 
1. Executive Context, Problem Statement & Business Case
1.1 Problem Statement & Market Reality (IDFC FIRST Bank LAP)
Loan Against Property (LAP) is one of India's fastest-growing secured lending segments, primarily serving MSMEs seeking working capital and business expansion, alongside Balance Transfers (BT), top-ups, professionals, institutions, and NRIs. Underwriting hinges on accurate collateral valuation, yet technical due diligence remains trapped in a manual, field-intensive, third-party agency workflow.
Market / Operational Metric	Benchmark Value & Significance
Industry LAP Book (Jun 2026)	Rs. 15.95 Lakh Crore (+20% YoY growth)
Quarterly LAP Originations (Apr–Jun 2026)	Rs. 1.5 Lakh Crore/quarter (~Rs. 6 Lakh Crore/year, +23% YoY)
IDFC FIRST Bank Share (Private-Bank LAP)	~7% (~Rs. 42,000 Cr/yr estimated origination volume)
Typical Loan Ticket per Entity	Rs. 1 Cr to Rs. 25 Cr (industry avg LAP ticket ~Rs. 50 Lakh)
Current Valuation Turnaround Time (TAT)	5–7 days typical (actual sample reports show 10–18 days to e-sign)
Disbursal Wait Bottleneck	Once credit is decided, disbursal takes 2–3 hours; valuation is the primary delay
Third-Party Agency Fee	~Rs. 3,000 + GST per file (recurring opex + re-work delays)

1.2 Where the 7 Days Go Today (Current 6-Step Failure Analysis)
Analysis of IDFC FIRST Bank's current workflow and the three real technical appraisal reports provided alongside Problem Statement 1 proves that physical site inspection accounts for less than 10% of total elapsed time. Approximately 70–80% of report fields already reside in government/public databases or uploaded documents, and the valuation math itself is deterministic arithmetic. Only the market rate requires triangulated evidence.
Legacy Stage	Elapsed Time	Root Cause & Failure Mode
1. Case & Document Collection	Day 1 (1–3 days chasing)	Branch/DSA collects Sale Deed, chain docs, sanctioned plan, tax bills; missing plans/deeds at login cause repeated loops.
2. Valuer Allocation & Scheduling	Day 1–2	Manual agency assignment by geography; coordinating inspection slots with property owners who dislike strangers measuring their homes.
3. Physical Site Visit	Day 2–3 (0.5 day)	Travel + 1–2 hours actual measuring of floors, photos, boundaries, occupancy, and approach road width.
4. Plan vs. Actual & Deviations	Day 3–4	Manual comparison of sanctioned plan vs. actual site built-up area (BUA), setbacks, and road-widening corridors.
5. Rate & Comparables	Day 4–5	Unrecorded 'local enquiry' with local brokers; circle/guideline rate used as floor; zero audit trail or comparable evidence.
6. Drafting, QC, e-Sign & Queries	Day 5–7 (up to 18 days)	Re-typing public data into templates; 9–15 day delays between visit and digital sign-off (R1: 10d, R3: 18d); manual errors sent back for rework.

1.3 What IDFC Officials Demanded & Core Banking Formulas
•	Speed Mandate: Speed: 30 minutes to 1 hour target; 24 hours maximum for exceptions.
•	'Zero or One' Mandate: Replace the physical valuer visit and manual work—do not merely build a workflow assistant for field valuers.
•	Three Core Technical Pillars: Solve three hard problems: (1) Measure without visiting, (2) Price without asking anyone, and (3) Read property usage from photos.
•	Authenticity & Risk Bar: Real blocker identified by bank officials: property prices exist online, but price authenticity does not. Standards must match or exceed physical underwriting risk controls.
Banking Formulas Implemented Inside PRAMAAN's Core Engine:
CORE BANKING FORMULAS HINGING ON MARKET VALUE (MV):
1. Loan-to-Value (LTV%):          LTV% = (Loan / MV) * 100
2. Collateral Loan Limit:         Max_Collateral_Loan = LTV_cap(usage) * MV
3. Final Sanctioned Loan:         Final_Sanction = min(LTV_cap * MV, Capacity_Based_Loan)
4. Repayment Capacity (EMI):      EMI = P * r * (1 + r)^n / [(1 + r)^n - 1]
5. Forced-Sale Value (FSV):       FSV = MV * (0.80 to 0.85)  [all 3 IDFC sample reports]
6. Overstatement Risk Formula:    LTV_true = LTV_stated * (1 + x)
   Example: If MV is overstated by x = +10%, a stated 70% LTV becomes 77% true LTV!
   LTV caps vary by confirmed usage: Residential (highest) > Commercial (moderate) > Industrial (conservative).

1.4 Global Benchmarks vs. India's Structural Constraints & Data Rails
Market	Model Adopted	Scale & Speed Impact	Risk Guardrail
USA	Fannie Mae Value Acceptance; Freddie Mac ACE (no appraisal)	28% of GSE loans used waivers (Mar 2026); ~$3B borrower savings	Federal AVM Quality-Control Rule (effective Oct 1, 2025)
UK	Hometrack AVM inside lender decision engines	~25% of secured lending; remortgages digital since 2004	Every valuation carries an explicit statistical confidence score
Australia	CoreLogic ValEx cascade (AVM -> Desktop -> Kerbside -> Full)	25% AVM + 20% Desktop (~4 hrs); -47% TAT, -19% fees	Desktop capped at A$2M; LVR cutoffs (80% AVM, 90% Desktop)
Netherlands	Calcasa Desktop Taxatie (registered valuer e-signs model value)	~4 hrs for EUR 110 vs EUR 600–800 physical	Capped at 90% LTV; ABN AMRO up to EUR 750k

India Reality Check — Why Global Models Cannot Be Copy-Pasted to India (And Why PRAMAAN Works):
•	Regulatory Compliance (RBI): RBI mandates independent valuers for mortgage lending; ICICI Bank was fined Rs. 75 Lakh in August 2025 partly for skipping independent valuation norms. PRAMAAN solves this via a 3-Phase regulatory path: Phase 1 keeps a registered valuer remotely auditing the AI evidence pack and e-signing (zero field visits, zero manual drafting).
•	Structural Data Friction: India has presumptive title (registered deeds, not guaranteed state titles), circle/guideline rates massively below market (e.g., Report 3: Rs. 500/sqft vs Rs. 3,910/sqft — a 7.82x gap), 28 states + 8 UTs with fragmented portals (~50% village maps geo-referenced), and rampant unauthorized construction/mixed-use buildings.
•	India's Ready Data Rails: Unified Lending Interface (ULI by RBIH: 64 lenders, 136+ data services, land records across 8 states as of Dec 2025), DILRMP (99.8% RoRs computerized, 97.4% cadastral maps digitized), Square Yards on ULI (100M+ registration records across 8 states for e-valuation & title search as of Apr 2026), DigiLocker, CERSAI, RERA, and IDFC FIRST Bank's own archive of past technical reports.
1.5 Regulatory Path, Go-Live Risk Bar & Direct IDFC P&L Impact
Rollout Phase	Operating Model & Governance
Phase 1: NOW (Zero Field Visits on Day 1)	AI performs 100% of measurement, OCR, pricing, usage classification, Auto-QC, and report drafting. An empanelled registered valuer audits the evidence pack in 3–5 mins and e-signs remotely on a micro-fee (~Rs. 400–600 vs Rs. 3,000+ physical). Fully compliant with RBI independent-valuer rules.
Phase 2: After 12 Months of Proof	Board policy approval + RBI Regulatory Sandbox: full straight-through auto-approval for high-confidence, low-risk segments (e.g., RERA flats & residential LAP under ticket/LTV cap) backed by 3–5% random hindsight audits.
Phase 3: Industry Utility (ULI)	Shared, regulator-recognized AVM & valuation utility hosted on ULI for 150–200 Indian LAP lenders (~12L valuations/yr x Rs. 1,200 = Rs. 144 Cr/yr TAM + monthly monitoring of the Rs. 15.95L Cr industry book).

Business Case Lever	Quantified Impact & Governance Target
Direct Valuation Opex Savings (IDFC Year 1)	At ~7% private LAP share (~Rs. 42,000 Cr/yr) and Rs. 50L–1 Cr avg ticket (~42k–84k valuations/yr), shifting 65% of files to PRAMAAN (saving Rs. 2,000–2,400/file vs Rs. 3,000+ physical fee) saves Rs. 6–13 Cr/year directly.
Conversion & Revenue Uplift	Compressing valuation TAT from 5–7 days to <1 hour cuts MSME attrition to faster NBFCs; a conservative 2–3% pull-through lift yields Rs. 800–1,200 Cr/year in incremental LAP disbursals.
Portfolio Mark-to-Market Monitoring	Automated monthly revaluation of the existing LAP book flags collateral erosion and LTV breaches early at near-zero marginal cost.
Proposed Go-Live Risk Bar (Credit & Risk)	Median value error <= 5% vs valuer (85% within +/-10%); Area accuracy 90% within +/-5% BUA; Usage match >= 98%; Median instant TAT < 60 min; Instant share >= 60%; Zero undetected fraud substitution in 3–5% audits.
Pilot Rollout Ask	M1–M2: Back-test on 3–5 years of anonymized IDFC technical reports -> M3–M5: 2-city parallel shadow run (BT, top-ups, residential LAP) -> M6+: Segment-wise go-live.

 
2. PRAMAAN Architecture & 6 Presentation-Round Feasibility Upgrades
PRAMAAN replaces IDFC FIRST Bank's 6 sequential multi-day steps with a parallelized 30–55 minute pipeline powered by a Trust Layer, three specialized engines (MEASURE, PRICE, USAGE), a deterministic Valuation & Auto-QC engine, and a confidence-gated Risk Cascade.
IDFC Step Replaced	PRAMAAN Automated Replacement (Total: 30–55 min)
1. Case & Docs (Day 1 -> 5 min)	Owner/representative completes KYC (Aadhaar OTP/DigiLocker, PAN, selfie), drops map pin, uploads docs. Vernacular OCR + LLM extracts & verifies fields vs govt records; gaps flagged instantly.
2. Valuer Assignment (Days 1–2 -> 0 min)	Eliminated. No physical slot scheduling; owner or authorized representative captures property on demand.
3. Site Visit -> Engine 1 & 3 (Days 2–3 -> 15 min)	Satellite + cadastral GIS auto-pull plot & footprint; owner completes 15-min guided exterior-to-interior video/photo self-capture secured by the Trust Layer.
4. Plan vs Actual (Days 3–4 -> 1 min)	Plan OCR compared deterministically against measured BUA & setbacks; missing plan auto-triggers bank policy rule + flag.
5. Rate & Comps -> Engine 2 (Days 4–5 -> 1 min)	Runs strictly AFTER Engine 1 (area) and Engine 3 (usage) confirm parameters. Triangulates 6 independent sources with bias correction and computes Authenticity Score (0–100).
6. Report, Auto-QC & e-Sign (Days 5–7 -> 5–30 min)	Auto-fills IDFC Technical Appraisal Report with clickable evidence links, runs 6 Auto-QC rules, routes via Risk Cascade, and queues for remote valuer e-sign.

2.1 Six Feasibility Upgrades Embedded in This Prototype
To eliminate every real-world underwriting, fraud, hardware, and regulatory vulnerability that IDFC Credit, Risk, and Technology panelists will probe during the final presentation, the following 6 upgrades MUST be implemented as first-class features in the prototype:
Feasibility Upgrade	Exact Prototype Implementation Requirement
Upgrade 1: Omission-Fraud Lock & Android-First Capture	Replaces disconnected room photos with a guided continuous Exterior-to-Interior capture sequence. Engine 1 counts exterior floors (facade/shadow) and BLOCKS submission if interior walked floors < exterior floors (stopping borrowers from hiding unauthorized top floors or commercial sheds). Baseline measurement uses monocular depth + known-object reference scaling (door/meter) for budget Android phones, with LiDAR/ARCore as an optional precision boost. Includes a zero-install WhatsApp/SMS web link for tenants, NRIs, or institutional site reps.
Upgrade 2: Vernacular OCR, 4-Direction Boundaries & GIS Hazard Overlays	Explicitly parses regional-language Indian documents seen in IDFC's real samples (Tamil Patta & FMB Sketch in R3; Hindi Forest Division RTI in R1) with cross-document entity resolution (Owner Name, Survey/Khasra No., Area). Adds automated GIS restriction overlays (Forest buffers, CRZ, HT lines, water bodies, Master Plan Road Widening, Caution/Negative/OGL zones) and 4-direction E/W/N/S boundary verification (Deed vs. Satellite/Compass).
Upgrade 3: Thin-Market Spatial Fallback & Commercial Yield Guardrail	Defines a hierarchical spatial fallback for bias factors (k_reg and d): 1 km Micro-Locality -> Revenue Village/Ward -> SRO Zone -> District Benchmark. Every fallback tier applies a transparent penalty to Authenticity Score (S) so thin Tier-3 markets route safely to Remote/Physical check. For leased commercial assets, enforces a hard +/-15% Income Capitalization cross-check gate.
Upgrade 4: RBI-Compliant 'Zero Field Visits' & High-Ticket Dual-Valuation Policy Gate	Clarifies Phase 1 as 'Zero Field Visits on Day 1; Zero Manual Drafting' with remote registered valuer e-signature. Adds an automatic High-Ticket Policy Gate: properties > Rs. 5 Cr cannot take the unreviewed Instant path; commercial properties > Rs. 15 Cr or > 30% BUA deviation (like R2) auto-route to Physical Check / Dual Valuation.
Upgrade 5: Interactive Stress-Test & Live P&L Telemetry	Underwriter Workbench includes interactive sensitivity sliders (Comps Count, Source Variance, Market Overstatement %) that dynamically recalculate Authenticity Score, Routing Cascade Tier, and Effective LTV in real time—plus an executive ROI calculator showing IDFC's direct Year-1 savings.
Upgrade 6: Formula Fixes & Real Legacy Error Catches	Corrects minor deck typos (BUA deviation formula and Auction division formula) and highlights a hidden human error in Report 3: the human valuer not only missed the Survey No. mismatch in the Sale Deed, but also transposed subdivision numbers in Remark 5 (173A/1F, 174A/1A) vs the attached Tamil Patta (173A/1A, 174A/1F).

 
3. Deterministic Engine Specifications & Exact Formulas
CRITICAL ENGINEERING RULE — DETERMINISTIC EXECUTION ONLY
All mathematical calculations, Authenticity Scores, Auto-QC rules, Indian Rupee word conversions, and Routing Cascade decisions MUST be implemented as pure, unit-tested TypeScript functions inside lib/engines/.
In Live AI Upload Mode, the Vision LLM ONLY extracts raw JSON attributes from PDFs/images. It NEVER computes Market Value, FSV, Deviation %, Authenticity Score, or Routing Status.

3.1 Trust & Anti-Fraud Layer (lib/engines/trust.ts)
Proves the capture occurred at the exact parcel, in real time, by an authorized person, without omitting floors or tampering with media:
Trust Check	Verification Logic & Failure Action
1. GPS-in-Parcel Polygon	Checks capture coordinates lie within parcel polygon (or <= 25m of deed/cadastral centroid where village maps lack geo-referencing). Cross-checks exterior frames vs satellite/street view.
2. Live Camera Only & Device Attestation	Blocks gallery uploads, screenshots, rooted/jailbroken devices, emulators, and mock-GPS apps. Attaches cryptographic timestamp to every frame.
3. Image Forensics & Sun-Angle Check	Detects AI-generated/edited photos; validates shadow direction against solar azimuth for GPS + timestamp; verifies random live capture prompts (e.g., 'Pan slowly left from main gate to electricity meter').
4. Identity & Representative Verification	Face match against KYC selfie (Aadhaar OTP / DigiLocker) or registered site representative for NRI/institutional/tenant-occupied properties.
5. Exterior-to-Interior Floor Coverage Lock	Compares exterior_detected_floors (facade + satellite shadow) against interior_walked_floors. If interior < exterior, raises OMISSION_FRAUD_BLOCK and halts submission.
6. Hindsight Audit Sampling	Randomly flags 3–5% of Instant-approved files for post-disbursal physical hindsight audits to feed the Drift Guard.

3.2 Engine 1: MEASURE (lib/engines/measure.ts)
Every physical quantity is derived from two independent sources so over-declaration or omitted deviations are caught automatically:
Quantity	Primary Source	Independent Cross-Check	Real Anomaly Caught
Plot Area	Cadastral map (Bhu-Naksha / state GIS / Patta)	Sale Deed OCR; satellite parcel boundary	R3: 6,000 sqft (deed) vs 5,920 sqft (Patta)
Net Usable Plot	Least plot polygon area	Master Plan road-widening + setback lines	R1: 3,831 -> 3,549 sqft (-282 sqft widening)
Building Footprint	Satellite building outline	Owner exterior photos; sanctioned plan	Unauthorized extensions, encroachments
Floors / Height	Satellite shadow + stereo; street imagery	Owner guided exterior capture; sanctioned floors	R2: 52.68% excess BUA + 5th floor tin shed
Interior BUA	Phone scan: monocular depth + known-object scale (door/meter); LiDAR/ARCore boost	Footprint x Floors; sanctioned floor areas	Over/under-declared room areas; omitted floors
Large / Industrial Sites	Satellite roof + yard polygon; licensed drone for top tickets	Site plan, factory license	Unapproved sheds/warehouses not on plan

Exact TypeScript Logic for Engine 1 (MEASURE):
ENGINE 1 FORMULAS (lib/engines/measure.ts):
1. Net Usable Plot Area:
   A_net = Math.min(A_deed, A_record) - A_widening

2. Multi-Source Area Reconciliation:
   A_star = sum(w_i * A_i)   // Weighted mean of Deed, Cadastral/Patta, Satellite
   AREA_VARIANCE_FLAG = sources.some(A_i => Math.abs(A_i - A_star) / A_star > 0.10)

3. Built-Up Area (BUA) Deviation %  [CORRECTED FORMULA]:
   dev_pct = ((BUA_actual - BUA_sanctioned) / BUA_sanctioned) * 100
   // Note: If BUA_sanctioned is missing, compare against BUA_permissible_bylaws and set NO_SANCTIONED_PLAN = true.

4. Permissible BUA Considered for Valuation:
   - If sanctioned plan exists (e.g., R2):               BUA_valued = Math.min(BUA_actual, BUA_sanctioned)
   - If no plan & strict Land-Only policy (e.g., R1):    BUA_valued = 0
   - If no plan & institutional exception (e.g., R3):    BUA_valued = BUA_actual (with MISSING_PLAN_FLAG = true)

5. Building Height & Floors from Satellite Shadow:
   H_meters = shadow_length_m * Math.tan(sun_elevation_deg * Math.PI / 180)
   estimated_floors = Math.max(1, Math.round(H_meters / 3.0))

6. Known-Object Monocular Photo Scaling (Android Baseline):
   Length_ft = measured_pixels * (reference_object_ft / reference_object_pixels)  // e.g., standard door = 7.0 ft

7. Omission Fraud Coverage Lock:
   OMISSION_FRAUD_BLOCK = (interior_walked_floors < exterior_detected_floors)

8. 4-Direction Boundary & GIS Hazard Overlay:
   - Compares Deed E/W/N/S vs Satellite/Site E/W/N/S (road direction, road width, adjacent plot type).
   - Evaluates boolean GIS overlays: in_forest_buffer, in_road_widening, in_crz_waterbody, near_ht_line, caution_area, negative_area, ogl_area.

3.3 Engine 2: PRICE & Authenticity Score (lib/engines/price.ts)
Engine 2 runs strictly AFTER Engine 1 (net area/BUA) and Engine 3 (usage) confirm what is being priced. It replaces unrecorded broker phone calls with 6 independent data sources, locality-calibrated bias corrections, spatial fallback penalties, and an auditable 0–100 Authenticity Score.
Price Data Source	Known Structural Bias	Exact Bias Correction Formula
1. Registered Sale Deeds (IGR via ULI/aggregators)	Under-declared near circle rate	r_reg* = median(r_reg) * k_reg  [k_reg = verified_rate / registered_rate]
2. Online Portal Listings (licensed feeds)	Asking > closing price; duplicates, stale	De-dupe (photo/text hash) -> r_list* = median(r_ask) * (1 - d)
3. IDFC Past Valuation Reports	Valuer judgment, site-verified but dated	r_idfc* = r_then * (HPI_now / HPI_then)
4. Bank Auction Results (SARFAESI)	Distressed pricing below market	r_auc* = r_auction / f  [CORRECTED: divide by forced-sale ratio f, e.g., 0.80]
5. Builder Price Lists & RERA (Flats only)	Launch premiums, hidden discounts/offers	r_rera* = list_rate - net_offer_value
6. Circle / Guideline Rate (State SRO)	Far below market (e.g., R3: 7.82x gap)	Weight = 0% (Floor sanity check only: flag if R_consensus < circle_rate)

Exact TypeScript Logic for Engine 2 (PRICE & Authenticity Score):
ENGINE 2 FORMULAS & AUTHENTICITY SCORE S (lib/engines/price.ts):
1. Inverse-Variance Weighted Consensus Land Rate:
   R_consensus = sum(w_i * r_i_corr)    where sum(w_i) = 1.0 and w_i proportional to 1 / (sigma_i^2)
   Range: [R_low, R_high] = [R_consensus * (1 - weighted_cv), R_consensus * (1 + weighted_cv)]

2. Comparable-Level Feature Adjustment (Hedonic / Comps):
   r_adj = r_comp * product(1 + a_k)    // a_k for road width, frontage, corner plot, floor, age, usage, zoning

3. Hierarchical Spatial Fallback for k_reg & d (Thin-Market Safety):
   - Tier 1: 1 km Micro-Locality  -> Spatial Score = 20 pts (0 penalty)
   - Tier 2: Revenue Village/Ward -> Spatial Score = 14 pts (-6 pts)
   - Tier 3: Sub-Registrar (SRO)  -> Spatial Score =  9 pts (-11 pts)
   - Tier 4: District Benchmark   -> Spatial Score =  4 pts (-16 pts)

4. Transparent Authenticity Score S (0 to 100):
   S = Math.round(agreement_score + depth_score + recency_score + spatial_typicality_score)
   - agreement_score (0–35):   CV <= 0.05 -> 35; CV >= 0.25 -> 0; linear interpolation between 0.05 and 0.25.
                               Where CV = stdDev(corrected_rates) / mean(corrected_rates).
   - depth_score (0–25):       n_comps >= 20 -> 25; else Math.round((n_comps / 20) * 25).
   - recency_score (0–20):     median_age_months <= 3 -> 20; >= 24 -> 0; linear interpolation between 3 and 24.
   - spatial_typicality (0–20): Spatial fallback tier score minus 4 pts if property is non-standard/irregular/commercial trophy.

5. Drift Guard (Audit Feedback Loop):
   If rolling 90-day hindsight audit median error in a locality > 7%, automatically raise locality Instant threshold from S >= 80 to S >= 88.

6. Illustrative Proof (R1-like Plot Calibration):
   - 12 Regd. Sales:   Rs. 6,100 * 1.45 = Rs. 8,845 (Weight 30%)
   - 31 Listings:      Rs. 10,400 * 0.86 = Rs. 8,944 (Weight 25%)
   -  7 IDFC Reports:  Rs. 9,200 (indexed) = Rs. 9,200 (Weight 35%)
   -  2 Auctions:      Rs. 7,600 / 0.80 = Rs. 9,500 (Weight 10%)
   -> Consensus = ~Rs. 9,060/sqft (Range Rs. 8,700–9,400) | R1 Legacy Valuer stated Rs. 9,000/sqft with ZERO comps.

3.4 Engine 3: USAGE & Property Condition (lib/engines/usage.ts)
Property usage dictates the bank's maximum LTV cap. Engine 3 classifies usage via Computer Vision on captured photos and independently cross-verifies it against utility/tax/zoning records. The same photos also extract occupancy (self/rented/vacant), finish quality (construction rate), visible structural defects (cracks, dampness -> depreciation), and external hazards (HT lines, drains, unapproved floors).
Usage Class	Computer Vision Photo Cues	Independent Record Confirmation	Illustrative LTV Cap
Residential	Kitchen, bedrooms, household furniture, domestic facade	Domestic EB tariff (e.g., LA1A/DOMESTIC), Residential tax class, Master Plan zoning	70% (Highest)
Commercial	Shopfront, signboard OCR, bank/retail counters, workstations	Commercial EB tariff, GST/Shop Act/Lease registration, Commercial zoning	60% (Moderate)
Mixed Use	Ground-floor shops with residential upper floors	Multiple utility meters, split municipal tax assessment	55% (Per-part weighted)
Industrial	Machinery, industrial sheds, cranes, loading bays	Industrial HT/LT power tariff, Factory/Pollution license	50% (Conservative)
Institutional	Hospital beds, classrooms, laboratories, clinics	Hospital/School registration & institutional allotment	50–55% (Policy-specific)

Conservative Conflict Resolution — CRITICAL CONFLICT RULE: Conflicts NEVER resolve upward toward a higher LTV band. Example: If CV detects commercial machinery/signage inside a property with a Domestic EB tariff, PRAMAAN sets USAGE_CONFLICT = true, caps LTV at the lower band, and forces escalation to Remote Review or Physical Check.
3.5 Deterministic Valuation Calculator (lib/engines/valuation.ts)
Exact Valuation Arithmetic & Indian Rupee Words Engine:
VALUATION METHODS & RECONCILIATION (lib/engines/valuation.ts):
Method 1 — Land + Building (Independent houses, plots, industrial, mixed):
   Depreciation D = Math.min(0.85, (age_years / total_life_years) * (1 - 0.10))   // 10% salvage value
   // Example (R3): Age 14 yrs, Residual 45 yrs -> Total Life 59 yrs -> D = (14 / 59) * 0.90 = 21.36%
   Land_Value     = A_net * R_land
   Building_Value = BUA_valued * R_constr_depreciated   // OR BUA_valued * R_constr_new * (1 - D)
   MV_land_bldg   = Land_Value + Building_Value + Amenities_Value

Method 2 — Comparable Sales (RERA Flats, standard shops, strata offices):
   MV_comps = Saleable_Area * R_comp_adj

Method 3 — Income Capitalization & Yield Cross-Check (Leased commercial properties):
   Annual_Rent   = Monthly_Rent * 12
   Gross_Yield%  = (Annual_Rent / MV_primary) * 100
   MV_income     = (Annual_Rent * (1 - outgoings_pct)) / Cap_Rate   // Default outgoings = 10%
   YIELD_GUARDRAIL_FLAG = (Math.abs(MV_primary - MV_income) / MV_primary > 0.15)

Reconciled Market Value, FSV & Loan Sizing:
   MV_final            = sum(w_m * MV_m)  // Primary method weight = 1.0 unless blended
   FSV                 = MV_final * fsv_ratio  // 0.80 (R1, R2) or 0.85 (R3)
   Max_Collateral_Loan = LTV_cap(confirmed_usage) * MV_final
   Final_Sanction      = Math.min(Max_Collateral_Loan, Cashflow_Capacity_Loan)
   Amount_In_Words     = toIndianRupeeWords(Math.round(MV_final))   // Exact Crores/Lakhs/Thousands formatter

3.6 Confidence-Gated Risk Cascade & Property-Type Playbook (lib/engines/routing.ts)
Cascade Tier & SLA	Exact Boolean Routing Rules (Deterministic)
INSTANT (Green)
30–55 mins
Expected: 60–75% of files	ALL gates must pass:
1. Authenticity Score S >= 80
2. Trust Layer 100% PASS (GPS-in-parcel, live camera, face match, no Omission Block)
3. Area sources within 10% & BUA deviation <= 15%
4. Usage confirmed by 2 independent sources (no conflict)
5. Sanctioned plan verified & 0 Survey/Title mismatches & 0 Critical Auto-QC Fails
6. Market Value <= Rs. 5 Cr (Policy threshold for instant unassisted route)
Fast Path: Recent IDFC valuation (BT/Top-up) re-used after satellite change detection.
REMOTE REVIEW (Amber)
Same Day (<= 24 hrs)
Expected: 15–25% of files	Triggered when Trust Layer passes, but ANY of:
• Authenticity Score S between 60 and 79
• Missing sanctioned plan (Land-only policy or exception review, e.g., R1/R3)
• Survey No. mismatch requiring Rectification Deed (e.g., R3)
• Road widening / irregular plot / forest RTI review (e.g., R1)
• Income yield variance > 15% or MV between Rs. 5 Cr and Rs. 15 Cr
• State land portal not on API -> Same-day Ops Lookup Desk fallback.
PHYSICAL CHECK (Red)
24–72 hrs
Expected: 5–15% of files	Triggered by ANY severe risk gate:
• Authenticity Score S < 60 (thin market / one-off trophy asset)
• BUA deviation > 30% or unapproved floors/sheds (e.g., R2 at 52.68% + tin shed)
• Trust Layer failure (GPS spoof, mock device, Omission Fraud floor mismatch)
• Severe Usage conflict (e.g., industrial machinery in residential tax parcel)
• High-Ticket Commercial > Rs. 15 Cr with major deviation (Dual-Valuation Policy Gate).

Property Type	Primary Valuation Method	Default Expected Route
Flat in RERA Project	Comparable Sales	Instant (Green)
Independent House / Plot	Land + Building	Instant / Remote Review
Shop / Office / Showroom	Comps + Rent Yield Check	Instant / Remote Review
Mixed Use Building	Split valuation per usage part	Remote Review
Factory / Warehouse	Land + Building (+ drone for large sites)	Remote / Physical Check
Hospital / School / Institutional	Land + Building + Income Check	Remote / Physical Check

3.7 Automated Quality Control (Auto-QC) Engine (lib/engines/autoQc.ts)
Runs 6 deterministic checks on every report before it reaches the valuer or underwriter—eliminating the exact human errors found across all three IDFC sample reports:
Auto-QC Rule	Deterministic Check Logic	Exact Error Caught in IDFC Sample Reports
QC-1: Words vs. Figures Check	Converts numeric MV to exact Indian Rupee words and compares against stated text.	R3 (Coimbatore): Legacy report prints 'Fifty Five Lakh Sixty Thousand and Twenty Rupees Only' for a Rs. 3,39,75,200 (Rs. 3.40 Cr) property!
QC-2: Chronological Date & TAT Check	Verifies Visit Date <= Report Date <= e-Sign Date; scans remarks for conflicting inspection dates; flags sign-off lag > 2 days.	R3: Visit 07.08.2026 vs Remark 1 'inspected on 04.07.2026' vs e-Sign 25.08.2026 (18 days). R1: Visit 25.05 vs Sign 04.06 (10 days).
QC-3: Deviation vs. Demolition Risk Logic	If BUA deviation > 25% (or unapproved tin shed/floor exists) AND demolition risk == 'Low', triggers CRITICAL FAIL.	R2 (Dehradun Comm.): 52.68% BUA deviation + 3,970 sqft tin shed still rated 'Low' demolition risk!
QC-4: Arithmetic & FSV Recalculation	Independently recomputes Land + Building + Amenities = MV and checks FSV = 80–85% of MV.	Guarantees zero spreadsheet/copy-paste arithmetic errors across all cases.
QC-5: Internal Status Contradiction Check	Flags logical conflicts (e.g., Stage of Construction = 100% while Remarks describe 'under-construction property'; or Vacant vs Occupied mismatch).	R1 (Dehradun Res.): Stage of Construction listed as '100%' while Remarks state 'under-construction property'.
QC-6: Cross-Document Survey & Geo-Tag Check	Matches Survey/Khasra numbers across Sale Deed, Vernacular Patta/FMB, and GIS; checks distance between Sanctioned Map coordinates and actual site coordinates (>25m = FAIL).	R3: Sale Deed says only SF 173A/1F; Tamil Patta says 165/21, 173A/1A, 174A/1F (and human valuer transposed 173A/1F & 174A/1A in Remark 5!). R2: Sanctioned map OC/0015/24-25 geo-tag is 74m off actual site.

 
4. Pre-Loaded Golden Seed Datasets (lib/data/seedCases.ts)
The prototype MUST ship with 4 complete, richly detailed cases pre-loaded so the live presentation works 100% offline with zero API latency. Cases 2, 3, and 4 are exact digital reconstructions of IDFC FIRST Bank's 3 supplied Technical Appraisal Reports; Case 1 demonstrates the clean Instant Green straight-through path.
Case 1 (Clean Showcase — INSTANT GREEN): IDFC-PRM-2026-001
Field	Exact Seed Values — Case 1 (Clean Instant Showcase)
Case Summary	Clean Independent Residential House — Dharampeth, Nagpur, Maharashtra | Case Ref: 0505891042 | TAT: 38 mins | Route: INSTANT (Green)
Coordinates & GIS	Lat 21.140800, Lng 79.060400 | Within NMC Municipal Limits | Residential Zone | 30 ft paved approach road | 0m road widening | 0 GIS hazards
Property & Areas	Self-Occupied Residential RCC, G+1, Age 4 yrs, Residual Life 56 yrs (Total 60 yrs) | Deed Plot: 2,400 sqft, Cadastral: 2,390 sqft -> Net Plot: 2,390 sqft | Sanctioned BUA: 2,800 sqft, Actual BUA: 2,860 sqft (Deviation: 2.14% — PASS)
Documents & Usage	Sale Deed, NMC Sanctioned Plan, Property Tax Receipt, Domestic MSEDCL EB Bill verified via DigiLocker/OCR. Usage: Residential (CV 98% + Domestic Tariff + Residential Tax -> Confirmed, LTV Cap 70%).
Engine 2 Price & Score	16 Regd. Sales (Rs. 5,400 x 1.38 = Rs. 7,452, w=30%); 28 Listings (Rs. 8,800 x 0.86 = Rs. 7,568, w=25%); 9 IDFC Reports (Rs. 7,600, w=35%); 3 Auctions (Rs. 6,150 / 0.80 = Rs. 7,688, w=10%). Circle Rate: Rs. 2,800/sqft (2.7x). Consensus Land Rate: Rs. 7,560/sqft. Authenticity Score S = 91/100 (1 km Micro-Locality).
Valuation & Loan Sizing	Land: 2,390 x Rs. 7,560 = Rs. 1,80,68,400 | BUA: 2,800 x Rs. 1,950 = Rs. 54,60,000 | Amenities: Rs. 0 | Market Value (MV): Rs. 2,35,28,400 (~Rs. 2.35 Cr) | FSV (85%): Rs. 1,99,99,140 | Max Collateral Loan (70% LTV): Rs. 1,64,69,880.
Auto-QC & Trust Status	ALL 6 Trust Layer Checks PASS | ALL 6 Auto-QC Rules PASS | Ready for 1-click Phase 1 Remote Valuer e-Sign.

Case 2 (IDFC Sample Report 1 — REMOTE REVIEW AMBER): IDFC/UKDDN26051909
Field	Exact Seed Values — Case 2 (IDFC Report 1 — Dehradun Residential)
Case Summary	Residential Property — Chandrabadni, near Wildlife Institute & Shiv Bhadrakali Mandir, Dehradun | Case Ref: 0505658323 | Applicant: Mr. Anoop Singh Chauhan s/o Mr. Ashok Singh Chauhan | Legacy Agency: Black Olive Ventures (Visit 25/05/2026 -> Report 26/05/2026 -> Signed 04/06/2026 = 10-day TAT)
Coordinates & GIS	Lat 30.279861, Lng 77.973972 | Within Nagar Nigam Limit | Approach Road: 47 ft wide (North & South) | Master Plan Road Widening: 24m (78.72 ft) proposed -> 15.86 ft plot depth lost (-282 sqft) | Adjacent Wildlife Forest Buffer (Hindi Forest Division RTI dated 13 Mar 2026 verified via Vernacular OCR confirming Khasra 2206 & 2221 are NOT Section 4/20 forest land).
Property & Areas	Vacant Residential RCC, GF+2+Mumty (GF Parking; FF & SF 4 Rooms/4 Kitchens/4 T&B each), Age 1 yr, Residual Life 59 yrs | Deed Plot: 3,831 sqft -> Net Plot after R/W: 3,549 sqft (329.71 sqmt) | Irregular plot shape | Permissible BUA: 3,721 sqft (GF 1,298, FF 1,298, SF 1,125, Mumty 0) vs Actual BUA: 4,278 sqft (GF 1,298, FF 1,298, SF 1,298, Mumty 384) -> Deviation: 14.96% | Sanctioned Plan: NOT PROVIDED -> Policy enforces Land-Only Value (BUA_valued = 0).
Boundaries (Deed vs Site)	East: Land of Deepak Rana / House of Sarika & Anoop Singh | West: Land of Buyer (Anoop Singh) / House of Suman Singh Negi | North: 28 ft road (Deed) vs 47 ft road (Site) | South: 8 ft road & land of Suman Negi vs 11 ft road.
Engine 2 Price & Score	12 Regd. Sales (Rs. 6,100 x 1.45 = Rs. 8,845, w=30%); 31 Listings (Rs. 10,400 x 0.86 = Rs. 8,944, w=25%); 7 Past IDFC Reports (Rs. 9,200, w=35%); 2 Auctions (Rs. 7,600 / 0.80 = Rs. 9,500, w=10%). PRAMAAN Consensus: Rs. 9,060/sqft (Legacy Valuer stated Rs. 9,000/sqft with ZERO comps). Authenticity Score S = 84/100.
Valuation (Land-Only Policy)	Land: 3,549 x Rs. 9,000 (legacy baseline) = Rs. 3,19,41,000 (Rs. 3.19 Cr) [PRAMAAN consensus value: Rs. 3,21,53,940] | Construction Value: Rs. 0 (No sanctioned plan) | FSV (80%): Rs. 2,55,52,800.
Auto-QC & Flags Caught	1) FAIL (QC-5): Stage of construction listed as '100%' while Remarks describe 'under-construction property'.
2) WARN (Plan Policy): Sanctioned Map / PTR / Key-Plan missing -> Land-Only value auto-applied.
3) WARN (GIS): 282 sqft lost to 24m road widening + Irregular shape + Forest buffer RTI verified via Hindi OCR.
4) WARN (TAT): Legacy report took 10 days from site visit to digital signature.
-> Route: REMOTE REVIEW (Amber — Same Day).

Case 3 (IDFC Sample Report 2 — PHYSICAL CHECK RED): IDFC/UKDDN26061359
Field	Exact Seed Values — Case 3 (IDFC Report 2 — Dehradun Commercial)
Case Summary	Commercial Building (RS Tower) — Rajpur Road, Dilaram Bazaar, near Vishal Mega Mart, Dehradun | Case Ref: 0505667804 | Owners: Mrs. Sarita Gupta & Mr. Abhilash Gupta | Tenant: IDFC FIRST Bank Ltd (9-yr Lease Reg No. 11154 dated 12/12/2024 at Rs. 16,00,000/month) | Legacy Agency: Black Olive Ventures (Visit 12/06/2026 -> Report 13/06/2026)
Coordinates & GIS	Lat 30.336660, Lng 78.056372 | Within MC Limit | Commercial Master Plan Zone | Approach Road: 68 ft paved Rajpur Road (West) | Proposed 33m R/W road widening | Geo-tag in DLDA Sanctioned Map OC/0015/24-25 is ~74 meters offset from actual parcel (Map OC/0009/24-25 matches site).
Property & Areas	Tenant-Occupied Commercial RCC, GF/Stilt + 04 + Mumty + 5th Floor Tin Shed, 2 Lifts, Age 1 yr, Residual Life 59 yrs | Doc Land: 5,192 sqft (5 Sale/Gift Deeds) -> Net Plot after R/W: 4,139 sqft (384.52 sqmt) | Sanctioned BUA (DLDA Maps OC/0015 & OC/0009 dated 31.05.2024): 13,611 sqft (GF 2,832; FF/SF/TF 2,703 each; 4F 2,670; 5F 0) vs Actual BUA: 24,752 sqft (20,782 RCC + 3,970 Tin Shed; 3,970/floor + 932 5F RCC) -> Deviation: 52.68% (excl. Tin Shed) / 81.85% (incl. Tin Shed) | 190 sqft front shop excluded (outside bank possession & in widening).
Engine 2 Price & Score	Land Rate: Rs. 42,000/sqft (triangulated across Rajpur Rd commercial deeds, commercial listings, and IDFC benchmarks); Construction Rate: Rs. 2,000/sqft on sanctioned 13,611 sqft. Authenticity Score S = 74/100 (high-ticket commercial scarcity).
Valuation & Income Check	Land: 4,139 x Rs. 42,000 = Rs. 17,38,38,000 | Construction: 13,611 x Rs. 2,000 = Rs. 2,72,22,000 | Market Value (MV): Rs. 20,10,60,000 (Rs. 20.11 Cr) | FSV (80%): Rs. 16,08,48,000 | Income Cross-Check: Annual Rent Rs. 1.92 Cr -> Gross Yield = 9.55% (Validates commercial cap-rate band).
Auto-QC & Flags Caught	1) CRITICAL FAIL (QC-3): 52.68% BUA deviation + unapproved 3,970 sqft 5th-floor Tin Shed misclassified as 'Low' demolition risk in legacy report!
2) FAIL (QC-6): Sanctioned Map OC/0015/24-25 geo-coordinates are 74 meters away from actual property.
3) WARN: 190 sqft front shop not in IDFC possession & affected by 33m road widening.
4) POLICY GATE: Commercial asset > Rs. 15 Cr + > 30% deviation requires Dual Valuation & Physical Audit.
-> Route: PHYSICAL CHECK (Red — 24–72 hrs).

Case 4 (IDFC Sample Report 3 — REMOTE REVIEW AMBER): ADR/CBE/July/26/IDFC/022
Field	Exact Seed Values — Case 4 (IDFC Report 3 — Coimbatore Residential)
Case Summary	Residential Building — NGGO Colony, Thudiyalur / Kurudampalayam, Asokapuram Village Panchayat, Coimbatore, Tamil Nadu | Case Ref: 0505783489 | Owner: Mr. A. Subramaniyan (s/o Ammasai Gounder) | Legacy Agency: Adroit Technical Services (Visit 07.08.2026 -> Report 10.08.2026 -> Signed 25.08.2026 = 18-day TAT)
Coordinates & GIS	Lat 11.092555, Lng 76.947050 | Tamil Nilam ULPIN: 732SH2D9TJ1SH0 | Village LGD Code: 644442 (Rural) | SRO: Periyanayakkan Palayam | Approach Road: North 30 ft East-West Road | Residential Class I Type-I.
Property & Areas	Self-Occupied Residential RCC, G+1 (GF 3BHK + Others 4; FF 2 Room + 2 Hall + Others 2), Age 14 yrs, Residual Life 45 yrs (Total 59 yrs -> Straight-line Depreciation D = 21.36%) | Deed & Actual Plot: 6,000 sqft vs Tamil Patta: 5,920 sqft (550 sqmt) -> Least area valued: 5,920 sqft | Actual BUA: 5,300 sqft (GF 3,200 + FF 2,100; Carpet 4,505 sqft) | Approved Building Plan & Layout Plan: NOT PROVIDED.
Documents & Vernacular OCR	Sale Deed Doc No. 5851/2010 (14.06.2010) mentions ONLY SF No. 173A/1F. Tamil Patta (Order 2021/0103/12/305278) parsed via Vernacular OCR lists THREE Survey Nos: 165/21 (0-4.50 Ares), 173A/1A (0-0.50 Ares), 174A/1F (0-0.50 Ares). EB Meter 21443611 (Consumer 0313300462, A. Subramanian, LA1A/DOMESTIC, 3-Phase 4 KW, LIVE) & Property Tax Receipt (Assessment 4490, Rs. 2,642 paid 05-08-2026, Door 4/66 Richard Street) verified & matched.
Engine 2 Price & Score	Land Rate: Rs. 3,910/sqft vs TNREGINET Guideline Value Rs. 500/sqft (7.82x gap — proves why circle-rate uplift calibration is essential); Depreciated Construction Rate: Rs. 1,760/sqft; Amenities (EB, UGWT, Septic Tank): Rs. 15,00,000. Authenticity Score S = 78/100.
Valuation & Loan Sizing	Land: 5,920 x Rs. 3,910 = Rs. 2,31,47,200 | BUA: 5,300 x Rs. 1,760 = Rs. 93,28,000 | Amenities: Rs. 15,00,000 | Market Value (MV): Rs. 3,39,75,200 (Rs. 3.40 Cr) | FSV (85%): Rs. 2,88,78,920 | Example Loan Request Rs. 2.0 Cr = 58.8% LTV (Max Collateral Loan at 70% LTV = Rs. 2.38 Cr).
Auto-QC & Flags Caught (Showstopper!)	1) CRITICAL FAIL (QC-1): Legacy report prints amount in words as 'Fifty Five Lakh Sixty Thousand and Twenty Rupees Only' instead of Three Crore Thirty-Nine Lakh Seventy-Five Thousand Two Hundred!
2) FAIL (QC-6): Survey Field No. Mismatch (Sale Deed lists 1 SF No. vs Tamil Patta 3 SF Nos -> Rectification Deed mandatory before disbursement). BONUS CATCH: Legacy valuer even transposed subdivision numbers in Remark 5 (wrote 173A/1F & 174A/1A instead of Patta's 173A/1A & 174A/1F)!
3) FAIL (QC-2): Date Contradiction — Cover page says Visit 07.08.2026, Remark 1 says 'inspected on 04.07.2026', e-Sign 25.08.2026 (18-day lag).
4) WARN: Approved building plan & layout plan not provided.
-> Route: REMOTE REVIEW (Amber — Hold for Rectification Deed).

 
5. Technical Architecture, TypeScript Data Model & API Contract
5.1 Recommended Tech Stack (Zero-Friction Deployment)
Layer	Technology & Rationale
Framework & Language	Next.js 15 (App Router) + React 19 + TypeScript (strict mode)
Styling & Components	Tailwind CSS + shadcn/ui + lucide-react icons
Interactive GIS & Comps Maps	leaflet + react-leaflet (dynamically imported with ssr: false). Uses free OpenStreetMap & Esri World Imagery satellite tiles—NO paid Google Maps billing key required!
Data Visualizations	recharts (Price Triangulation Bar/Waterfall Chart, Authenticity Score Radial Gauge, Floor-wise BUA Deviation Chart)
PDF Report Generation	jspdf + jspdf-autotable (client-side 1-click downloadable IDFC FIRST Bank Technical Appraisal Report PDF)
Live Vision AI Extraction	Next.js Route Handler /api/analyze-live using @google/genai (Gemini 2.5 Flash) or OpenAI GPT-4o via env var, with graceful simulated fallback when no API key is present
State & Storage	React Context + localStorage persistence (zero database setup; deploys cleanly to Vercel in < 2 minutes)

5.2 Core TypeScript Data Model (lib/types.ts)
Recommended Core TypeScript Interfaces (lib/types.ts):
export type UsageClass = 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED_USE' | 'INDUSTRIAL' | 'INSTITUTIONAL';
export type RouteTier = 'INSTANT' | 'REMOTE_REVIEW' | 'PHYSICAL_CHECK';
export type QcStatus = 'PASS' | 'WARN' | 'FAIL' | 'CRITICAL_FAIL';
export type SpatialTier = 'MICRO_1KM' | 'WARD_VILLAGE' | 'SRO_ZONE' | 'DISTRICT';

export interface PriceSourceInput {
  id: 'REGD_DEEDS' | 'LISTINGS' | 'IDFC_ARCHIVE' | 'AUCTIONS' | 'RERA_BUILDER' | 'CIRCLE_RATE';
  label: string;
  count: number;
  rawRatePerSqft: number;
  correctionFormulaLabel: string;
  correctionFactor: number;        // e.g., k_reg=1.45, (1-d)=0.86, 1/f=1.25
  correctedRatePerSqft: number;
  weight: number;                  // 0 for CIRCLE_RATE; sum = 1.0 for active sources
  medianAgeMonths: number;
}

export interface ComparablePin {
  id: string;
  source: PriceSourceInput['id'];
  lat: number;
  lng: number;
  distanceKm: number;
  date: string;
  rawRate: number;
  adjustedRate: number;
  note: string;
}

export interface FloorAreaRow {
  floorName: string;
  sanctionedSqft: number;
  actualSqft: number;
  isTinShedOrTemporary?: boolean;
}

export interface AutoQcFinding {
  ruleId: 'QC-1' | 'QC-2' | 'QC-3' | 'QC-4' | 'QC-5' | 'QC-6';
  title: string;
  status: QcStatus;
  legacyReportValue: string;
  pramaanDetection: string;
  actionRequired: string;
}

export interface PropertyCase {
  id: string;
  caseRefNo: string;
  title: string;
  city: string;
  state: string;
  applicantName: string;
  isBenchmarkSample: boolean;
  legacyAgencyName?: string;
  legacyTatDays?: number;
  pramaanTatMinutes: number;
  lat: number;
  lng: number;
  sanctionedMapGeoOffsetMeters?: number; // e.g., 74m for R2
  // Measure Inputs
  deedPlotAreaSqft: number;
  cadastralPlotAreaSqft: number;
  roadWideningLossSqft: number;
  roadWidthCurrentFt: number;
  roadWidthProposedFt?: number;
  floors: FloorAreaRow[];
  hasSanctionedPlan: boolean;
  noPlanPolicy: 'LAND_ONLY' | 'INSTITUTIONAL_EXCEPTION' | 'STANDARD';
  exteriorDetectedFloors: number;
  interiorWalkedFloors: number;
  ageYears: number;
  residualLifeYears: number;
  gisHazards: {
    forestBuffer: boolean;
    forestRtiCleared?: boolean;
    roadWidening: boolean;
    crzOrWaterbody: boolean;
    htLine: boolean;
    cautionArea: boolean;
    negativeArea: boolean;
  };
  boundaries: {
    direction: 'East' | 'West' | 'North' | 'South';
    asPerDeed: string;
    atSiteSatellite: string;
    matched: boolean;
  }[];
  // Price Inputs
  priceSources: PriceSourceInput[];
  circleRatePerSqft: number;
  spatialFallbackTier: SpatialTier;
  isTypicalProperty: boolean;
  comparables: ComparablePin[];
  constructionRatePerSqft: number;
  amenitiesValueInr: number;
  fsvRatio: number;                // 0.80 or 0.85
  monthlyRentInr?: number;         // e.g., 1600000 for R2
  capRate?: number;                // e.g., 0.085
  // Usage & Trust Inputs
  cvDetectedUsage: UsageClass;
  cvConfidencePct: number;
  recordConfirmedUsage: UsageClass;
  utilitySummary: string;
  trustChecks: {
    gpsInParcel: boolean;
    liveCameraOnly: boolean;
    deviceAttested: boolean;
    sunAngleMatched: boolean;
    faceMatched: boolean;
    floorCoverageLocked: boolean;
  };
  // Legacy Audit Comparison Fields (for Auto-QC)
  legacyStatedLandRate?: number;
  legacyStatedValueWords?: string;
  legacyDemolitionRisk?: 'Low' | 'Medium' | 'High' | 'No';
  legacyVisitDate?: string;
  legacyRemarkVisitDate?: string;
  legacySignDate?: string;
  legacyStageOfConstruction?: string;
  legacyRemarksText?: string;
  surveyDeedNumbers?: string[];
  surveyPattaNumbers?: string[];
  legacyRemarkSurveyNumbers?: string[];
  vernacularDocsParsed?: { language: string; docType: string; summary: string }[];
  // Sign-off state
  esignStatus: 'PENDING' | 'SIGNED_BY_VALUER' | 'ESCALATED_PHYSICAL';
  signedByValuer?: { name: string; ibbiRegNo: string; timestamp: string };
}

5.3 Repository Structure & Live AI Endpoint Contract
Recommended Repository File Tree:
pramaan-idfc/
├── app/
│   ├── layout.tsx                   # IDFC Maroon enterprise shell, top nav, demo mode pill
│   ├── page.tsx                     # Tab 1: Portfolio Command Center + ROI Drawer
│   ├── capture/page.tsx             # Tab 2: Owner Mobile Self-Capture Simulator + Fraud Lab
│   ├── cases/[id]/page.tsx          # Tab 3: Underwriter & Remote Valuer Workbench (3 Engines + QC)
│   ├── cases/[id]/report/page.tsx   # Tab 4: Auto-Generated IDFC Report + PDF Export + e-Sign
│   └── api/analyze-live/route.ts    # Live Vision AI extraction endpoint (PDF/Photos -> JSON)
├── lib/
│   ├── types.ts                     # All strict TypeScript interfaces
│   ├── engines/
│   │   ├── trust.ts                 # Trust Layer & Omission Fraud evaluator
│   │   ├── measure.ts               # Net area, BUA deviation, shadow height, boundaries
│   │   ├── price.ts                 # 6-source triangulation, spatial fallback, Authenticity S
│   │   ├── usage.ts                 # Dual-source usage & conservative LTV policy engine
│   │   ├── valuation.ts             # L+B, Comps, Income Yield, FSV, INR Words converter
│   │   ├── autoQc.ts                # 6 deterministic Auto-QC rules
│   │   ├── routing.ts               # Confidence-gated Risk Cascade (Instant/Remote/Physical)
│   │   └── evaluateCase.ts          # Master orchestrator returning complete EvidencePack
│   ├── data/
│   │   └── seedCases.ts             # Exact golden datasets (Clean Case + R1, R2, R3 + comps)
│   └── pdf/
│       └── generateIdfcPdf.ts       # jsPDF + autotable IDFC report generator
└── components/
    ├── SatelliteMap.tsx             # Leaflet Esri Satellite + GIS overlays + 74m offset + comps
    ├── PriceTriangulationPanel.tsx  # 6-source chart, Authenticity Gauge, Interactive Sliders
    ├── AutoQcPanel.tsx              # Legacy Error vs PRAMAAN Auto-Catch cards
    ├── EvidenceDrawer.tsx           # Click-any-figure audit trail & formula inspector
    ├── RoiCalculatorModal.tsx       # IDFC Year-1 P&L & Conversion Uplift simulator
    ├── LiveUploadModal.tsx          # Upload real PDF/Photos to /api/analyze-live
    └── RemoteESignModal.tsx         # RBI Phase 1 Registered Valuer OTP e-Sign flow

Live Vision AI Endpoint Contract — Endpoint POST /api/analyze-live accepts multipart/form-data (PDF appraisal report or property photos), sends the file to Gemini 2.5 Flash (if GEMINI_API_KEY is present in .env.local) with a strict JSON extraction schema matching PropertyCase fields, pipes the extracted JSON through lib/engines/evaluateCase.ts, saves the new case to localStorage, and opens its Workbench view. If no API key is configured, it runs a deterministic client-side parser/simulator with a transparent 'Simulated Extraction Mode' badge so the prototype never errors out on stage.
 
6. Screen-by-Screen UI/UX & Interactive Specifications
6.1 Visual Brand System (IDFC FIRST Bank Enterprise Grade)
•	Color Palette: Primary Brand Maroon #9C1D26, Deep Maroon #6E1118, Warm Neutral Canvas #FAF8F8, Card Surface #FFFFFF, Dark Slate Text #1E293B.
•	Semantic Status Badges: INSTANT = Emerald Green (#15803D on #DCFCE7), REMOTE REVIEW = Amber (#B45309 on #FEF3C7), PHYSICAL CHECK / CRITICAL FAIL = Crimson (#DC2626 on #FEE2E2).
•	Typography & Numeric Precision: Clean sans-serif (Inter / Geist) with tabular-nums enabled on ALL currency figures, sqft areas, percentages, and scores so numbers align vertically like a real banking terminal.
6.2 Tab 1: Portfolio Command Center (app/page.tsx)
•	5-Card Executive KPI Strip: Median TAT ('41 min vs 7 days'), Instant Route Share ('68%'), Avg Authenticity Score ('84/100'), Legacy QC Errors Caught ('11 across 3 IDFC samples'), Cost per File ('Rs. 480 vs Rs. 3,000+').
•	Interactive Case Queue Table showing all 4 seeded cases (plus any live-uploaded or self-captured cases) with filter pills (All / Instant / Remote Review / Physical Check), Market Value, Authenticity Score pill, Auto-QC badge, Routing Cascade badge, and 'Open Workbench' CTA.
•	Header Action Buttons: '+ Start Owner Self-Capture', 'Upload Live PDF / Photos (AI)', and 'IDFC Business Case / ROI Simulator' modal.
6.3 Tab 2: Owner Mobile Self-Capture Simulator (app/capture/page.tsx)
Layout: Split-screen desktop view—LEFT side displays a realistic 390px Mobile App Frame (with toggle for 'Owner App' vs 'Zero-Install WhatsApp Rep Link'); RIGHT side displays a live 'PRAMAAN Trust & Extraction Telemetry Stream' so judges watch every security check and OCR extraction fire in real time.
•	Step 1 — Consent & KYC: Simulated Aadhaar OTP / DigiLocker consent (strictly generic masked placeholder like [Aadhaar OTP Verified] — NEVER print real Aadhaar digits), PAN check, and Selfie Face Match indicator.
•	Step 2 — Address & Parcel Map Pin: Interactive Leaflet satellite map; clicking inside parcel turns 'GPS-in-Parcel Polygon' green and toggles Master Plan Road Widening & Forest/Hazard GIS overlays.
•	Step 3 — Smart Document Upload & Vernacular OCR: Select/upload Sale Deed, Sanctioned Plan, EB Bill, Property Tax, and optional Vernacular Patta/RTI (Tamil/Hindi). Instantly extracts Owner Name, Area, Survey No., and highlights mismatches before the owner leaves the screen.
•	Step 4 — Guided Continuous Exterior-to-Interior Capture: Step-by-step capture checklist (Approach Road Width -> Exterior Facade [auto-counts floors] -> Electricity Meter -> Room-by-room floor walkthrough with Android known-object door scaling). Includes a prominent 'FRAUD SIMULATION BAR' at the bottom of the right telemetry panel with 3 one-click demo buttons: (a) 'Simulate Omission Fraud (Skip Top Floor)', (b) 'Simulate Mock GPS (180m Outside Parcel)', and (c) 'Simulate Gallery Upload / AI Photo'—allowing the presenter to trigger live red Trust Layer blocks on stage!
•	Step 5 — Run 3-Engine Pipeline: 1.5-second animated execution sequence (Trust -> Engine 1 Measure -> Engine 3 Usage -> Engine 2 Price -> Auto-QC -> Risk Cascade) that creates the new case and opens its Workbench.
6.4 Tab 3: Underwriter & Remote Valuer Workbench (app/cases/[id]/page.tsx)
•	Sticky Decision Header: Case Ref, Property Title, Market Value (Rs.), FSV (Rs.), Max Collateral Loan at confirmed LTV Cap, Routing Cascade Pill (clickable to expand exact Pass/Fail gate checklist), and primary CTA 'Preview Report & Remote e-Sign'.
•	Sub-Tab A — Engine 1 (MEASURE & GIS): Area Reconciliation table (Deed vs Patta/Cadastral vs Road Widening vs Net Valued Area), Floor-wise Sanctioned vs Actual BUA bar chart (highlighting R2's 52.68% + tin shed), interactive Leaflet Satellite Map (showing parcel marker, widening overlay, and R2's 74m geo-tag offset dashed line), 4-Direction E/W/N/S Boundary Matching Matrix, and Vernacular Document OCR extraction cards (showing Tamil Patta for R3 and Hindi Forest RTI for R1).
•	Sub-Tab B — Engine 2 (PRICE & Authenticity — KEY WOW SCREEN): 6-Source Bias-Correction Table & Recharts Comparison Bar Chart; Authenticity Score (0–100) Radial Gauge with 4 transparent sub-score progress bars (Agreement /35, Comps Depth /25, Recency /20, Spatial Typicality /20); Interactive Comparables Map plotting surrounding sales, listings, auctions, and past IDFC reports; and an interactive 'LIVE STRESS-TEST & SENSITIVITY PANEL' with sliders for (1) Comps Count, (2) Source Variance / CV %, (3) Spatial Fallback Tier (1 km -> Ward -> SRO -> District), and (4) Market Overstatement % (x) showing live LTV_true = LTV_stated * (1 + x) and watching the Routing Cascade dynamically flip between INSTANT, REMOTE REVIEW, and PHYSICAL CHECK!
•	Sub-Tab C — Engine 3 (USAGE & Trust Layer): Annotated property photo cards displaying CV usage detections (e.g., 'Residential Kitchen 98%', 'Commercial Signage 96%', '5th Floor Tin Shed 94%'), Dual-Source Verification Card (CV vs EB Tariff vs Property Tax vs Zoning) showing conservative LTV cap enforcement, and 6 green/red Trust Layer telemetry badges.
•	Sub-Tab D — Auto-QC & Legacy Error Audit: Side-by-side cards comparing 'What the Legacy Human Report Missed' vs 'What PRAMAAN Flagged on Day 0' across all 6 Auto-QC rules (highlighting R3's 'Fifty Five Lakh' blunder, Tamil Patta transposition error, R2's 52.68% 'Low' risk error, and R1's under-construction contradiction).
•	Universal Click-to-Inspect Evidence Drawer: Clicking ANY calculated rupee value, rate, or area opens a right-hand Evidence Drawer showing the exact formula, raw input parameters, source document citation, and audit replay timestamp.
6.5 Tab 4: Auto-Generated IDFC Report, PDF Export & Remote e-Sign (app/cases/[id]/report/page.tsx)
•	Full print-layout replica of IDFC FIRST Bank's Technical Appraisal Report (Basic Details, Locality, Building & Floor-wise Deviation Table, Land & Building Valuation Table with INR Words, Income Yield Cross-Check, 4-Direction Boundaries Table, Auto-QC Remarks, Geo-Coordinates & Comparables Evidence Annex, Digital Signature Block).
•	1-Click 'Download IDFC PDF Report' button generating a clean multi-page PDF via jsPDF + jspdf-autotable.
•	1-Click 'Remote Registered Valuer e-Sign (RBI Phase 1)' button opening a modal where an empanelled IBBI Registered Valuer reviews the Evidence Checklist, enters a simulated OTP, and stamps a cryptographic signature block (Valuer Name, IBBI Reg No., Timestamp, 'Valid 90 Days'), updating case status to SIGNED & READY FOR DISBURSAL.
 
7. Phased Coding-Agent Build Playbook (6-Prompt Sequence)
To prevent context overflow, broken imports, or hallucinated math, feed this PRD to your coding agent across 6 sequential checkpoints. Verify `npm run build` after each checkpoint before advancing.
Build Phase	Exact Instruction Scope for Coding Agent
Prompt 1: Scaffold & Design System	Initialize Next.js App Router + TypeScript + Tailwind + shadcn/ui + lucide-react + recharts + leaflet + react-leaflet + jspdf + jspdf-autotable. Configure IDFC Maroon (#9C1D26) theme, tabular-nums utility, top navigation layout, and lib/types.ts from Section 5.2.
Prompt 2: Deterministic Core Engines & Unit Tests	Implement all pure TypeScript functions in lib/engines/ (trust.ts, measure.ts, price.ts, usage.ts, valuation.ts including exact Indian Rupee Crores/Lakhs word converter, autoQc.ts, routing.ts, evaluateCase.ts) strictly matching Section 3 formulas. Write a quick node verification script asserting exact outputs for R1, R2, R3, and Clean Case 1.
Prompt 3: Golden Seed Datasets & Command Center	Create lib/data/seedCases.ts with ALL exact values from Section 4 (including surrounding comparable coordinates for each city) + localStorage state provider. Build Tab 1 (Portfolio Command Center) with 5 KPI cards, filterable case queue, and ROI Calculator modal.
Prompt 4: Underwriter Workbench, Maps & Stress-Test Sliders	Build Tab 3 (app/cases/[id]/page.tsx) with sticky decision header, 4 sub-tabs (Engine 1 Measure + Leaflet Satellite GIS Map + 4-Direction Boundaries; Engine 2 Price Waterfall + Authenticity Gauge + Comparables Map + Interactive Stress-Test Sliders; Engine 3 Usage CV + Trust Badges; Auto-QC Legacy-vs-PRAMAAN Audit), and click-any-number Evidence Drawer.
Prompt 5: Owner Mobile Capture Simulator + Fraud Lab	Build Tab 2 (app/capture/page.tsx) with split-screen 390px Mobile Viewport (Owner App / WhatsApp Rep Link toggle) + live Trust Telemetry stream, 5-step guided flow, and the 3 interactive Fraud Simulation triggers (Omission Fraud, Mock GPS, Gallery Upload) that visibly block submission.
Prompt 6: IDFC Report View, PDF Export, e-Sign & Live AI Route	Build Tab 4 (app/cases/[id]/report/page.tsx), lib/pdf/generateIdfcPdf.ts (multi-page PDF export), RemoteESignModal (IBBI valuer OTP sign-off), and /api/analyze-live route (Gemini 2.5 Flash Vision extraction with graceful offline fallback). Run final `npm run build` and verify zero TypeScript/SSR warnings.

7.1 Definition of Done (Pre-Stage Verification Checklist)
•	Zero TypeScript errors and clean `npm run build` (Leaflet components dynamically imported with `ssr: false`).
•	All 4 seeded cases produce exact deterministic figures: Case 1 = Rs. 2.35 Cr (INSTANT, S=91); R1 = Rs. 3.19 Cr Land-Only (REMOTE REVIEW); R2 = Rs. 20.11 Cr / 9.55% Yield / 52.68% Dev (PHYSICAL CHECK); R3 = Rs. 3.40 Cr / 7.82x Circle Gap (REMOTE REVIEW).
•	Auto-QC panel visibly flags: R3's 'Fifty Five Lakh' words mismatch, Tamil Patta Survey No. mismatch + human transposition catch, R3's 04 Jul vs 07 Aug date conflict, R2's 52.68% 'Low' risk error & 74m geo-tag offset, and R1's 'under-construction' vs 100% contradiction.
•	Engine 2 interactive stress-test sliders dynamically recalculate Authenticity Score (S), Effective LTV, and visibly flip the Routing Cascade badge in real time.
•	Owner Mobile Simulator demonstrates both a successful capture creating a new case AND live Trust Layer rejections when clicking the Fraud Simulation buttons.
•	1-Click PDF Export downloads a clean IDFC FIRST Bank Technical Appraisal Report, and Remote e-Sign stamps the IBBI Valuer signature block cleanly.
•	Works 100% offline in Demo Mode (even if auditorium Wi-Fi drops, only map tiles need fallback styling—all calculations, charts, PDF export, and e-sign stay functional).
