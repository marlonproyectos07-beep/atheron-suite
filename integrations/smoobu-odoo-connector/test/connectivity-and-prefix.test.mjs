import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnectivity, classifyNetworkError, hostsToCheck } from '../src/connectivity.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { runDiagnosis, detectPrefix } from '../src/diagnose.mjs';
import { UNITS } from '../src/unit-map.mjs';

test('conectividad: clasifica DNS y reporta codigos HTTP sin credenciales', async () => {
  const env = { ODOO_BASE_URL: 'https://o.example/path' };
  assert.deepEqual(hostsToCheck(env), ['https://login.smoobu.com', 'https://o.example']);
  const r = await checkConnectivity({ env, fetchImpl: async (u) => {
    if (u.includes('smoobu')) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    return { status: 401 };
  } });
  assert.deepEqual(r, [{ origin: 'https://login.smoobu.com', reachable: false, cause: 'DNS' }, { origin: 'https://o.example', reachable: true, httpStatus: 401 }]);
  assert.equal(classifyNetworkError({ name: 'TimeoutError' }), 'TIMEOUT');
});

test('el prefijo de ruta entra en la firma y la URL', async () => {
  const calls = [];
  const c = new SmoobuClient({ apiKey: 'k', apiSecret: 's', pathPrefix: '/api/v1', fetchImpl: async (u) => { calls.push(u); return { ok: true, json: async () => ({ apartments: [] }) }; } });
  await c.listProperties();
  assert.equal(calls[0], 'https://login.smoobu.com/api/v1/apartments');
});

const apartments = UNITS.map((u) => ({ id: u.smoobuApartmentId }));
const mk = (okPrefix) => (pathPrefix) => ({ pathPrefix, listProperties: async () => {
  if (pathPrefix !== okPrefix) throw Object.assign(new Error('x'), { code: 'SMOOBU_NOT_FOUND', status: 404 });
  return apartments;
} });

test('detectPrefix: prueba /api y cae a /api/v1 solo ante 404', async () => {
  const a = await detectPrefix(mk('/api/v1'));
  assert.equal(a.prefix, '/api/v1'); assert.deepEqual(a.tried.map((t) => t.httpStatus), [404, 200]);
  const b = await detectPrefix(mk('/api'));
  assert.equal(b.prefix, '/api');
  const c = await detectPrefix(() => ({ listProperties: async () => { throw Object.assign(new Error('x'), { code: 'SMOOBU_AUTH_REJECTED', status: 401 }); } }));
  assert.equal(c.tried.length, 1); // un 401 no se confunde con ruta equivocada
  const d = await detectPrefix(mk('/otro'));
  assert.equal(d.prefix, null);
});
