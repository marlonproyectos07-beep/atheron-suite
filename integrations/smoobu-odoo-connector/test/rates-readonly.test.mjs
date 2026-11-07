import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { canonicalQuery, canonicalString } from '../src/smoobu-hmac.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { validateRatesInput, inspectDailyRates } from '../src/rates-readonly.mjs';
const ids = [3557506, 3557511];
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });

test('GET /rates: apartments[] repetido ordenado y firmado exactamente igual que la URL', async () => {
  let seen;
  const client = new SmoobuClient({ baseUrl: 'https://s.test', apiKey: 'k', apiSecret: 'TEST-SECRET', now: () => 0, fetchImpl: async (url, init) => { seen = { url, init }; return ok({ '3557506': {} }); } });
  await client.getRates({ startDate: '2026-12-01', endDate: '2026-12-02', apartmentIds: [3557511, 3557506] });
  const params = { 'apartments[]': ids, start_date: '2026-12-01', end_date: '2026-12-02' };
  const query = canonicalQuery(params);
  assert.equal(query, 'apartments%5B%5D=3557506&apartments%5B%5D=3557511&end_date=2026-12-02&start_date=2026-12-01');
  assert.equal(seen.url, 'https://s.test/api/rates?' + query);
  assert.equal(seen.init.method, 'GET');
  const h = seen.init.headers;
  const canonical = canonicalString({ method: 'GET', path: '/api/rates', query: params, timestamp: h['X-Timestamp'], nonce: h['X-Nonce'], apiKey: 'k' });
  assert.equal(h['X-Signature'], createHmac('sha256', 'TEST-SECRET').update(canonical).digest('base64'));
  assert.equal(seen.init.body, undefined);
  assert.ok(!JSON.stringify(seen).includes('TEST-SECRET'));
});

test('parametros no alteran canonico escalar existente', () => {
  assert.equal(canonicalQuery({ z: undefined, to: 'b', from: 'a' }), 'from=a&to=b');
});

test('rechaza fechas invalidas, rango extenso, IDs duplicados y no hace solicitudes', async () => {
  for (const startDate of ['2026-02-30', '2026/12/01', 'x']) assert.throws(() => validateRatesInput({ startDate, endDate: '2026-12-02', apartmentIds: ids }));
  assert.throws(() => validateRatesInput({ startDate: '2026-12-04', endDate: '2026-12-02', apartmentIds: ids }));
  assert.throws(() => validateRatesInput({ startDate: '2026-12-01', endDate: '2027-02-01', apartmentIds: ids }));
  assert.throws(() => validateRatesInput({ startDate: '2026-12-01', endDate: '2026-12-02', apartmentIds: [3557506, 3557506] }));
  let calls = 0;
  const c = new SmoobuClient({ apiKey: 'k', apiSecret: 's', fetchImpl: async () => { calls += 1; return ok({}); } });
  await assert.rejects(c.getRates({ startDate: '2026-02-30', endDate: '2026-12-02', apartmentIds: ids }));
  assert.equal(calls, 0);
});

test('resumen conservador: ausencia de noches, sin precio, bloqueos, minimo de noches y parent desconocido', () => {
  const base = { '2026-12-01': { price: 85000, available: 1, min_length_of_stay: 1 }, '2026-12-02': { price: 90000, available: 1, min_length_of_stay: 1 } };
  const p = { arrival: '2026-12-01', departure: '2026-12-03', physicalIds: ids };
  const success = inspectDailyRates({ ...p, rates: { '3557506': base } });
  assert.deepEqual(success[0], { apartmentId: 3557506, status: 'candidate_only', nightlyTotal: 175000, nights: 2, currency: 'UNVERIFIED', parentInventory: 'PARENT_NOT_RETURNED' });
  assert.equal(success[1].status, 'unknown');
  assert.equal(inspectDailyRates({ ...p, rates: { '3557506': { ...base, '2026-12-02': { price: 90000, available: 0 } } } })[0].status, 'unavailable');
  assert.equal(inspectDailyRates({ ...p, rates: { '3557506': { ...base, '2026-12-02': { price: null, available: 1 } } } })[0].status, 'unknown');
  assert.equal(inspectDailyRates({ ...p, rates: { '3557506': { ...base, '2026-12-01': { price: 1, available: 1, min_length_of_stay: 3 } } } })[0].reason, 'MIN_STAY_RESTRICTION');
});

test('respuesta con data invalido se rechaza sin nuevas llamadas', async () => {
  const c = new SmoobuClient({ apiKey: 'k', apiSecret: 's', fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }) });
  await assert.rejects(c.getRates({ startDate: '2026-12-01', endDate: '2026-12-02', apartmentIds: ids }), { code: 'SMOOBU_RESPONSE_INVALID' });
});
