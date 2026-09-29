/**
 * Workstream I: fixture real de Booking (Paola, Casa Completa,
 * 28->29 sep 2026, reserva 6634915879, ya verificada en vivo el
 * 2026-09-29, ver AI/ATH-ODOO-HOTEL-008_OTA_MAP.md). NO se modifica la
 * reserva real: esto solo simula, con el modelo Nivel 1, como habria
 * reaccionado el motor de bloqueo cruzado si esta reserva hubiera pasado
 * por Odoo como fuente unica.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAvailable, ROOM_UNITS, CASA_COMPLETA } from '../src/inventory-model.mjs';

const PAOLA_BOOKING = {
  unit: CASA_COMPLETA,
  checkIn: '2026-09-28',
  checkOut: '2026-09-29',
  // datos comerciales (no usados por el modelo de disponibilidad, solo
  // documentados aqui para trazabilidad del fixture real):
  external_reference: '6634915879',
  guests: 12,
  gross_sale: 700000,
};

test('Paola (Casa Completa) reservada -> las 5 habitaciones individuales quedan NO disponibles', () => {
  const bookings = [PAOLA_BOOKING];
  for (const room of ROOM_UNITS) {
    assert.equal(
      isAvailable(bookings, room, PAOLA_BOOKING.checkIn, PAOLA_BOOKING.checkOut),
      false,
      `${room} deberia rechazarse mientras Casa Completa esta reservada`,
    );
  }
});

test('test inverso: si la 302 se reserva individualmente en esa misma ventana, Casa Completa queda rechazada', () => {
  const bookings = [{ unit: '302', checkIn: '2026-09-28', checkOut: '2026-09-29' }];
  assert.equal(isAvailable(bookings, CASA_COMPLETA, '2026-09-28', '2026-09-29'), false);
});

test('el caso real de overbooking (Casa Completa + habitacion 302 vendidas ambas en Booking) SI se habria bloqueado con este motor', () => {
  // Caso real ya documentado: Mia Walton (Casa Completa, 10-17 ago 2026)
  // vendida en Booking al mismo tiempo que la habitacion 302 se vendio
  // suelta (Jackeine Rengifo 11-12 ago, Rendon Lukas 13-14 ago), porque
  // Booking gestiona los dos calendarios sin enlace entre si.
  const bookingsSiEsteMotorFueraLaFuente = [
    { unit: CASA_COMPLETA, checkIn: '2026-08-10', checkOut: '2026-08-17' },
  ];
  // Intentar vender la 302 suelta el 11 de agosto habria sido rechazado:
  assert.equal(isAvailable(bookingsSiEsteMotorFueraLaFuente, '302', '2026-08-11', '2026-08-12'), false);
});
