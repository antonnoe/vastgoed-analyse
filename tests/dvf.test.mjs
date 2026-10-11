import test from 'node:test';
import assert from 'node:assert/strict';
import { row, csvGz, mockServer } from './helpers.mjs';
import { loadDvf, buildResult, percentile, stats, MIN_VERKOPEN } from '../lib/dvf-core.js';
import { dvfService, GEEN_DEKKING_DEPS } from '../lib/dvf-service.js';

const P = { lat: 43.61, lon: 3.87 };
const loc = (dLat = 0, dLon = 0) => ({ latitude: P.lat + dLat, longitude: P.lon + dLon });

const lines2025 = [
  // 1: enkele maison 100 m2, 300000, + dépendance (negeren), terrein 2 parcellen, valeur op elke regel
  row({ id_mutation: '2025-1', date_mutation: '2025-03-10', nature_mutation: 'Vente', valeur_fonciere: '300000.00', adresse_numero: '12', adresse_nom_voie: 'RUE X', id_parcelle: 'A1', type_local: 'Maison', surface_reelle_bati: '100', surface_terrain: '400', ...loc() }),
  row({ id_mutation: '2025-1', date_mutation: '2025-03-10', nature_mutation: 'Vente', valeur_fonciere: '300000.00', id_parcelle: 'A1', type_local: 'Dépendance', surface_reelle_bati: '30', surface_terrain: '400', ...loc() }),
  row({ id_mutation: '2025-1', date_mutation: '2025-03-10', nature_mutation: 'Vente', valeur_fonciere: '300000.00', id_parcelle: 'A2', code_nature_culture: 'S', surface_terrain: '100', ...loc() }),
  // 2: appartement 50 m2, 150000
  row({ id_mutation: '2025-2', date_mutation: '2025-06-01', nature_mutation: 'Vente', valeur_fonciere: '150000', id_parcelle: 'B1', type_local: 'Appartement', surface_reelle_bati: '50', ...loc(0.01, 0) }),
  // 3: twee woningen: niet in statistiek
  row({ id_mutation: '2025-3', date_mutation: '2025-07-01', nature_mutation: 'Vente', valeur_fonciere: '500000', id_parcelle: 'C1', type_local: 'Maison', surface_reelle_bati: '80', ...loc() }),
  row({ id_mutation: '2025-3', date_mutation: '2025-07-01', nature_mutation: 'Vente', valeur_fonciere: '500000', id_parcelle: 'C2', type_local: 'Maison', surface_reelle_bati: '90', ...loc() }),
  // 4: VEFA: weg
  row({ id_mutation: '2025-4', date_mutation: '2025-08-01', nature_mutation: "Vente en l'état futur d'achèvement", valeur_fonciere: '250000', id_parcelle: 'D1', type_local: 'Appartement', surface_reelle_bati: '60', ...loc() }),
  // 5: woning zonder oppervlakte: geen woning
  row({ id_mutation: '2025-5', date_mutation: '2025-09-01', nature_mutation: 'Vente', valeur_fonciere: '100000', id_parcelle: 'E1', type_local: 'Maison', surface_reelle_bati: '0', ...loc() }),
  // 6: buiten straal (50 km)
  row({ id_mutation: '2025-6', date_mutation: '2025-12-31', nature_mutation: 'Vente', valeur_fonciere: '999999', id_parcelle: 'F1', type_local: 'Maison', surface_reelle_bati: '10', latitude: P.lat + 0.5, longitude: P.lon }),
  // 7: grond, adres met komma tussen aanhalingstekens, rij zonder coördinaten in zelfde mutation
  row({ id_mutation: '2025-7', date_mutation: '2025-05-05', nature_mutation: 'Vente', valeur_fonciere: '80000', adresse_nom_voie: 'CHEMIN DE LA, TOUR', id_parcelle: 'G1', surface_terrain: '700', ...loc() }),
  row({ id_mutation: '2025-7', date_mutation: '2025-05-05', nature_mutation: 'Vente', valeur_fonciere: '80000', id_parcelle: 'G2', surface_terrain: '50' }),
];
const lines2024 = [
  row({ id_mutation: '2024-1', date_mutation: '2024-02-02', nature_mutation: 'Vente', valeur_fonciere: '200000', id_parcelle: 'H1', type_local: 'Maison', surface_reelle_bati: '100', ...loc() }),
];

test('percentiel en statistiek', () => {
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.deepEqual(stats([]), { n: 0, mediaan_m2: null, p25: null, p75: null });
  assert.equal(stats([1000, 2000, 3000]).mediaan_m2, 2000);
});

test('jaren dynamisch: huidig jaar 404 -> 2025 en 2024; max 3', async () => {
  const ms = await mockServer({ '2025/34': csvGz(lines2025), '2024/34': csvGz(lines2024), '2023/34': csvGz([]), '2022/34': csvGz([]) });
  try {
    const l = await loadDvf({ ...P, radiusKm: 5, dep: '34', base: ms.base, now: new Date('2026-10-07') });
    assert.deepEqual(l.jaren, [2025, 2024, 2023]);
    const l2 = await loadDvf({ ...P, radiusKm: 5, dep: '34', base: ms.base, now: new Date('2025-10-07') });
    assert.deepEqual(l2.jaren, [2025, 2024, 2023]);
  } finally { ms.close(); }
});

test('stopt bij 404 na gevonden jaren; geen hardcoded jaartal', async () => {
  const ms = await mockServer({ '2027/34': csvGz(lines2025), '2026/34': csvGz(lines2024) });
  try {
    const l = await loadDvf({ ...P, radiusKm: 5, dep: '34', base: ms.base, now: new Date('2027-02-01') });
    assert.deepEqual(l.jaren, [2027, 2026]);
  } finally { ms.close(); }
});

test('opschoning, statistiek, meta (zonder losse transacties)', async () => {
  const ms = await mockServer({ '2025/34': csvGz(lines2025), '2024/34': csvGz(lines2024) });
  try {
    const l = await loadDvf({ ...P, radiusKm: 5, dep: '34', base: ms.base, now: new Date('2026-10-07') });
    const r = buildResult(l, { ...P, radiusKm: 5, dep: '34' });
    assert.equal(r.meta.laatste_datum, '2025-12-31'); // datasetdekking, ook buiten de straal
    assert.deepEqual(r.meta.jaren, [2025, 2024]);
    assert.equal(r.transactions, undefined);
    // Slechts 6 verkopen in de straal (m1, appartement, 2 woningen-mutatie, woning zonder m2, grond, 2024): onder de ondergrens
    assert.equal(r.meta.te_weinig, true);
    assert.equal(r.meta.aantal, null);
    assert.equal(r.statistiek.alle.te_weinig, true);
    assert.equal(r.statistiek.alle.mediaan_m2, null);
  } finally { ms.close(); }
});

const mk = (id, prix, opp, type = 'Maison', adres = 'RUE GEHEIM') => row({ id_mutation: id, date_mutation: '2025-04-01', nature_mutation: 'Vente', valeur_fonciere: String(prix), adresse_numero: '7', adresse_nom_voie: adres, id_parcelle: id, type_local: type, surface_reelle_bati: String(opp), ...loc() });
const twaalf = Array.from({ length: 12 }, (_, i) => mk(`t${i}`, 300000 + i * 3000, 100, i % 2 ? 'Appartement' : 'Maison'));

test('n >= 10: wel getal; JSON bevat geen adres, geen transactielijst, geen gemiddelde', async () => {
  const ms = await mockServer({ '2025/34': csvGz(twaalf) });
  try {
    const l = await loadDvf({ ...P, radiusKm: 5, dep: '34', base: ms.base, now: new Date('2025-10-07') });
    const r = buildResult(l, { ...P, radiusKm: 5, dep: '34' });
    assert.equal(r.statistiek.alle.te_weinig, false);
    assert.equal(r.statistiek.alle.n, 12);
    assert.ok(r.statistiek.alle.mediaan_m2 > 0);
    assert.ok(r.statistiek.alle.p25 > 0 && r.statistiek.alle.p75 > 0);
    assert.equal(r.meta.aantal, 12);
    const json = JSON.stringify(r);
    assert.doesNotMatch(json, /adresse|GEHEIM|afstand_m|transactions|gemiddelde|gemiddeld|"prix"/i);
    assert.equal(r.transactions, undefined);
  } finally { ms.close(); }
});

test('n < 10 geeft geen getal, wel te_weinig', async () => {
  const ms = await mockServer({ '2025/34': csvGz(twaalf.slice(0, MIN_VERKOPEN - 1)) });
  try {
    const l = await loadDvf({ ...P, radiusKm: 5, dep: '34', base: ms.base, now: new Date('2025-10-07') });
    const r = buildResult(l, { ...P, radiusKm: 5, dep: '34' });
    for (const k of ['alle', 'maison', 'appartement']) {
      const x = r.statistiek[k];
      assert.equal(x.te_weinig, true);
      assert.equal(x.n, null); assert.equal(x.mediaan_m2, null); assert.equal(x.p25, null); assert.equal(x.p75, null);
    }
    assert.equal(r.meta.aantal, null);
    assert.equal(r.meta.te_weinig, true);
  } finally { ms.close(); }
});

test('dekking: 57, 67, 68, 976 geven een dekkingsmelding op departementscode, zonder bestand op te halen', async () => {
  assert.deepEqual(GEEN_DEKKING_DEPS, ['57', '67', '68', '976']);
  const ms = await mockServer({});
  try {
    for (const dep of GEEN_DEKKING_DEPS) {
      const out = await dvfService({ ...P, radiusKm: 5, dep, base: ms.base });
      assert.equal(out.httpStatus, 200);
      assert.equal(out.body.meta.status, 'geen_dekking');
      assert.match(out.body.meta.dekking_tekst, /livre foncier/);
      assert.match(out.body.meta.dekking_tekst, /Mayotte/);
      assert.match(out.body.meta.dekking_tekst, /immobilier\.notaires\.fr/);
      assert.equal(out.body.statistiek.alle.mediaan_m2, null);
    }
    assert.equal(ms.hits.length, 0);
  } finally { ms.close(); }
});

test('geen bestand: dekking false', async () => {
  const ms = await mockServer({});
  try {
    const l = await loadDvf({ ...P, radiusKm: 5, dep: '57', base: ms.base, now: new Date('2026-10-07') });
    assert.equal(l.dekking, false);
  } finally { ms.close(); }
});

test('terugval op oude API met verouderd=true, daarna eerlijke fout', async () => {
  const ms = await mockServer({ '2026/34': 'error500', '2025/34': 'error500', '2024/34': 'error500' });
  const fake = async (url, o) => {
    if (String(url).startsWith('http://legacy')) {
      return new Response(JSON.stringify({ transactions: [{ date: '2025-06-30', prix: 1, type: 'Maison', surface: 1, adresse: '1 RUE LEK' }] }), { status: 200 });
    }
    return fetch(url, o);
  };
  try {
    const out = await dvfService({ ...P, radiusKm: 5, dep: '34', base: ms.base, fetchImpl: fake, legacyUrl: 'http://legacy' });
    assert.equal(out.httpStatus, 200);
    assert.equal(out.body.meta.verouderd, true);
    assert.equal(out.body.meta.laatste_datum, '2025-06-30');
    assert.equal(out.body.transactions, undefined);
    assert.doesNotMatch(JSON.stringify(out.body), /adresse|"prix"/);
    assert.equal(out.body.statistiek.alle.te_weinig, true);
    const bad = await dvfService({ ...P, lat: 43.7, radiusKm: 5, dep: '34', base: ms.base, fetchImpl: async (u, o) => (String(u).startsWith('http://legacy') ? new Response('x', { status: 500 }) : fetch(u, o)), legacyUrl: 'http://legacy' });
    assert.equal(bad.httpStatus, 502);
    assert.equal(bad.body.meta.status, 'fout');
  } finally { ms.close(); }
});

test('afwijkende €/m2 (<25% of >400% van mediaan) tellen niet mee in de statistiek', async () => {
  const mk2 = (id, prix, opp) => mk(id, prix, opp);
  const goed = Array.from({ length: 10 }, (_, i) => mk2(`g${i}`, 300000, 100));
  const lines = [...goed, mk2('d', 100, 100), mk2('e', 2000000, 100)];
  const ms = await mockServer({ '2025/34': csvGz(lines) });
  try {
    const l = await loadDvf({ ...P, radiusKm: 5, dep: '34', base: ms.base, now: new Date('2025-10-07') });
    const r = buildResult(l, { ...P, radiusKm: 5, dep: '34' });
    assert.equal(r.statistiek.alle.n, 10);
    assert.equal(r.statistiek.alle.mediaan_m2, 3000);
    assert.equal(r.meta.aantal, 12);
  } finally { ms.close(); }
});
