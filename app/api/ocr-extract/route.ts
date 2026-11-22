/* ------------------------------------------------------------------
   POST /api/ocr-extract — read property documents and extract form facts.

   Body: { docs: [{ name, text: string|null, images: string[] (JPEG data URLs) }] }
   1. OCR: digital-PDF text arrives pre-extracted (pdf.js in the browser);
      scanned pages / photos are transcribed by a FREE vision model
      (Sarvam Vision → free OpenRouter Nemotron VL → Gemma → …, Gemini last).
   2. Language + document type: deterministic (lib/engines/docFacts.ts).
   3. Facts: Sarvam sarvam-105b (Indian-language model; free OpenRouter model
      as fallback) copies field values verbatim, each tagged
      with its document; every value is verified to exist in that
      document's OCR text. Pattern-based extraction is the no-AI fallback.
   The model never computes: unit parsing, age and usage mapping are
   deterministic and happen on the client autofill step.
   ------------------------------------------------------------------ */
import { NextResponse } from 'next/server';
import { openRouterChat, OPENROUTER_FREE_VISION_CHAIN, OpenRouterError } from '@/lib/live/openrouter';
import { callGemini, extractJson } from '@/lib/live/gemini';
import { sarvamChat, sarvamConfigured, sarvamOcrImage } from '@/lib/live/sarvam';
import { quoteInSource } from '@/lib/engines/marketEvidence';
import { classifyDocType, detectLanguage, FACT_FIELDS, patternFacts, type DocFact, type DocType, type FactField } from '@/lib/engines/docFacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_DOCS = 6;
const MAX_IMAGES = 8;
const MAX_TEXT_PER_DOC = 6000;

interface InDoc {
  name: string;
  text: string | null;
  images: string[];
}

export interface OcrDocResult {
  name: string;
  docType: DocType;
  language: string;
  method: string;
  text: string;
  error?: string;
}

export interface OcrExtractResponse {
  docs: OcrDocResult[];
  facts: DocFact[];
  rejected: { field?: string; value?: string; doc?: number; reason: string }[];
  model: string;
  warnings: string[];
}

const OCR_PROMPT = `You are an OCR engine for Indian property documents (sale deeds, 7/12 extracts, pattas, property cards, sanctioned plans, tax receipts, electricity bills) in English, Hindi, Marathi, Tamil or other Indian languages.
Transcribe ALL text in this page image exactly as written, line by line, in the original script. Keep numbers, units and punctuation exactly. Do not translate, summarise or add anything. If a part is unreadable write [illegible].`;

async function ocrImage(dataUrl: string, name: string, deadline: number, orKey?: string, geminiKey?: string): Promise<{ text: string; method: string }> {
  // 1. Sarvam Vision — purpose-built Indic OCR (exact Devanagari / Tamil digits).
  if (sarvamConfigured()) {
    try {
      const r = await sarvamOcrImage(dataUrl, name, deadline);
      return { text: r.text, method: `OCR · ${r.model}` };
    } catch {
      /* fall through to free vision models */
    }
  }
  if (orKey) {
    try {
      const r = await openRouterChat(orKey, 'You transcribe documents exactly.', [{ type: 'text', text: OCR_PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }], deadline, OPENROUTER_FREE_VISION_CHAIN);
      return { text: r.text, method: `Vision OCR · ${r.model}` };
    } catch {
      /* fall through to Gemini */
    }
  }
  if (geminiKey) {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      const r = await callGemini(geminiKey, { contents: [{ role: 'user', parts: [{ text: OCR_PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }], generationConfig: { temperature: 0 } }, Math.max(5000, deadline - Date.now()));
      return { text: r.text, method: `Vision OCR · ${r.model}` };
    }
  }
  throw new Error('No vision OCR model available');
}

const EXTRACT_SYSTEM = `You are a strict data-extraction tool. You COPY text from the documents you are given. You never calculate, convert, translate, summarise or invent. Output ONLY a JSON array.`;

function extractPrompt(docs: OcrDocResult[]) {
  const body = docs.map((d, i) => `[D${i + 1}] ${d.name} — detected type: ${d.docType}, language: ${d.language}\n${d.text.slice(0, MAX_TEXT_PER_DOC)}`).join('\n\n-----\n\n');
  return `Extract property facts from these documents. Return a JSON array of objects:
{"field":"<FIELD>","value":"<text copied EXACTLY from the document>","doc":"D<number>","floorName":"<only for FLOOR_AREA_* fields>"}

FIELD is one of:
OWNER_NAME (current owner / purchaser / holder), ADDRESS (full property address), LOCALITY (area / village / mouza), CITY, STATE, PINCODE,
SURVEY_NUMBER (one object per survey / khasra / gat / CTS / SF number), PLOT_AREA (plot / land area including its unit, e.g. "167.22 sq. m." or "1800 sq. ft."),
FLOOR_AREA_SANCTIONED (area approved in the sanctioned plan, per floor, with unit), FLOOR_AREA_ACTUAL (built-up area per floor as stated, with unit),
PLAN_NUMBER (sanctioned plan / building permission number), CONSTRUCTION_YEAR (year of construction as printed), USAGE (tax class, tariff category or land use text),
ROAD_WIDTH (approach road width with unit), BOUNDARY_EAST, BOUNDARY_WEST, BOUNDARY_NORTH, BOUNDARY_SOUTH.

Rules:
- "value" MUST be copied character-for-character from that document's text, in its original language and script, including units.
- Do not convert units, do not translate, do not compute ages or totals.
- If a fact appears in several documents, return one object per document.
- Skip fields that are not present. Do not output Aadhaar, PAN or phone numbers.

DOCUMENTS:
${body}`;
}

function validateFacts(rows: unknown[], docs: OcrDocResult[], rejected: OcrExtractResponse['rejected']): DocFact[] {
  const out: DocFact[] = [];
  for (const r of rows.slice(0, 80)) {
    const o = (r ?? {}) as Record<string, unknown>;
    const field = String(o.field ?? '').toUpperCase() as FactField;
    const value = typeof o.value === 'string' ? o.value.trim().slice(0, 300) : '';
    const doc = Number(String(o.doc ?? '').replace(/\D/g, '')) - 1;
    if (!FACT_FIELDS.includes(field)) {
      rejected.push({ field, value, reason: 'Unknown field' });
      continue;
    }
    if (!value || !docs[doc]) {
      rejected.push({ field, value, reason: 'Missing value or document reference' });
      continue;
    }
    if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(value) || /\b[A-Z]{5}\d{4}[A-Z]\b/.test(value)) {
      rejected.push({ field, doc, reason: 'Looks like an Aadhaar / PAN number — discarded' });
      continue;
    }
    // Anti-hallucination: the value must exist in that document's OCR text.
    if (!quoteInSource(value, docs[doc].text)) {
      rejected.push({ field, value, doc, reason: 'Value not found in the document text' });
      continue;
    }
    const floorName = typeof o.floorName === 'string' && o.floorName.trim() ? o.floorName.trim().slice(0, 60) : undefined;
    out.push({ field, value, doc, floorName: field.startsWith('FLOOR_AREA') ? floorName ?? 'Floor' : undefined, origin: 'AI' });
  }
  return out;
}

export async function POST(req: Request) {
  const started = Date.now();
  let body: { docs?: InDoc[] };
  try {
    body = (await req.json()) as { docs?: InDoc[] };
  } catch {
    return NextResponse.json({ error: 'Expected JSON body (upload may be too large — use fewer / smaller pages)' }, { status: 400 });
  }
  const inDocs = (body.docs ?? []).slice(0, MAX_DOCS).map((d) => ({
    name: String(d.name ?? 'document').slice(0, 120),
    text: typeof d.text === 'string' ? d.text.slice(0, 20000) : null,
    images: Array.isArray(d.images) ? d.images.filter((x) => typeof x === 'string' && x.startsWith('data:image/')) : [],
  }));
  if (!inDocs.length) return NextResponse.json({ error: 'No documents' }, { status: 400 });
  if (inDocs.reduce((s, d) => s + d.images.length, 0) > MAX_IMAGES) return NextResponse.json({ error: `Maximum ${MAX_IMAGES} page images per upload` }, { status: 400 });

  const orKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const warnings: string[] = [];

  /* 1. OCR (parallel across pages) */
  const ocrDeadline = started + 30000;
  const docs: OcrDocResult[] = await Promise.all(
    inDocs.map(async (d) => {
      if (d.text && d.text.trim().length > 0) return { name: d.name, text: d.text, method: 'PDF text layer (no OCR needed)' } as const;
      try {
        const pages = await Promise.all(d.images.map((img, k) => ocrImage(img, `${d.name}-p${k + 1}`, ocrDeadline, orKey, geminiKey)));
        return { name: d.name, text: pages.map((p) => p.text).join('\n\n'), method: pages[0]?.method ?? 'Vision OCR' } as const;
      } catch (e) {
        return { name: d.name, text: '', method: 'OCR failed', error: e instanceof Error ? e.message : 'OCR failed' } as const;
      }
    }),
  ).then((rs) => rs.map((r) => ({ ...r, docType: classifyDocType(r.text, r.name), language: r.text ? detectLanguage(r.text) : '—' })));

  docs.filter((d) => d.error).forEach((d) => warnings.push(`${d.name}: ${d.error}`));
  const readable = docs.filter((d) => d.text.trim().length > 0);
  if (!readable.length) {
    return NextResponse.json({ docs, facts: [], rejected: [], model: 'none', warnings: [...warnings, 'No document text could be read — fill the form manually.'] } satisfies OcrExtractResponse);
  }

  /* 2. Facts */
  const rejected: OcrExtractResponse['rejected'] = [];
  let facts: DocFact[] = [];
  let model = 'Pattern extractor (no AI)';
  // Extractors in order: Sarvam (Indian-language model) → free OpenRouter model → patterns.
  const extractors: { name: string; run: () => Promise<{ model: string; text: string }> }[] = [];
  if (sarvamConfigured()) extractors.push({ name: 'Sarvam', run: () => sarvamChat(EXTRACT_SYSTEM, extractPrompt(docs), started + 50000) });
  if (orKey) extractors.push({ name: 'OpenRouter', run: () => openRouterChat(orKey, EXTRACT_SYSTEM, extractPrompt(docs), started + 52000) });
  for (const ex of extractors) {
    try {
      const r = await ex.run();
      const parsed = extractJson(r.text);
      facts = validateFacts(Array.isArray(parsed) ? parsed : [], docs, rejected);
      model = r.model;
      break;
    } catch (e) {
      warnings.push(`${ex.name}: ${e instanceof OpenRouterError || e instanceof Error ? e.message.slice(0, 160) : 'unusable output'}`);
    }
  }
  if (extractors.length && model.startsWith('Pattern')) warnings.push('AI extraction unavailable — used pattern extractor.');
  // Pattern facts fill any field the AI did not return (and are the full fallback without AI).
  const have = new Set(facts.map((f) => `${f.field}|${f.doc}`));
  docs.forEach((d, i) => {
    if (!d.text) return;
    for (const pf of patternFacts(d.text, i)) if (!have.has(`${pf.field}|${i}`) || pf.field === 'SURVEY_NUMBER') {
      if (!facts.some((f) => f.field === pf.field && f.doc === i && f.value === pf.value)) facts.push(pf);
    }
  });

  return NextResponse.json({ docs, facts, rejected, model, warnings } satisfies OcrExtractResponse);
}
