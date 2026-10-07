// Gezondheid van alle bronnen met een vast testpunt (Marseille, INSEE 13055).
// Kritiek: dvf en ban. HTTP 503 als een kritieke bron uitvalt; andere uitval geeft status "degraded".
import { loadDvf } from '../lib/dvf-core.js';
import { fetchJson, CORS } from '../lib/http.js';
import { fetchRisques } from '../lib/risques-core.js';
import { fetchUrbanisme, fetchCadastre, fetchDpe } from '../lib/sources.js';

const T = { lat: 43.2965, lon: 5.3698, insee: '13055', dep: '13' };
const MAX_DVF_AGE_DAYS = 365;


async function timed(fn) {
  const t0 = Date.now();
  try { const r = await fn(); return { ms: Date.now() - t0, ...r }; }
  catch (e) { return { status: 'fout', ms: Date.now() - t0, fout: String((e && e.message) || e) }; }
}

export async function runHealth(now = new Date()) {
  const [dvf, ban, risques, cadastre, urbanisme, dpe] = await Promise.all([
    timed(async () => {
      const l = await loadDvf({ lat: T.lat, lon: T.lon, radiusKm: 5, dep: T.dep, now });
      if (!l.dekking) return { status: 'fout', fout: 'geen DVF-bestand gevonden', laatste_datum: null };
      const age = l.laatste_datum ? (now - new Date(l.laatste_datum)) / 864e5 : Infinity;
      return {
        status: age > MAX_DVF_AGE_DAYS ? 'verouderd' : 'ok',
        jaren: l.jaren, laatste_datum: l.laatste_datum, leeftijd_dagen: Math.round(age),
        transacties_testpunt: l.mutations.length,
      };
    }),
    timed(async () => {
      const r = await fetchJson('https://data.geopf.fr/geocodage/search?q=Marseille&limit=1', { timeoutMs: 5000 });
      return { status: r.ok && r.data.features && r.data.features.length ? 'ok' : (r.ok ? 'leeg' : r.status) };
    }),
    timed(async () => { const r = await fetchRisques({ lat: T.lat, lon: T.lon, insee: T.insee }); return { status: r.status, bronnen: r.bronnen }; }),
    timed(async () => { const r = await fetchCadastre({ lat: T.lat, lon: T.lon }); return { status: r.status, parcelle: r.parcelle.status, commune: r.commune.status }; }),
    timed(async () => { const r = await fetchUrbanisme({ lat: T.lat, lon: T.lon }); return { status: r.status }; }),
    timed(async () => { const r = await fetchDpe({ lat: T.lat, lon: T.lon }); return { status: r.status }; }),
  ]);

  const bronnen = { dvf, ban, risques, cadastre, urbanisme, dpe };
  const kritiek = ['dvf', 'ban'];
  const down = (s) => s === 'fout' || s === 'time-out' || s === 'niet_beschikbaar';
  const kritiekUit = kritiek.filter((k) => down(bronnen[k].status));
  const overigUit = Object.keys(bronnen).filter((k) => !kritiek.includes(k) && down(bronnen[k].status));

  let status = 'ok';
  if (kritiekUit.length) status = 'down';
  else if (overigUit.length || ['deels'].includes(risques.status) || cadastre.status === 'deels') status = 'degraded';
  if (!kritiekUit.length && dvf.status === 'verouderd') status = 'verouderd';

  return {
    status, httpStatus: kritiekUit.length ? 503 : 200,
    testpunt: { naam: 'Marseille', ...T },
    kritieke_bronnen: kritiek, uitgevallen: [...kritiekUit, ...overigUit],
    dvf_dekking: { laatste_datum: dvf.laatste_datum || null, jaren: dvf.jaren || [], verouderd: dvf.status === 'verouderd' },
    bronnen,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    gemeten: now.toISOString(),
  };
}

export default async function handler(req, res) {
  // ?quick=1: alleen de gedeployde commit (voor wachten op een deploy), geen bronnentest.
  if (new URL(req.url, 'http://localhost').searchParams.get('quick')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ commit: process.env.VERCEL_GIT_COMMIT_SHA || null }));
  }
  const out = await runHealth();
  const { httpStatus, ...body } = out;
  res.statusCode = httpStatus;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
