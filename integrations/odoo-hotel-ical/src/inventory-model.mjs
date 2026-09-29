/**
 * ATH-ODOO-HOTEL-008 Nivel 1 - modelo de inventario con bloqueo cruzado.
 *
 * Reimplementa, como logica pura y testeable, la regla de negocio ya
 * aprobada en HOTEL-002 (Odoo real, accion 1967 detras del gateway):
 *
 *   CASA COMPLETA reservada  -> bloquea 201/202/203/301/302.
 *   Una habitacion reservada -> bloquea CASA COMPLETA.
 *   Una habitacion reservada -> NO bloquea las demas habitaciones.
 *
 * No sustituye a Odoo como fuente de verdad: esto es la pieza Nivel 1
 * (independiente de NOBEDS) que consume el mismo estado de reservas y
 * lo traduce a calendarios por unidad, para exportar/importar iCal sin
 * cruzar OTAs entre si (Booking <-> Odoo, Airbnb <-> Odoo, nunca
 * Booking <-> Airbnb directamente).
 */

export const ROOM_UNITS = Object.freeze(['201', '202', '203', '301', '302']);
export const CASA_COMPLETA = 'CASA_COMPLETA';
export const ALL_UNITS = Object.freeze([...ROOM_UNITS, CASA_COMPLETA]);

function assertValidUnit(unit) {
  if (!ALL_UNITS.includes(unit)) {
    throw new Error(`UNKNOWN_UNIT: ${unit}`);
  }
}

function assertValidBooking(booking) {
  assertValidUnit(booking.unit);
  if (!booking.checkIn || !booking.checkOut) {
    throw new Error('BOOKING_REQUIRES_CHECKIN_AND_CHECKOUT');
  }
  if (booking.checkOut <= booking.checkIn) {
    throw new Error('CHECKOUT_MUST_BE_AFTER_CHECKIN');
  }
}

/**
 * Noches ocupadas por una reserva: [checkIn, checkOut) en dias completos,
 * mismo criterio hotelero ya usado en el resto del proyecto (check-out no
 * cuenta como noche ocupada).
 */
export function nightsOf(checkIn, checkOut) {
  const nights = [];
  let cursor = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  while (cursor < end) {
    nights.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return nights;
}

function bookingCoversDate(booking, date) {
  return date >= booking.checkIn && date < booking.checkOut;
}

/**
 * Motivo de bloqueo de `unit` en `date`, o null si esta libre.
 * Nunca inventa disponibilidad: solo deriva de las reservas dadas.
 */
export function occupancyReason(bookings, unit, date) {
  assertValidUnit(unit);
  const isRoom = ROOM_UNITS.includes(unit);

  for (const booking of bookings) {
    if (!bookingCoversDate(booking, date)) continue;

    if (booking.unit === unit) {
      return { occupied: true, reason: 'own_booking', blockingUnit: unit };
    }
    if (isRoom && booking.unit === CASA_COMPLETA) {
      return { occupied: true, reason: 'casa_completa_blocks_room', blockingUnit: CASA_COMPLETA };
    }
    if (unit === CASA_COMPLETA && ROOM_UNITS.includes(booking.unit)) {
      return { occupied: true, reason: 'room_blocks_casa_completa', blockingUnit: booking.unit };
    }
    // habitacion hermana reservada: NO bloquea esta habitacion.
  }
  return { occupied: false, reason: null, blockingUnit: null };
}

export function isAvailable(bookings, unit, checkIn, checkOut) {
  bookings.forEach(assertValidBooking);
  return nightsOf(checkIn, checkOut).every((date) => !occupancyReason(bookings, unit, date).occupied);
}

/**
 * Calendario noche-a-noche para una unidad, entre `from` (incl.) y `to`
 * (excl.). Cada entrada trae el motivo de bloqueo cuando aplica, para que
 * el exportador iCal y cualquier tablero puedan mostrar la causa real.
 */
export function calendarFor(bookings, unit, { from, to }) {
  bookings.forEach(assertValidBooking);
  return nightsOf(from, to).map((date) => ({ date, ...occupancyReason(bookings, unit, date) }));
}

/**
 * Unidades realmente disponibles para una ventana de fechas, dado un
 * conjunto de reservas. Base para el motor de alternativas (Workstream C).
 */
export function availableUnitsFor(bookings, checkIn, checkOut, { units = ALL_UNITS } = {}) {
  return units.filter((unit) => isAvailable(bookings, unit, checkIn, checkOut));
}
