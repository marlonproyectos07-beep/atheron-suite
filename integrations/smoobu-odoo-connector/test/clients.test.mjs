import test from 'node:test';
import assert from 'node:assert/strict';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { loadSmoobuConfig, loadOdooConfig, PUBLIC_VARS, SECRET_VARS } from '../src/config.mjs';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const SECRET = 'TEST-SECRET-FICTICIO';

test('Smoobu: GET firmado, paginacion y sin secreto en la peticion', async () => {
  const calls = [];
  const c = new SmoobuClient({ baseUrl: 'https://smoobu.test/', apiKey: 'kid', apiSecret: SECRET, now: () => 1000,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return ok({ bookings: [{ id: calls.length }], page_count: 2 }); } });
  const all = await c.listReservations({ from: '2026-01-01' });
  assert.equal(all.length, 2);
  assert.ok(calls.every((x) => x.init.method === 'GET' && x.init.headers['X-Signature'] && x.init.headers['X-API-Key'] === 'kid'));
  assert.ok(calls.every((x) => !JSON.stringify(x).includes(SECRET)));
  assert.match(calls[1].url, /page=2/);
});

test('Smoobu: errores saneados', async () => {
  const c = new SmoobuClient({ baseUrl: 'https://s.test', apiKey: 'k', apiSecret: SECRET,
    fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(c.listProperties(), (e) => e.code === 'SMOOBU_UPSTREAM_UNAVAILABLE' && e.retryable && !String(e.message).includes(SECRET));
  await assert.rejects(c.getReservation('abc'), { code: 'SMOOBU_INVALID_ID' });
});

test('Smoobu: respuesta invalida', async () => {
  const c = new SmoobuClient({ baseUrl: 'https://s.test', apiKey: 'k', apiSecret: SECRET, fetchImpl: async () => ok({ nada: 1 }) });
  await assert.rejects(c.listProperties(), { code: 'SMOOBU_RESPONSE_INVALID' });
});

test('Odoo JSON-2: bearer, base de datos, y rechazo de escrituras antes de la red', async () => {
  let req;
  const c = new OdooJson2Client({ baseUrl: 'https://o.test', database: 'db', apiKey: 'TEST-KEY', fetchImpl: async (u, i) => { req = { u, i }; return ok([]); } });
  await c.listSlotsForRole(37, { from: '2026-01-01', to: '2026-01-03' });
  assert.equal(req.u, 'https://o.test/json/2/planning.slot/search_read');
  assert.equal(req.i.headers.authorization, 'bearer TEST-KEY');
  assert.equal(req.i.headers['x-odoo-database'], 'db');
  req = null;
  for (const m of ['create', 'write', 'unlink', 'action_confirm']) await assert.rejects(c.call('planning.slot', m, {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  await assert.rejects(c.call('../x', 'read', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  await assert.rejects(c.call('x_availability/../planning.slot', 'read', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  await assert.rejects(c.call('x_availability', 'write', {}), { code: 'ODOO_READ_ONLY_VIOLATION' });
  assert.equal(req, null);
});

test('Odoo JSON-2: 404 por plan sin JSON-2 se traduce a codigo', async () => {
  const c = new OdooJson2Client({ baseUrl: 'https://o.test', database: 'db', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 404 }) });
  await assert.rejects(c.listRoles(), { code: 'ODOO_NOT_FOUND' });
});

test('config: falta de variables informa nombres, nunca valores', () => {
  assert.throws(() => loadSmoobuConfig({ SMOOBU_API_SECRET: SECRET }), (e) => e.code === 'SMOOBU_ENV_MISSING' && e.missing.join() === 'SMOOBU_API_KEY' && !JSON.stringify(e.missing).includes(SECRET));
  assert.throws(() => loadOdooConfig({}), { code: 'ODOO_ENV_MISSING' });
  const cfg = loadSmoobuConfig({ SMOOBU_API_KEY: 'k', SMOOBU_API_SECRET: 's' });
  assert.equal(cfg.baseUrl, 'https://login.smoobu.com');
  assert.deepEqual([PUBLIC_VARS.length, SECRET_VARS.length], [3, 3]);
});

test('Odoo JSON-2: modelos propios de Studio (x_...) se pueden LEER, no escribir', async () => {
  const urls = [];
  const c = new OdooJson2Client({ baseUrl: 'https://o.test', database: 'db', apiKey: 'k', fetchImpl: async (u) => { urls.push(u); return ok([]); } });
  await c.call('x_availability', 'search_read', {});
  assert.deepEqual(urls, ['https://o.test/json/2/x_availability/search_read']);
});
