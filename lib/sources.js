import { fetchJson, overallStatus } from './http.js';

export const GPU_KAART = (lon, lat) => `https://www.geoportail-urbanisme.gouv.fr/map/#/center/${lon}/${lat}/zoom/17`;

const pointGeom = (lat, lon) => encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));

export async function fetchUrbanisme({ lat, lon, fetchImpl, base = 'https://apicarto.ign.fr/api' }) {
  const r = await fetchJson(`${base}/gpu/zone-urba?geom=${pointGeom(lat, lon)}`, { fetchImpl });
  const links = { gpu_kaart: GPU_KAART(lon, lat) };
  if (!r.ok) return { status: r.status, ms: r.ms, fout: r.error, zones: [], links };
  const feats = Array.isArray(r.data && r.data.features) ? r.data.features : [];
  const zones = feats.map((f) => {
    const p = f.properties || {};
    return {
      libelle: p.libelle || null, libelong: p.libelong || null, typezone: p.typezone || null,
      destination: p.destdomi ?? p.destdom ?? null, document: p.nomfic || p.idurba || null,
      datappro: p.datappro || null, url: p.urlfic || null,
    };
  });
  return { status: zones.length ? 'ok' : 'leeg', ms: r.ms, zones, links };
}

export async function fetchCadastre({ lat, lon, fetchImpl, base = 'https://apicarto.ign.fr/api', geoBase = 'https://geo.api.gouv.fr' }) {
  const [p, c] = await Promise.all([
    fetchJson(`${base}/cadastre/parcelle?geom=${pointGeom(lat, lon)}`, { fetchImpl }),
    fetchJson(`${geoBase}/communes?lat=${lat}&lon=${lon}&fields=nom,code,codesPostaux,population,surface&format=json`, { fetchImpl }),
  ]);

  const parcelle = { status: p.ok ? 'ok' : p.status, ms: p.ms, items: [] };
  if (p.ok) {
    const feats = Array.isArray(p.data && p.data.features) ? p.data.features : [];
    parcelle.items = feats.map((f) => {
      const q = f.properties || {};
      return {
        idu: q.idu || null, section: q.section || null, numero: q.numero || null,
        commune: q.nom_com || null, code_insee: q.code_insee || ((q.code_dep || '') + (q.code_com || '')) || null,
        contenance: q.contenance ?? null,
      };
    });
    if (!parcelle.items.length) parcelle.status = 'leeg';
  } else parcelle.fout = p.error;

  const commune = { status: c.ok ? 'ok' : c.status, ms: c.ms };
  if (c.ok) {
    const x = Array.isArray(c.data) ? c.data[0] : null;
    if (x) Object.assign(commune, { nom: x.nom, code: x.code, codesPostaux: x.codesPostaux, population: x.population });
    else commune.status = 'leeg';
  } else commune.fout = c.error;

  return {
    status: overallStatus([parcelle.status, commune.status]),
    parcelle, commune,
    links: { kadaster: 'https://www.cadastre.gouv.fr/scpc/rechercherPlan.do' },
  };
}

export async function fetchDpe({ lat, lon, fetchImpl, base = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines' }) {
  const build = (select) => {
    const u = new URL(base);
    u.searchParams.set('geo_distance', `${lon},${lat},500`);
    u.searchParams.set('size', '20');
    if (select) u.searchParams.set('select', select);
    return u.toString();
  };
  let r = await fetchJson(build('etiquette_dpe,etiquette_ges,surface_habitable_logement,annee_construction,type_batiment'), { fetchImpl });
  // Wijkt de veldenlijst af, dan antwoordt data-fair met 400: probeer zonder select.
  if (!r.ok && r.httpStatus === 400) r = await fetchJson(build(null), { fetchImpl });
  const links = { observatoire_dpe: 'https://observatoire-dpe-audit.ademe.fr/', france_renov: 'https://france-renov.gouv.fr/' };
  if (!r.ok) return { status: r.status, ms: r.ms, fout: r.error, results: [], total: null, links };
  const results = Array.isArray(r.data && r.data.results) ? r.data.results : [];
  return { status: results.length ? 'ok' : 'leeg', ms: r.ms, total: Number.isFinite(r.data.total) ? r.data.total : null, results, links };
}
