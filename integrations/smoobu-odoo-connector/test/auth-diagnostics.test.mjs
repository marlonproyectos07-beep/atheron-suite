import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { sanitizeDetail } from '../src/errors.mjs';
import { loadSmoobuConfig, credentialHygiene } from '../src/config.mjs';
import { hmacHeaders, canonicalString, isoTimestamp } from '../src/smoobu-hmac.mjs';
import { runDiagnosis, classify, clockSkewSeconds, detectPrefix } from '../src/diagnose.mjs';
import { UNITS } from '../src/unit-map.mjs';

const SECRET = 'TEST-SECRET-FICTICIO';
const KEY = 'TEST-KEY-FICTICIA';

test('conformidad independiente: la firma coincide con openssl (no con nuestro codigo)', (t) => {
  let opensslOk = true;
  try { execFileSync('openssl', ['version']); } catch { opensslOk = false; }
  if (!opensslOk) return t.skip('openssl no disponible');
  const parts = { method: 'GET', path: '/api/reservations', query: { to: '2026-02-01', from: '2026-01-01' }, timestamp: '2026-10-26T15:00:00Z', nonce: '3f9c1c1e-5b0a-4d6e-9c55-0d6a5d3f8a11', apiKey: KEY };
  // Cadena canonica escrita a mano, siguiendo el esquema publicado (metodo, ruta, query ordenada, timestamp, nonce, sha256 hex de cuerpo vacio, API key)
  const canonical = `GET\n/api/reservations\nfrom=2026-01-01&to=2026-02-01\n2026-10-26T15:00:00Z\n3f9c1c1e-5b0a-4d6e-9c55-0d6a5d3f8a11\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n${KEY}`;
  assert.equal(canonicalString(parts), canonical);
  const hex = execFileSync('openssl', ['dgst', '-sha256', '-hmac', SECRET, '-binary'], { input: canonical }).toString('base64');
  const h = hmacHeaders({ apiKey: KEY, apiSecret: SECRET, method: 'GET', path: parts.path, query: parts.query, now: Date.parse(parts.timestamp), nonce: parts.nonce });
  assert.equal(h['X-Signature'], hex);
});

test('timestamp: UTC, sin desfase respecto del reloj inyectado', () => {
  assert.equal(isoTimestamp(Date.parse('2026-10-26T15:00:00.987Z')), '2026-10-26T15:00:00Z');
  assert.equal(clockSkewSeconds('Mon, 26 Oct 2026 15:00:00 GMT', Date.parse('2026-10-26T15:00:03Z')), 3);
  assert.equal(clockSkewSeconds(undefined), null);
});

test('un 401 de Smoobu conserva un mensaje saneado (sin credenciales) y la fecha del servidor', async () => {
  const c = new SmoobuClient({ apiKey: KEY, apiSecret: SECRET, fetchImpl: async () => ({
    ok: false, status: 401, headers: { get: () => 'Mon, 26 Oct 2026 15:00:00 GMT' },
    text: async () => `Invalid signature for key ${KEY} secret ${SECRET}\u0000 https://x.test/a`,
  }) });
  await assert.rejects(c.listProperties(), (e) => e.status === 401 && /Invalid signature/.test(e.detail)
    && !e.detail.includes(KEY) && !e.detail.includes(SECRET) && !e.detail.includes('https://') && e.serverDate.includes('2026'));
  assert.equal(sanitizeDetail('x'.repeat(500)).length, 160);
});

test('un 500 no lee el cuerpo (puede traer datos)', async () => {
  let read = false;
  const c = new SmoobuClient({ apiKey: KEY, apiSecret: SECRET, fetchImpl: async () => ({ ok: false, status: 500, headers: { get: () => null }, text: async () => { read = true; return 'x'; } }) });
  await assert.rejects(c.listProperties(), { code: 'SMOOBU_UPSTREAM_UNAVAILABLE' });
  assert.equal(read, false);
});

test('config recorta espacios/saltos de linea de las credenciales y la higiene no revela valores', () => {
  const env = { SMOOBU_API_KEY: ` ${KEY}\n`, SMOOBU_API_SECRET: `"${SECRET}"` };
  assert.equal(loadSmoobuConfig(env).apiKey, KEY);
  const h = credentialHygiene(env);
  assert.equal(h.SMOOBU_API_KEY.hasOuterWhitespace, true);
  assert.equal(h.SMOOBU_API_SECRET.hasQuotes, true);
  assert.equal(h.keyEqualsSecret, false);
  assert.ok(!JSON.stringify(h).includes(SECRET) && !JSON.stringify(h).includes(KEY));
  assert.equal(credentialHygiene({ SMOOBU_API_KEY: 'a', SMOOBU_API_SECRET: 'a' }).keyEqualsSecret, true);
});

const apartments = UNITS.map((u) => ({ id: u.smoobuApartmentId }));
const e401 = (detail) => Object.assign(new Error('x'), { code: 'SMOOBU_AUTH_REJECTED', status: 401, detail });
const okOdoo = { searchRead: async () => [{ id: 37, name: 'N' }], listSlotsForRole: async () => [] };

test('clasificacion: variables, 401 generico, firma, endpoint, Odoo y completo', async () => {
  assert.equal((await runDiagnosis({ env: {} })).classification, 'ENV_MISSING');
  const run = (smoobu, odoo = okOdoo) => runDiagnosis({ clients: { smoobu, odoo } });
  const bad = (err) => ({ listProperties: async () => { throw err; }, getReservation: async () => { throw err; } });
  assert.equal((await run(bad(e401(null)))).classification, 'SMOOBU_AUTH_401');
  assert.equal((await run(bad(e401('Invalid signature')))).classification, 'SMOOBU_SIGNATURE_ERROR');
  assert.equal((await run(bad(Object.assign(new Error('x'), { code: 'SMOOBU_NOT_FOUND', status: 404 })))).classification, 'SMOOBU_ENDPOINT_ERROR');
  const smoobuOk = { listProperties: async () => apartments, getReservation: async () => ({ apartment: { id: 3557521 }, arrival: '2026-05-01', departure: '2026-05-03' }) };
  const odooBad = { searchRead: async () => { throw Object.assign(new Error('x'), { code: 'ODOO_AUTH_REJECTED', status: 401 }); } };
  assert.equal((await run(smoobuOk, odooBad)).classification, 'ODOO_FAILURE');
  assert.equal((await run(smoobuOk)).classification, 'COMPLETE');
});

test('detectPrefix prueba ambos prefijos tambien ante 401 y reporta cada intento', async () => {
  const r = await detectPrefix(() => ({ listProperties: async () => { throw e401('Invalid signature'); } }));
  assert.equal(r.tried.length, 2); assert.equal(r.prefix, null);
  assert.equal(r.tried[0].detail, 'Invalid signature');
});

test('el informe real de un fallo incluye intentos de prefijo y mensaje saneado', async () => {
  const smoobu = { listProperties: async () => { throw e401('Missing X-Nonce'); }, getReservation: async () => { throw e401('Missing X-Nonce'); } };
  const r = await runDiagnosis({ env: { SMOOBU_API_KEY: ' k\n' }, clients: { smoobu, odoo: okOdoo } });
  assert.equal(r.classification, 'SMOOBU_SIGNATURE_ERROR');
  assert.equal(r.credentialHygiene.SMOOBU_API_KEY.hasOuterWhitespace, true);
  assert.ok(!JSON.stringify(r).includes(' k\n'));
});
