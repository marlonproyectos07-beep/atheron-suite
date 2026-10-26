import test from 'node:test';
import assert from 'node:assert/strict';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { HEADER_NAMES } from '../src/smoobu-hmac.mjs';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const SECRET = 'TEST-SECRET-FICTICIO';

test('Smoobu: GET firmado, paginacion y sin secreto en la peticion', async () => {
  const calls = [];
  const c = new SmoobuClient({ baseUrl: 'https://smoobu.test/', keyId: 'kid', secret: SECRET, now: () => 1000,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return ok({ bookings: [{ id: calls.length }], page_count: 2 }); } });
  const all = await c.listReservations({ from: '2026-01-01' });
  assert.equal(all.length, 2);
  assert.ok(calls.every((x) => x.init.method === 'GET' && x.init.headers[HEADER_NAMES.signature]));
  assert.ok(calls.every((x) => !JSON.stringify(x).includes(SECRET)));
  assert.match(calls[1].url, /page=2/);
});

test('Smoobu: modo api-key y errores saneados', async () => {
  const c = new SmoobuClient({ baseUrl: 'https://s.test', secret: SECRET, authMode: 'api-key',
    fetchImpl: async (u, init) => (init.headers['Api-Key'] === SECRET ? { ok: false, status: 429 } : ok({})) });
  await assert.rejects(c.listProperties(), (e) => e.code === 'SMOOBU_UPSTREAM_UNAVAILABLE' && e.retryable && !String(e.message).includes(SECRET));
  await assert.rejects(c.getReservation('abc'), { code: 'SMOOBU_INVALID_ID' });
});

test('Smoobu: respuesta invalida', async () => {
  const c = new SmoobuClient({ baseUrl: 'https://s.test', keyId: 'k', secret: SECRET, fetchImpl: async () => ok({ nada: 1 }) });
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
  assert.equal(req, null);
});

test('Odoo JSON-2: 404 por plan sin JSON-2 se traduce a codigo', async () => {
  const c = new OdooJson2Client({ baseUrl: 'https://o.test', database: 'db', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 404 }) });
  await assert.rejects(c.listRoles(), { code: 'ODOO_NOT_FOUND' });
});

test('config: falta de variables informa nombres, nunca valores', () => {
  assert.throws(() => loadSmoobuConfig({ SMOOBU_SECRET: SECRET }), (e) => e.code === 'SMOOBU_ENV_MISSING' && !JSON.stringify(e.missing).includes(SECRET));
  assert.throws(() => loadOdooConfig({}), { code: 'ODOO_ENV_MISSING' });
  assert.equal(loadSmoobuConfig({ SMOOBU_BASE_URL: 'u', SMOOBU_KEY_ID: 'k', SMOOBU_SECRET: 's' }).authMode, 'hmac');
});
