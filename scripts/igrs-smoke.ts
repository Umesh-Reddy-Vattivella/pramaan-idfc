/* npx tsx scripts/igrs-smoke.ts — live read of the Telangana IGRS Market Value Search (no login). */
import { igrsDistricts, igrsLocalities, igrsMandals, igrsRates, igrsVillages } from '../lib/live/igrsTelangana';

async function main() {
  const d = await igrsDistricts();
  console.log('districts', d.length, d.slice(0, 3));
  const rr = d.find((x) => x.name === 'RANGAREDDY')!;
  const m = await igrsMandals(rr.code);
  const g = m.find((x) => x.name === 'GANDIPET')!;
  const v = await igrsVillages(rr.code, g.code);
  const k = v.find((x) => x.name === 'KOKAPET')!;
  console.log('mandals', m.length, 'villages', v.length, k);
  for (const searchBy of ['L', 'A'] as const) {
    const r = await igrsRates({ district: rr.code, districtName: rr.name, mandal: g.code, mandalName: g.name, village: k.code, villageName: k.name, searchBy });
    console.log(searchBy, r.header, '|', r.rows.length, 'rows', r.cached ? '(cached)' : '');
    console.log(r.rows.slice(0, 3));
  }
  const loc = await igrsLocalities('1600001', 'BANJARA');
  console.log('hyd localities', loc);
  const h = await igrsRates({ district: '16_1', districtName: 'HYDERABAD', division: '1600001', locality: loc[1].code, localityName: loc[1].name, searchBy: 'L' });
  console.log('hyd', h.header, h.rows);
}
main().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
