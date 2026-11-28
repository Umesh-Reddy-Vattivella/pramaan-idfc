/* ------------------------------------------------------------------
   PRAMAAN Valuation Logic v2 — every policy constant in one typed object
   (v2 doc §11). All values are starting points to be calibrated (§12).
   Engines read them from here; nothing else hard-codes a threshold.
   ------------------------------------------------------------------ */

export const VALUATION = {
  /* ---- corrections to a closing price (§3) ---- */
  listingDiscount: 0.14,
  auctionForcedSaleRatio: 0.8,
  kReg: 1.0,

  /* ---- systematic error τ per source kind, and add-ons (§3, §5, §6) ---- */
  tau: { SALE: 0.05, LISTING: 0.06, AUCTION: 0.1 },
  /** Added to τ for each: area basis not printed, no guideline adjustment, no price-index adjustment. */
  tauAddOn: 0.02,
  /** Standard error assumed for a source kind with a single point. */
  singlePointSE: 0.15,
  /** Efficiency factor of the median vs the mean. */
  medianEfficiency: 1.25,
  /** Normal-consistency factor that turns a MAD into a standard deviation. */
  madToSd: 1.4826,

  /* ---- cleaning (§5) ---- */
  minRate: 100,
  maxRate: 500_000,
  maxComparableKm: 10,
  /** Undated (assumed-date) points are scored as this old. */
  undatedAgeMonths: 12,
  /** Outliers: |ln r − median(ln r)| > k × 1.4826 × MAD(ln r), only with this many points or more. */
  outlierRobustSd: 3,
  outlierMinN: 4,
  /** Misread band vs the median of the other points of the category. */
  implausibleLow: 0.3,
  implausibleHigh: 3,
  /** Duplicate test for points without a shared link: same locality, rate within 1% and area within 2%. */
  duplicateRateTol: 0.01,
  duplicateAreaTol: 0.02,
  /** Flat rates → the built-up basis PRAMAAN values (carpet × 1.2). */
  areaBasis: { superBuiltUpToBuiltUp: 1.25, carpetToBuiltUp: 1 / 1.2 },
  /** A registered sale whose consideration is within ±5% of the government value on the same deed. */
  atGuidelineBand: 0.05,

  /* ---- locality tiers and weights (§6) ---- */
  tierKm: { T1: 1.5, T2: 5, T3: 10 },
  tierWeight: { T1: 1, T2: 0.5, T3: 0.25 },
  recencyHalfLifeMonths: 12,
  localityAverageMultiplier: 3,
  /** G_subject ÷ G_comp outside this band → a different market, dropped. */
  guidelineRatioCap: { min: 0.67, max: 1.5 },

  /* ---- price index (§3) ---- */
  /** Sales / auctions older than this are brought to today with the house price index. */
  hpiMinAgeMonths: 6,
  /** Commercial / industrial points older than this get τ + add-on (the index is residential only). */
  hpiNonResidentialMonths: 12,

  /* ---- market rate engine (§7) ---- */
  /** Z = n_eff(T1) ÷ (n_eff(T1) + k). */
  localBlendK: 5,
  /** Range shown = R ± z × u (80%). */
  rangeZ: 1.28,

  /* ---- Authenticity Score v2 (§8) ---- */
  agreement: { max: 35, fullAtU: 0.06, zeroAtU: 0.2 },
  depth: { base: 20, fullAtNeff: 12, bonus: 5, bonusMinNeffPerKind: 2 },
  recency: { max: 20, fullAtMonths: 3, zeroAtMonths: 24 },
  spatial: { max: 20, credit: { T1: 1, T2: 0.6, T3: 0.2 } },
  routing: { instant: 80, review: 60 },
  thinMarketScoreCap: 59,

  /* ---- Phase 1 components (§1A) ---- */
  /** Government value: floor only by default; weight is a setting (max 10%). */
  govtWeight: 0,
  purchase: {
    /** Annual appreciation used when no price index covers the city (to be calibrated). */
    growth: 0.06,
    uBase: 0.08,
    uPerYear: 0.02,
    uMax: 0.3,
    /** Extra uncertainty while the price is self-declared (deed not verified). */
    uSelfDeclared: 0.05,
    /** C's weight in the blend never exceeds this. */
    maxWeight: 0.3,
    /** |R_C − R_market| ÷ R_market above this raises a warning. */
    divergenceWarn: 0.3,
  },

  /* ---- value, loan and checks (§9, §10) ---- */
  /** u ÷ R above this: the maximum loan is sized on the lower edge of the range. */
  wideRangeU: 0.15,
  /** T20: customer's claim above MV by more than this. */
  claimGapWarn: 0.25,
  /** T18: R_T1 ÷ R_all outside this band while n_eff(T1) is below maxNeffT1. */
  localPremium: { min: 0.75, max: 1.25, maxNeffT1: 6 },
  /** Floor-plan area vs satellite top view × floors (measurement confidence). */
  floorArea: {
    /** |delta| at or below this scores full agreement; at or above zeroAt scores 0. */
    fullAt: 0.05,
    zeroAt: 0.3,
    points: { agreement: 70, floors: 15, source: 15 },
    /** Floor count matched only against the declaration (not seen on the call). */
    floorsDeclaredOnly: 8,
    source: { GOVT_VERIFIED: 15, GOVT: 10, CUSTOMER_VERIFIED: 10, CUSTOMER: 5 },
    /** Score bands → check status: PASS at or above pass, WARN at or above warn, else BLOCKER. */
    pass: 80,
    warn: 50,
  },
  /** T13 market evidence depth. */
  t13: { minScore: 60, minNeff: 3, blockNeffT1T2: 2, blockU: 0.25 },
} as const;

export type Tier = 'T1' | 'T2' | 'T3';
