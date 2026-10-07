import http from 'node:http';
import { gzipSync } from 'node:zlib';

export const HEADER = 'id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe,adresse_nom_voie,adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,ancien_nom_commune,id_parcelle,ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,lot2_surface_carrez,lot3_numero,lot3_surface_carrez,lot4_numero,lot4_surface_carrez,lot5_numero,lot5_surface_carrez,nombre_lots,code_type_local,type_local,surface_reelle_bati,nombre_pieces_principales,code_nature_culture,nature_culture,code_nature_culture_speciale,nature_culture_speciale,surface_terrain,longitude,latitude';
const COLS = HEADER.split(',');

export function row(o) {
  const d = { numero_disposition: '000001', code_postal: '34000', code_commune: '34172', nom_commune: 'Montpellier', code_departement: '34', ...o };
  return COLS.map((c) => {
    const v = d[c] ?? '';
    return /[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  }).join(',');
}

export const csvGz = (lines) => gzipSync([HEADER, ...lines].join('\n') + '\n');

// files: { '2025/34': Buffer | 'error500' }
export function mockServer(files) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const m = req.url.match(/^\/(\d{4})\/departements\/(\w+)\.csv\.gz/);
    const f = m && files[`${m[1]}/${m[2]}`];
    if (!f) { res.statusCode = 404; return res.end('nope'); }
    if (f === 'error500') { res.statusCode = 500; return res.end('boom'); }
    res.setHeader('Content-Type', 'application/gzip');
    res.end(f);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, hits, base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
