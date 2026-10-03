import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSystem, cal } from './phase-b-fixtures.mjs';

const booking201 = { source: 'booking', unit: 'AHS-201' };
const airbnbCasa = { source: 'airbnb', unit: 'AHS-CASA' };
const event = { uid: 'booking-201@fixture', updated: '20270101T010000Z' };

test('runner continuo local: Booking 201 llega a Odoo y cierra CASA en Airbnb y Booking', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal(event));
  const runner = f.createRunner({ jobs: [booking201], outboundTargets: [airbnbCasa,
    { source: 'booking', unit: 'AHS-CASA' }] });
  const result = await runner.tick();
  assert.equal(result.status, 'OK');
  assert.equal(f.blocks.size, 1);
  assert.deepEqual(f.otaBlocks.get('airbnb:AHS-CASA'), [{ start: '2027-01-10', end: '2027-01-12' }]);
  assert.deepEqual(f.otaBlocks.get('booking:AHS-CASA'), [{ start: '2027-01-10', end: '2027-01-12' }]);
  assert.equal(runner.health().last_successful_sync['booking:AHS-201'], '2027-01-01T00:00:00Z');
  assert.equal(runner.health().at_risk_units, 6);
  assert.equal((await runner.tick()).status, 'OK');
  assert.equal(f.writes.filter(([operation]) => operation === 'apply').length, 1);
});

test('Airbnb CASA cierra las cinco habitaciones Booking en la proyeccion local', async () => {
  const f = fixtureSystem();
  f.feeds.set('airbnb:AHS-CASA', cal({ uid: 'air-casa@fixture' }));
  const targets = ['201', '202', '203', '301', '302'].map((room) => ({ source: 'booking', unit: `AHS-${room}` }));
  const result = await f.createRunner({ jobs: [airbnbCasa], outboundTargets: targets }).tick();
  assert.equal(result.status, 'OK');
  assert.equal(f.blocks.size, 1);
  for (const target of targets) {
    assert.deepEqual(f.otaBlocks.get(`booking:${target.unit}`), [{ start: '2027-01-10', end: '2027-01-12' }]);
  }
});

for (const source of ['direct', 'odoo']) {
  test(`${source.toUpperCase()} 201 cierra CASA en ambos canales desde inventario Odoo`, async () => {
    const f = fixtureSystem();
    f.blocks.set(`${source}-201`, { source, canonical_unit_id: 'AHS-201',
      idempotency_key: `${source}-201`, check_in: '2027-01-10', check_out: '2027-01-12', status: 'blocked' });
    const result = await f.createRunner({ outboundTargets: [airbnbCasa,
      { source: 'booking', unit: 'AHS-CASA' }] }).tick();
    assert.equal(result.status, 'OK');
    assert.equal(f.otaBlocks.get('airbnb:AHS-CASA').length, 1);
    assert.equal(f.otaBlocks.get('booking:AHS-CASA').length, 1);
  });
}

test('liberar una habitacion conserva CASA cerrada mientras otra sigue ocupada', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'b-201' }));
  f.feeds.set('airbnb:AHS-202', cal({ uid: 'a-202' }));
  const runner = f.createRunner({ jobs: [booking201, { source: 'airbnb', unit: 'AHS-202' }],
    outboundTargets: [airbnbCasa] });
  await runner.tick();
  assert.equal(f.blocks.size, 2);
  f.feeds.set('booking:AHS-201', cal());
  await runner.tick();
  await runner.tick();
  assert.equal(f.blocks.size, 1);
  assert.equal(f.otaBlocks.get('airbnb:AHS-CASA').length, 1);
  f.feeds.set('airbnb:AHS-202', cal());
  await runner.tick();
  await runner.tick();
  assert.equal(f.blocks.size, 0);
  assert.deepEqual(f.otaBlocks.get('airbnb:AHS-CASA'), []);
});

test('desaparicion en feed completo: primera lectura retiene; segunda libera solo su UID', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal(event));
  const runner = f.createRunner({ jobs: [booking201], outboundTargets: [airbnbCasa] });
  await runner.tick();
  f.feeds.set('booking:AHS-201', cal());
  const first = await runner.tick();
  assert.equal(first.inbound[0].outcomes[0].pending.length, 1);
  assert.equal(f.blocks.size, 1);
  const second = await runner.tick();
  assert.equal(second.inbound[0].outcomes[0].released.length, 1);
  assert.equal(f.blocks.size, 0);
  assert.deepEqual(f.otaBlocks.get('airbnb:AHS-CASA'), []);
  assert.equal(f.writes.filter(([operation]) => operation === 'release').length, 1);
});

test('Booking y Airbnb incompatibles producen alerta CRITICAL sin afirmar BOOKED_AT', async () => {
  const f = fixtureSystem();
  f.feeds.set('booking:AHS-201', cal({ uid: 'book-201' }));
  f.feeds.set('airbnb:AHS-CASA', cal({ uid: 'air-casa' }));
  const runner = f.createRunner({ jobs: [booking201, airbnbCasa], cutoffAt: '2027-01-01T00:00:00Z' });
  const result = await runner.tick();
  assert.equal(result.status, 'DEGRADED');
  assert.equal(f.blocks.size, 1);
  assert.equal(runner.health().conflict_count, 1);
  assert.equal(runner.health().new_overbooking_count, 0);
  assert.ok(f.alerts.some((alert) => alert.severity === 'CRITICAL' && alert.code === 'UNCLASSIFIED_CONFLICT'));
});

test('runner no solapa dos ticks cuando un proveedor tarda', async () => {
  const f = fixtureSystem();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const original = f.adapters.booking.operations.fetchReservations;
  // Se usa un adapter fixture independiente con espera.
  const slowAdapters = { ...f.adapters, booking: {
    fetchReservations: async (input) => { await waiting; return original(input); },
  } };
  const { createContinuousSyncRunner } = await import('../src/continuous-sync-runner.mjs');
  const slow = createContinuousSyncRunner({ jobs: [{ ...booking201, mapping: f.mapping }],
    adapters: slowAdapters, odoo: f.odoo, snapshotStore: f.snapshotStore, journal: f.journal,
    clock: () => '2027-01-01T00:00:00Z' });
  const first = slow.tick();
  assert.equal((await slow.tick()).status, 'SKIPPED_OVERLAP');
  release();
  assert.equal((await first).status, 'OK');
});
