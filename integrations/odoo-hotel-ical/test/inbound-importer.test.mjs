import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadIcal, importInboundFeed, runConfiguredInbound } from '../src/inbound-importer.mjs';
import { createOdooInboundFeedStore } from '../src/inbound-odoo-feed-store.mjs';
import { isAvailable } from '../src/inventory-model.mjs';
import { parseIcal } from '../src/ical-import.mjs';

const URL_302 = 'https://ical.booking.com/v1/export?token=PRIVATE_FEED_SECRET';
const feed = (extra = {}) => ({ id: 17, x_source: 'booking', x_canonical_unit_id: 'AHS-302',
  x_odoo_unit_id: [5, '302'], x_external_property_id: '16559325',
  x_external_listing_id: '1655932505', x_inbound_feed_reference: URL_302, ...extra });
const event = (uid = 'opaque-1', start = '20261112', end = '20261114', extra = '') =>
  `BEGIN:VEVENT\r\n${uid ? `UID:${uid}\r\n` : ''}DTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:Closed\r\nDESCRIPTION:Calendar block\r\n${extra}END:VEVENT\r\n`;
const ics = (...events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('')}END:VCALENDAR\r\n`;

function harness(rows = [feed()]) {
  const blocks = [];
  const snapshots = new Map();
  const status = [];
  const calls = { apply: 0 };
  const odoo = {
    listBlocks: async () => blocks.map((b) => ({ ...b })),
    applyBlock: async (r) => {
      calls.apply++;
      blocks.push({ source: r.source, canonical_unit_id: r.canonical_unit_id,
        check_in: r.check_in, check_out: r.check_out, status: r.status,
        idempotency_key: r.idempotency_key });
    },
    snapshotStore: {
      list: async (source, unit) => [...snapshots.values()].filter((s) => s.source === source
        && s.canonical_unit_id === unit).map((s) => ({ ...s })),
      put: async (entry) => { snapshots.set(entry.idempotency_key, { ...entry }); },
    },
  };
  const feedStore = {
    listConfigured: async () => rows,
    updateStatus: async (id, value) => { status.push({ id, ...value }); },
  };
  return { blocks, snapshots, status, calls, odoo, feedStore };
}

test('parses required iCal fields and maps a normal 302 event', async () => {
  const raw = parseIcal(ics(event('ota-1', '20261112', '20261114', 'STATUS:CONFIRMED\r\n')));
  assert.deepEqual(raw[0], { uid: 'ota-1', dtstart: '2026-11-12', dtend: '2026-11-14',
    summary: 'Closed', description: 'Calendar block', status: 'CONFIRMED' });
  const h = harness();
  const result = await importInboundFeed(feed(), { ...h, download: async () => ics(event('ota-1')) });
  assert.equal(result.status, 'OK');
  assert.equal(result.counts.APPLIED, 1);
  assert.equal(h.blocks.length, 1);
  assert.equal(h.snapshots.size, 1);
  assert.equal(h.status.at(-1).status, 'OK');
  assert.equal(isAvailable(h.blocks.map((b) => ({ unit: '302', checkIn: b.check_in,
    checkOut: b.check_out })), 'CASA_COMPLETA', '2026-11-12', '2026-11-14'), false);
});

test('same event twice is durable DUPLICATE with one effect', async () => {
  const h = harness();
  const deps = { ...h, download: async () => ics(event()) };
  await importInboundFeed(feed(), deps);
  const second = await importInboundFeed(feed(), deps);
  assert.equal(second.counts.DUPLICATE, 1);
  assert.equal(h.calls.apply, 1);
  assert.equal(h.blocks.length, 1);
  assert.equal(h.snapshots.size, 1);
});

test('UID-less fallback is stable across repeated reads', async () => {
  const h = harness();
  const deps = { ...h, download: async () => ics(event('')) };
  assert.equal((await importInboundFeed(feed(), deps)).counts.APPLIED, 1);
  assert.equal((await importInboundFeed(feed(), deps)).counts.DUPLICATE, 1);
  assert.equal(h.blocks.length, 1);
});

test('existing Odoo block causes auditable conflict without overwrite', async () => {
  const h = harness();
  h.blocks.push({ source: 'odoo', canonical_unit_id: 'AHS-CASA',
    check_in: '2026-11-12', check_out: '2026-11-14', status: 'blocked',
    idempotency_key: 'commercial-existing' });
  const result = await importInboundFeed(feed(), { ...h, download: async () => ics(event()) });
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.counts.CONFLICT, 1);
  assert.equal(h.calls.apply, 0);
  assert.equal([...h.snapshots.values()][0].state, 'CONFLICT');
  assert.equal(h.blocks.length, 1);
});

test('overlapping events in one feed are held for review', async () => {
  const h = harness();
  const result = await importInboundFeed(feed(), { ...h,
    download: async () => ics(event('a', '20261112', '20261114'), event('b', '20261113', '20261115')) });
  assert.equal(result.counts.CONFLICT, 2);
  assert.equal(h.calls.apply, 0);
  assert.equal(h.snapshots.size, 2);
});

test('a revised UID is quarantined with original durable dates preserved', async () => {
  const h = harness();
  await importInboundFeed(feed(), { ...h, download: async () => ics(event()) });
  const changed = await importInboundFeed(feed(), { ...h,
    download: async () => ics(event('opaque-1', '20261113', '20261115')) });
  assert.equal(changed.status, 'REVIEW');
  assert.equal(h.calls.apply, 1);
  const entry = [...h.snapshots.values()][0];
  assert.equal(entry.state, 'CONFLICT');
  assert.equal(entry.check_in, '2026-11-12');
  assert.equal(entry.observed_check_in, '2026-11-13');
});

test('explicit cancellation and disappeared events never release automatically', async () => {
  const h = harness();
  await importInboundFeed(feed(), { ...h, download: async () => ics(event()) });
  const cancelled = await importInboundFeed(feed(), { ...h,
    download: async () => ics(event('opaque-1', '20261112', '20261114', 'STATUS:CANCELLED\r\n')) });
  assert.equal(cancelled.counts.CANCELLED_PENDING, 1);
  assert.equal(h.blocks.length, 1);
  const missing = await importInboundFeed(feed(), { ...h, download: async () => ics() });
  assert.equal(missing.status, 'EMPTY');
  assert.equal(h.blocks.length, 1);
  assert.equal([...h.snapshots.values()][0].state, 'CANCELLED_PENDING');
});

test('disappearance of an active UID is flagged but never releases', async () => {
  const h = harness();
  await importInboundFeed(feed(), { ...h, download: async () => ics(event()) });
  const missing = await importInboundFeed(feed(), { ...h, download: async () => ics() });
  assert.equal(missing.counts.MISSING_PENDING, 1);
  assert.equal([...h.snapshots.values()][0].state, 'MISSING_PENDING');
  assert.equal(h.blocks.length, 1);
});

test('truncated VEVENT fails closed without changing a prior block or snapshot', async () => {
  const h = harness();
  await importInboundFeed(feed(), { ...h, download: async () => ics(event()) });
  const before = [...h.snapshots.values()][0];
  const bad = await importInboundFeed(feed(), { ...h,
    download: async () => 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:other\r\nEND:VCALENDAR\r\n' });
  assert.equal(bad.error, 'INVALID_ICAL_FEED');
  assert.deepEqual([...h.snapshots.values()][0], before);
  assert.equal(h.blocks.length, 1);
});

test('invalid and private feed URLs fail before network access', async () => {
  const h = harness();
  let reads = 0;
  const result = await importInboundFeed(feed({ x_inbound_feed_reference: 'http://127.0.0.1/?secret=PRIVATE_FEED_SECRET' }),
    { ...h, download: async () => { reads++; return ics(); } });
  assert.equal(result.error, 'INVALID_FEED_URL');
  assert.equal(reads, 0);
  assert.doesNotMatch(JSON.stringify({ result, status: h.status }), /PRIVATE_FEED_SECRET/);
});

test('timeout and HTTP errors expose codes, not secret references', async () => {
  const timeout = new Error('secret'); timeout.name = 'TimeoutError';
  await assert.rejects(downloadIcal(URL_302, 'booking', { fetchImpl: async () => { throw timeout; } }),
    { code: 'FEED_TIMEOUT' });
  await assert.rejects(downloadIcal(URL_302, 'booking', { fetchImpl: async () => ({ ok: false, status: 403 }) }),
    { code: 'FEED_HTTP_ERROR' });
  const h = harness();
  const result = await importInboundFeed(feed(), { ...h, download: async () => { throw timeout; } });
  assert.equal(result.status, 'ERROR');
  assert.doesNotMatch(JSON.stringify({ result, status: h.status }), /PRIVATE_FEED_SECRET|secret/);
});

test('one failed feed does not stop the next configured feed', async () => {
  const rows = [feed({ id: 1, x_inbound_feed_reference: 'http://invalid.local/private' }), feed({ id: 2 })];
  const h = harness(rows);
  const result = await runConfiguredInbound({ ...h, download: async () => ics(event()) });
  assert.deepEqual(result.results.map((r) => r.status), ['ERROR', 'OK']);
  assert.equal(h.blocks.length, 1);
});

test('Odoo feed store enforces exact STAGING and only updates sync fields', async () => {
  const calls = [];
  const transport = { call: async (service, method, args) => {
    calls.push({ service, method, args });
    if (service === 'common') return 42;
    if (args[4] === 'search_read') return [feed()];
    if (args[4] === 'write') return true;
    throw new Error('unexpected');
  } };
  const config = { baseUrl: 'https://atheron1-hotel-staging-20260923.odoo.com',
    database: 'atheron1-hotel-staging-20260923', technicalUser: 'test', technicalSecret: 'test-secret' };
  assert.throws(() => createOdooInboundFeedStore({ transport,
    config: { ...config, baseUrl: 'https://other.odoo.com' } }), /STAGING_CONFIG_REQUIRED/);
  const store = createOdooInboundFeedStore({ transport, config });
  assert.equal((await store.listConfigured()).length, 1);
  await store.updateStatus(17, { status: 'OK', error: null, last_sync_at: '2026-10-04T12:00:00Z' });
  const writeVals = calls.at(-1).args[5][1];
  assert.deepEqual(writeVals, { x_last_sync_status: 'OK', x_last_error: false,
    x_last_sync_at: '2026-10-04 12:00:00' });
});
