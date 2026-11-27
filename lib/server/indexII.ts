/* ------------------------------------------------------------------
   Index II (Maharashtra registered-document summary) → a draft SALE point.
   The valuer obtains the Index II from IGR's free search in their own browser
   (the portal's captcha is solved by a person; PRAMAAN never automates it) and
   uploads the printout / PDF. Gemini only COPIES printed fields; amounts, area
   and date are parsed deterministically; the valuer confirms every field
   before the point is added.
   ------------------------------------------------------------------ */
import { geminiChat } from '@/lib/live/gemini';
import { parseAreaSqft, parseIndianDate, parseInrAmount } from '@/lib/engines/parse';

export interface IndexIIDraft {
  /** Exact text copied from the document (shown to the valuer). */
  copied: {
    docNo?: string;
    office?: string;
    documentType?: string;
    regDate?: string;
    consideration?: string;
    govtValue?: string;
    area?: string;
    property?: string;
    village?: string;
  };
  /** Deterministically parsed values (null where the copied text could not be parsed). */
  parsed: {
    regDate: string | null;
    considerationInr: number | null;
    govtValueInr: number | null;
    areaSqft: number | null;
  };
  /** True if the document type reads as a sale / conveyance. */
  looksLikeSale: boolean | null;
  model: string;
}

const SYSTEM = `You are a strict data-extraction tool for an Indian bank's property valuation system.
You read a Maharashtra "Index II" (सूची क्र. 2) registered-document summary, which may be in Marathi, English or both.
You COPY text exactly as printed. You never calculate, convert, translate numbers, round, estimate or invent anything.
Output ONLY one JSON object. No prose, no markdown.`;

const PROMPT = `Copy these fields from the Index II exactly as printed (keep Devanagari digits and unit words as they appear). Use null if a field is not printed.
{
 "docNo": "<registered document number / दस्त क्रमांक, as printed, e.g. 1234/2025>",
 "office": "<sub-registrar office / दुय्यम निबंधक, as printed>",
 "documentType": "<type of document / विलेखाचा प्रकार, e.g. खरेदीखत, Sale Deed>",
 "regDate": "<date of registration / नोंदणीचा दिनांक, as printed>",
 "consideration": "<consideration amount / मोबदला, as printed>",
 "govtValue": "<market value / बाजारभाव as assessed for stamp duty, as printed>",
 "area": "<area of the property / क्षेत्रफळ with its unit, as printed>",
 "property": "<property description / भू-मापन, पोटहिस्सा व घरक्रमांक — short, as printed>",
 "village": "<village / locality / गाव, as printed>"
}`;

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, max) : undefined);

function extractJsonObject(text: string): Record<string, unknown> {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return {};
  try {
    const o = JSON.parse(t.slice(a, b + 1));
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function readIndexII(apiKey: string, mime: string, dataBase64: string): Promise<IndexIIDraft> {
  const r = await geminiChat(apiKey, SYSTEM, [{ inlineData: { mimeType: mime, data: dataBase64 } }, { text: PROMPT }], { json: true, deadline: Date.now() + 45_000 });
  const o = extractJsonObject(r.text);
  const copied: IndexIIDraft['copied'] = {
    docNo: str(o.docNo, 60),
    office: str(o.office, 120),
    documentType: str(o.documentType, 80),
    regDate: str(o.regDate, 40),
    consideration: str(o.consideration, 80),
    govtValue: str(o.govtValue, 80),
    area: str(o.area, 160),
    property: str(o.property, 200),
    village: str(o.village, 100),
  };
  const looksLikeSale = copied.documentType ? /sale|conveyance|खरेदी|विक्री/i.test(copied.documentType) : null;
  return {
    copied,
    parsed: {
      regDate: parseIndianDate(copied.regDate),
      considerationInr: copied.consideration ? parseInrAmount(copied.consideration) : null,
      govtValueInr: copied.govtValue ? parseInrAmount(copied.govtValue) : null,
      areaSqft: copied.area ? parseAreaSqft(copied.area) : null,
    },
    looksLikeSale,
    model: r.model,
  };
}
