#!/usr/bin/env node
// Smoke-test tegen de live URL. Gebruik: node scripts/smoke.mjs [baseUrl] [--wait-commit <sha>]
// Exitcode 1 bij falen. Basis-URL ook via env SMOKE_BASE_URL.
const args = process.argv.slice(2);
const waitIdx = args.indexOf('--wait-commit');
const waitSha = waitIdx >= 0 ? args.splice(waitIdx, 2)[1] : null;
const BASE = (args[0] || process.env.SMOKE_BASE_URL || 'https://vastgoed-analyse-v84x.vercel.app').replace(/\/$/, '');

const LOCATIES = [
  { naam: 'Montpellier', lat: 43.6108, lon: 3.8767, insee: '34172', dep: '34' },
  { naam: 'Marseille', lat: 43.2965, lon: 5.3698, insee: '13055', dep: '13' },
  { naam: 'Bordeaux', lat: 44.8378, lon: -0.5792, insee: '33063', dep: '33' },
  { naam: 'Aubusson (Creuse)', lat: 45.9553, lon: 2.1685, insee: '23008', dep: '23' },
];
const RISQUE_BRONNEN = ['gaspar', 'radon', 'zonage_sismique', 'icpe', 'cavites', 'sis'];
const BRON_STATUS = new Set(['ok', 'leeg', 'time-out', 'fout']);
const DEEL_STATUS = new Set(['ok', 'leeg', 'deels', 'niet_beschikbaar', 'time-out', 'fout']);

const rows = [];
let failed = 0;
const risqueUit = {};   // locatie -> true als geen enkele Géorisques-bron bereikbaar was
let healthRisques = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, timeoutMs = 70000) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'vastgoed-smoke/1.0' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* geen JSON */ }
  return { status: res.status, json, ms: Date.now() - t0 };
}

async function check(loc, route, fn) {
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, ms: 0, note: String(e.message || e) }; }
  if (!r.ok) failed++;
  rows.push({ locatie: loc, route, resultaat: r.ok ? 'PASS' : 'FAIL', ms: r.ms, opmerking: r.note || '' });
}

const maandenTerug = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };

if (waitSha) {
  const deadline = Date.now() + 8 * 60 * 1000;
  let seen = null;
  while (Date.now() < deadline) {
    try { seen = (await get(`/api/health?quick=1&cb=${Date.now()}`, 15000)).json?.commit; } catch { /* nog niet klaar */ }
    if (seen === waitSha) break;
    await sleep(15000);
  }
  if (seen !== waitSha) { console.error(`Deploy van ${waitSha} niet gezien op ${BASE} (laatst gezien: ${seen})`); process.exit(1); }
  console.log(`Deploy ${waitSha.slice(0, 7)} actief op ${BASE}`);
}

for (const L of LOCATIES) {
  const q = `lat=${L.lat}&lon=${L.lon}`;
  await check(L.naam, 'dvf', async () => {
    const r = await get(`/api/dvf?${q}&radius=5&code_insee=${L.insee}&dep=${L.dep}`);
    const m = r.json?.meta, n = r.json?.transactions?.length || 0;
    const fouten = [];
    if (r.status !== 200) fouten.push(`HTTP ${r.status}`);
    if (!n) fouten.push('geen transacties');
    if (!m?.laatste_datum) fouten.push('geen meta.laatste_datum');
    else if (m.laatste_datum < maandenTerug(12)) fouten.push(`laatste_datum ${m.laatste_datum} ouder dan 12 maanden`);
    if (m?.verouderd) fouten.push('terugvalbron (verouderd)');
    return { ok: !fouten.length, ms: r.ms, note: fouten.join('; ') || `${n} tx, t/m ${m?.laatste_datum}, jaren ${m?.jaren?.join(',')}, mediaan ${r.json?.statistiek?.alle?.mediaan_m2 ?? '-'}` };
  });
  await check(L.naam, 'risques', async () => {
    const r = await get(`/api/risques?${q}&code_insee=${L.insee}`);
    const b = r.json?.bronnen;
    const fouten = [];
    if (r.status !== 200) fouten.push(`HTTP ${r.status}`);
    for (const k of RISQUE_BRONNEN) if (!BRON_STATUS.has(b?.[k]?.status)) fouten.push(`status ontbreekt: ${k}`);
    const ok = RISQUE_BRONNEN.filter((k) => b?.[k]?.status === 'ok' || b?.[k]?.status === 'leeg').length;
    if (b && !fouten.length) risqueUit[L.naam] = ok === 0;
    return { ok: !fouten.length, ms: r.ms, note: fouten.join('; ') || `${ok}/${RISQUE_BRONNEN.length} bronnen bereikbaar (${RISQUE_BRONNEN.filter((k) => !['ok','leeg'].includes(b[k].status)).join(',') || '-'} niet)` };
  });
  for (const route of ['urbanisme', 'cadastre', 'dpe']) {
    await check(L.naam, route, async () => {
      const r = await get(`/api/${route}?${q}`);
      const fouten = [];
      if (r.status !== 200) fouten.push(`HTTP ${r.status}`);
      if (!r.json) fouten.push('geen geldige JSON');
      else if (!DEEL_STATUS.has(r.json.status)) fouten.push('status ontbreekt');
      return { ok: !fouten.length, ms: r.ms, note: fouten.join('; ') || `status ${r.json.status}` };
    });
  }
}

await check('Marseille (testpunt)', 'health', async () => {
  const r = await get('/api/health?cb=' + Date.now());
  const fouten = [];
  if (r.status !== 200) fouten.push(`HTTP ${r.status}, status ${r.json?.status}`);
  if (r.json?.status === 'verouderd') fouten.push('DVF verouderd');
  healthRisques = r.json?.bronnen?.risques?.status ?? null;
  return { ok: !fouten.length, ms: r.ms, note: fouten.join('; ') || `status ${r.json.status}, dvf t/m ${r.json.dvf_dekking?.laatste_datum}` };
});

console.log(`Smoke-test tegen ${BASE}\n`);
console.table(rows);
console.log(failed ? `\n${failed} controle(s) mislukt` : '\nAlle controles geslaagd');

// Bronuitval Géorisques: waarschuwing, geen falen. De Action leest .smoke-georisques voor het issue.
const gemeten = Object.keys(risqueUit);
const alleLocatiesUit = gemeten.length === LOCATIES.length && gemeten.every((n) => risqueUit[n]);
const healthUit = healthRisques === 'niet_beschikbaar';
if (gemeten.length || healthRisques) {
  const uit = alleLocatiesUit || healthUit;
  const reden = [alleLocatiesUit ? `geen enkele Géorisques-bron bereikbaar op alle ${LOCATIES.length} testlocaties` : null,
    healthUit ? '/api/health meldt risques: niet_beschikbaar' : null].filter(Boolean).join('; ');
  const { writeFileSync, appendFileSync } = await import('node:fs');
  writeFileSync('.smoke-georisques', uit ? `down\n${reden}\n` : 'up\n');
  if (uit) {
    const w = `⚠️ Géorisques onbereikbaar vanaf de Vercel-server: ${reden}. De smoke-test blijft groen; de risico-tab toont "Niet beschikbaar op dit moment".`;
    console.log(`\n${w}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n> ${w}\n`);
  }
}
process.exit(failed ? 1 : 0);
