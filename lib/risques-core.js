// Géorisques: per bron een eigen status, deelresultaten, nooit "inconnu" voor ontbrekende data.
import { fetchJson, overallStatus } from './http.js';

export const GEORISQUES = 'https://georisques.gouv.fr/api/v1';

export function rapportLink(insee) {
  return insee
    ? `https://georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport?form-commune=true&codeInsee=${insee}`
    : 'https://georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi';
}

const hasRows = (r) => Array.isArray(r.data && r.data.data) && r.data.data.length > 0;

// Zet een fetchJson-resultaat om naar { status, ms, ... }: ok | leeg | time-out | fout
function statusOf(r) {
  if (!r.ok) return r.status;
  return hasRows(r) ? 'ok' : 'leeg';
}

// Totaalbudget voor alle bronnen samen; daarna komen deelresultaten terug.
export const RISQUES_BUDGET_MS = 7000;

export async function fetchRisques({ lat, lon, insee, fetchImpl, base = GEORISQUES, budgetMs = RISQUES_BUDGET_MS }) {
  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(), budgetMs);
  // Eén gedeelde signal; geen tweede poging na time-out, wel na een 5xx zolang het budget loopt.
  const opts = { timeoutMs: budgetMs, retries: 1, retryOnTimeout: false, signal: budget.signal, fetchImpl };
  const ll = `${lon},${lat}`;
  const calls = {
    gaspar: insee ? fetchJson(`${base}/gaspar/risques?code_insee=${insee}`, opts) : null,
    radon: insee ? fetchJson(`${base}/radon?code_insee=${insee}`, opts) : null,
    zonage_sismique: insee ? fetchJson(`${base}/zonage_sismique?code_insee=${insee}`, opts) : null,
    icpe: fetchJson(`${base}/installations_classees?latlon=${ll}&rayon=2000`, opts),
    cavites: fetchJson(`${base}/cavites?latlon=${ll}&rayon=500`, opts),
    sis: fetchJson(`${base}/ssp/conclusions_sis?latlon=${ll}&rayon=500`, opts),
  };
  const keys = Object.keys(calls);
  const results = await Promise.all(keys.map((k) => calls[k]));
  clearTimeout(budgetTimer);
  const R = Object.fromEntries(keys.map((k, i) => [k, results[i]]));

  const bronnen = {};
  for (const k of keys) {
    bronnen[k] = R[k]
      ? { status: statusOf(R[k]), ms: R[k].ms, ...(R[k].ok ? {} : { fout: R[k].error }) }
      : { status: 'fout', ms: 0, fout: 'geen INSEE-code opgegeven' };
  }

  const rows = (k) => (R[k] && R[k].ok && hasRows(R[k]) ? R[k].data.data : []);
  const out = { bronnen, links: { rapport: rapportLink(insee), erp: 'https://errial.georisques.gouv.fr/' } };

  // Commune-gebonden bronnen: leeg betekent hier "geen gegevens", niet "geen risico".
  const radon = rows('radon')[0];
  out.radon = { status: bronnen.radon.status };
  if (radon) {
    const cat = parseInt(radon.classe_potentiel, 10);
    out.radon.categorie = Number.isFinite(cat) ? cat : null;
    out.radon.niveau = { 1: 'faible', 2: 'moyen', 3: 'fort' }[cat] || null;
  }

  const zone = rows('zonage_sismique')[0];
  out.seisme = { status: bronnen.zonage_sismique.status };
  if (zone) {
    const z = parseInt(zone.code_zone, 10);
    out.seisme.zone = Number.isFinite(z) ? z : null;
    out.seisme.niveau = { 1: 'tres_faible', 2: 'faible', 3: 'moyen', 4: 'fort', 5: 'tres_fort' }[z] || null;
  }

  const gaspar = rows('gaspar')[0];
  out.inondation = { status: bronnen.gaspar.status, details: [] };
  out.argiles = { status: bronnen.gaspar.status, alea: null };
  out.autres = [];
  if (gaspar && Array.isArray(gaspar.risques_detail)) {
    for (const risque of gaspar.risques_detail) {
      const label = risque.libelle_risque_long || '';
      const t = label.toLowerCase();
      if (t.includes('inondation') || t.includes('crue')) out.inondation.details.push(label);
      else if (t.includes('tassements') || t.includes('argile')) out.argiles.alea = label;
      else if (!t.includes('séisme') && !t.includes('radon')) out.autres.push(label);
    }
    out.inondation.aanwezig = out.inondation.details.length > 0;
    out.argiles.aanwezig = !!out.argiles.alea;
  }

  // Puntbronnen: leeg = niets gevonden binnen de straal (geldige uitkomst).
  const icpe = rows('icpe');
  out.industriel = {
    status: bronnen.icpe.status, straal_m: 2000, aantal: icpe.length,
    seveso: icpe.some((i) => String(i.regime || '').toLowerCase().includes('seveso')),
    installations: icpe.slice(0, 5),
  };
  const cav = rows('cavites');
  out.cavites = { status: bronnen.cavites.status, straal_m: 500, aantal: cav.length, details: cav.slice(0, 3) };
  const sis = rows('sis');
  out.pollution = { status: bronnen.sis.status, straal_m: 500, aantal: sis.length, sites: sis.slice(0, 3) };

  out.status = overallStatus(Object.values(bronnen).map((b) => b.status));
  return out;
}
