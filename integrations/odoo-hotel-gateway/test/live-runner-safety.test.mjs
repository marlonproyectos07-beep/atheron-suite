import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertApprovedRate, executeSafeRun, inventory, windowAt, verifyJournal } from '../scripts/live-runner-safety.mjs';
import { loadGuardedConfig, runPriceTiers, runGate4, runInverseGate, summarize } from '../scripts/live-hotel-008a-runner.mjs';

const env = { ODOO_DATABASE: 'atheron1-hotel-staging-20260923', ODOO_ACTION_ID: '1967',
  ODOO_BASE_URL: 'https://atheron1-hotel-staging-20260923.odoo.com',
  ODOO_TECHNICAL_USER: 'offline-user', ODOO_TECHNICAL_SECRET: 'offline-not-a-secret',
  HOTEL008A_CHECK_IN: '2099-03-10', HOTEL008A_CHECK_OUT: '2099-03-12' };
const config = () => loadGuardedConfig(env);
const rate = { id: 31, x_gov_state: 'approved', x_rule_code: 'RATE-AHS-CASA-BASE10-ADD',
  x_pricing_model: 'base_plus_extra', x_price_night: 500000, x_base_guests: 10,
  x_extra_person_price: 50000, x_max_guests: 22, x_active: true, x_unit_id: [6, 'CASA COMPLETA'], x_property_id: [1, 'HOTEL'] };
function transport(row = rate) {
  return { calls: [], async call(service, method, args) {
    this.calls.push({ service, method, args });
    return service === 'common' ? 27 : [row];
  } };
}
const names = ['201', '202', '203', '301', '302', 'CASA COMPLETA'];
const units = Object.fromEntries(names.map((n, i) => [n.replace(' ', '_'), i + 1]));
function backend() {
  const holds = [], quotes = new Map(); let expired = false;
  return { holds, expire() { expired = true; },
    async availability(p) {
      const active = expired ? [] : holds.filter(h => h.dates.check_in === p.check_in);
      return { data: { opciones: names.map((nombre, i) => ({ property_id: 1, nombre, unit_id: i + 1,
        estado: active.some(h => h.unit_id === 6 || i === 5 || h.unit_id === i + 1) ? 'no_disponible' : 'disponible' })) } };
    },
    async quote(p) {
      // Fake Odoo only. Production runner never sends these amounts upstream.
      const nights = (Date.parse(p.check_out) - Date.parse(p.check_in)) / 86400000;
      const q = { quote_id: quotes.size + 100, opciones: names.map((nombre, i) => ({ nombre,
        unit_id: i + 1, property_id: 1, currency: 'COP', pricing_status: 'quoted', approval_level: 'approved',
        rate_rule_id: i === 5 ? 'RATE-AHS-CASA-BASE10-ADD' : 'ROOM_TEST_RULE',
        precio_total: (i === 5 ? Math.max(500000, p.guests * 50000) : 80000) * nights })) };
      quotes.set(q.quote_id, { q, dates: p }); return { data: q };
    },
    async hold(p) {
      const { q, dates } = quotes.get(p.quote_id);
      const hold = { hold_id: holds.length + 1000, unit_id: p.unit_id, dates,
        precio_total: q.opciones.find(o => o.unit_id === p.unit_id).precio_total };
      holds.push(hold); return { data: hold };
    },
    async status(p) { const h = holds.find(h => h.hold_id === p.operation_id);
      return { data: { hold_id: h.hold_id, status: expired ? 'hold_expired' : 'hold_active',
        precio_total: h.precio_total, hold_expires_utc: '2099-01-01 02:00:00' } }; },
  };
}
test('guard rejects wrong host/action before any transport', () => {
  assert.throws(() => loadGuardedConfig({ ...env, ODOO_BASE_URL: 'https://production.invalid' }));
  assert.throws(() => loadGuardedConfig({ ...env, ODOO_ACTION_ID: '1' }));
});
test('VALIDATED blocks with login and read only; no action execution or approval', async () => {
  const t = transport({ ...rate, x_gov_state: 'validated' });
  await assert.rejects(assertApprovedRate(config(), t), /NOT_APPROVED/);
  assert.equal(t.calls.length, 2);
  assert.deepEqual(t.calls[1].args.slice(3, 6), ['x_hotel_rate', 'read', [[31]]]);
});
test('APPROVED with wrong pricing configuration still blocks', async () => {
  await assert.rejects(assertApprovedRate(config(), transport({ ...rate, x_price_night: 1 })), /MISMATCH/);
});
test('windows are independent and past dates fail', () => {
  const a = windowAt(config(), 0), b = windowAt(config(), 1);
  assert.ok(a.checkOut < b.checkIn);
  assert.throws(() => windowAt({ dates: { checkIn: '2020-01-01', checkOut: '2020-01-02' } }, 0));
});
test('inventory rejects missing units and duplicate names instead of vacuous PASS', async () => {
  const c = { ...config(), propertyId: 1, unitIds: units };
  const response = await backend().availability({});
  assert.equal(Object.keys(inventory(response, c)).length, 6);
  response.data.opciones.pop();
  assert.throws(() => inventory(response, c), /AMBIGUOUS/);
});
test('all: real response shapes, three independent holds, persisted state, full expiration restoration', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hotel008a-offline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = path.join(dir, 'state.json'); const adapter = backend();
  const args = { phase: 'all', config: config(), adapter, transport: transport(), stateFile, runPriceTiers, runGate4, runInverseGate };
  const result = await executeSafeRun(args);
  assert.equal(result.overall, 'PASS_FUNCTIONAL_PENDING_EXPIRY');
  assert.equal(adapter.holds.length, 3);
  assert.equal(new Set(adapter.holds.map(h => h.dates.check_in)).size, 3);
  const text = await readFile(stateFile, 'utf8');
  assert.ok(!text.includes(env.ODOO_TECHNICAL_SECRET));
  const state = JSON.parse(text);
  assert.equal(state.holds.length, 3);
  assert.equal(state.pending, null);
  await assert.rejects(executeSafeRun(args), /EXISTING_RUN/);
  assert.equal((await verifyJournal(adapter, state)).overall, 'PENDING_EXPIRY');
  adapter.expire();
  assert.equal((await executeSafeRun({ ...args, phase: 'verify-expiration' })).overall, 'PASS');
  assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).cleanup_verified, true);
});
test('uncertain hold request cannot be treated as verified cleanup', async () => {
  await assert.rejects(verifyJournal(backend(), { database: env.ODOO_DATABASE, holds: [{}], pending: { operation: 'hold' } }), /UNRESOLVED/);
});
test('empty, skipped and created are never PASS', () => {
  for (const states of [[], [{ overall: 'SKIPPED' }], [{ overall: 'CREATED' }]]) assert.notEqual(summarize(states).overall, 'PASS');
});
