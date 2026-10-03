import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAvailable } from '../src/inventory-model.mjs';
import { createSyncLedger, importCalendar } from '../src/ota-adapters.mjs';
import { COVERAGE, PHASE_A_UNITS, summarizeCoverage } from '../src/phase-a-inventory.mjs';
import { classifyOverbooking, OVERBOOKING_CLASS } from '../src/protection-cutoff.mjs';

const rooms = ['201', '202', '203', '301', '302'];
const range = ['2027-01-10', '2027-01-12'];
const cutoff = '2027-01-01T00:00:00Z';
const calendar = (...uids) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  ...uids.flatMap((uid) => ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTART;VALUE=DATE:20270110',
    'DTEND;VALUE=DATE:20270112', 'END:VEVENT']),
  'END:VCALENDAR',
].join('\r\n');
const mapping = Object.fromEntries(['AHS-CASA', ...rooms.map((room) => `AHS-${room}`)]
  .map((unit, index) => [unit, { odoo_unit_id: index + 1, external_listing_id: `TEST-${unit}` }]));

function makePort({ simultaneousReads = false, delayedRelease = false } = {}) {
  const blocks = new Map();
  const writes = [];
  let readCount = 0;
  let openReads;
  const readsReady = new Promise((resolve) => { openReads = resolve; });
  let finishRelease;
  const releaseReady = new Promise((resolve) => { finishRelease = resolve; });
  let signalReleaseEntered;
  const releaseEntered = new Promise((resolve) => { signalReleaseEntered = resolve; });
  const odoo = {
    async listBlocks() {
      const snapshot = [...blocks.values()];
      if (simultaneousReads && ++readCount <= 2) {
        if (readCount === 2) openReads();
        await readsReady;
      }
      return snapshot;
    },
    async applyBlock(reservation) {
      blocks.set(reservation.idempotency_key, { ...reservation });
      writes.push(['apply', reservation.idempotency_key]);
    },
    async releaseBlock(key) {
      if (delayedRelease) { signalReleaseEntered(); await releaseReady; }
      blocks.delete(key);
      writes.push(['release', key]);
    },
  };
  const ledger = createSyncLedger();
  const receive = (source, unit, ical) => importCalendar({
    ical, source, canonical_unit_id: unit, mapping, odoo, ledger,
  });
  const inventory = () => [...blocks.values()].map((block) => ({
    unit: block.canonical_unit_id === 'AHS-CASA' ? 'CASA_COMPLETA' : block.canonical_unit_id.slice(4),
    checkIn: block.check_in, checkOut: block.check_out,
  }));
  return { blocks, writes, receive, inventory, releaseEntered, finishRelease };
}

test('inventario: seis unidades exactas; ninguna conectada de extremo a extremo', () => {
  assert.deepEqual(summarizeCoverage(), {
    TOTAL_UNITS: 6, CONNECTED: 0, PARTIAL: 1, UNCONNECTED: 5, UNKNOWN: 0, AT_RISK: 6,
  });
  assert.equal(PHASE_A_UNITS.find((entry) => entry.unit === 'AHS-302').coverage, COVERAGE.PARTIAL);
  assert.ok(PHASE_A_UNITS.every((entry) => !('feed_url' in entry)));
});

test('cutoff: conflictos previos son legacy; cualquier venta nueva es critica', () => {
  assert.equal(classifyOverbooking({ conflict: true, cutoff_at: cutoff,
    created_at: ['2026-12-01T00:00:00Z', '2026-12-31T23:59:59Z'] }), OVERBOOKING_CLASS.LEGACY_OVERBOOKING);
  assert.equal(classifyOverbooking({ conflict: true, cutoff_at: cutoff,
    created_at: ['2026-12-01T00:00:00Z', cutoff] }), OVERBOOKING_CLASS.NEW_OVERBOOKING);
  assert.equal(classifyOverbooking({ conflict: true, cutoff_at: cutoff,
    created_at: ['2026-12-01T00:00:00Z', null] }), OVERBOOKING_CLASS.UNCLASSIFIED_CONFLICT);
  assert.equal(classifyOverbooking({ conflict: true, cutoff_at: cutoff,
    created_at: [null, '2027-01-02T00:00:00Z'] }), OVERBOOKING_CLASS.NEW_OVERBOOKING);
  assert.equal(classifyOverbooking({ conflict: true, cutoff_at: cutoff,
    created_at: ['2026-02-30T00:00:00Z', '2026-12-01T00:00:00Z'] }), OVERBOOKING_CLASS.UNCLASSIFIED_CONFLICT);
  assert.equal(classifyOverbooking({ conflict: true, created_at: [cutoff, cutoff] }), OVERBOOKING_CLASS.UNCLASSIFIED_CONFLICT);
  assert.equal(classifyOverbooking({ conflict: false }), OVERBOOKING_CLASS.AT_RISK);
  assert.equal(classifyOverbooking({ conflict: false, synchronized: true }), OVERBOOKING_CLASS.NO_CONFLICT);
});

for (const source of ['BOOKING', 'AIRBNB', 'DIRECT', 'ODOO', 'HOLD', 'ICAL']) {
  test(`exclusion CASA/habitaciones independiente del origen ${source}`, () => {
    for (const room of rooms) {
      const casa = [{ unit: 'CASA_COMPLETA', checkIn: range[0], checkOut: range[1], source }];
      const individual = [{ unit: room, checkIn: range[0], checkOut: range[1], source }];
      assert.equal(isAvailable(casa, room, ...range), false);
      assert.equal(isAvailable(individual, 'CASA_COMPLETA', ...range), false);
    }
  });
}

test('replay y VEVENT duplicado en un lote crean un solo bloqueo', async () => {
  const r = makePort();
  const first = await r.receive('booking', 'AHS-201', calendar('book-201', 'book-201'));
  const replay = await r.receive('booking', 'AHS-201', calendar('book-201'));
  assert.deepEqual(first.results.map((result) => result.status), ['APPLIED']);
  assert.deepEqual(replay.results.map((result) => result.status), ['DUPLICATE']);
  assert.equal(r.blocks.size, 1);
  assert.equal(r.writes.length, 1);
});

test('actualizacion del mismo UID cambia fechas sin duplicar bloqueo', async () => {
  const r = makePort();
  await r.receive('booking', 'AHS-201', calendar('book-201'));
  const moved = calendar('book-201')
    .replace('20270110', '20270115').replace('20270112', '20270116');
  assert.equal((await r.receive('booking', 'AHS-201', moved)).results[0].status, 'APPLIED');
  assert.equal(r.blocks.size, 1);
  assert.equal([...r.blocks.values()][0].check_in, '2027-01-15');
  assert.equal((await r.receive('booking', 'AHS-201', moved)).results[0].status, 'DUPLICATE');
});

test('orden de llegada de revisiones del mismo UID altera fecha final: falta version causal', async () => {
  const oldEvent = calendar('book-201');
  const newEvent = oldEvent.replace('20270110', '20270115').replace('20270112', '20270116');
  const oldThenNew = makePort();
  await oldThenNew.receive('booking', 'AHS-201', oldEvent);
  await oldThenNew.receive('booking', 'AHS-201', newEvent);
  const newThenOld = makePort();
  await newThenOld.receive('booking', 'AHS-201', newEvent);
  await newThenOld.receive('booking', 'AHS-201', oldEvent);
  assert.equal([...oldThenNew.blocks.values()][0].check_in, '2027-01-15');
  assert.equal([...newThenOld.blocks.values()][0].check_in, '2027-01-10');
});

test('cancelacion libera solo el UID propio y conserva otro canal', async () => {
  const r = makePort();
  await r.receive('booking', 'AHS-201', calendar('book-201'));
  await r.receive('airbnb', 'AHS-202', calendar('air-202'));
  const cancelled = calendar('book-201').replace('END:VEVENT', 'STATUS:CANCELLED\r\nEND:VEVENT');
  assert.equal((await r.receive('booking', 'AHS-201', cancelled)).results[0].status, 'RELEASED');
  assert.equal(r.blocks.size, 1);
  assert.equal(isAvailable(r.inventory(), '202', ...range), false);
  assert.equal(isAvailable(r.inventory(), 'CASA_COMPLETA', ...range), false);
});

async function race(first, second) {
  const r = makePort({ simultaneousReads: true });
  const outcomes = await Promise.all([
    r.receive(first.source, first.unit, calendar(first.uid)),
    r.receive(second.source, second.unit, calendar(second.uid)),
  ]);
  return { r, statuses: outcomes.map((result) => result.results[0].status) };
}

test('RACE A: Booking 201 y Airbnb CASA pueden pasar lectura simultanea; conflicto detectado despues', async () => {
  const { r, statuses } = await race(
    { source: 'booking', unit: 'AHS-201', uid: 'book-201' },
    { source: 'airbnb', unit: 'AHS-CASA', uid: 'air-casa' },
  );
  assert.deepEqual(statuses, ['APPLIED', 'APPLIED']);
  assert.equal(r.blocks.size, 2);
  assert.equal(isAvailable(r.inventory().slice(0, 1), 'CASA_COMPLETA', ...range), false);
  assert.equal(classifyOverbooking({ conflict: true, cutoff_at: cutoff,
    created_at: ['2027-01-02T00:00:00Z', '2027-01-02T00:00:01Z'] }), OVERBOOKING_CLASS.NEW_OVERBOOKING);
});

test('RACE B: Airbnb CASA y Booking 301 tampoco tienen exclusion atomica local', async () => {
  const { r, statuses } = await race(
    { source: 'airbnb', unit: 'AHS-CASA', uid: 'air-casa' },
    { source: 'booking', unit: 'AHS-301', uid: 'book-301' },
  );
  assert.deepEqual(statuses, ['APPLIED', 'APPLIED']);
  assert.equal(r.blocks.size, 2);
});

test('RACE C: dos habitaciones distintas simultaneas son compatibles y cierran CASA', async () => {
  const { r, statuses } = await race(
    { source: 'booking', unit: 'AHS-201', uid: 'book-201' },
    { source: 'airbnb', unit: 'AHS-202', uid: 'air-202' },
  );
  assert.deepEqual(statuses, ['APPLIED', 'APPLIED']);
  assert.equal(r.blocks.size, 2);
  assert.equal(isAvailable(r.inventory(), 'CASA_COMPLETA', ...range), false);
  assert.equal(isAvailable(r.inventory(), '203', ...range), true);
});

test('RACE D: disponibilidad puede observar antes o despues de una liberacion pendiente', async () => {
  const r = makePort({ delayedRelease: true });
  await r.receive('booking', 'AHS-201', calendar('book-201'));
  const cancelled = calendar('book-201').replace('END:VEVENT', 'STATUS:CANCELLED\r\nEND:VEVENT');
  const releasing = r.receive('booking', 'AHS-201', cancelled);
  await r.releaseEntered;
  assert.equal(isAvailable(r.inventory(), '201', ...range), false);
  r.finishRelease();
  assert.equal((await releasing).results[0].status, 'RELEASED');
  assert.equal(isAvailable(r.inventory(), '201', ...range), true);
});
