import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { FileBeds24EventStore } from '../src/beds24/event-store.mjs';

function tempStore(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'atheron-beds24-'));
  t.after(() => {
    const target = resolve(directory);
    if (!target.startsWith(`${resolve(tmpdir())}${sep}`) ||
        !basename(target).startsWith('atheron-beds24-')) throw new Error('UNSAFE_TEST_CLEANUP');
    rmSync(target, { recursive: true, force: false });
  });
  return { directory, store: new FileBeds24EventStore({ directory, ...options }) };
}

const metadata = (signature = 'TEST-SIGNATURE') => ({ signature,
  reservationId: 'TEST-RESERVATION-KEY', event: { eventId: 'TEST-EVENT-1' } });

test('processed event and reservation state survive reopening the file store', (t) => {
  const { directory, store } = tempStore(t);
  assert.equal(store.isCertain(), false);
  store.recordReceived('TEST-EVENT-1', metadata());
  store.commitProcessed('TEST-EVENT-1', 'TEST-RESERVATION-KEY',
    { signature: 'TEST-SIGNATURE', status: 'active' }, 'CREATED');
  const reopened = new FileBeds24EventStore({ directory });
  assert.equal(reopened.hasProcessed('TEST-EVENT-1'), true);
  assert.equal(reopened.getReservationState('TEST-RESERVATION-KEY').status, 'active');
  assert.equal(reopened.getEvent('TEST-EVENT-1').result, 'CREATED');
  assert.equal(reopened.isCertain(), false);
  reopened.clearUncertain();
  assert.equal(new FileBeds24EventStore({ directory }).isCertain(), true);
});

test('failed atomic replacement leaves the previous valid state intact', (t) => {
  let fail = false;
  const { directory, store } = tempStore(t, { beforeReplace: () => {
    if (fail) { fail = false; throw new Error('TEST_INTERRUPTED_WRITE'); }
  } });
  store.saveReservationState('TEST-KEY', { status: 'before' });
  fail = true;
  assert.throws(() => store.saveReservationState('TEST-KEY', { status: 'after' }),
    { code: 'STORE_WRITE_FAILED' });
  const reopened = new FileBeds24EventStore({ directory });
  assert.equal(reopened.getReservationState('TEST-KEY').status, 'before');
});

test('interrupted acknowledgement cannot persist a processed event without its reservation', (t) => {
  let fail = false;
  const { directory, store } = tempStore(t, { beforeReplace: () => {
    if (fail) { fail = false; throw new Error('TEST_INTERRUPTED_ACK'); }
  } });
  store.recordReceived('TEST-EVENT-1', metadata());
  fail = true;
  assert.throws(() => store.commitProcessed('TEST-EVENT-1', 'TEST-RESERVATION-KEY',
    { signature: 'TEST-SIGNATURE', status: 'active' }, 'CREATED'),
  { code: 'STORE_WRITE_FAILED' });
  const reopened = new FileBeds24EventStore({ directory });
  assert.equal(reopened.hasProcessed('TEST-EVENT-1'), false);
  assert.equal(reopened.getReservationState('TEST-RESERVATION-KEY'), null);
  assert.equal(reopened.listPendingRetries().length, 1);
});

test('retry classification, attempts and next retry timestamp survive restart', (t) => {
  const { directory, store } = tempStore(t, { clock: () => '2026-10-09T12:00:00.000Z' });
  store.recordReceived('TEST-EVENT-1', metadata());
  store.recordFailure('TEST-EVENT-1', 'ODOO_TIMEOUT', { retryable: true });
  const reopened = new FileBeds24EventStore({ directory });
  const pending = reopened.listPendingRetries();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attempts, 1);
  assert.equal(pending[0].errorClass, 'ODOO_TIMEOUT');
  assert.equal(pending[0].nextRetryAt, '2026-10-09T12:00:02.000Z');
  reopened.recordFailure('TEST-EVENT-1', 'ODOO_CONTRACT_ERROR');
  assert.equal(new FileBeds24EventStore({ directory }).listPendingRetries().length, 0);
  assert.equal(reopened.getEvent('TEST-EVENT-1').status, 'FAILED');
  assert.throws(() => reopened.clearUncertain(), { code: 'RECONCILIATION_REQUIRED' });
});

test('exclusive lock prevents duplicate work across two store instances', (t) => {
  const { directory, store } = tempStore(t);
  const second = new FileBeds24EventStore({ directory });
  const token = store.acquireIdempotencyLock('TEST-BOOKING');
  assert.throws(() => second.acquireIdempotencyLock('TEST-BOOKING'),
    { code: 'IDEMPOTENCY_LOCK_BUSY' });
  store.releaseIdempotencyLock('TEST-BOOKING', token);
  const secondToken = second.acquireIdempotencyLock('TEST-BOOKING');
  second.releaseIdempotencyLock('TEST-BOOKING', secondToken);
});

test('event ID reuse with a changed signature fails closed', (t) => {
  const { store } = tempStore(t);
  store.recordReceived('TEST-EVENT-1', metadata());
  assert.throws(() => store.recordReceived('TEST-EVENT-1', metadata('TEST-OTHER-SIGNATURE')),
    { code: 'EVENT_ID_REUSED' });
  assert.equal(store.isCertain(), false);
});

test('corrupt or truncated state is rejected without creating a fresh state', (t) => {
  const { directory, store } = tempStore(t);
  const statePath = join(directory, 'events.json');
  const original = readFileSync(statePath, 'utf8');
  writeFileSync(statePath, `${original.slice(0, 20)}`, 'utf8');
  assert.throws(() => new FileBeds24EventStore({ directory }), { code: 'STORE_CORRUPT' });
  assert.throws(() => store.isCertain(), { code: 'STORE_CORRUPT' });
});
