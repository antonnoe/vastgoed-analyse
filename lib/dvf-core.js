// DVF uit het officiële geo-dvf bestand (data.gouv.fr): live opgehaald en gestreamd uit gzip.
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { USER_AGENT } from './http.js';

export const DVF_BASE = 'https://files.data.gouv.fr/geo-dvf/latest/csv';
const MAX_YEARS = 3;
const WONING = new Set(['Maison', 'Appartement']);
const MAX_LIST = 300;

// ---------- hulpfuncties ----------

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bboxFor(lat, lon, radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { latMin: lat - dLat, latMax: lat + dLat, lonMin: lon - dLon, lonMax: lon + dLon };
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function stats(values) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return { n: 0, mediaan_m2: null, p25: null, p75: null };
  return {
    n: s.length,
    mediaan_m2: Math.round(percentile(s, 0.5)),
    p25: Math.round(percentile(s, 0.25)),
    p75: Math.round(percentile(s, 0.75)),
  };
}

// Minimale CSV-regelparser met aanhalingstekens.
export function parseCsvLine(line) {
  if (line.indexOf('"') === -1) return line.split(',');
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// ---------- groep (mutation) -> samenvatting ----------

export function summarizeMutation(rows, idx) {
  const g = (r, k) => (idx[k] === undefined ? '' : r[idx[k]] || '');
  const first = rows[0];
  const nature = g(first, 'nature_mutation');
  const prix = Number(rows.map((r) => g(r, 'valeur_fonciere')).find((v) => v !== '')) || 0;

  const woningen = [], overigeLocals = [];
  let heeftDependance = false;
  for (const r of rows) {
    const t = g(r, 'type_local');
    if (WONING.has(t)) woningen.push(r);
    else if (t === 'Dépendance') heeftDependance = true;
    else if (t) overigeLocals.push(r);
  }

  let type, surface = null, woning = false;
  if (woningen.length === 1 && overigeLocals.length === 0) {
    const s = Number(g(woningen[0], 'surface_reelle_bati'));
    type = g(woningen[0], 'type_local');
    if (s > 0) { surface = s; woning = nature === 'Vente' && prix > 0; }
  } else if (woningen.length > 1) type = 'Meerdere woningen';
  else if (woningen.length === 1 || overigeLocals.length) type = 'Bedrijfspand/overig';
  else if (heeftDependance) type = 'Bijgebouw';
  else type = 'Grond';

  // Terrein: som van surface_terrain over unieke percelen/cultuurpercelen (dubbele regels tellen niet dubbel).
  const seen = new Set();
  let terrain = 0;
  for (const r of rows) {
    const t = Number(g(r, 'surface_terrain'));
    if (!(t > 0)) continue;
    const key = `${g(r, 'id_parcelle')}|${g(r, 'code_nature_culture')}|${g(r, 'code_nature_culture_speciale')}|${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    terrain += t;
  }

  const geo = rows.find((r) => g(r, 'latitude') && g(r, 'longitude'));
  const adresse = [g(first, 'adresse_numero'), g(first, 'adresse_suffixe'), g(first, 'adresse_nom_voie')]
    .filter(Boolean).join(' ').trim();
  const plaats = [g(first, 'code_postal'), g(first, 'nom_commune')].filter(Boolean).join(' ');

  return {
    id: g(first, 'id_mutation'),
    date: g(first, 'date_mutation'),
    nature,
    prix,
    type,
    woning,
    surface,
    terrain: terrain || null,
    adresse: [adresse, plaats].filter(Boolean).join(', '),
    lat: geo ? Number(g(geo, 'latitude')) : null,
    lon: geo ? Number(g(geo, 'longitude')) : null,
  };
}

// ---------- een jaarbestand scannen ----------

async function scanBody(webBody, bbox, signal) {
  const src = Readable.fromWeb(webBody);
  const gunzip = createGunzip({ chunkSize: 256 * 1024 });
  src.on('error', (e) => gunzip.destroy(e));
  if (signal) signal.addEventListener('abort', () => { src.destroy(); gunzip.destroy(new Error('time-out')); }, { once: true });
  src.pipe(gunzip);
  gunzip.setEncoding('utf8');

  let header = null, idx = null, tailOk = false;
  let carry = '';
  let curId = null, curLines = [], curHit = false;
  let maxDate = '';
  const hits = [];

  const flush = () => {
    if (curHit && curLines.length) hits.push(curLines);
    curLines = []; curHit = false;
  };

  const handle = (line) => {
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
    if (!line) return;
    if (!header) {
      header = parseCsvLine(line);
      idx = Object.fromEntries(header.map((h, i) => [h, i]));
      tailOk = header[header.length - 1] === 'latitude' && header[header.length - 2] === 'longitude';
      if (!tailOk || idx.id_mutation !== 0 || idx.date_mutation !== 1) throw new Error('onverwacht DVF-kolomschema');
      return;
    }
    const c = line.indexOf(',');
    const id = line.slice(0, c);
    const date = line.slice(c + 1, c + 11);
    if (date > maxDate) maxDate = date;
    if (id !== curId) { flush(); curId = id; }
    curLines.push(line);
    const i1 = line.lastIndexOf(',');
    const i2 = line.lastIndexOf(',', i1 - 1);
    if (i1 > i2 + 1 && i1 < line.length - 1) {
      const lon = +line.slice(i2 + 1, i1), lat = +line.slice(i1 + 1);
      if (lat >= bbox.latMin && lat <= bbox.latMax && lon >= bbox.lonMin && lon <= bbox.lonMax) curHit = true;
    }
  };

  for await (const chunk of gunzip) {
    const text = carry ? carry + chunk : chunk;
    let start = 0, nl;
    while ((nl = text.indexOf('\n', start)) !== -1) {
      handle(text.slice(start, nl));
      start = nl + 1;
    }
    carry = text.slice(start);
  }
  if (carry) handle(carry);
  flush();
  if (!header) throw new Error('leeg bestand');

  const muts = new Map();
  for (const lines of hits) {
    const rows = lines.map(parseCsvLine);
    const id = rows[0][0];
    if (muts.has(id)) muts.get(id).push(...rows); else muts.set(id, rows);
  }
  return { mutations: [...muts.values()].map((rows) => summarizeMutation(rows, idx)), maxDate };
}

// ---------- hoofdfunctie ----------

// Haalt jaren dynamisch op: huidige jaar terug tot een 404, maximaal MAX_YEARS bestaande jaren.
export async function loadDvf({ lat, lon, radiusKm = 5, dep, base = DVF_BASE, now = new Date(), fetchImpl = fetch, timeoutMs = 45000 }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const fileUrl = (y) => `${base}/${y}/departements/${dep}.csv.gz`;
  const get = (y) => fetchImpl(fileUrl(y), { headers: { 'User-Agent': USER_AGENT }, signal: ac.signal });
  const cancel = (r) => { try { r.body && r.body.cancel(); } catch { /* niets */ } };

  try {
    const year0 = now.getUTCFullYear();
    const pending = [0, 1, 2].map((i) => get(year0 - i));
    const responses = await Promise.all(pending);
    if (responses[0].status === 404) responses.push(await get(year0 - 3));

    const used = [];
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      if (r.status === 404) {
        cancel(r);
        if (used.length) break;
        continue;
      }
      if (!r.ok || !r.body) throw new Error(`DVF-bestand ${year0 - i}: HTTP ${r.status}`);
      if (used.length < MAX_YEARS) used.push({ year: year0 - i, res: r }); else cancel(r);
    }
    for (const r of responses) if (!used.some((u) => u.res === r)) cancel(r);

    if (!used.length) return { dekking: false, jaren: [], mutations: [], laatste_datum: null };

    const bbox = bboxFor(lat, lon, radiusKm);
    const scans = await Promise.all(used.map((u) => scanBody(u.res.body, bbox, ac.signal)));

    const mutations = [];
    let laatste = '';
    for (const s of scans) {
      if (s.maxDate > laatste) laatste = s.maxDate;
      for (const m of s.mutations) {
        if (m.lat == null) continue;
        const d = haversineKm(lat, lon, m.lat, m.lon);
        if (d <= radiusKm) mutations.push({ ...m, afstand_m: Math.round(d * 1000) });
      }
    }
    return { dekking: true, jaren: used.map((u) => u.year), mutations, laatste_datum: laatste || null };
  } finally {
    clearTimeout(timer);
  }
}

// Mutations -> API-uitvoer (transactieschema + statistiek + meta).
export function buildResult(load, { lat, lon, radiusKm, dep }) {
  const verkopen = load.mutations.filter((m) => m.nature === 'Vente' && m.prix > 0);
  verkopen.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Afwijkend: €/m² onder 25% of boven 400% van de mediaan van alle woningverkopen. Telt niet mee in de statistiek.
  const ppm2 = (m) => m.prix / m.surface;
  const mediaanAlle = stats(verkopen.filter((m) => m.woning).map(ppm2)).mediaan_m2;
  for (const m of verkopen) {
    m.afwijkend = !!(m.woning && mediaanAlle && (ppm2(m) < 0.25 * mediaanAlle || ppm2(m) > 4 * mediaanAlle));
  }
  const per = (pred) => stats(verkopen.filter((m) => m.woning && !m.afwijkend && pred(m)).map(ppm2));
  const transactions = verkopen.slice(0, MAX_LIST).map((m) => ({
    date: m.date, prix: Math.round(m.prix), type: m.type, surface: m.surface, terrain: m.terrain,
    adresse: m.adresse, woning: m.woning, afwijkend: m.afwijkend, afstand_m: m.afstand_m,
  }));

  return {
    transactions,
    statistiek: {
      eenheid: 'EUR/m2 bebouwde woonoppervlakte, alleen verkopen van precies één woning',
      afwijkend_aantal: verkopen.filter((m) => m.afwijkend).length,
      afwijkend_grens_m2: mediaanAlle ? { onder: Math.round(0.25 * mediaanAlle), boven: Math.round(4 * mediaanAlle) } : null,
      alle: per(() => true),
      maison: per((m) => m.type === 'Maison'),
      appartement: per((m) => m.type === 'Appartement'),
    },
    meta: {
      status: load.dekking ? 'ok' : 'geen_dekking',
      bron: 'DVF (data.gouv.fr)',
      jaren: load.jaren,
      laatste_datum: load.laatste_datum,
      aantal: verkopen.length,
      aantal_getoond: transactions.length,
      radius_km: radiusKm,
      departement: dep,
      verouderd: false,
      lat, lon,
    },
  };
}

// Eenvoudige LRU in het geheugen van de warme instance.
const cache = new Map();
const TTL = 6 * 3600 * 1000;
export function cacheGet(k) {
  const e = cache.get(k);
  if (!e || e.exp < Date.now()) { cache.delete(k); return null; }
  cache.delete(k); cache.set(k, e);
  return e.v;
}
export function cacheSet(k, v) {
  cache.set(k, { v, exp: Date.now() + TTL });
  if (cache.size > 40) cache.delete(cache.keys().next().value);
}
