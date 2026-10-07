// TIJDELIJK: diagnoseroute om de juiste Géorisques-paden te vinden (o.a. SIS).
// Wordt in een volgende taak verwijderd. Haalt uitsluitend de vaste lijst hieronder op;
// er is bewust geen door de bezoeker opgegeven URL.
import { jsonResponse, NO_CACHE, USER_AGENT } from '../lib/http.js';

export const config = { runtime: 'edge', regions: ['cdg1'] };

const URLS = [
  'https://georisques.gouv.fr/api/v3/api-docs',
  'https://georisques.gouv.fr/api/v1/v3/api-docs',
  'https://georisques.gouv.fr/v3/api-docs',
  'https://georisques.gouv.fr/api/v1/swagger.json',
  'https://www.georisques.gouv.fr/doc-api',
];
const TREFWOORDEN = ['sis', 'ssp', 'pollution'];

async function probe(url) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/html;q=0.8, */*;q=0.5' }, signal: ac.signal });
    const text = await res.text();
    const out = { url, status: res.status, content_type: res.headers.get('content-type'), ms: Date.now() - t0, begin: text.slice(0, 2000), lengte: text.length };
    try {
      const spec = JSON.parse(text);
      if (spec && spec.paths && typeof spec.paths === 'object') {
        out.paden = Object.keys(spec.paths).filter((p) => TREFWOORDEN.some((k) => p.toLowerCase().includes(k)));
        out.aantal_paden = Object.keys(spec.paths).length;
      }
    } catch { /* geen JSON */ }
    return out;
  } catch (e) {
    return { url, status: null, fout: e && e.name === 'AbortError' ? 'time-out na 6000 ms' : String((e && e.message) || e), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// --- SSP/SIS: parameters, deprecated en antwoordvelden uit de OpenAPI-specificatie, plus één live-aanroep per pad.
const SPEC = 'https://georisques.gouv.fr/api/v3/api-docs';
const SSP_PAD = /\/ssp\/(conclusions_sis|casias|instructions)(\/|$)/;
const LIVE_PARAMS = { latlon: '3.8772,43.6119', rayon: '500' };

function deref(spec, node, depth = 0) {
  if (!node || depth > 6) return node;
  if (node.$ref) {
    const parts = node.$ref.replace(/^#\//, '').split('/');
    let cur = spec;
    for (const k of parts) cur = cur && cur[k];
    return deref(spec, cur, depth + 1);
  }
  return node;
}

// Veldnamen van een schema; bij een lijst of een "data"-array de velden van het element.
function veldnamen(spec, schema, depth = 0) {
  const sch = deref(spec, schema);
  if (!sch || depth > 4) return [];
  if (sch.type === 'array') return veldnamen(spec, sch.items, depth + 1);
  if (sch.properties) {
    const out = { top: Object.keys(sch.properties) };
    if (sch.properties.data) out.data = veldnamen(spec, sch.properties.data, depth + 1);
    return out;
  }
  return [];
}

async function sspDiag() {
  const specRes = await fetch(SPEC, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const spec = await specRes.json();
  const pad = Object.keys(spec.paths || {}).filter((p) => SSP_PAD.test(p));
  return Promise.all(pad.map(async (p) => {
    const get = spec.paths[p].get || {};
    const params = (get.parameters || []).map((x) => deref(spec, x)).map((x) => ({
      naam: x.name, in: x.in, verplicht: !!x.required, type: (deref(spec, x.schema) || {}).type || null,
    }));
    const ok = deref(spec, get.responses && get.responses['200']);
    const content = ok && ok.content && (ok.content['application/json'] || ok.content['*/*'] || Object.values(ok.content)[0]);
    const info = { pad: p, deprecated: !!get.deprecated, parameters: params, antwoordvelden: content ? veldnamen(spec, content.schema) : null };
    const q = new URLSearchParams();
    for (const x of params) if (LIVE_PARAMS[x.naam] !== undefined) q.set(x.naam, LIVE_PARAMS[x.naam]);
    info.live = { url: `https://georisques.gouv.fr${p}?${q}` };
    const t0 = Date.now();
    try {
      const r = await fetch(info.live.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
      const text = await r.text();
      Object.assign(info.live, { status: r.status, ms: Date.now() - t0, begin: text.slice(0, 500) });
    } catch (e) {
      Object.assign(info.live, { status: null, ms: Date.now() - t0, fout: String((e && e.message) || e) });
    }
    return info;
  }));
}

export default async function handler(request) {
  const [resultaten, ssp] = await Promise.all([
    Promise.all(URLS.map(probe)),
    sspDiag().catch((e) => ({ fout: String((e && e.message) || e) })),
  ]);
  return jsonResponse({ tijdelijk: true, vercel_id: request.headers.get('x-vercel-id'), ssp, resultaten: resultaten.map(({ begin, ...r }) => ({ ...r, begin: (begin || '').slice(0, 300) })) }, { cache: NO_CACHE });
}
