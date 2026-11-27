'use client';

/**
 * Add a registered sale from a Maharashtra Index II. The valuer looks the sale up on IGR's free search in their own
 * browser (the captcha is theirs to solve — PRAMAAN never automates it), uploads the printout / PDF, Gemini copies
 * the printed fields, and the valuer confirms every field before the SALE point is added.
 */
import { useMemo, useRef, useState } from 'react';
import { ExternalLink, FileSearch, Loader2, MapPin, Upload } from 'lucide-react';
import type { EvidenceCategory, MarketPoint } from '@/lib/domain/types';
import { isUnit } from '@/lib/domain/catalog';
import { AREA_UNITS, areaToSqft, type AreaUnit } from '@/lib/engines/parse';
import { pointRate } from '@/lib/engines/evidence';
import { inr, rate } from '@/lib/engines/format';
import { api } from '@/lib/client/api';
import { fileUrl, prepareUpload } from '@/lib/client/files';
import type { AppCtl } from '@/lib/client/useApplication';
import type { IndexIIDraft } from '@/lib/server/indexII';
import { Field, Notice } from '@/components/ui';

export const IGR_FREE_SEARCH_URL = 'https://freesearchigrservice.maharashtra.gov.in/';

const blank = { docNo: '', office: '', regDate: '', consideration: '', govtValue: '', area: '', unit: 'SQFT' as AreaUnit, property: '', locality: '', lat: '', lng: '' };

export default function RegisteredSale({ ctl }: { ctl: AppCtl }) {
  const a = ctl.app!;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [category, setCategory] = useState<EvidenceCategory>(isUnit(a.property.type) ? 'BUILT' : 'LAND');
  const [doc, setDoc] = useState<{ fileId: string; fileName: string } | null>(null);
  const [draft, setDraft] = useState<IndexIIDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const consideration = Number(f.consideration) || null;
  const govtValue = Number(f.govtValue) || null;
  const areaSqft = f.area ? areaToSqft(Number(f.area), f.unit) : null;
  const previewRate = useMemo(() => (consideration && areaSqft ? pointRate({ id: '', category, kind: 'SALE', priceInr: consideration, areaSqft, origin: 'MANUAL', included: true }) : null), [consideration, areaSqft, category]);
  const below = consideration !== null && govtValue !== null && consideration < govtValue;

  const reset = () => {
    setF(blank);
    setDoc(null);
    setDraft(null);
    setNote(null);
    setErr(null);
  };

  const upload = async (file: File) => {
    setErr(null);
    setNote(null);
    setReading(true);
    try {
      const u = await prepareUpload(file);
      const j = await api<{ fileId: string; fileName: string; draft?: IndexIIDraft; warning?: string }>(`/api/applications/${a.id}/index2`, { body: { fileName: u.fileName, mime: u.mime, dataBase64: u.dataBase64 } });
      setDoc({ fileId: j.fileId, fileName: j.fileName });
      if (j.warning) setNote(j.warning);
      if (j.draft) {
        const d = j.draft;
        setDraft(d);
        setF((x) => ({
          ...x,
          docNo: d.copied.docNo ?? x.docNo,
          office: d.copied.office ?? x.office,
          regDate: d.parsed.regDate ?? x.regDate,
          consideration: d.parsed.considerationInr ? String(d.parsed.considerationInr) : x.consideration,
          govtValue: d.parsed.govtValueInr ? String(d.parsed.govtValueInr) : x.govtValue,
          area: d.parsed.areaSqft ? String(d.parsed.areaSqft) : x.area,
          unit: d.parsed.areaSqft ? 'SQFT' : x.unit,
          property: d.copied.property ?? x.property,
          locality: d.copied.village ?? x.locality,
        }));
        const misses = [!d.parsed.considerationInr && 'consideration', !d.parsed.areaSqft && 'area', !d.parsed.regDate && 'date'].filter(Boolean);
        setNote(
          `Fields copied by ${d.model}. Check each one against the document${misses.length ? ` — could not read: ${misses.join(', ')}` : ''}.${d.looksLikeSale === false ? ` The document type reads "${d.copied.documentType}", which may not be a sale.` : ''}`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setReading(false);
    }
  };

  const locate = async () => {
    const q = [f.locality, a.property.city, a.property.state].filter(Boolean).join(', ');
    if (q.length < 3) return setErr('Enter the village / locality first.');
    setLocating(true);
    setErr(null);
    try {
      const j = await api<{ results: { lat: number; lng: number; displayName: string }[] }>(`/api/geocode?q=${encodeURIComponent(q)}`);
      const hit = j.results[0];
      if (!hit) setErr(`No map location found for “${q}”. Enter latitude / longitude, or leave blank (distance unknown).`);
      else setF((x) => ({ ...x, lat: hit.lat.toFixed(6), lng: hit.lng.toFixed(6) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not locate');
    } finally {
      setLocating(false);
    }
  };

  const add = async () => {
    setErr(null);
    if (!consideration || !areaSqft) return setErr('Enter the consideration and the area.');
    const c = draft?.copied;
    const quote = c ? [c.consideration && `मोबदला ${c.consideration}`, c.govtValue && `बाजारभाव ${c.govtValue}`, c.area && `क्षेत्रफळ ${c.area}`].filter(Boolean).join(' · ') : undefined;
    const point: MarketPoint = {
      id: '',
      category,
      kind: 'SALE',
      priceInr: consideration,
      areaSqft,
      date: f.regDate || undefined,
      title: `Index II${f.docNo ? ` · Doc ${f.docNo}` : ''}${f.office ? ` · ${f.office}` : ''}`,
      propertyType: f.property || 'Registered sale',
      locality: f.locality || undefined,
      lat: f.lat ? Number(f.lat) : undefined,
      lng: f.lng ? Number(f.lng) : undefined,
      quote,
      origin: 'MANUAL',
      included: true,
      registration: { docNo: f.docNo || undefined, office: f.office || undefined, regDate: f.regDate || undefined, considerationInr: consideration, govtValueInr: govtValue ?? undefined, fileId: doc?.fileId },
    };
    if (await ctl.run({ op: 'addPoint', point })) {
      reset();
      setOpen(false);
    }
  };

  if (!open)
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <FileSearch className="h-4 w-4" /> Add registered sale (Index II)
      </button>
    );

  return (
    <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="mb-1 text-sm font-semibold">Registered sale from Index II (सूची क्र. 2)</div>
      <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
        <li>
          Open{' '}
          <a href={IGR_FREE_SEARCH_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-sky-700 hover:underline">
            IGR Maharashtra free search <ExternalLink className="h-3 w-3" />
          </a>{' '}
          → search by property: district <b>{a.property.city || '—'}</b>, village / locality <b>{a.property.locality || '—'}</b>, a nearby survey / plot number, year.
        </li>
        <li>Solve the captcha, open the IndexII of a recent sale near the property and save it as PDF or take a screenshot.</li>
        <li>Upload it here — the fields are copied for you to check — or type them in.</li>
      </ol>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button className="btn-secondary" disabled={reading} onClick={() => input.current?.click()}>
          {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {reading ? 'Reading the Index II…' : doc ? 'Upload a different file' : 'Upload Index II (PDF / photo)'}
        </button>
        {doc && (
          <a href={fileUrl(doc.fileId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">
            {doc.fileName} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {note && <div className="mb-3"><Notice tone="amber">{note}</Notice></div>}
      {err && <div className="mb-3"><Notice tone="red">{err}</Notice></div>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Document no. (दस्त क्र.)">
          <input className="input" value={f.docNo} onChange={set('docNo')} placeholder="1234/2026" />
        </Field>
        <Field label="Sub-registrar office">
          <input className="input" value={f.office} onChange={set('office')} placeholder="Nagpur 4" />
        </Field>
        <Field label="Registration date">
          <input className="input" type="date" value={f.regDate} onChange={set('regDate')} />
        </Field>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as EvidenceCategory)}>
            <option value="LAND">Land / plot</option>
            <option value="BUILT">Built property</option>
          </select>
        </Field>
        <Field label="Consideration ₹ (मोबदला)" hint={draft?.copied.consideration ? `printed: ${draft.copied.consideration}` : undefined}>
          <input className="input" value={f.consideration} onChange={set('consideration')} inputMode="numeric" />
        </Field>
        <Field label="Govt market value ₹ (बाजारभाव)" hint={draft?.copied.govtValue ? `printed: ${draft.copied.govtValue}` : 'optional — used for the under-declaration check'}>
          <input className="input" value={f.govtValue} onChange={set('govtValue')} inputMode="numeric" />
        </Field>
        <Field label="Area (क्षेत्रफळ)" hint={draft?.copied.area ? `printed: ${draft.copied.area}` : undefined}>
          <div className="flex gap-1">
            <input className="input" value={f.area} onChange={set('area')} inputMode="decimal" />
            <select className="input w-auto" value={f.unit} onChange={set('unit')}>
              {(Object.keys(AREA_UNITS) as AreaUnit[]).map((u) => (
                <option key={u} value={u}>
                  {AREA_UNITS[u].label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="Property description">
          <input className="input" value={f.property} onChange={set('property')} placeholder="Plot no. 12, Kh. no. 45" />
        </Field>
        <Field label="Village / locality">
          <input className="input" value={f.locality} onChange={set('locality')} />
        </Field>
        <Field label="Latitude, longitude" hint="for distance from the property">
          <div className="flex gap-1">
            <input className="input" value={f.lat} onChange={set('lat')} placeholder="lat" />
            <input className="input" value={f.lng} onChange={set('lng')} placeholder="lng" />
            <button className="btn-ghost px-2" title="Locate the village / locality on the map" onClick={locate} disabled={locating}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex flex-col justify-end rounded-lg bg-white p-2.5 text-xs sm:col-span-2">
          <div className="text-slate-500">Rate used (consideration ÷ area)</div>
          <div className="text-base font-bold text-ink">{previewRate ? rate(previewRate) : '—'}</div>
          <div className="text-[11px] text-slate-500">
            {areaSqft ? `${areaSqft.toLocaleString('en-IN')} sqft` : 'area —'} · {consideration ? inr(consideration) : 'consideration —'}
          </div>
          {below && <div className="mt-1 font-semibold text-amber-700">Price is below the government value on the deed — possible under-declaration (flagged in Sanity).</div>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" onClick={add} disabled={ctl.busy || reading || !consideration || !areaSqft}>
          Add registered sale
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
