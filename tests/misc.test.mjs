import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../lib/http.js';
import { parseCoords, deptFromInsee, deptFromPostcode } from '../lib/validate.js';
import { fetchRisques } from '../lib/risques-core.js';

test('coördinaten validatie', () => {
  const p = (q) => parseCoords(new URLSearchParams(q));
  assert.ok(p('lat=43.29&lon=5.37').lat);
  assert.ok(p('lat=abc&lon=5').error);
  assert.ok(p('lat=&lon=5').error);
  assert.ok(p('lat=0&lon=0').error);
  assert.ok(p('lat=48.85&lon=2.35').lat);
  assert.ok(p('lat=-21.1&lon=55.5').lat); // Réunion
  assert.ok(p('lat=52.37&lon=4.9').error); // Amsterdam
});

test('departement', () => {
  assert.equal(deptFromInsee('2A004'), '2A');
  assert.equal(deptFromInsee('2B033'), '2B');
  assert.equal(deptFromInsee('97411'), '974');
  assert.equal(deptFromInsee('13055'), '13');
  assert.equal(deptFromPostcode('20000'), '2A');
  assert.equal(deptFromPostcode('20200'), '2B');
  assert.equal(deptFromPostcode('97400'), '974');
  assert.equal(deptFromPostcode('06000'), '06');
});

test('fetchJson: time-out + retry', async () => {
  let n = 0;
  const hang = (url, { signal }) => { n++; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))); };
  const r = await fetchJson('http://x', { timeoutMs: 50, retries: 1, retryDelayMs: 1, fetchImpl: hang });
  assert.equal(r.status, 'time-out'); assert.equal(n, 2);
});

test('fetchJson: retry bij 503, geen retry bij 404, slaagt na retry', async () => {
  let n = 0;
  const f503then200 = async () => (++n === 1 ? new Response('', { status: 503 }) : new Response('{"a":1}', { status: 200 }));
  const ok = await fetchJson('http://x', { retryDelayMs: 1, fetchImpl: f503then200 });
  assert.equal(ok.ok, true); assert.equal(ok.attempts, 2);
  n = 0;
  const f404 = async () => { n++; return new Response('', { status: 404 }); };
  const bad = await fetchJson('http://x', { retryDelayMs: 1, fetchImpl: f404 });
  assert.equal(bad.status, 'fout'); assert.equal(n, 1);
});

test('risques: deelresultaten met status per bron', async () => {
  const f = async (url) => {
    if (url.includes('/radon')) return new Response(JSON.stringify({ data: [{ classe_potentiel: '3' }] }), { status: 200 });
    if (url.includes('/cavites')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (url.includes('/gaspar')) return new Response('', { status: 503 });
    return new Response('', { status: 404 });
  };
  const slow = (u, o) => f(u);
  const r = await fetchRisques({ lat: 43.3, lon: 5.37, insee: '13055', fetchImpl: slow });
  assert.equal(r.radon.status, 'ok'); assert.equal(r.radon.niveau, 'fort');
  assert.equal(r.cavites.status, 'leeg');
  assert.equal(r.inondation.status, 'fout');
  assert.equal(r.status, 'deels');
  assert.ok(r.links.rapport.includes('13055'));
});

test('risques: totaalbudget, deelresultaten, geen retry na time-out', async () => {
  const calls = {};
  const f = (url, o) => {
    const k = url.split('/api/v1/')[1].split('?')[0];
    calls[k] = (calls[k] || 0) + 1;
    if (k === 'radon') return Promise.resolve(new Response(JSON.stringify({ data: [{ classe_potentiel: '2' }] }), { status: 200 }));
    return new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))));
  };
  const t0 = Date.now();
  const r = await fetchRisques({ lat: 43.3, lon: 5.37, insee: '13055', fetchImpl: f, budgetMs: 200 });
  const ms = Date.now() - t0;
  assert.ok(ms < 600, `duurde ${ms} ms`);
  assert.equal(r.radon.status, 'ok');
  assert.equal(r.bronnen.cavites.status, 'time-out');
  assert.equal(r.status, 'deels');
  assert.equal(calls.cavites, 1);
});

test('risques: 5xx wordt binnen het budget nog eens geprobeerd', async () => {
  let n = 0;
  const f = async (url) => {
    if (url.includes('/radon')) { n++; return n === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify({ data: [{ classe_potentiel: '1' }] }), { status: 200 }); }
    return new Response('', { status: 404 });
  };
  const r = await fetchRisques({ lat: 43.3, lon: 5.37, insee: '13055', fetchImpl: f, budgetMs: 2000 });
  assert.equal(r.radon.status, 'ok'); assert.equal(n, 2);
});
