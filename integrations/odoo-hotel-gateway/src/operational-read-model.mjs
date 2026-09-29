/**
 * ATH-ODOO-HOTEL-009, Frente C - read-model operativo para "modo Angela".
 *
 * Convierte reservas (misma forma que fixtures/reservation-fixtures.mjs,
 * la fuente real sera sale.order/planning.slot de Odoo una vez haya
 * sesion STAGING) en las 8 vistas que recepcion necesita. Nunca inventa
 * un campo que la fuente no trae: cada campo declara si su fuente esta
 * disponible (SOURCE_AVAILABLE) o pendiente de conectar (SOURCE_PENDING).
 */

import { deriveStatus } from './angela-read-model.mjs';

export const FIELD_SOURCE = Object.freeze({
  AVAILABLE: 'SOURCE_AVAILABLE',
  PENDING: 'SOURCE_PENDING',
});

function sourceOf(value) {
  return value === undefined || value === null ? FIELD_SOURCE.PENDING : FIELD_SOURCE.AVAILABLE;
}

/** PAGADO / PARCIAL / PENDIENTE, o null si no hay venta bruta que evaluar. */
export function paymentStatus(reservation) {
  const total = reservation.gross_sale;
  if (total === undefined || total === null || total <= 0) return null;
  const paid = reservation.collected ?? 0;
  if (paid <= 0) return 'PENDIENTE';
  if (paid >= total) return 'PAGADO';
  return 'PARCIAL';
}

function hasVerifiedDates(reservation) {
  const { checkin, checkout } = reservation;
  return Boolean(checkin) && Boolean(checkout) && checkin !== 'PENDIENTE_DE_VERIFICAR' && checkout !== 'PENDIENTE_DE_VERIFICAR';
}

/**
 * Un item operativo, con los campos pedidos (property, unit, guest,
 * phone, check_in, check_out, guests, source, reservation_status,
 * payment_status, total, paid, balance) y su procedencia por campo.
 */
export function toOperationalItem(reservation, { referenceDate } = {}) {
  const total = reservation.gross_sale ?? null;
  const paid = reservation.collected ?? null;
  const balance = total != null ? Math.max(total - (paid ?? 0), 0) : null;

  const reservationStatus = reservation.explicit_status ?? (referenceDate ? deriveStatus(reservation, referenceDate) : null);

  return {
    property: reservation.property ?? null,
    unit: reservation.unit,
    guest: reservation.guest ?? null,
    phone: reservation.phone ?? null,
    check_in: reservation.checkin ?? null,
    check_out: reservation.checkout ?? null,
    guests: reservation.guests ?? null,
    source: reservation.channel ?? null,
    reservation_status: reservationStatus,
    payment_status: paymentStatus(reservation),
    total,
    paid,
    balance,
    external_reference: reservation.external_reference ?? null,
    _field_source: {
      property: sourceOf(reservation.property),
      guest: sourceOf(reservation.guest),
      phone: sourceOf(reservation.phone),
      source: sourceOf(reservation.channel),
      total: sourceOf(reservation.gross_sale),
      paid: sourceOf(reservation.collected),
    },
  };
}

function items(reservations, referenceDate) {
  return reservations.map((r) => toOperationalItem(r, { referenceDate }));
}

/** Todo lo relevante para HOY: llega, sale, o esta en casa hoy. */
export function today(reservations, referenceDate) {
  return items(reservations, referenceDate).filter(
    (i) => i.check_in === referenceDate || i.check_out === referenceDate || i.reservation_status === 'OCUPADA',
  );
}

export function arrivals(reservations, referenceDate) {
  return items(reservations, referenceDate).filter((i) => i.check_in === referenceDate);
}

export function departures(reservations, referenceDate) {
  return items(reservations, referenceDate).filter((i) => i.check_out === referenceDate);
}

export function inHouse(reservations, referenceDate) {
  return items(reservations, referenceDate).filter((i) => i.reservation_status === 'OCUPADA');
}

/** Reservas marcadas explicitamente como HOLD (no confirmadas todavia). */
export function holds(reservations, referenceDate) {
  return items(reservations, referenceDate).filter((i) => i.reservation_status === 'HOLD');
}

export function paymentPending(reservations, referenceDate) {
  return items(reservations, referenceDate).filter((i) => i.payment_status === 'PENDIENTE' || i.payment_status === 'PARCIAL');
}

/** Llegadas futuras dentro de una ventana (por defecto 14 dias). */
export function upcoming(reservations, referenceDate, { horizonDays = 14 } = {}) {
  const horizon = new Date(`${referenceDate}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + horizonDays);
  const horizonStr = horizon.toISOString().slice(0, 10);
  return items(reservations, referenceDate).filter(
    (i) => hasVerifiedDates({ checkin: i.check_in, checkout: i.check_out }) && i.check_in > referenceDate && i.check_in <= horizonStr,
  );
}

/**
 * AVAILABLE reutiliza el modelo de inventario Nivel 1 (bloqueo cruzado ya
 * probado, ver integrations/odoo-hotel-ical) en vez de inventar su propia
 * logica de disponibilidad. `bookings` en el mismo formato que
 * inventory-model.mjs espera ({unit, checkIn, checkOut}).
 */
export function available(bookings, checkIn, checkOut, availableUnitsForFn, unitsCatalog) {
  return availableUnitsForFn(bookings, checkIn, checkOut, { units: unitsCatalog });
}

/** Arma el objeto completo con las 8 vistas pedidas por Frente C. */
export function buildOperationalDashboard(reservations, referenceDate, { bookings, checkIn, checkOut, availableUnitsForFn, unitsCatalog } = {}) {
  const dashboard = {
    TODAY: today(reservations, referenceDate),
    ARRIVALS: arrivals(reservations, referenceDate),
    DEPARTURES: departures(reservations, referenceDate),
    IN_HOUSE: inHouse(reservations, referenceDate),
    HOLDS: holds(reservations, referenceDate),
    PAYMENT_PENDING: paymentPending(reservations, referenceDate),
    UPCOMING: upcoming(reservations, referenceDate),
    AVAILABLE: null,
  };
  if (bookings && checkIn && checkOut && availableUnitsForFn) {
    dashboard.AVAILABLE = available(bookings, checkIn, checkOut, availableUnitsForFn, unitsCatalog);
  }
  return dashboard;
}
