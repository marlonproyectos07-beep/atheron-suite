import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importCalendar, createSyncLedger, legacyUnit, toInventory } from '../src/ota-adapters.mjs';
import { isAvailable } from '../src/inventory-model.mjs';
import { cal } from './phase-b-fixtures.mjs';

/** Fake local de la estrategia requerida en Odoo; no acredita la acción remota. */
function atomicFixture() {
  const blocks = new Map();
  let version = 0;
  let queue = Promise.resolve();
  let reads = 0;
  let open;
  const readBarrier = new Promise((resolve) => { open = resolve; });
  const port = {
    async listBlocks() {
      const snapshot = [...blocks.values()];
      reads += 1;
      if (reads === 2) open();
      if (reads <= 2) await readBarrier;
      return snapshot;
    },
    async applyBlock(reservation) {
      const prior = queue;
      let unlock;
      queue = new Promise((resolve) => { unlock = resolve; });
      await prior;
      try {
        if (!isAvailable(toInventory([...blocks.values()]), legacyUnit(reservation.canonical_unit_id),
          reservation.check_in, reservation.check_out)) {
          throw Object.assign(new Error('ATOMIC_CONFLICT'), { code: 'CONFLICT' });
        }
        blocks.set(reservation.idempotency_key, { ...reservation });
        version += 1;
      } finally { unlock(); }
    },
    async releaseBlock(key) { blocks.delete(key); version += 1; },
    compareAndSet(expectedVersion, mutate) {
      if (expectedVersion !== version) throw Object.assign(new Error('CAS_STALE'), { code: 'CAS_STALE' });
      mutate(); version += 1;
      return version;
    },
  };
  return { port, blocks, version: () => version };
}

async function runRace(first, second) {
  const fixture = atomicFixture();
  const mapping = Object.fromEntries(['AHS-201', 'AHS-202', 'AHS-301', 'AHS-CASA']
    .map((unit, index) => [unit, { odoo_unit_id: index + 1, external_listing_id: `FIXTURE-${unit}` }]));
  const receive = (item) => importCalendar({ ical: cal({ uid: item.uid }), source: item.source,
    canonical_unit_id: item.unit, mapping, odoo: fixture.port, ledger: createSyncLedger() });
  return { fixture, outcomes: await Promise.allSettled([receive(first), receive(second)]) };
}

for (const [name, first, second] of [
  ['A', { source: 'booking', unit: 'AHS-201', uid: 'b201' },
    { source: 'airbnb', unit: 'AHS-CASA', uid: 'acasa' }],
  ['B', { source: 'airbnb', unit: 'AHS-CASA', uid: 'acasa' },
    { source: 'booking', unit: 'AHS-301', uid: 'b301' }],
]) {
  test(`RACE ${name}: lock/recheck local impide doble apply incompatible`, async () => {
    const { fixture, outcomes } = await runRace(first, second);
    assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'rejected']);
    assert.equal(outcomes[1].reason.code, 'CONFLICT');
    assert.equal(fixture.blocks.size, 1);
    assert.equal(fixture.version(), 1);
  });
}

test('RACE C: lock local permite dos habitaciones diferentes y bloquea CASA', async () => {
  const { fixture, outcomes } = await runRace(
    { source: 'booking', unit: 'AHS-201', uid: 'b201' },
    { source: 'airbnb', unit: 'AHS-202', uid: 'a202' },
  );
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'fulfilled']);
  assert.equal(fixture.blocks.size, 2);
  assert.equal(isAvailable(toInventory([...fixture.blocks.values()]), 'CASA_COMPLETA', '2027-01-10', '2027-01-12'), false);
});

test('compare-and-set rechaza version obsoleta antes de liberar', () => {
  const fixture = atomicFixture();
  assert.equal(fixture.port.compareAndSet(0, () => {}), 1);
  assert.throws(() => fixture.port.compareAndSet(0, () => {}), (error) => error.code === 'CAS_STALE');
  assert.equal(fixture.version(), 1);
});
