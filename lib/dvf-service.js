// DVF-dienst: officieel bestand, met terugval op de oude Cloud Run en een eerlijke foutstatus.
import { loadDvf, buildResult, stats, cacheGet, cacheSet } from './dvf-core.js';
import { fetchJson } from './http.js';
import { deptFromInsee, deptFromPostcode, validDept } from './validate.js';

export const LEGACY_URL = 'https://dvf-api-1012901367480.europe-west1.run.app';

export const round3 = (x) => Math.round(x * 1000) / 1000;

// Departement: expliciet > INSEE > postcode > reverse geocode (geo.api.gouv.fr).
export async function resolveDept({ dep, insee, postcode, lat, lon }) {
  const d = validDept(dep) || deptFromInsee(insee) || deptFromPostcode(postcode);
  if (d) return d;
  const r = await fetchJson(`https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=codeDepartement&format=json`, { timeoutMs: 4000 });
  const code = r.ok && Array.isArray(r.data) && r.data[0] && r.data[0].codeDepartement;
  return validDept(code);
}

function legacyToResult(data, { lat, lon, radiusKm, dep }) {
  const txs = (Array.isArray(data) ? data : data && data.transactions) || [];
  const transactions = txs.map((t) => ({
    date: t.date || t.date_mutation || null,
    prix: Number(t.prix ?? t.valeur_fonciere) || 0,
    type: t.type || t.type_local || null,
    surface: Number(t.surface ?? t.surface_reelle_bati) || null,
    terrain: Number(t.terrain ?? t.surface_terrain) || null,
    adresse: t.adresse || '',
    woning: false,
  }));
  const dates = transactions.map((t) => String(t.date || '').slice(0, 10)).filter(Boolean).sort();
  return {
    transactions,
    statistiek: { alle: stats([]), maison: stats([]), appartement: stats([]) },
    meta: {
      status: 'ok', bron: 'DVF via Cloud Run (terugval)', jaren: [], laatste_datum: dates[dates.length - 1] || null,
      aantal: transactions.length, aantal_getoond: transactions.length, radius_km: radiusKm,
      departement: dep, verouderd: true, lat, lon,
    },
  };
}

// Geeft { httpStatus, body, cache }.
export async function dvfService({ lat, lon, radiusKm, dep, base, fetchImpl, legacyUrl = LEGACY_URL }) {
  lat = round3(lat); lon = round3(lon);
  const key = `${dep}|${lat}|${lon}|${radiusKm}`;
  const hit = cacheGet(key);
  if (hit) return { httpStatus: 200, body: hit, cache: 's-maxage=86400, stale-while-revalidate=604800' };

  let officialError = null;
  try {
    const load = await loadDvf({ lat, lon, radiusKm, dep, base, fetchImpl });
    const body = buildResult(load, { lat, lon, radiusKm, dep });
    if (load.dekking) cacheSet(key, body);
    return { httpStatus: 200, body, cache: 's-maxage=86400, stale-while-revalidate=604800' };
  } catch (e) {
    officialError = String((e && e.message) || e);
  }

  const old = await fetchJson(`${legacyUrl}?lat=${lat}&lon=${lon}&radius=${radiusKm}`, { timeoutMs: 8000, fetchImpl });
  if (old.ok) {
    return { httpStatus: 200, body: legacyToResult(old.data, { lat, lon, radiusKm, dep }), cache: 's-maxage=600' };
  }
  return {
    httpStatus: 502,
    cache: 'no-store',
    body: {
      transactions: [],
      error: 'DVF-data is nu niet op te halen',
      meta: { status: 'fout', bron: 'DVF (data.gouv.fr)', officieel: officialError, terugval: old.error || old.status, departement: dep, lat, lon },
    },
  };
}
