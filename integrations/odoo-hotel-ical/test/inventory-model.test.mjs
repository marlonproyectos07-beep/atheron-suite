import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarFor,
  isAvailable,
  availableUnitsFor,
  occupancyReason,
  nightsOf,
  ROOM_UNITS,
  CASA_COMPLETA,
} from '../src/inventory-model.mjs';

test('nightsOf: checkout no cuenta como noche ocupada', () => {
  assert.deepEqual(nightsOf('2026-09-28', '2026-09-29'), ['2026-09-28']);
  assert.deepEqual(nightsOf('2026-09-28', '2026-09-30'), ['2026-09-28', '2026-09-29']);
});

test('habitacion sin reservas: disponible', () => {
  assert.equal(isAvailable([], '201', '2026-09-28', '2026-09-29'), true);
});

test('201 reservada -> 201 no disponible, 202 sigue disponible (hermanas no se bloquean)', () => {
  const bookings = [{ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  assert.equal(isAvailable(bookings, '201', '2026-09-28', '2026-09-29'), false);
  assert.equal(isAvailable(bookings, '202', '2026-09-28', '2026-09-29'), true);
  assert.equal(isAvailable(bookings, '203', '2026-09-28', '2026-09-29'), true);
  assert.equal(isAvailable(bookings, '301', '2026-09-28', '2026-09-29'), true);
  assert.equal(isAvailable(bookings, '302', '2026-09-28', '2026-09-29'), true);
});

test('201 reservada -> CASA COMPLETA no disponible (habitacion bloquea la casa)', () => {
  const bookings = [{ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  assert.equal(isAvailable(bookings, CASA_COMPLETA, '2026-09-28', '2026-09-29'), false);
  const r = occupancyReason(bookings, CASA_COMPLETA, '2026-09-28');
  assert.equal(r.reason, 'room_blocks_casa_completa');
  assert.equal(r.blockingUnit, '201');
});

test('CASA COMPLETA reservada -> bloquea TODAS las habitaciones', () => {
  const bookings = [{ unit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  for (const room of ROOM_UNITS) {
    assert.equal(isAvailable(bookings, room, '2026-09-28', '2026-09-29'), false, `${room} deberia estar bloqueada`);
    const r = occupancyReason(bookings, room, '2026-09-28');
    assert.equal(r.reason, 'casa_completa_blocks_room');
  }
});

test('CASA COMPLETA reservada -> ella misma aparece ocupada por reserva propia', () => {
  const bookings = [{ unit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  const r = occupancyReason(bookings, CASA_COMPLETA, '2026-09-28');
  assert.equal(r.occupied, true);
  assert.equal(r.reason, 'own_booking');
});

test('fuera del rango de fechas de la reserva: disponible', () => {
  const bookings = [{ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  assert.equal(isAvailable(bookings, '201', '2026-09-29', '2026-09-30'), true);
});

test('calendarFor devuelve el motivo por cada noche del rango', () => {
  const bookings = [{ unit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-30' }];
  const cal = calendarFor(bookings, '301', { from: '2026-09-27', to: '2026-10-01' });
  assert.deepEqual(
    cal.map((d) => [d.date, d.occupied]),
    [
      ['2026-09-27', false],
      ['2026-09-28', true],
      ['2026-09-29', true],
      ['2026-09-30', false],
    ],
  );
  assert.equal(cal[1].reason, 'casa_completa_blocks_room');
});

test('availableUnitsFor: excluye correctamente segun el caso Casa Completa / habitacion (fixture Paola)', () => {
  // Fixture real de Booking: Paola Largo, Casa Completa, 28->29 sep 2026.
  const bookings = [{ unit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  const disponibles = availableUnitsFor(bookings, '2026-09-28', '2026-09-29');
  assert.deepEqual(disponibles, []); // nada disponible: casa completa y las 5 habitaciones bloqueadas
});

test('reserva invalida (checkout <= checkin) lanza error, no se asume nada', () => {
  assert.throws(() => isAvailable([{ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-28' }], '201', '2026-09-28', '2026-09-29'));
});

test('unidad desconocida lanza error explicito, nunca inventa disponibilidad', () => {
  assert.throws(() => isAvailable([], 'UNIDAD-FANTASMA', '2026-09-28', '2026-09-29'), /UNKNOWN_UNIT/);
});
