import test from 'node:test';
import assert from 'node:assert/strict';
import { Beds24Client } from '../src/beds24/client.mjs';
import { Beds24Error, classifyRetry } from '../src/beds24/errors.mjs';
import { createBeds24Mapping, normalizeApprovedRate, normalizeBeds24Event } from '../src/beds24/mapper.mjs';
import { syntheticEvent, syntheticMapping, syntheticTransport } from './fixtures/beds24-synthetic.mjs';

test('client requires an explicitly synthetic injected transport', () => {
  assert.throws(() => new Beds24Client(), { code: 'SYNTHETIC_TRANSPORT_REQUIRED' });
  assert.throws(() => new Beds24Client({ transport: { request: async () => ({}) } }),
    { code: 'SYNTHETIC_TRANSPORT_REQUIRED' });
});

test('client exposes read contracts through a mock, without network', async () => {
  const operations = [];
  const client = new Beds24Client({ transport: syntheticTransport(async ({ operation, payload }) => {
    operations.push([operation, payload.scope]);
    return { status: 200, data: { test: true } };
  }) });
  await client.getAvailability({ scope: 'TEST' });
  await client.getInventory({ scope: 'TEST' });
  await client.getReservation({ scope: 'TEST' });
  await client.listReservations({ scope: 'TEST' });
  await client.getRates({ scope: 'TEST' });
  assert.deepEqual(operations.map(([operation]) => operation), [
    'availability.read', 'inventory.read', 'reservations.get', 'reservations.list', 'rates.read',
  ]);
});

test('client sanitizes timeout, 429, 500 and malformed responses', async () => {
  for (const [failure, code, retryable] of [
    [Object.assign(new Error('TEST-SECRET-MUST-NOT-LEAK'), { code: 'ETIMEDOUT' }), 'BEDS24_TIMEOUT', true],
    [{ status: 429 }, 'BEDS24_RATE_LIMITED', true],
    [{ status: 500 }, 'BEDS24_UPSTREAM_UNAVAILABLE', true],
    [{ status: 400 }, 'BEDS24_CONTRACT_ERROR', false],
  ]) {
    const client = new Beds24Client({ transport: syntheticTransport(async () => {
      if (failure instanceof Error) throw failure;
      return { ...failure, data: {} };
    }) });
    await assert.rejects(() => client.getReservation({}), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.retryable, retryable);
      assert.doesNotMatch(error.message, /TEST-SECRET/);
      return true;
    });
  }
  const malformed = new Beds24Client({ transport: syntheticTransport(async () => ({ status: 200 })) });
  await assert.rejects(() => malformed.getInventory({}), { code: 'BEDS24_RESPONSE_INVALID' });
  const primitive = new Beds24Client({ transport: syntheticTransport(async () => ({ status: 200, data: 42 })) });
  await assert.rejects(() => primitive.getRates({}), { code: 'BEDS24_RESPONSE_INVALID' });
  assert.deepEqual(classifyRetry(new Beds24Error('MAPPING_UNKNOWN')),
    { code: 'MAPPING_UNKNOWN', retryable: false });
});

test('mapping contains five physical units and one virtual Casa with no real IDs', () => {
  const mapping = syntheticMapping();
  assert.equal(mapping.units().length, 6);
  assert.equal(mapping.forUnit('AHS-CASA').kind, 'virtual');
  assert.equal(mapping.forUnit('AHS-CASA').odooResourceId, null);
  assert.equal(mapping.forRoom('TEST-BEDS24-ACCOUNT', 'TEST-BEDS24-PROPERTY',
    'TEST-BEDS24-ROOM-201').canonicalUnitId, 'AHS-201');
  assert.equal(mapping.forRoom('TEST-BEDS24-ACCOUNT', 'TEST-UNKNOWN', 'TEST-BEDS24-ROOM-201'), null);
  for (const unit of mapping.units()) {
    assert.match(mapping.forUnit(unit).beds24RoomId, /^TEST-/);
  }
});

test('mapping fails closed on missing, duplicate or ambiguous rooms', () => {
  assert.throws(() => createBeds24Mapping([]), { code: 'MAPPING_INCOMPLETE' });
  const rows = syntheticMapping().units().map((unit) => syntheticMapping().forUnit(unit));
  rows[1] = { ...rows[1], beds24RoomId: rows[0].beds24RoomId };
  assert.throws(() => createBeds24Mapping(rows), { code: 'MAPPING_AMBIGUOUS' });
});

test('event identity stays stable across modifications; revision signature changes', () => {
  const mapping = syntheticMapping();
  const created = normalizeBeds24Event(syntheticEvent(), mapping);
  const modified = normalizeBeds24Event(syntheticEvent('201', {
    type: 'reservation.modified', checkOut: '2026-11-15', revision: 2,
  }), mapping);
  assert.equal(created.idempotencyKey, modified.idempotencyKey);
  assert.notEqual(created.signature, modified.signature);
  assert.equal(created.canonicalUnitId, 'AHS-201');
});

test('invalid event, unknown room and unapproved rate cannot cross mapping gate', () => {
  const mapping = syntheticMapping();
  assert.throws(() => normalizeBeds24Event(syntheticEvent('201', { checkOut: '2026-11-11' }), mapping),
    { code: 'INVALID_STAY_WINDOW' });
  assert.throws(() => normalizeBeds24Event(syntheticEvent('201', { roomId: 'TEST-UNKNOWN' }), mapping),
    { code: 'MAPPING_UNKNOWN' });
  assert.throws(() => normalizeApprovedRate({ canonicalUnitId: 'AHS-201', from: '2026-11-12',
    to: '2026-11-13', currency: 'COP', amount: 100 }, mapping), { code: 'RATE_CONTRACT_INVALID' });
  const approved = normalizeApprovedRate({ canonicalUnitId: 'AHS-201', from: '2026-11-12',
    to: '2026-11-13', currency: 'COP', amount: 100, approvalRef: 'TEST-ODOO-APPROVAL' }, mapping);
  assert.equal(approved.roomId, 'TEST-BEDS24-ROOM-201');
  assert.equal(approved.synthetic, true);
});
