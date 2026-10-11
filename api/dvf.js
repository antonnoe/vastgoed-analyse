// DVF-transacties uit het officiële geo-dvf bestand (data.gouv.fr), gestreamd en gefilterd.
// Node-runtime: gzip-streaming heeft zlib en een ruime time-out nodig.
import { dvfService, resolveDept, round3 } from '../lib/dvf-service.js';
import { parseCoords, validInsee } from '../lib/validate.js';
import { corsHeaders } from '../lib/http.js';

function send(req, res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  for (const [k, v] of Object.entries(corsHeaders(req.headers.origin))) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; for (const [k, v] of Object.entries(corsHeaders(req.headers.origin))) res.setHeader(k, v); return res.end(); }
  const sp = new URL(req.url, 'http://localhost').searchParams;
  const c = parseCoords(sp);
  if (c.error) return send(req, res, 400, { error: c.error }, 'no-store');

  const radiusKm = Math.min(Math.max(Number(sp.get('radius')) || 5, 0.5), 10);
  const insee = validInsee(sp.get('code_insee') || '');
  const dep = await resolveDept({ dep: sp.get('dep'), insee, postcode: sp.get('postcode'), lat: c.lat, lon: c.lon });
  if (!dep) return send(req, res, 400, { error: 'departement niet te bepalen uit code_insee/postcode/coördinaten' }, 'no-store');

  const out = await dvfService({ lat: round3(c.lat), lon: round3(c.lon), radiusKm, dep });
  return send(req, res, out.httpStatus, out.body, out.cache);
}
