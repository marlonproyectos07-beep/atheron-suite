import test from 'node:test';
import assert from 'node:assert/strict';
import { runDiagnosis } from '../src/diagnose.mjs';
import { UNITS } from '../src/unit-map.mjs';

const SECRET = 'TEST-SECRET-FICTICIO';
const fakeSmoobu = (over = {}) => ({
  listProperties: async () => UNITS.map((u) => ({ id: u.smoobuApartmentId, name: 'x' })).concat([{ id: 1, name: 'Carrera 19' }]),
  getReservation: async () => ({ id: 161419736, apartment: { id: 3557521 }, arrival: '2026-05-01', departure: '2026-05-03', 'guest-name': 'NO DEBE SALIR' }),
  ...over,
});
const fakeOdoo = (over = {}) => ({
  searchRead: async () => [{ id: 37, name: 'X' }],
  listSlotsForRole: async (role) => (role === 37 ? [{ id: 5 }, { id: 6 }] : []),
  ...over,
});

test('sin credenciales: BLOCKED, sin exito inventado y sin lecturas reales', async () => {
  const r = await runDiagnosis({ env: {} });
  assert.equal(r.overall, 'BLOCKED'); assert.equal(r.realReads, 0);
  assert.ok(r.steps.every((s) => s.status !== 'OK'));
});

test('con clientes simulados: seis unidades, reserva 301, rol 37, sin datos de huesped', async () => {
  const r = await runDiagnosis({ clients: { smoobu: fakeSmoobu(), odoo: fakeOdoo() } });
  assert.equal(r.overall, 'OK');
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.equal(by['smoobu.auth+apartments'].allSixFound, true);
  assert.equal(by['smoobu.reservation.161419736'].isUnit301, true);
  assert.equal(by['odoo.json2+role37'].role37Exists, true);
  assert.deepEqual(by['odoo.slots-vs-reservation'].slotIds, [5, 6]);
  assert.ok(!JSON.stringify(r).includes('NO DEBE SALIR'));
});

test('fallo de autenticacion Smoobu se informa como FAIL con codigo, sin filtrar secretos', async () => {
  const smoobu = fakeSmoobu({ listProperties: async () => { const e = new Error(SECRET); e.code = 'SMOOBU_AUTH_REJECTED'; e.status = 401; throw e; } });
  const r = await runDiagnosis({ clients: { smoobu, odoo: fakeOdoo() } });
  assert.equal(r.overall, 'FAIL');
  assert.equal(r.steps[0].code, 'SMOOBU_AUTH_REJECTED');
  assert.ok(!JSON.stringify(r).includes(SECRET));
});

test('Odoo sin JSON-2 (404) se informa sin romper la lectura de Smoobu', async () => {
  const odoo = fakeOdoo({ searchRead: async () => { const e = new Error('x'); e.code = 'ODOO_NOT_FOUND'; e.status = 404; throw e; } });
  const r = await runDiagnosis({ clients: { smoobu: fakeSmoobu(), odoo } });
  assert.equal(r.overall, 'FAIL');
  assert.equal(r.steps.find((s) => s.name === 'odoo.json2+role37').code, 'ODOO_NOT_FOUND');
  assert.equal(r.steps.find((s) => s.name.startsWith('smoobu.reservation')).status, 'OK');
});
