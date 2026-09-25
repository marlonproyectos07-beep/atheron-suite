import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture, buildHarness } from './helpers.mjs';
import { OtaCalendarAdapter } from '../src/adapter.mjs';

test('crea un bloqueo a partir de un VEVENT de Booking', () => {
  const { adapter, sink } = buildHarness();
  const result = adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });

  assert.equal(result.created.length, 1);
  assert.equal(result.conflicts.length, 0);
  assert.ok(sink.isBlocked('hotel-atheron-suite:201', 'booking:fixture-atheron-suite-201:bdc-9f21a7@booking.com'));
});

test('reprocesar el mismo feed es idempotente (no crea un segundo bloqueo)', () => {
  const { adapter, sink } = buildHarness();
  const ics = loadFixture('booking-room.ics');
  adapter.sync(ics, { source: 'booking', listingId: 'fixture-atheron-suite-201' });
  const second = adapter.sync(ics, { source: 'booking', listingId: 'fixture-atheron-suite-201' });

  assert.equal(second.created.length, 0);
  assert.equal(second.updated.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.equal(sink.activeBlocksFor('hotel-atheron-suite:201').length, 1);
});

test('un feed "duplicate.ics" con el mismo UID y mismas fechas no duplica el bloqueo', () => {
  const { adapter, sink } = buildHarness();
  adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });
  const result = adapter.sync(loadFixture('duplicate.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });

  assert.equal(result.skipped.length, 1);
  assert.equal(sink.activeBlocksFor('hotel-atheron-suite:201').length, 1);
});

test('un VEVENT con fechas distintas para el mismo UID se trata como actualización', () => {
  const { adapter, sink } = buildHarness();
  adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });

  const updated = loadFixture('booking-room.ics').replace('20261013', '20261014');
  const result = adapter.sync(updated, { source: 'booking', listingId: 'fixture-atheron-suite-201' });

  assert.equal(result.updated.length, 1);
  const [block] = sink.activeBlocksFor('hotel-atheron-suite:201');
  assert.equal(block.endDate, '2026-10-14');
});

test('STATUS:CANCELLED libera el bloqueo previamente aplicado', () => {
  const { adapter, sink } = buildHarness();
  adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });
  assert.equal(sink.activeBlocksFor('hotel-atheron-suite:201').length, 1);

  const result = adapter.sync(loadFixture('cancelled.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });

  assert.equal(result.cancelled.length, 1);
  assert.equal(sink.activeBlocksFor('hotel-atheron-suite:201').length, 0);
});

test('CASA COMPLETA bloquea también todas las habitaciones hermanas', () => {
  const { adapter, sink } = buildHarness();
  const result = adapter.sync(loadFixture('casa-completa.ics'), { source: 'airbnb', listingId: 'fixture-casa-completa-magia' });

  assert.equal(result.created.length, 1);
  for (const unitId of ['hotel-atheron-suite:casa-completa', 'hotel-atheron-suite:201', 'hotel-atheron-suite:202', 'hotel-atheron-suite:203', 'hotel-atheron-suite:301', 'hotel-atheron-suite:302']) {
    assert.equal(sink.activeBlocksFor(unitId).length, 1, `${unitId} debería quedar bloqueada`);
  }
});

test('dos eventos distintos con fechas solapadas sobre la misma unidad van a la cola de conflictos', () => {
  const { adapter, sink, conflictQueue } = buildHarness();
  adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });
  const result = adapter.sync(loadFixture('conflict.ics'), { source: 'airbnb', listingId: 'fixture-atheron-suite-201' });

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, 'OTA_EVENT_OVERLAP');
  assert.equal(conflictQueue.list().length, 1);
  // El evento en conflicto NO debe aplicarse: sigue habiendo un único bloqueo (el original).
  assert.equal(sink.activeBlocksFor('hotel-atheron-suite:201').length, 1);
});

test('un listing sin mapeo CONFIRMADO en la matriz se manda a la cola en vez de fallar en silencio', () => {
  const { adapter, conflictQueue } = buildHarness();
  const result = adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'listing-nunca-mapeado' });

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, 'UNMAPPED_LISTING');
  assert.equal(conflictQueue.list().length, 1);
});

test('un internalReservationChecker con conflicto bloquea la aplicación en vez de sobreescribir', () => {
  const { mappingRegistry, sink, conflictQueue } = buildHarness();
  const adapter = new OtaCalendarAdapter({
    mappingRegistry,
    sink,
    conflictQueue,
    internalReservationChecker: { hasConflict: () => true },
  });

  const result = adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].type, 'INTERNAL_RESERVATION_CONFLICT');
  assert.equal(sink.activeBlocksFor('hotel-atheron-suite:201').length, 0);
});

test('cada operación queda auditada, éxito o error', () => {
  const { adapter } = buildHarness();
  adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'fixture-atheron-suite-201' });
  adapter.sync(loadFixture('booking-room.ics'), { source: 'booking', listingId: 'listing-nunca-mapeado' });

  assert.ok(adapter.auditLog.length >= 2);
  assert.ok(adapter.auditLog.some((entry) => entry.result === 'ok'));
  assert.ok(adapter.auditLog.some((entry) => entry.result === 'error'));
});
