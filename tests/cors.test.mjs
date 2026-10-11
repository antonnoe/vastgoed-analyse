import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corsHeaders, ALLOWED_ORIGINS, jsonResponse } from '../lib/http.js';

test('CORS: allowlist, geen wildcard', () => {
  assert.deepEqual(ALLOWED_ORIGINS, ['https://infofrankrijk.com', 'https://www.infofrankrijk.com', 'https://www.dossierfrankrijk.nl', 'https://cafeclaude.fr', 'https://www.cafeclaude.fr']);
  for (const o of ALLOWED_ORIGINS) assert.equal(corsHeaders(o)['Access-Control-Allow-Origin'], o);
  assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
  assert.equal(corsHeaders(null)['Access-Control-Allow-Origin'], undefined); // zelfde origin: geen Origin-header, geen CORS nodig
  assert.equal(corsHeaders('https://infofrankrijk.com').Vary, 'Origin');
  assert.equal(corsHeaders(null)['X-Robots-Tag'], 'noindex, nofollow');
});

test('jsonResponse: noindex en geen wildcard', () => {
  const r = jsonResponse({ a: 1 }, { origin: 'https://evil.example' });
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('vercel.json: noindex-header overal, geen CORS-wildcard; pagina heeft meta robots', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  const all = JSON.stringify(v);
  // Alleen voor pagina's (niet /api): vaste origin, nooit een wildcard.
  assert.doesNotMatch(all, /Access-Control-Allow-Origin","value":"\*/);
  const cors = v.headers.filter((x) => x.headers.some((y) => y.key === 'Access-Control-Allow-Origin'));
  assert.ok(cors.every((x) => x.source.includes('?!api/')));
  const h = v.headers.find((x) => x.source === '/(.*)');
  assert.ok(h.headers.some((x) => x.key === 'X-Robots-Tag' && x.value === 'noindex, nofollow'));
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /transactions|\.adresse/);
  assert.doesNotMatch(html, /P25|P75|[ (,]n=/);
  assert.match(html, /<title>[^<—–]*<\/title>/);
});
