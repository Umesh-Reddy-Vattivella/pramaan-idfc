/* ------------------------------------------------------------------
   Browser-only document preparation for OCR.
   - Digital PDFs: text layer extracted locally with pdf.js (no AI, instant).
   - Scanned PDFs: first pages rendered to compressed JPEG for vision OCR.
   - Photos: downscaled to compressed JPEG for vision OCR.
   Keeps the upload small (serverless request bodies are limited to ~4.5 MB).
   ------------------------------------------------------------------ */

export interface PreparedDoc {
  name: string;
  mime: string;
  pages: number;
  /** Text layer from a digital PDF (null when the document needs vision OCR). */
  text: string | null;
  /** JPEG data URLs for vision OCR. */
  images: string[];
  bytes: number;
}

const MAX_SIDE = 1600;
const MAX_PDF_PAGES = 3;
const JPEG_QUALITY = 0.72;
const MIN_TEXT_CHARS_PER_PAGE = 40;

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function imageFileToJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToJpeg(canvas);
}

async function pdfToDoc(file: File): Promise<Omit<PreparedDoc, 'name' | 'mime' | 'bytes'>> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = pdf.numPages;
  const n = Math.min(pages, 6);

  // 1. Try the text layer (digital PDFs).
  const texts: string[] = [];
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    texts.push(line);
  }
  const text = texts.join('\n\n');
  if (text.length >= MIN_TEXT_CHARS_PER_PAGE * n) return { pages, text, images: [] };

  // 2. Scanned PDF → render the first pages for vision OCR.
  const images: string[] = [];
  for (let i = 1; i <= Math.min(pages, MAX_PDF_PAGES); i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, MAX_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    images.push(canvasToJpeg(canvas));
  }
  return { pages, text: null, images };
}

export async function prepareDoc(file: File): Promise<PreparedDoc> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const d = await pdfToDoc(file);
    return { name: file.name, mime: 'application/pdf', bytes: file.size, ...d };
  }
  if (file.type.startsWith('image/')) {
    return { name: file.name, mime: file.type, bytes: file.size, pages: 1, text: null, images: [await imageFileToJpeg(file)] };
  }
  throw new Error(`${file.name}: unsupported file type (use PDF, JPG, PNG or WEBP)`);
}

/** Approximate request size in bytes (data URLs are already base64). */
export function payloadBytes(docs: PreparedDoc[]): number {
  return docs.reduce((s, d) => s + (d.text?.length ?? 0) + d.images.reduce((a, i) => a + i.length, 0), 0);
}
