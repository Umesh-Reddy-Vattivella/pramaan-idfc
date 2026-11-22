/* ------------------------------------------------------------------
   POST /api/analyze-live  (PRD §5.3)
   multipart/form-data: files[] (PDF appraisal report and/or property photos)
   - GEMINI_API_KEY set → Gemini 2.5 Flash vision extraction with a strict JSON schema.
   - No key / AI failure → deterministic Simulated Extraction Mode (never errors on stage).
   Extracted JSON is piped through lib/engines/evaluateCase — the LLM never computes figures.
   ------------------------------------------------------------------ */
import { NextResponse } from 'next/server';
import { evaluateCase } from '@/lib/engines/evaluateCase';
import { callGemini, extractJson } from '@/lib/live/gemini';
import {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  extractionToCase,
  sanitizeExtraction,
  simulatedExtraction,
  type AnalyzeLiveResponse,
  type ExtractedReport,
  type ExtractionMode,
} from '@/lib/live/extraction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024; // keep inline payload under Gemini's request limit
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

async function extractWithGemini(files: File[], apiKey: string): Promise<{ extracted: ExtractedReport; model: string }> {
  const parts: Record<string, unknown>[] = [{ text: EXTRACTION_PROMPT }];
  for (const f of files) {
    const data = Buffer.from(await f.arrayBuffer()).toString('base64');
    parts.push({ inline_data: { mime_type: f.type, data } });
  }
  const r = await callGemini(apiKey, {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: EXTRACTION_SCHEMA },
  });
  return { extracted: sanitizeExtraction(extractJson(r.text)), model: r.model };
}

export async function POST(req: Request) {
  const t0 = Date.now();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with files[]' }, { status: 400 });
  }

  const files = form.getAll('files').filter((x): x is File => typeof x === 'object' && x !== null && 'arrayBuffer' in x);
  if (files.length === 0) return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Maximum ${MAX_FILES} files` }, { status: 400 });
  const bad = files.find((f) => !ALLOWED.has(f.type));
  if (bad) return NextResponse.json({ error: `Unsupported file type: ${bad.name} (${bad.type || 'unknown'})` }, { status: 415 });
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) return NextResponse.json({ error: 'Upload exceeds 18 MB total' }, { status: 413 });

  const fileNames = files.map((f) => f.name);
  const apiKey = process.env.GEMINI_API_KEY;
  let model: string | undefined;

  let mode: ExtractionMode = 'SIMULATED';
  let warning: string | undefined;
  let extracted: ExtractedReport;

  if (apiKey) {
    try {
      const r = await extractWithGemini(files, apiKey);
      extracted = r.extracted;
      model = r.model;
      mode = 'LIVE_AI';
    } catch (err) {
      warning = `Live AI extraction unavailable (${err instanceof Error ? err.message : 'error'}) — fell back to Simulated Extraction Mode.`;
      extracted = simulatedExtraction(fileNames);
    }
  } else {
    warning = 'No GEMINI_API_KEY configured — Simulated Extraction Mode.';
    extracted = simulatedExtraction(fileNames);
  }

  const id = `live-upload-${Date.now().toString(36)}`;
  const tatMinutes = Math.max(1, Math.round((Date.now() - t0) / 60000));
  const propertyCase = extractionToCase(extracted, { id, mode, fileNames, tatMinutes });
  const ev = evaluateCase(propertyCase);

  const body: AnalyzeLiveResponse = {
    mode,
    model: mode === 'LIVE_AI' ? model : undefined,
    warning,
    files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    extracted,
    case: propertyCase,
    summary: { tier: ev.routing.tier, score: ev.price.authenticity.score, mvFinal: ev.valuation.mvFinal },
  };
  return NextResponse.json(body);
}
