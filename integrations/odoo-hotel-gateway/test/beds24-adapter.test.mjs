import test from 'node:test';
import assert from 'node:assert/strict';
import { Beds24Client } from '../src/beds24/client.mjs';
import { Beds24Adapter, MemoryBeds24Store, PRODUCTION_DURABLE_STORE_REQUIRED } from '../src/beds24/adapter.mjs';
import { syntheticEvent, syntheticMapping, syntheticTransport } from './fixtures/beds24-synthetic.mjs';

function harness(handler) {
  const store = new MemoryBeds24Store({ initiallyCertain: true });
  const client = new Beds24Client({ transport: syntheticTransport(handler) });
  const adapter = new Beds24Adapter({ client, mapping: syntheticMapping(), store, sleep: async () => {} });
  const available = (unit = 'AHS-201') => adapter.availability({
    canonicalUnitId: unit, checkIn: '2026-11-12', checkOut: '2026-11-14',
  });
  return { adapter, store, available };
}

test('uninitialized memory state is uncertain until a complete synthetic baseline matches', () => {
  const store = new MemoryBeds24Store();
  const adapter = new Beds24Adapter({ client: new Beds24Client({ transport: syntheticTransport() }),
    mapping: syntheticMapping(), store });
  const request = { canonicalUnitId: 'AHS-201', checkIn: '2026-11-12', checkOut: '2026-11-14' };
  assert.equal(adapter.availability(request).available, false);
  assert.equal(adapter.availability(request).certain, false);
  assert.equal(adapter.reconcile({ observed: [], complete: true }).status, 'MATCH');
  assert.equal(adapter.availability(request).available, true);
});

test('201 blocks Casa but leaves 202, 203, 301 and 302 available', async () => {
  const { adapter, store, available } = harness();
  assert.equal((await adapter.applyEvent(syntheticEvent())).status, 'CREATED');
  assert.equal(store.list().length, 1);
  assert.equal(available('AHS-201').available, false);
  assert.equal(available('AHS-CASA').available, false);
  for (const number of ['202', '203', '301', '302']) {
    assert.equal(available(`AHS-${number}`).available, true);
  }
});

test('Casa reservation blocks all five physical rooms without five commercial records', async () => {
  const { adapter, store, available } = harness();
  await adapter.applyEvent(syntheticEvent('CASA'));
  assert.equal(store.list().length, 1);
  assert.equal(available('AHS-CASA').available, false);
  for (const number of ['201', '202', '203', '301', '302']) {
    assert.equal(available(`AHS-${number}`).available, false);
  }
});

test('cancelling 201 restores 201 and Casa', async () => {
  const { adapter, available } = harness();
  await adapter.applyEvent(syntheticEvent());
  assert.equal((await adapter.applyEvent(syntheticEvent('201', {
    type: 'reservation.cancelled', revision: 2,
  }))).status, 'CANCELLED');
  assert.equal(available('AHS-201').available, true);
  assert.equal(available('AHS-CASA').available, true);
});

test('cancelling Casa restores all five physical rooms', async () => {
  const { adapter, available } = harness();
  await adapter.applyEvent(syntheticEvent('CASA'));
  await adapter.applyEvent(syntheticEvent('CASA', { type: 'reservation.cancelled', revision: 2 }));
  for (const number of ['201', '202', '203', '301', '302']) {
    assert.equal(available(`AHS-${number}`).available, true);
  }
});

test('modification moves the booked nights without leaving an old block', async () => {
  const { adapter } = harness();
  await adapter.applyEvent(syntheticEvent());
  await adapter.applyEvent(syntheticEvent('201', {
    type: 'reservation.modified', revision: 2, checkIn: '2026-11-15', checkOut: '2026-11-17',
  }));
  assert.equal(adapter.availability({ canonicalUnitId: 'AHS-201',
    checkIn: '2026-11-12', checkOut: '2026-11-14' }).available, true);
  assert.equal(adapter.availability({ canonicalUnitId: 'AHS-201',
    checkIn: '2026-11-15', checkOut: '2026-11-17' }).available, false);
});

test('a booking moved from 201 to virtual Casa keeps one identity and blocks five rooms', async () => {
  const { adapter, store, available } = harness();
  const original = syntheticEvent('201', { bookingId: 'TEST-BEDS24-BOOKING-MOVE' });
  const moved = syntheticEvent('CASA', { type: 'reservation.modified', revision: 2,
    bookingId: 'TEST-BEDS24-BOOKING-MOVE' });
  const first = await adapter.applyEvent(original);
  const second = await adapter.applyEvent(moved);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].canonicalUnitId, 'AHS-CASA');
  for (const number of ['201', '202', '203', '301', '302']) {
    assert.equal(available(`AHS-${number}`).available, false);
  }
});

test('duplicate and concurrent deliveries have one stored booking and one effect', async () => {
  const { adapter, store } = harness();
  const [first, second] = await Promise.all([
    adapter.applyEvent(syntheticEvent()), adapter.applyEvent(syntheticEvent()),
  ]);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(store.list().length, 1);
  assert.equal((await adapter.applyEvent(syntheticEvent())).status, 'DUPLICATE');
  const cancelled = syntheticEvent('201', { type: 'reservation.cancelled', revision: 2 });
  await adapter.applyEvent(cancelled);
  assert.equal((await adapter.applyEvent(cancelled)).status, 'DUPLICATE');
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].status, 'cancelled');
});

test('out-of-order older event is stale and cannot reopen cancelled inventory', async () => {
  const { adapter, store } = harness();
  await adapter.applyEvent(syntheticEvent());
  await adapter.applyEvent(syntheticEvent('201', { type: 'reservation.cancelled', revision: 3 }));
  assert.equal((await adapter.applyEvent(syntheticEvent('201', {
    type: 'reservation.modified', revision: 2,
  }))).status, 'STALE');
  assert.equal(store.list()[0].status, 'cancelled');
});

test('conflicting same revision fails closed with no mutation', async () => {
  const { adapter, store, available } = harness();
  await adapter.applyEvent(syntheticEvent());
  await assert.rejects(() => adapter.applyEvent(syntheticEvent('201', {
    checkOut: '2026-11-15',
  })), { code: 'REVISION_CONFLICT' });
  assert.equal(store.list()[0].checkOut, '2026-11-14');
  assert.equal(available().available, false);
  assert.equal(available().certain, false);
});

test('invalid payload and unknown room are non-retryable and close availability', async () => {
  for (const raw of [syntheticEvent('201', { bookingId: '' }),
    syntheticEvent('201', { roomId: 'TEST-UNKNOWN' })]) {
    const { adapter, store, available } = harness();
    await assert.rejects(() => adapter.applyEvent(raw), (error) => {
      assert.equal(error.retryable, false);
      return true;
    });
    assert.equal(store.list().length, 0);
    assert.equal(available().available, false);
  }
});

test('a room and Casa cannot overlap in the synthetic gateway model', async () => {
  const { adapter, store, available } = harness();
  await adapter.applyEvent(syntheticEvent());
  await assert.rejects(() => adapter.applyEvent(syntheticEvent('CASA')), { code: 'INVENTORY_CONFLICT' });
  assert.equal(store.list().length, 1);
  assert.equal(available('AHS-202').available, false);
  assert.equal(available('AHS-202').certain, false);
});

test('timeout, HTTP 429 and HTTP 500 retry bounded reads then fail closed', async () => {
  for (const [failure, code] of [
    [Object.assign(new Error('TEST-PRIVATE'), { code: 'ETIMEDOUT' }), 'BEDS24_TIMEOUT'],
    [{ status: 429 }, 'BEDS24_RATE_LIMITED'],
    [{ status: 500 }, 'BEDS24_UPSTREAM_UNAVAILABLE'],
  ]) {
    let calls = 0;
    const { adapter, available } = harness(async () => {
      calls += 1;
      if (failure instanceof Error) throw failure;
      return { ...failure, data: {} };
    });
    await assert.rejects(() => adapter.refreshReservation({
      accountId: 'TEST-BEDS24-ACCOUNT', propertyId: 'TEST-BEDS24-PROPERTY',
      bookingId: 'TEST-BEDS24-BOOKING-201',
    }), { code });
    assert.equal(calls, 2);
    assert.equal(available().certain, false);
    assert.equal(available().available, false);
  }
});

test('retryable read can recover; invalid contract does not retry', async () => {
  let calls = 0;
  const { adapter, available } = harness(async () => {
    calls += 1;
    if (calls === 1) return { status: 500, data: {} };
    return { status: 200, data: syntheticEvent() };
  });
  assert.equal((await adapter.refreshReservation({ accountId: 'TEST-BEDS24-ACCOUNT',
    propertyId: 'TEST-BEDS24-PROPERTY',
    bookingId: 'TEST-BEDS24-BOOKING-201' })).status, 'CREATED');
  assert.equal(calls, 2);
  assert.equal(available().certain, true);

  let invalidCalls = 0;
  const invalid = harness(async () => { invalidCalls += 1; return { status: 400, data: {} }; });
  await assert.rejects(() => invalid.adapter.refreshReservation({ accountId: 'TEST-BEDS24-ACCOUNT',
    propertyId: 'TEST-BEDS24-PROPERTY',
    bookingId: 'TEST-BEDS24-BOOKING-201' }), { code: 'BEDS24_CONTRACT_ERROR' });
  assert.equal(invalidCalls, 1);
});

test('refresh rejects an unexpected reservation ID and closes availability', async () => {
  const { adapter, available } = harness(async () => ({ status: 200,
    data: syntheticEvent('201', { bookingId: 'TEST-OTHER-BOOKING' }) }));
  await assert.rejects(() => adapter.refreshReservation({ accountId: 'TEST-BEDS24-ACCOUNT',
    propertyId: 'TEST-BEDS24-PROPERTY',
    bookingId: 'TEST-BEDS24-BOOKING-201' }), { code: 'RESERVATION_ID_MISMATCH' });
  assert.equal(available().available, false);
  assert.equal(available().certain, false);
});

test('reconciliation only restores certainty after a complete matching snapshot', async () => {
  const { adapter, available } = harness();
  const event = syntheticEvent();
  await adapter.applyEvent(event);
  assert.equal(adapter.reconcile({ observed: [], complete: false }).status, 'UNKNOWN');
  assert.equal(available('AHS-202').available, false);
  assert.equal(adapter.reconcile({ observed: [], complete: true }).status, 'DIVERGENT');
  assert.equal(available('AHS-202').available, false);
  assert.equal(adapter.reconcile({ observed: [event], complete: true }).status, 'MATCH');
  assert.equal(available('AHS-202').available, true);
});

test('inventory contract exposes all six sellable units and virtual Casa', async () => {
  const { adapter } = harness();
  await adapter.applyEvent(syntheticEvent());
  const rows = adapter.inventory({ from: '2026-11-12', to: '2026-11-14' });
  assert.equal(rows.length, 6);
  assert.equal(rows.find((row) => row.canonicalUnitId === 'AHS-CASA').dates.length, 2);
  assert.equal(rows.find((row) => row.canonicalUnitId === 'AHS-CASA').dates[0].available, false);
  assert.equal(PRODUCTION_DURABLE_STORE_REQUIRED, true);
});
