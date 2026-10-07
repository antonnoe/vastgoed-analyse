// Gedeelde HTTP-helpers voor alle api-routes.

export const USER_AGENT = 'InfoFrankrijk-VastgoedDashboard/1.0 (+https://infofrankrijk.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET met time-out (AbortController) en een retry bij 5xx, time-out of netwerkfout.
// Gooit nooit: geeft { ok, status: 'ok'|'time-out'|'fout', httpStatus, data, ms, attempts, error }.
export async function fetchJson(url, opts = {}) {
  const {
    timeoutMs = 6000,
    retries = 1,
    retryDelayMs = 250,
    headers = {},
    fetchImpl = fetch,
  } = opts;

  const t0 = Date.now();
  let last = { ok: false, status: 'fout', httpStatus: null, error: 'onbekend' };
  let attempts = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts++;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let retry = true;
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        signal: ac.signal,
      });
      if (res.ok) {
        const data = await res.json();
        clearTimeout(timer);
        return { ok: true, status: 'ok', httpStatus: res.status, data, ms: Date.now() - t0, attempts };
      }
      last = { ok: false, status: 'fout', httpStatus: res.status, error: `HTTP ${res.status}` };
      retry = res.status >= 500;
    } catch (e) {
      const aborted = e && e.name === 'AbortError';
      last = {
        ok: false,
        status: aborted ? 'time-out' : 'fout',
        httpStatus: null,
        error: aborted ? `time-out na ${timeoutMs} ms` : String((e && e.message) || e),
      };
    } finally {
      clearTimeout(timer);
    }
    if (!retry || attempt === retries) break;
    await sleep(retryDelayMs);
  }
  return { ...last, ms: Date.now() - t0, attempts };
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const CACHE_LONG = 's-maxage=86400, stale-while-revalidate=604800';
export const CACHE_HOUR = 's-maxage=3600, stale-while-revalidate=86400';
export const CACHE_SHORT = 's-maxage=60, stale-while-revalidate=300';
export const NO_CACHE = 'no-store';

// Web-standaard Response (edge-routes).
export function jsonResponse(body, { status = 200, cache = NO_CACHE } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, ...CORS },
  });
}

// Samenvattende status uit een lijst deelstatussen.
export function overallStatus(statuses) {
  const good = (s) => s === 'ok' || s === 'leeg';
  if (statuses.every(good)) return 'ok';
  if (statuses.some(good)) return 'deels';
  return 'niet_beschikbaar';
}
