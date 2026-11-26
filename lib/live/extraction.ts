/* ------------------------------------------------------------------
   Live Vision AI extraction contract (PRD §5.3).
   The LLM ONLY extracts raw stated attributes. Every computed figure
   (MV, FSV, deviation, Authenticity S, route) comes from lib/engines.
   ------------------------------------------------------------------ */
import type { PropertyCase, UsageClass } from '@/lib/types';

export interface ExtractedFloor {
  floorName: string;
  sanctionedSqft: number;
  actualSqft: number;
  isTinShedOrTemporary?: boolean;
}

/** Raw attributes as stated in the uploaded document(s). */
export interface ExtractedReport {
  title?: string;
  city?: string;
  state?: string;
  applicantName?: string;
  caseRefNo?: string;
  fileNo?: string;
  legacyAgencyName?: string;
  lat?: number;
  lng?: number;
  deedPlotAreaSqft?: number;
  recordPlotAreaSqft?: number;
  roadWideningLossSqft?: number;
  roadWidthFt?: number;
  floors?: ExtractedFloor[];
  hasSanctionedPlan?: boolean;
  ageYears?: number;
  residualLifeYears?: number;
  usage?: UsageClass;
  utilitySummary?: string;
  statedLandRatePerSqft?: number;
  constructionRatePerSqft?: number;
  amenitiesValueInr?: number;
  fsvRatio?: number;
  statedMarketValueInr?: number;
  statedValueWords?: string;
  monthlyRentInr?: number;
  visitDate?: string;
  reportDate?: string;
  signDate?: string;
  remarkVisitDate?: string;
  stageOfConstruction?: string;
  remarksText?: string;
  demolitionRisk?: 'Low' | 'Medium' | 'High' | 'No';
  surveyNumbersDeed?: string[];
  surveyNumbersRecord?: string[];
}

export type ExtractionMode = 'LIVE_AI' | 'SIMULATED';

export interface AnalyzeLiveResponse {
  mode: ExtractionMode;
  model?: string;
  warning?: string;
  files: { name: string; size: number; type: string }[];
  extracted: ExtractedReport;
  case: PropertyCase;
  summary: { tier: string; score: number; mvFinal: number };
}

const USAGES: UsageClass[] = ['RESIDENTIAL', 'COMMERCIAL', 'MIXED_USE', 'INDUSTRIAL', 'INSTITUTIONAL'];
const RISKS = ['Low', 'Medium', 'High', 'No'] as const;

/* ---------------- JSON schema sent to the vision model ---------------- */

const num = { type: 'NUMBER' };
const str = { type: 'STRING' };
export const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: str, city: str, state: str, applicantName: str, caseRefNo: str, fileNo: str, legacyAgencyName: str,
    lat: num, lng: num,
    deedPlotAreaSqft: num, recordPlotAreaSqft: num, roadWideningLossSqft: num, roadWidthFt: num,
    floors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { floorName: str, sanctionedSqft: num, actualSqft: num, isTinShedOrTemporary: { type: 'BOOLEAN' } },
        required: ['floorName', 'sanctionedSqft', 'actualSqft'],
      },
    },
    hasSanctionedPlan: { type: 'BOOLEAN' },
    ageYears: num, residualLifeYears: num,
    usage: { type: 'STRING', enum: USAGES },
    utilitySummary: str,
    statedLandRatePerSqft: num, constructionRatePerSqft: num, amenitiesValueInr: num, fsvRatio: num,
    statedMarketValueInr: num, statedValueWords: str, monthlyRentInr: num,
    visitDate: str, reportDate: str, signDate: str, remarkVisitDate: str,
    stageOfConstruction: str, remarksText: str,
    demolitionRisk: { type: 'STRING', enum: [...RISKS] },
    surveyNumbersDeed: { type: 'ARRAY', items: str },
    surveyNumbersRecord: { type: 'ARRAY', items: str },
  },
};

export const EXTRACTION_PROMPT = `You are a document data-extraction tool for an Indian bank's property (LAP) technical appraisal workflow.
Extract ONLY values that are explicitly printed in the attached documents. Do NOT calculate, infer, round or estimate anything.
- Areas in square feet (convert only if the document itself states the sqft figure; otherwise omit).
- Rates and amounts in Indian Rupees as plain numbers (no commas, no "Rs.").
- statedValueWords: copy the amount-in-words text exactly as printed, including any errors.
- Dates exactly as printed (e.g. 07.08.2026 or 25/05/2026).
- remarkVisitDate: an inspection date mentioned inside the remarks, if it differs in wording from the cover visit date.
- floors: one entry per floor with sanctioned/permissible and actual built-up area as printed; mark tin sheds/temporary structures.
- surveyNumbersDeed / surveyNumbersRecord: survey / khasra / SF numbers from the sale deed and from patta / land records respectively.
- NEVER output Aadhaar, PAN or phone numbers.
Omit any field that is not present.`;

/* ---------------- Sanitiser (pure) ---------------- */

const cleanStr = (v: unknown, max = 300): string | undefined =>
  typeof v === 'string' && v.trim() ? v.replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[masked]').trim().slice(0, max) : undefined;
const cleanNum = (v: unknown, min = 0, max = 1e12): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/[,\s]/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const cleanList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map((x) => cleanStr(x, 40)).filter((x): x is string => !!x).slice(0, 20) : undefined;

/** Validates & normalises untrusted model output. */
export function sanitizeExtraction(raw: unknown): ExtractedReport {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let fsv = cleanNum(r.fsvRatio, 0, 100);
  if (fsv !== undefined && fsv > 1) fsv = fsv / 100;
  const floors = Array.isArray(r.floors)
    ? r.floors
        .map((f): ExtractedFloor | null => {
          const o = (f ?? {}) as Record<string, unknown>;
          const name = cleanStr(o.floorName, 60);
          const s = cleanNum(o.sanctionedSqft, 0, 1e7) ?? 0;
          const a = cleanNum(o.actualSqft, 0, 1e7);
          return name && a !== undefined ? { floorName: name, sanctionedSqft: s, actualSqft: a, isTinShedOrTemporary: o.isTinShedOrTemporary === true } : null;
        })
        .filter((x): x is ExtractedFloor => !!x)
        .slice(0, 30)
    : undefined;
  const usage = USAGES.includes(r.usage as UsageClass) ? (r.usage as UsageClass) : undefined;
  const risk = RISKS.includes(r.demolitionRisk as (typeof RISKS)[number]) ? (r.demolitionRisk as (typeof RISKS)[number]) : undefined;
  return {
    title: cleanStr(r.title, 140),
    city: cleanStr(r.city, 60),
    state: cleanStr(r.state, 60),
    applicantName: cleanStr(r.applicantName, 140),
    caseRefNo: cleanStr(r.caseRefNo, 40),
    fileNo: cleanStr(r.fileNo, 60),
    legacyAgencyName: cleanStr(r.legacyAgencyName, 100),
    lat: cleanNum(r.lat, 6, 38),
    lng: cleanNum(r.lng, 68, 98),
    deedPlotAreaSqft: cleanNum(r.deedPlotAreaSqft, 1, 1e8),
    recordPlotAreaSqft: cleanNum(r.recordPlotAreaSqft, 1, 1e8),
    roadWideningLossSqft: cleanNum(r.roadWideningLossSqft, 0, 1e8),
    roadWidthFt: cleanNum(r.roadWidthFt, 0, 1000),
    floors,
    hasSanctionedPlan: typeof r.hasSanctionedPlan === 'boolean' ? r.hasSanctionedPlan : undefined,
    ageYears: cleanNum(r.ageYears, 0, 200),
    residualLifeYears: cleanNum(r.residualLifeYears, 0, 200),
    usage,
    utilitySummary: cleanStr(r.utilitySummary, 200),
    statedLandRatePerSqft: cleanNum(r.statedLandRatePerSqft, 1, 1e7),
    constructionRatePerSqft: cleanNum(r.constructionRatePerSqft, 0, 1e6),
    amenitiesValueInr: cleanNum(r.amenitiesValueInr, 0, 1e11),
    fsvRatio: fsv,
    statedMarketValueInr: cleanNum(r.statedMarketValueInr, 1, 1e12),
    statedValueWords: cleanStr(r.statedValueWords, 300),
    monthlyRentInr: cleanNum(r.monthlyRentInr, 1, 1e10),
    visitDate: cleanStr(r.visitDate, 20),
    reportDate: cleanStr(r.reportDate, 20),
    signDate: cleanStr(r.signDate, 20),
    remarkVisitDate: cleanStr(r.remarkVisitDate, 20),
    stageOfConstruction: cleanStr(r.stageOfConstruction, 60),
    remarksText: cleanStr(r.remarksText, 2000),
    demolitionRisk: risk,
    surveyNumbersDeed: cleanList(r.surveyNumbersDeed),
    surveyNumbersRecord: cleanList(r.surveyNumbersRecord),
  };
}

/* ---------------- Offline simulated extraction (deterministic) ---------------- */

/** Fixed, clearly-labelled demo extraction used when no API key is configured or the AI call fails. */
export function simulatedExtraction(fileNames: string[]): ExtractedReport {
  const first = fileNames[0]?.replace(/\.[a-z0-9]+$/i, '') || 'uploaded document';
  return {
    title: `Independent Residential House — Shankar Nagar (simulated from "${first.slice(0, 40)}")`,
    city: 'Nagpur',
    state: 'Maharashtra',
    applicantName: 'Simulated Applicant (demo extraction)',
    legacyAgencyName: 'Uploaded legacy valuer report',
    lat: 21.1395,
    lng: 79.065,
    deedPlotAreaSqft: 2000,
    recordPlotAreaSqft: 1990,
    roadWideningLossSqft: 0,
    roadWidthFt: 30,
    floors: [
      { floorName: 'Ground Floor', sanctionedSqft: 1200, actualSqft: 1260 },
      { floorName: 'First Floor', sanctionedSqft: 1200, actualSqft: 1260 },
    ],
    hasSanctionedPlan: true,
    ageYears: 8,
    residualLifeYears: 52,
    usage: 'RESIDENTIAL',
    utilitySummary: 'Domestic EB tariff + Residential property-tax class (as stated in report)',
    statedLandRatePerSqft: 7400,
    constructionRatePerSqft: 1800,
    amenitiesValueInr: 0,
    fsvRatio: 0.85,
    statedMarketValueInr: 19046000,
    statedValueWords: 'One Crore Ninety Lakh Forty Six Thousand Rupees Only',
    visitDate: '12.11.2026',
    reportDate: '13.11.2026',
    signDate: '14.11.2026',
    stageOfConstruction: '100%',
    remarksText: 'Completed and self-occupied residential building.',
    demolitionRisk: 'Low',
    surveyNumbersDeed: ['48/3'],
    surveyNumbersRecord: ['48/3'],
  };
}

/* ---------------- Extraction → PropertyCase (pure mapping, no arithmetic) ---------------- */

export function extractionToCase(ex: ExtractedReport, meta: { id: string; mode: ExtractionMode; fileNames: string[]; tatMinutes: number }): PropertyCase {
  const deed = ex.deedPlotAreaSqft ?? ex.recordPlotAreaSqft ?? 0;
  const record = ex.recordPlotAreaSqft ?? deed;
  const usage = ex.usage ?? 'RESIDENTIAL';
  const rate = ex.statedLandRatePerSqft;
  const hasCoords = ex.lat !== undefined && ex.lng !== undefined;
  const floors = ex.floors?.length ? ex.floors : [{ floorName: 'Built-up area (not itemised)', sanctionedSqft: 0, actualSqft: 0 }];
  const suffix = meta.id.slice(-6).toUpperCase();

  return {
    id: meta.id,
    fileNo: ex.fileNo ?? `IDFC-PRM-AI-${suffix}`,
    caseRefNo: ex.caseRefNo ?? `AI${suffix}`,
    title: ex.title ?? 'Uploaded Property Report',
    city: ex.city ?? '—',
    state: ex.state ?? '—',
    applicantName: ex.applicantName ?? 'Not stated',
    isBenchmarkSample: false,
    origin: 'LIVE_UPLOAD',
    legacyAgencyName: ex.legacyAgencyName,
    pramaanTatMinutes: meta.tatMinutes,
    lat: hasCoords ? ex.lat! : 20.5937,
    lng: hasCoords ? ex.lng! : 78.9629,

    deedPlotAreaSqft: deed,
    cadastralPlotAreaSqft: record,
    roadWideningLossSqft: ex.roadWideningLossSqft ?? 0,
    roadWidthCurrentFt: ex.roadWidthFt ?? 0,
    floors,
    hasSanctionedPlan: ex.hasSanctionedPlan ?? false,
    noPlanPolicy: 'LAND_ONLY',
    exteriorDetectedFloors: floors.length,
    interiorWalkedFloors: floors.length,
    ageYears: ex.ageYears ?? 0,
    residualLifeYears: ex.residualLifeYears ?? 60,
    gisHazards: { forestBuffer: false, roadWidening: (ex.roadWideningLossSqft ?? 0) > 0, crzOrWaterbody: false, htLine: false, cautionArea: false, negativeArea: false },
    boundaries: [],

    // Single stated rate only — PRAMAAN 6-source triangulation requires a data-rail pull.
    priceSources: rate
      ? [{ id: 'IDFC_ARCHIVE', label: 'Uploaded report — stated land rate (single source)', count: 1, rawRatePerSqft: rate, correctionFormulaLabel: 'As stated (no bias correction applied)', correctionFactor: 1, correctedRatePerSqft: rate, weight: 1, medianAgeMonths: 0 }]
      : [],
    circleRatePerSqft: 0,
    spatialFallbackTier: 'DISTRICT',
    isTypicalProperty: true,
    comparables: [],
    constructionRatePerSqft: ex.constructionRatePerSqft ?? 0,
    constructionRateIsDepreciated: true,
    amenitiesValueInr: ex.amenitiesValueInr ?? 0,
    fsvRatio: ex.fsvRatio ?? 0.8,
    monthlyRentInr: ex.monthlyRentInr,
    capRate: ex.monthlyRentInr ? 0.085 : undefined,
    adoptedLandRatePerSqft: rate,
    adoptedLandRateBasis: rate ? 'Rate as stated in uploaded report (single source — triangulation pending)' : undefined,

    cvDetectedUsage: usage,
    cvConfidencePct: 0,
    recordConfirmedUsage: usage,
    utilitySummary: ex.utilitySummary ?? 'As stated in uploaded report',
    // No PRAMAAN live capture exists for an uploaded report → Trust Layer is NOT passed (conservative).
    trustChecks: { gpsInParcel: false, liveCameraOnly: false, deviceAttested: false, sunAngleMatched: false, floorCoverageLocked: false },

    legacyStatedLandRate: rate,
    legacyStatedValueWords: ex.statedValueWords,
    legacyStatedMarketValueInr: ex.statedMarketValueInr,
    legacyVisitDate: ex.visitDate,
    legacyReportDate: ex.reportDate,
    legacySignDate: ex.signDate,
    legacyRemarkVisitDate: ex.remarkVisitDate,
    legacyStageOfConstruction: ex.stageOfConstruction,
    legacyRemarksText: ex.remarksText,
    legacyDemolitionRisk: ex.demolitionRisk,
    surveyDeedNumbers: ex.surveyNumbersDeed,
    surveyPattaNumbers: ex.surveyNumbersRecord,

    esignStatus: 'PENDING',
    details: [
      { label: 'Extraction', value: meta.mode === 'LIVE_AI' ? 'Live Vision AI extraction (values as printed; engines compute all figures)' : 'Simulated Extraction Mode (no API key / offline)' },
      { label: 'Source files', value: meta.fileNames.join(', ') || '—' },
      { label: 'Trust Layer', value: 'No PRAMAAN live capture on this file — request owner self-capture to qualify for Instant / Remote routes' },
      { label: 'Coordinates', value: hasCoords ? `${ex.lat}, ${ex.lng}` : 'Not found in document — map centred on India (placeholder)' },
    ],
  };
}
