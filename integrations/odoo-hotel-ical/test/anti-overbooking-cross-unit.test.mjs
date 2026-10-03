import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncLedger, importCalendar } from '../src/ota-adapters.mjs';
import { isAvailable } from '../src/inventory-model.mjs';

const rooms = ['201', '202', '203', '301', '302'];
const ical = (uid) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `UID:${uid}`,
  'DTSTART;VALUE=DATE:20270110', 'DTEND;VALUE=DATE:20270112',
  'END:VEVENT', 'END:VCALENDAR',
].join('\r\n');

function rig() {
  const blocks = new Map();
  const writes = [];
  const odoo = {
    listBlocks: async () => [...blocks.values()],
    applyBlock: async (reservation) => {
      blocks.set(reservation.idempotency_key, reservation);
      writes.push(reservation.idempotency_key);
    },
    releaseBlock: async (key) => blocks.delete(key),
  };
  const ledger = createSyncLedger();
  const mapping = Object.fromEntries(['AHS-CASA', ...rooms.map((room) => `AHS-${room}`)].map((unit, index) => [
    unit, { odoo_unit_id: index + 1, external_listing_id: `TEST-${unit}` },
  ]));
  const receive = (source, unit, uid) => importCalendar({
    ical: ical(uid), source, canonical_unit_id: unit, mapping, odoo, ledger,
  });
  const inventory = () => [...blocks.values()].map((block) => ({
    unit: block.canonical_unit_id === 'AHS-CASA' ? 'CASA_COMPLETA' : block.canonical_unit_id.slice(4),
    checkIn: block.check_in, checkOut: block.check_out,
  }));
  return { blocks, writes, receive, inventory };
}

for (const room of rooms) {
  test(`Booking ${room} impide Airbnb CASA sin crear un segundo bloqueo`, async () => {
    const r = rig();
    assert.equal((await r.receive('booking', `AHS-${room}`, `BOOK-${room}`)).results[0].status, 'APPLIED');
    assert.deepEqual((await r.receive('airbnb', 'AHS-CASA', `AIR-CASA-${room}`)).results,
      [{ status: 'CONFLICT', authority: 'odoo' }]);
    assert.equal(r.blocks.size, 1);
    assert.equal(r.writes.length, 1);
    assert.equal(isAvailable(r.inventory(), 'CASA_COMPLETA', '2027-01-10', '2027-01-12'), false);
  });

  test(`Airbnb CASA impide Booking ${room} sin crear un segundo bloqueo`, async () => {
    const r = rig();
    assert.equal((await r.receive('airbnb', 'AHS-CASA', `AIR-CASA-${room}`)).results[0].status, 'APPLIED');
    assert.deepEqual((await r.receive('booking', `AHS-${room}`, `BOOK-${room}`)).results,
      [{ status: 'CONFLICT', authority: 'odoo' }]);
    assert.equal(r.blocks.size, 1);
    assert.equal(r.writes.length, 1);
    assert.equal(isAvailable(r.inventory(), room, '2027-01-10', '2027-01-12'), false);
  });
}
