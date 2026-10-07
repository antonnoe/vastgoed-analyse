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

export default async function handler(request) {
  const resultaten = await Promise.all(URLS.map(probe));
  return jsonResponse({ tijdelijk: true, vercel_id: request.headers.get('x-vercel-id'), resultaten }, { cache: NO_CACHE });
}
