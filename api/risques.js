// Géorisques met status per bron en deelresultaten.
import { jsonResponse, corsHeaders, CACHE_HOUR, NO_CACHE } from '../lib/http.js';
import { parseCoords, validInsee } from '../lib/validate.js';
import { fetchRisques } from '../lib/risques-core.js';

export const config = { runtime: 'edge', regions: ['cdg1'] };

export default async function handler(request) {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const sp = new URL(request.url).searchParams;
  const c = parseCoords(sp);
  if (c.error) return jsonResponse({ error: c.error }, { status: 400, origin });
  const insee = validInsee(sp.get('code_insee') || '');

  const out = await fetchRisques({ lat: c.lat, lon: c.lon, insee });
  // Alleen cachen als alles gelukt is; mislukte bronnen mogen niet uren blijven hangen.
  return jsonResponse(out, { cache: out.status === 'ok' ? CACHE_HOUR : NO_CACHE, origin });
}
