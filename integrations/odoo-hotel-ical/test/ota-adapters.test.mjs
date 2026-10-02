import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChannelAdapter, createSyncLedger, exportCalendar, importCalendar,
  normalizeReservation, preventLoop,
} from '../src/ota-adapters.mjs';
import { isAvailable } from '../src/inventory-model.mjs';

const bookingMapping = {
  'AHS-201': { external_property_id: '16559325', external_listing_id: null, odoo_unit_id: 1 },
  'AHS-CASA': { external_property_id: '16569053', external_listing_id: null, odoo_unit_id: 'TEST-ODOO-CASA' },
};
const airbnbMapping = {
  'AHS-201': { external_property_id: null, external_listing_id: 'TEST-AIRBNB-201', odoo_unit_id: 1 },
  'AHS-301': { external_property_id: null, external_listing_id: '1057232086445101786', odoo_unit_id: 'TEST-ODOO-301' },
  'AHS-CASA': { external_property_id: null, external_listing_id: 'TEST-AIRBNB-CASA', odoo_unit_id: 'TEST-ODOO-CASA' },
};

function calendar(uid, { start = '20270110', end = '20270112', status } = {}) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `UID:${uid}`,
    `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
    ...(status ? [`STATUS:${status}`] : []), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function fakeOdoo() {
  const blocks = new Map();
  const writes = [];
  return {
    blocks, writes,
    async listBlocks() { return [...blocks.values()]; },
    async applyBlock(reservation) {
      blocks.set(reservation.idempotency_key, reservation);
      writes.push(['apply', reservation.idempotency_key]);
    },
    async releaseBlock(key) {
      blocks.delete(key);
      writes.push(['release', key]);
    },
  };
}

function harness() {
  const odoo = fakeOdoo();
  const ledger = createSyncLedger();
  const entries = [];
  const audit = { record: (event) => entries.push(event) };
  const booking = createChannelAdapter('booking', { mapping: bookingMapping, odoo, ledger, audit });
  const airbnb = createChannelAdapter('airbnb', { mapping: airbnbMapping, odoo, ledger, audit });
  const inventory = () => [...odoo.blocks.values()].map((r) => ({
    unit: r.canonical_unit_id === 'AHS-CASA' ? 'CASA_COMPLETA' : r.canonical_unit_id.slice(4),
    checkIn: r.check_in, checkOut: r.check_out,
  }));
  return { odoo, ledger, entries, booking, airbnb, inventory };
}

test('A: Booking 201 bloquea 201 y CASA, pero deja 202 disponible', async () => {
  const h = harness();
  const result = await h.booking.importCalendar({ ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' });
  assert.equal(result.results[0].status, 'APPLIED');
  assert.equal(isAvailable(h.inventory(), '201', '2027-01-10', '2027-01-12'), false);
  assert.equal(isAvailable(h.inventory(), 'CASA_COMPLETA', '2027-01-10', '2027-01-12'), false);
  assert.equal(isAvailable(h.inventory(), '202', '2027-01-10', '2027-01-12'), true);
});

test('B: Airbnb CASA bloquea todas las habitaciones', async () => {
  const h = harness();
  const result = await h.airbnb.importCalendar({ ical: calendar('AIR-CASA'), canonical_unit_id: 'AHS-CASA' });
  assert.equal(result.results[0].status, 'APPLIED');
  for (const unit of ['201', '202', '203', '301', '302', 'CASA_COMPLETA']) {
    assert.equal(isAvailable(h.inventory(), unit, '2027-01-10', '2027-01-12'), false, unit);
  }
});

test('C: replay identico crea una sola operacion Odoo', async () => {
  const h = harness();
  const args = { ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' };
  await h.booking.importCalendar(args);
  const replay = await h.booking.importCalendar(args);
  assert.equal(replay.results[0].status, 'DUPLICATE');
  assert.equal(h.odoo.writes.length, 1);
  assert.equal(h.odoo.blocks.size, 1);
});

test('replay tras reiniciar ledger consulta Odoo y no repite la escritura', async () => {
  const h = harness();
  const args = { ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' };
  await h.booking.importCalendar(args);
  const restarted = createChannelAdapter('booking', {
    mapping: bookingMapping, odoo: h.odoo, ledger: createSyncLedger(),
  });
  const replay = await restarted.importCalendar(args);
  assert.equal(replay.results[0].status, 'DUPLICATE');
  assert.equal(h.odoo.writes.length, 1);
});

test('retirada manual en Odoo prevalece sobre un replay conocido', async () => {
  const h = harness();
  const args = { ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' };
  await h.booking.importCalendar(args);
  h.odoo.blocks.clear();
  const replay = await h.booking.importCalendar(args);
  assert.equal(replay.results[0].status, 'ODOO_OVERRIDE');
  assert.equal(h.odoo.writes.length, 1);
});

test('D: cancelacion libera solo su bloqueo', async () => {
  const h = harness();
  await h.booking.importCalendar({ ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' });
  await h.airbnb.importCalendar({ ical: calendar('AIR-301'), canonical_unit_id: 'AHS-301' });
  const cancelled = await h.booking.importCalendar({
    ical: calendar('BOOK-201', { status: 'CANCELLED' }), canonical_unit_id: 'AHS-201',
  });
  assert.equal(cancelled.results[0].status, 'RELEASED');
  assert.equal(h.odoo.blocks.size, 1);
  assert.equal(isAvailable(h.inventory(), '201', '2027-01-10', '2027-01-12'), true);
  assert.equal(isAvailable(h.inventory(), '301', '2027-01-10', '2027-01-12'), false);
  assert.equal(isAvailable(h.inventory(), 'CASA_COMPLETA', '2027-01-10', '2027-01-12'), false);
});

test('E: Odoo -> iCal -> Odoo descarta loop', async () => {
  const h = harness();
  await h.booking.importCalendar({ ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' });
  const exported = await h.booking.exportCalendar({
    canonical_unit_id: 'AHS-CASA', from: '2027-01-09', to: '2027-01-13', stamp: '2027-01-09',
  });
  assert.match(exported, /UID:atheron-CASA_COMPLETA-/);
  const replay = await h.airbnb.importCalendar({ ical: exported, canonical_unit_id: 'AHS-CASA' });
  assert.equal(replay.loops_discarded, 1);
  assert.equal(replay.imported, 0);
  assert.equal(h.odoo.writes.length, 1);
  assert.equal(h.entries.at(-1).result, 'LOOP_DISCARDED');
});

test('F: Booking y Airbnb misma unidad/rango genera conflicto auditable; Odoo conserva primero', async () => {
  const h = harness();
  await h.booking.importCalendar({ ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' });
  const second = await h.airbnb.importCalendar({ ical: calendar('AIR-201'), canonical_unit_id: 'AHS-201' });
  assert.deepEqual(second.results, [{ status: 'CONFLICT', authority: 'odoo' }]);
  assert.equal(h.odoo.writes.length, 1);
  assert.equal([...h.odoo.blocks.values()][0].source, 'booking');
  assert.equal(h.entries.at(-1).result, 'CONFLICT');
});

test('mapeo faltante queda pendiente; iCal invalido no libera bloques', async () => {
  const h = harness();
  const mapping = { 'AHS-302': { odoo_unit_id: null, external_listing_id: null } };
  const pending = await importCalendar({ ical: calendar('PENDING-302'), source: 'airbnb',
    canonical_unit_id: 'AHS-302', mapping, odoo: h.odoo, ledger: h.ledger });
  assert.equal(pending.results[0].status, 'PENDING_MAPPING');
  assert.equal(h.odoo.writes.length, 0);
  await assert.rejects(() => h.booking.importCalendar({ ical: 'garbage', canonical_unit_id: 'AHS-201' }), /INVALID_ICAL_FEED/);
});

test('contrato normalizado conserva campos y evita fechas o IDs inferidos', () => {
  const event = { uid: 'BOOK-201', dtstart: '2027-01-10', dtend: '2027-01-12' };
  const r = normalizeReservation(event, { source: 'booking', canonical_unit_id: 'AHS-201', mapping: bookingMapping });
  assert.deepEqual(Object.keys(r), ['source', 'external_property_id', 'external_listing_id',
    'external_reservation_id', 'canonical_unit_id', 'odoo_unit_id', 'check_in', 'check_out',
    'status', 'source_updated_at', 'idempotency_key', 'correlation_id']);
  assert.equal(r.external_listing_id, null);
  assert.equal(r.source_updated_at, null);
  assert.equal(preventLoop(event), false);
  assert.throws(() => normalizeReservation({ ...event, dtend: '2027-01-01' },
    { source: 'booking', canonical_unit_id: 'AHS-201', mapping: bookingMapping }), /INVALID_STAY_WINDOW/);
});

test('exportCalendar usa solo bloques del puerto Odoo', async () => {
  const h = harness();
  await h.booking.importCalendar({ ical: calendar('BOOK-201'), canonical_unit_id: 'AHS-201' });
  const ical = await exportCalendar({ canonical_unit_id: 'AHS-CASA', from: '2027-01-09',
    to: '2027-01-13', stamp: '2027-01-09', odoo: h.odoo, ledger: h.ledger });
  assert.match(ical, /DTSTART;VALUE=DATE:20270110/);
  assert.match(ical, /DTEND;VALUE=DATE:20270112/);
});
