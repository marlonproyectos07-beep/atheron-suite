import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcalFeed, coalesceOccupiedRanges } from '../src/ical-export.mjs';
import { calendarFor, CASA_COMPLETA } from '../src/inventory-model.mjs';

test('coalesceOccupiedRanges agrupa noches consecutivas en un solo rango', () => {
  const bookings = [{ unit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-30' }];
  const days = calendarFor(bookings, '201', { from: '2026-09-27', to: '2026-10-01' });
  const ranges = coalesceOccupiedRanges(days);
  assert.deepEqual(ranges, [{ start: '2026-09-28', end: '2026-09-30', reasons: ['casa_completa_blocks_room'] }]);
});

test('buildIcalFeed produce VCALENDAR valido con un VEVENT para el bloqueo de Casa Completa', () => {
  const bookings = [{ unit: CASA_COMPLETA, checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  const ics = buildIcalFeed(bookings, '301', { from: '2026-09-27', to: '2026-10-01', stamp: '2026-09-29' });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /X-ATHERON-UNIT:301/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260928/);
  assert.match(ics, /DTEND;VALUE=DATE:20260929/);
  assert.match(ics, /END:VCALENDAR/);
});

test('buildIcalFeed sin ninguna noche ocupada no genera VEVENT', () => {
  const ics = buildIcalFeed([], '202', { from: '2026-09-27', to: '2026-09-29', stamp: '2026-09-29' });
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
  assert.match(ics, /BEGIN:VCALENDAR/);
});

test('calendarFor(CASA_COMPLETA) se bloquea si cualquier habitacion individual esta ocupada (fixture: caso real Booking, habitacion 302)', () => {
  // Mismo patron confirmado en produccion (Booking): mientras Casa Completa
  // estaba vendida, la 302 tambien se vendio suelta para noches dentro de
  // la misma ventana -> riesgo real de overbooking ya documentado en
  // AI/ATH-ODOO-HOTEL-008_OTA_MAP.md. Este test demuestra que el modelo
  // Nivel 1 SI habria bloqueado esa venta cruzada si hubiera sido la fuente.
  const bookings = [{ unit: '302', checkIn: '2026-08-11', checkOut: '2026-08-12' }];
  const ics = buildIcalFeed(bookings, CASA_COMPLETA, { from: '2026-08-10', to: '2026-08-13', stamp: '2026-08-10' });
  assert.match(ics, /DTSTART;VALUE=DATE:20260811/);
  assert.match(ics, /SUMMARY:Bloqueado \(room_blocks_casa_completa\)/);
});
