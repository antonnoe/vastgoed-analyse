import { jsonResponse, CACHE_LONG, NO_CACHE } from '../lib/http.js';
import { parseCoords } from '../lib/validate.js';
import { fetchCadastre } from '../lib/sources.js';

export const config = { runtime: 'edge', regions: ['cdg1'] };

export default async function handler(request) {
  const c = parseCoords(new URL(request.url).searchParams);
  if (c.error) return jsonResponse({ error: c.error }, { status: 400 });
  const out = await fetchCadastre({ lat: c.lat, lon: c.lon });
  const good = out.status === 'ok' || out.status === 'leeg';
  return jsonResponse(out, { cache: good ? CACHE_LONG : NO_CACHE });
}
