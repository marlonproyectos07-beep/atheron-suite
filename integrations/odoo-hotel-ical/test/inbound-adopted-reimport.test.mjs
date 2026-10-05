import test from 'node:test';
import assert from 'node:assert/strict';
import { importInboundFeed } from '../src/inbound-importer.mjs';
import { normalizeReservation } from '../src/ota-adapters.mjs';

test('adopted Booking 302 block wins over prior CONFLICT and both reimports are DUPLICATE', async () => {
  const event = { uid: 'synthetic-booking-302', dtstart: '2026-10-17',
    dtend: '2026-10-18', summary: 'CLOSED' };
  const feed = { id: 1, x_source: 'booking', x_canonical_unit_id: 'AHS-302',
    x_odoo_unit_id: 5, x_external_property_id: 'synthetic-property',
    x_external_listing_id: 'synthetic-listing',
    x_inbound_feed_reference: 'https://ical.booking.com/v1/export?synthetic=1' };
  const mapped = normalizeReservation(event, { source: 'booking', canonical_unit_id: 'AHS-302',
    mapping: { 'AHS-302': { odoo_unit_id: 5, external_property_id: 'synthetic-property',
      external_listing_id: 'synthetic-listing' } } });
  let snapshot = { source: 'booking', canonical_unit_id: 'AHS-302',
    idempotency_key: mapped.idempotency_key, external_uid: event.uid,
    check_in: event.dtstart, check_out: event.dtend, state: 'CONFLICT' };
  let applied = 0;
  const odoo = {
    snapshotStore: { list: async () => [snapshot], put: async (entry) => { snapshot = entry; } },
    listBlocks: async () => [{ canonical_unit_id: 'AHS-302', source: 'booking',
      idempotency_key: mapped.idempotency_key, check_in: event.dtstart,
      check_out: event.dtend, status: 'blocked' }],
    applyBlock: async () => { applied++; throw new Error('MUST_NOT_APPLY'); },
  };
  const statuses = [];
  const feedStore = { updateStatus: async (_id, status) => statuses.push(status.status) };
  const download = async () => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${event.uid}\r\nDTSTART:20261017\r\nDTEND:20261018\r\nSUMMARY:CLOSED\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  const first = await importInboundFeed(feed, { odoo, feedStore, download });
  const second = await importInboundFeed(feed, { odoo, feedStore, download });
  assert.equal(first.counts.DUPLICATE, 1);
  assert.equal(second.counts.DUPLICATE, 1);
  assert.equal(first.counts.CONFLICT, 0);
  assert.equal(second.counts.CONFLICT, 0);
  assert.equal(first.counts.APPLIED, 0);
  assert.equal(second.counts.APPLIED, 0);
  assert.equal(applied, 0);
  assert.equal(snapshot.state, 'ACTIVE');
  assert.deepEqual(statuses, ['OK', 'OK']);
});
