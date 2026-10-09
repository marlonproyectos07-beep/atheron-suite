import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Beds24Adapter } from '../src/beds24/adapter.mjs';
import { Beds24Client } from '../src/beds24/client.mjs';
import { FileBeds24EventStore } from '../src/beds24/event-store.mjs';
import { FakeOdooHotelPort, OdooHotelPort } from '../src/beds24/odoo-port.mjs';
import { BEDS24_SCOPE_MATRIX, BEDS24_SCOPES, requireBeds24Scope } from '../src/beds24/scopes.mjs';
import { IdentityStore, normalizeScopes } from '../src/identity.mjs';
import { syntheticEvent, syntheticMapping, syntheticTransport } from './fixtures/beds24-synthetic.mjs';

function pipeline(t) {
  const directory = mkdtempSync(join(tmpdir(), 'atheron-beds24-'));
  t.after(() => {
    const target = resolve(directory);
    if (!target.startsWith(`${resolve(tmpdir())}${sep}`) ||
        !basename(target).startsWith('atheron-beds24-')) throw new Error('UNSAFE_TEST_CLEANUP');
    rmSync(target, { recursive: true, force: false });
  });
  const mapping = syntheticMapping();
  const odooPort = new FakeOdooHotelPort({ mapping });
  const client = new Beds24Client({ transport: syntheticTransport() });
  const makeAdapter = () => {
    const store = new FileBeds24EventStore({ directory });
    return { store, adapter: new Beds24Adapter({ client, mapping, store, odooPort }) };
  };
  const first = makeAdapter();
  first.store.clearUncertain(); // Explicit complete synthetic empty baseline.
  return { ...first, makeAdapter, odooPort, mapping };
}

test('201 flows through adapter, durable store and fake Odoo; replay after restart is no-op', async (t) => {
  const { adapter, store, makeAdapter, odooPort } = pipeline(t);
  const event = syntheticEvent();
  assert.equal((await adapter.processEvent(event)).status, 'CREATED');
  assert.equal(store.hasProcessed(event.eventId), true);
  assert.equal(odooPort.writeCount, 1);
  assert.equal(adapter.availability({ canonicalUnitId: 'AHS-CASA',
    checkIn: event.checkIn, checkOut: event.checkOut }).available, false);
  const restarted = makeAdapter();
  assert.equal((await restarted.adapter.processEvent(event)).status, 'DUPLICATE');
  assert.equal(odooPort.writeCount, 1);
  assert.equal(restarted.store.list().length, 1);
});

test('Casa flows as one reservation and blocks five physical rooms', async (t) => {
  const { adapter, store, odooPort } = pipeline(t);
  const event = syntheticEvent('CASA');
  await adapter.processEvent(event);
  assert.equal(store.list().length, 1);
  for (const number of ['201', '202', '203', '301', '302']) {
    assert.equal(odooPort.getAvailability({ canonicalUnitId: `AHS-${number}`,
      checkIn: event.checkIn, checkOut: event.checkOut }).available, false);
  }
});

test('modify and cancel update one durable reservation and restore availability', async (t) => {
  const { adapter, store, odooPort } = pipeline(t);
  const created = syntheticEvent();
  const modified = syntheticEvent('201', { type: 'reservation.modified', revision: 2,
    checkIn: '2026-11-15', checkOut: '2026-11-17' });
  const cancelled = syntheticEvent('201', { type: 'reservation.cancelled', revision: 3,
    checkIn: '2026-11-15', checkOut: '2026-11-17' });
  await adapter.processEvent(created);
  assert.equal((await adapter.processEvent(modified)).status, 'MODIFIED');
  assert.equal((await adapter.processEvent(cancelled)).status, 'CANCELLED');
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].revision, 3);
  assert.equal(odooPort.writeCount, 3);
  assert.equal(odooPort.getAvailability({ canonicalUnitId: 'AHS-CASA',
    checkIn: '2026-11-15', checkOut: '2026-11-17' }).available, true);
});

test('Odoo timeout persists retry; reopening and retrying does not duplicate an ambiguous write', async (t) => {
  const { adapter, store, makeAdapter, odooPort } = pipeline(t);
  const event = syntheticEvent();
  odooPort.failNext('createReservation', { stage: 'after', code: 'ODOO_TIMEOUT' });
  await assert.rejects(() => adapter.processEvent(event), { code: 'ODOO_TIMEOUT' });
  assert.equal(odooPort.writeCount, 1);
  assert.equal(store.listPendingRetries().length, 1);
  assert.equal(store.isCertain(), false);
  const restarted = makeAdapter();
  assert.equal((await restarted.adapter.processEvent(event)).status, 'CREATED');
  assert.equal(odooPort.writeCount, 1);
  assert.equal(restarted.store.hasProcessed(event.eventId), true);
  assert.equal(restarted.store.isCertain(), false);
  assert.equal(restarted.adapter.reconcile({ observed: [event], complete: true }).status, 'MATCH');
  assert.equal(restarted.store.isCertain(), true);
});

test('before-write timeout retries safely after restart', async (t) => {
  const { adapter, makeAdapter, odooPort } = pipeline(t);
  const event = syntheticEvent();
  odooPort.failNext('createReservation', { stage: 'before', code: 'ODOO_TIMEOUT' });
  await assert.rejects(() => adapter.processEvent(event), { code: 'ODOO_TIMEOUT' });
  assert.equal(odooPort.writeCount, 0);
  assert.equal((await makeAdapter().adapter.processEvent(event)).status, 'CREATED');
  assert.equal(odooPort.writeCount, 1);
});

test('persistent Odoo failure remains failed and closes availability', async (t) => {
  const { adapter, store, makeAdapter, odooPort } = pipeline(t);
  const event = syntheticEvent();
  odooPort.failNext('createReservation', { code: 'ODOO_INVENTORY_CONFLICT' });
  await assert.rejects(() => adapter.processEvent(event), { code: 'ODOO_INVENTORY_CONFLICT' });
  assert.equal(store.getEvent(event.eventId).status, 'FAILED');
  assert.equal(store.listPendingRetries().length, 0);
  await assert.rejects(() => makeAdapter().adapter.processEvent(event), { code: 'PERSISTENT_FAILURE' });
  assert.equal(odooPort.writeCount, 0);
  assert.equal(adapter.availability({ canonicalUnitId: 'AHS-201',
    checkIn: event.checkIn, checkOut: event.checkOut }).available, false);
});

test('unknown mapping is rejected before Odoo and persists fail-closed state', async (t) => {
  const { adapter, store, odooPort, makeAdapter } = pipeline(t);
  await assert.rejects(() => adapter.processEvent(syntheticEvent('201', { roomId: 'TEST-UNKNOWN' })),
    { code: 'MAPPING_UNKNOWN' });
  assert.equal(odooPort.writeCount, 0);
  assert.equal(store.isCertain(), false);
  assert.equal(store.getEvent(syntheticEvent('201', { roomId: 'TEST-UNKNOWN' }).eventId).status, 'FAILED');
  assert.equal(makeAdapter().store.isCertain(), false);
});

test('same event ID with a conflicting revision cannot reuse its durable acknowledgement', async (t) => {
  const { adapter, odooPort } = pipeline(t);
  const event = syntheticEvent();
  await adapter.processEvent(event);
  await assert.rejects(() => adapter.processEvent({ ...event, revision: 2,
    checkOut: '2026-11-15' }), { code: 'EVENT_ID_REUSED' });
  assert.equal(odooPort.writeCount, 1);
});

test('Beds24-only match cannot clear uncertainty when fake Odoo disagrees', async (t) => {
  const { adapter, store, mapping, odooPort } = pipeline(t);
  const event = syntheticEvent();
  await adapter.processEvent(event);
  const client = new Beds24Client({ transport: syntheticTransport() });
  const brokenRead = { ...odooPort, getReservation: () => null };
  const checking = new Beds24Adapter({ client, mapping, store, odooPort: brokenRead });
  assert.equal(checking.reconcile({ observed: [event], complete: true }).status, 'DIVERGENT');
  assert.equal(store.isCertain(), false);
});

test('direct applyEvent cannot bypass Odoo when a durable store is injected', async (t) => {
  const { adapter } = pipeline(t);
  await assert.rejects(() => adapter.applyEvent(syntheticEvent()),
    { code: 'DURABLE_PROCESSOR_REQUIRED' });
});

test('Odoo port contract and fake hold obey the Casa inventory rule', async () => {
  const port = new OdooHotelPort();
  assert.throws(() => port.createReservation(), { code: 'ODOO_PORT_UNIMPLEMENTED' });
  const fake = new FakeOdooHotelPort({ mapping: syntheticMapping() });
  assert.equal(fake.healthCheck().status, 'UP');
  assert.equal(fake.getMapping('AHS-CASA').kind, 'virtual');
  fake.applyHold({ holdId: 'TEST-HOLD-1', canonicalUnitId: 'AHS-201',
    checkIn: '2026-11-12', checkOut: '2026-11-14' });
  assert.equal(fake.getAvailability({ canonicalUnitId: 'AHS-CASA',
    checkIn: '2026-11-12', checkOut: '2026-11-14' }).available, false);
  fake.releaseHold('TEST-HOLD-1');
  assert.equal(fake.getAvailability({ canonicalUnitId: 'AHS-CASA',
    checkIn: '2026-11-12', checkOut: '2026-11-14' }).available, true);
});

test('Beds24 scopes are explicit and legacy identities retain only their original four', () => {
  assert.equal(BEDS24_SCOPES.length, 8);
  assert.equal(normalizeScopes(undefined).includes(BEDS24_SCOPE_MATRIX.createReservation), false);
  assert.equal(normalizeScopes([BEDS24_SCOPE_MATRIX.getReservation])[0],
    BEDS24_SCOPE_MATRIX.getReservation);
  const identities = new IdentityStore();
  identities.register({ agentId: 'TEST-AGENT', actor: 'TEST', rawKey: 'TEST-KEY' });
  const legacy = identities.authenticate('TEST-AGENT', 'TEST-KEY');
  assert.throws(() => requireBeds24Scope(legacy, 'createReservation'),
    { code: 'BEDS24_SCOPE_DENIED' });
  assert.equal(requireBeds24Scope({ scopes: [BEDS24_SCOPE_MATRIX.getReservation] },
    'getReservation'), BEDS24_SCOPE_MATRIX.getReservation);
});
