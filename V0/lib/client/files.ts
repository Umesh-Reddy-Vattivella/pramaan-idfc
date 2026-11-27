/* Browser-side file preparation for document uploads (one file per document slot). */

export interface PreparedUpload {
  fileName: string;
  mime: string;
  dataBase64: string;
  preview?: string;
}

const MAX_BYTES = 3 * 1024 * 1024;

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

async function drawScaled(file: File, max: number, quality: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * s);
  cv.height = Math.round(bmp.height * s);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', quality));
}

/** Photos are compressed to ≤ 1800 px JPEG (readable documents, small upload); PDFs are sent as-is (≤ 3 MB). */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) throw new Error('PDF is larger than 3 MB — please upload a smaller scan or photos of the pages.');
    return { fileName: file.name, mime: file.type, dataBase64: await blobToBase64(file) };
  }
  if (!file.type.startsWith('image/')) throw new Error('Please upload a photo or a PDF.');
  const full = await drawScaled(file, 1800, 0.8);
  if (full.size > MAX_BYTES) throw new Error('Image too large.');
  const thumb = await drawScaled(file, 200, 0.6);
  const name = file.name.replace(/\.(heic|heif|png|webp)$/i, '.jpg');
  return { fileName: name, mime: 'image/jpeg', dataBase64: await blobToBase64(full), preview: `data:image/jpeg;base64,${await blobToBase64(thumb)}` };
}

export const fileUrl = (id: string) => `/api/files/${id}`;

export function formatBytes(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
