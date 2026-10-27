import test from 'node:test';
import assert from 'node:assert/strict';
import { hmacHeaders, canonicalString } from '../src/smoobu-hmac.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';

/**
 * ATH-DEV-022 — vectores INDEPENDIENTES: las firmas esperadas se calcularon fuera de Node (Python hmac/hashlib y
 * `openssl dgst -sha256 -hmac`, coincidieron entre si) con credenciales ficticias. No hay llamadas a Smoobu.
 */
const KEY = 'K3Y-FICTICIA';
const SECRET = 'S3CR3T-FICTICIO';
const NOW = Date.parse('2026-10-27T13:16:51Z');

test('vector independiente 1: GET /api/apartments (query vacia = linea vacia, sin salto final)', () => {
  const nonce = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const h = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'GET', path: '/api/apartments', now: NOW, nonce });
  assert.equal(h['X-Signature'], 'uCzYKLxt0f6Yfl7g0fb3JN6K+utRhTtuW2OpFPI9iYo=');
  const c = canonicalString({ method: 'GET', path: '/api/apartments', query: {}, timestamp: h['X-Timestamp'], nonce, apiKey: KEY });
  assert.equal(c.split('\n').length, 7);
  assert.ok(!c.endsWith('\n') && !c.includes('\r'));
  assert.equal(c.split('\n')[2], '');
});
test('vector independiente 2: GET con query ordenada', () => {
  const h = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'GET', path: '/api/reservations', query: { to: '2026-02-01', from: '2026-01-01' }, now: NOW, nonce: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  assert.equal(h['X-Signature'], 'ScbEaQE3sgjm63KDypSQaIgt37fgh258drab3OcVFYk=');
});
test('vector independiente 3: POST con cuerpo', () => {
  const h = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'POST', path: '/api/x', body: '{"a":1}', now: NOW, nonce: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
  assert.equal(h['X-Signature'], 'ofIImkMUPis71M89bsYumPk/oQGAfzkFM1qKO9ggMOY=');
});

test('el cliente envia a https://login.smoobu.com/api/apartments las 4 cabeceras y firma lo que envia', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200, json: async () => ({ apartments: [{ id: 1 }] }) }; };
  const c = new SmoobuClient({ apiKey: KEY, apiSecret: SECRET, fetchImpl, now: () => NOW });
  await c.listProperties();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://login.smoobu.com/api/apartments');
  assert.equal(sent[0].init.method, 'GET');
  const h = sent[0].init.headers;
  assert.deepEqual(['X-API-Key', 'X-Nonce', 'X-Signature', 'X-Timestamp'].filter((k) => h[k]), ['X-API-Key', 'X-Nonce', 'X-Signature', 'X-Timestamp']);
  assert.equal(h['X-API-Key'], KEY);
  assert.equal(h['X-Timestamp'], '2026-10-27T13:16:51Z');
  // recalculo independiente con el nonce realmente enviado
  const ref = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'GET', path: '/api/apartments', now: NOW, nonce: h['X-Nonce'] });
  assert.equal(h['X-Signature'], ref['X-Signature']);
  assert.ok(!JSON.stringify(h).includes(SECRET));
});

test('la query firmada es la misma cadena que se envia en la URL', async () => {
  const sent = [];
  const fetchImpl = async (url) => { sent.push(url); return { ok: true, status: 200, json: async () => ({ bookings: [] }) }; };
  const c = new SmoobuClient({ apiKey: KEY, apiSecret: SECRET, fetchImpl, now: () => NOW });
  await c.get('/reservations', { to: '2026-02-01', from: '2026-01-01' });
  assert.equal(sent[0], 'https://login.smoobu.com/api/reservations?from=2026-01-01&to=2026-02-01');
});
