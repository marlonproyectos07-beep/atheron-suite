import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  today,
  arrivals,
  departures,
  inHouse,
  holds,
  paymentPending,
  upcoming,
  paymentStatus,
  toOperationalItem,
  buildOperationalDashboard,
  FIELD_SOURCE,
} from '../src/operational-read-model.mjs';
import { CAMILO, KEVIN, JHON, MONICA, DANIEL, ALL_RESERVATIONS } from '../fixtures/reservation-fixtures.mjs';
import { availableUnitsFor } from '../../odoo-hotel-ical/src/inventory-model.mjs';

test('paymentStatus: PENDIENTE cuando no se ha cobrado nada de una venta real', () => {
  assert.equal(paymentStatus(CAMILO), 'PENDIENTE'); // gross_sale=150000, collected=0
});

test('paymentStatus: PAGADO cuando lo cobrado cubre la venta', () => {
  assert.equal(paymentStatus(KEVIN), 'PAGADO'); // 86448 = 86448
});

test('paymentStatus: null cuando no hay venta bruta que evaluar (no se inventa)', () => {
  assert.equal(paymentStatus({ gross_sale: null, collected: 0 }), null);
});

test('toOperationalItem: marca SOURCE_PENDING en campos que la fuente no trae (telefono, canal en varios de estos casos)', () => {
  const item = toOperationalItem(JHON, { referenceDate: '2026-09-28' });
  assert.equal(item._field_source.phone, FIELD_SOURCE.PENDING); // el CEO no dio telefono de Jhon
  assert.equal(item._field_source.total, FIELD_SOURCE.AVAILABLE); // si dio el monto
});

test('arrivals: Camilo aparece el 28 (checkin), no el 27 ni el 29', () => {
  assert.equal(arrivals([CAMILO], '2026-09-28').length, 1);
  assert.equal(arrivals([CAMILO], '2026-09-27').length, 0);
  assert.equal(arrivals([CAMILO], '2026-09-29').length, 0);
});

test('departures: Camilo aparece el 29 (checkout)', () => {
  assert.equal(departures([CAMILO], '2026-09-29').length, 1);
  assert.equal(departures([CAMILO], '2026-09-28').length, 0);
});

test('inHouse: Camilo esta OCUPADA el 28, no el 29 (dia de salida)', () => {
  assert.equal(inHouse([CAMILO], '2026-09-28').length, 1);
  assert.equal(inHouse([CAMILO], '2026-09-29').length, 0);
});

test('today: incluye llegadas, salidas y ocupados del dia, sin duplicar por otras causas', () => {
  const day = today([CAMILO], '2026-09-28');
  assert.equal(day.length, 1); // Camilo llega Y esta ocupado el 28, pero es un solo item
});

test('paymentPending: Camilo (PENDIENTE) y Monica (sin cobro registrado, PENDIENTE) aparecen; Kevin (PAGADO) no', () => {
  const pending = paymentPending([CAMILO, KEVIN, MONICA], '2026-09-28').map((i) => i.external_reference);
  assert.ok(pending.includes(CAMILO.external_reference));
  assert.ok(pending.includes(MONICA.external_reference));
  assert.ok(!pending.includes(KEVIN.external_reference));
});

test('upcoming: no revienta con Daniel (fechas PENDIENTE_DE_VERIFICAR), simplemente lo excluye', () => {
  assert.doesNotThrow(() => upcoming([DANIEL, CAMILO], '2026-09-20'));
  const result = upcoming([DANIEL, CAMILO], '2026-09-20');
  assert.ok(result.every((i) => i.external_reference !== DANIEL.external_reference));
});

test('holds: vacio si ninguna reserva trae explicit_status HOLD (no se inventa)', () => {
  assert.deepEqual(holds(ALL_RESERVATIONS, '2026-09-28'), []);
});

test('holds: reconoce explicit_status=HOLD cuando la fuente lo trae', () => {
  const held = { ...CAMILO, explicit_status: 'HOLD' };
  assert.equal(holds([held], '2026-09-28').length, 1);
});

test('AVAILABLE reutiliza el modelo de inventario Nivel 1 (bloqueo cruzado), no reimplementa su propia logica', () => {
  const dashboard = buildOperationalDashboard(ALL_RESERVATIONS, '2026-09-28', {
    bookings: [{ unit: 'CASA_COMPLETA', checkIn: '2026-09-28', checkOut: '2026-09-29' }],
    checkIn: '2026-09-28',
    checkOut: '2026-09-29',
    availableUnitsForFn: availableUnitsFor,
  });
  assert.deepEqual(dashboard.AVAILABLE, []); // Casa Completa reservada bloquea todo, mismo comportamiento ya probado en HOTEL-002
});

test('buildOperationalDashboard nunca lanza error sobre el set completo de fixtures reales', () => {
  assert.doesNotThrow(() => buildOperationalDashboard(ALL_RESERVATIONS, '2026-09-28'));
});
