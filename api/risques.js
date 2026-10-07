// Géorisques met status per bron en deelresultaten.
import { jsonResponse, CACHE_HOUR, NO_CACHE } from '../lib/http.js';
import { parseCoords, validInsee } from '../lib/validate.js';
import { fetchRisques } from '../lib/risques-core.js';

export const config = { runtime: 'edge', regions: ['cdg1'] };

export default async function handler(request) {
  const sp = new URL(request.url).searchParams;
  const c = parseCoords(sp);
  if (c.error) return jsonResponse({ error: c.error }, { status: 400 });
  const insee = validInsee(sp.get('code_insee') || '');

  const out = await fetchRisques({ lat: c.lat, lon: c.lon, insee });
  // Alleen cachen als alles gelukt is; mislukte bronnen mogen niet uren blijven hangen.
  return jsonResponse(out, { cache: out.status === 'ok' ? CACHE_HOUR : NO_CACHE });
}
