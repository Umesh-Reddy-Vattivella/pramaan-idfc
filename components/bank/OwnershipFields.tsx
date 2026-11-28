'use client';

/* How the customer got the property + what they paid + what they claim it is worth (Valuation Logic v2 §1A, component C).
   The purchase price, brought to today, is a second weighted component of the rate (capped at 30%);
   the claimed value is a cross-check only (T20) and never enters the value. */
import type { Acquisition, Ownership, PropertyType, PurchaseAreaUnit, PurchaseCovered } from '@/lib/domain/types';
import { isUnit } from '@/lib/domain/catalog';
import { Field } from '@/components/ui';

export interface OwnershipDraft {
  acquiredBy: Acquisition | '';
  purchaseMonth: string;
  price: string;
  covered: PurchaseCovered | '';
  areaBought: string;
  areaUnit: PurchaseAreaUnit;
  constructedAfter: '' | 'yes' | 'no';
  constructedYear: string;
  deedDocNo: string;
  claimed: string;
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));

export function draftOf(o?: Ownership): OwnershipDraft {
  return {
    acquiredBy: o?.acquiredBy ?? '',
    purchaseMonth: o?.purchaseMonth ?? '',
    price: str(o?.priceInr),
    covered: o?.covered ?? '',
    areaBought: str(o?.areaBought),
    areaUnit: o?.areaUnit ?? 'SQFT',
    constructedAfter: o?.constructedAfter === true ? 'yes' : o?.constructedAfter === false ? 'no' : '',
    constructedYear: str(o?.constructedYear),
    deedDocNo: o?.deedDocNo ?? '',
    claimed: str(o?.claimedValueInr),
  };
}

export function ownershipOf(d: OwnershipDraft): Partial<Ownership> {
  const bought = d.acquiredBy === 'PURCHASED';
  return {
    acquiredBy: d.acquiredBy || null,
    purchaseMonth: bought ? d.purchaseMonth || undefined : undefined,
    priceInr: bought ? num(d.price) : null,
    covered: bought ? d.covered || null : null,
    areaBought: bought ? num(d.areaBought) : null,
    areaUnit: d.areaUnit,
    constructedAfter: bought && d.covered === 'PLOT' ? (d.constructedAfter === 'yes' ? true : d.constructedAfter === 'no' ? false : null) : null,
    constructedYear: bought && d.constructedAfter === 'yes' ? num(d.constructedYear) : null,
    deedDocNo: bought ? d.deedDocNo || undefined : undefined,
    claimedValueInr: num(d.claimed),
  };
}

export const COVERED_LABEL: Record<PurchaseCovered, string> = { PLOT: 'Plot only', PLOT_BUILDING: 'Plot + building', UNIT: 'Flat / unit' };

export default function OwnershipFields({ value, onChange, type }: { value: OwnershipDraft; onChange: (d: OwnershipDraft) => void; type: PropertyType }) {
  const set = (k: keyof OwnershipDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  const bought = value.acquiredBy === 'PURCHASED';
  const covers: PurchaseCovered[] = isUnit(type) ? ['UNIT'] : type === 'PLOT' ? ['PLOT'] : ['PLOT', 'PLOT_BUILDING'];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="How the customer got the property">
        <select className="input" value={value.acquiredBy} onChange={set('acquiredBy')}>
          <option value="">Not recorded</option>
          <option value="PURCHASED">Purchased</option>
          <option value="INHERITED">Inherited</option>
          <option value="GIFTED">Gifted</option>
          <option value="SELF_BUILT">Self-built</option>
        </select>
      </Field>
      {bought && (
        <>
          <Field label="Month and year of purchase">
            <input className="input" type="month" value={value.purchaseMonth} onChange={set('purchaseMonth')} max={new Date().toISOString().slice(0, 7)} />
          </Field>
          <Field label="Price paid (₹)" hint="Consideration on the sale deed.">
            <input className="input" value={value.price} onChange={set('price')} inputMode="numeric" placeholder="e.g. 7200000" />
          </Field>
          <Field label="What the price covered">
            <select className="input" value={value.covered} onChange={set('covered')}>
              <option value="">Select</option>
              {covers.map((c) => (
                <option key={c} value={c}>
                  {COVERED_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Area bought" hint="Only if different from today’s area.">
            <div className="flex gap-1">
              <input className="input" value={value.areaBought} onChange={set('areaBought')} inputMode="decimal" />
              <select className="input w-24" value={value.areaUnit} onChange={set('areaUnit')}>
                <option value="SQFT">sqft</option>
                <option value="SQYD">sq yd</option>
                <option value="SQM">sq m</option>
              </select>
            </div>
          </Field>
          {value.covered === 'PLOT' && type !== 'PLOT' && (
            <Field label="Construction after purchase">
              <div className="flex gap-1">
                <select className="input" value={value.constructedAfter} onChange={set('constructedAfter')}>
                  <option value="">—</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                {value.constructedAfter === 'yes' && <input className="input w-24" value={value.constructedYear} onChange={set('constructedYear')} inputMode="numeric" placeholder="year" />}
              </div>
            </Field>
          )}
          <Field label="Sale deed document no." hint="Optional — for later EC verification.">
            <input className="input" value={value.deedDocNo} onChange={set('deedDocNo')} placeholder="e.g. 4521/2021" />
          </Field>
        </>
      )}
      <Field label="Customer’s claimed value (₹)" hint="Cross-check only — never used in the valuation.">
        <input className="input" value={value.claimed} onChange={set('claimed')} inputMode="numeric" />
      </Field>
    </div>
  );
}
