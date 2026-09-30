/**
 * ATH-ODOO-HOTEL-009, Frente E - arnes de prueba anti-overbooking
 * ("prueba reina"): disponible -> reserva manual TEST -> bloqueada ->
 * cancelacion -> disponible de nuevo.
 *
 * SIMULADO: corre sobre un inventario en memoria (mismo modelo de bloqueo
 * cruzado de odoo-hotel-ical, ya probado en HOTEL-002/008), nunca contra
 * Odoo real. Repetible e idempotente: cada corrida copia el inventario
 * que recibe (nunca lo muta) y no deja rastro fuera de su propio retorno.
 *
 * Hallazgo real (no hipotesis, verificado en src/contract.mjs): el
 * contrato del Gateway hoy solo define las operaciones
 * availability/quote/hold/status. No existe una operacion `cancel` --
 * y esto NO es un descuido: `test/contract.test.mjs` ("unsupported
 * operations (confirm/cancel) are never in the whitelist") prueba
 * explicitamente, a proposito, desde HOTEL-007, que 'cancel' NUNCA debe
 * quedar en el whitelist de operaciones del Gateway. Se intento agregar
 * `cancel` como operacion real (DRY_RUN) en este gate y se revirtio
 * exactamente por chocar con esa prueba deliberada: no es un bug a
 * corregir, es una decision de arquitectura que solo Marlon puede
 * levantar. Este arnes simula la cancelacion sobre el inventario en
 * memoria (nunca sobre el Gateway) para poder probar el CICLO COMPLETO
 * de la regla de negocio ahora mismo; el paso de cancelacion contra el
 * Gateway/Odoo real queda NOT_IMPLEMENTED hasta esa decision.
 */

import { isAvailable } from '../../odoo-hotel-ical/src/inventory-model.mjs';
import { createManualReservation } from './reception-booking.mjs';

export const CANCEL_NOT_IMPLEMENTED_IN_GATEWAY_CONTRACT = 'CANCEL_NOT_IMPLEMENTED_IN_GATEWAY_CONTRACT';

/** Dependencias falsas (nunca red, nunca Odoo) para reception-booking.mjs. */
export function buildFakeGatewayDeps(inventory) {
  let quoteCounter = 0;
  let holdCounter = 0;
  return {
    checkAvailability: async (unit, checkin, checkout) => isAvailable(inventory, unit, checkin, checkout),
    createQuote: async ({ unit, checkin }) => ({ quote_id: `TEST-Q-${unit}-${checkin}-${++quoteCounter}` }),
    createHold: async ({ quote_id }) => ({ hold_id: `TEST-H-${quote_id}-${++holdCounter}` }),
  };
}

/**
 * Corre el ciclo completo de la prueba reina sobre una COPIA de
 * `bookings` (el llamador nunca ve su array mutado). Devuelve el registro
 * paso a paso para reporte, mas un `status` final:
 *
 *   PASS
 *   ABORTED_UNIT_NOT_AVAILABLE_BEFORE_TEST  (no es un fallo del arnes: la
 *     unidad ya estaba ocupada por otra cosa, el arnes no fuerza overbooking)
 *   ABORTED_RESERVATION_NOT_HELD
 *   FAILED_UNIT_STILL_AVAILABLE_AFTER_HOLD  (fallo real: overbooking posible)
 *   FAILED_UNIT_NOT_AVAILABLE_AFTER_CANCEL  (fallo real: cancelacion no libero la unidad)
 */
export async function runQueenTest({ unit, checkin, checkout, guest = 'TEST_HUESPED_PRUEBA_REINA', bookings = [] }) {
  const inventory = [...bookings];
  const steps = [];

  const beforeAvailable = isAvailable(inventory, unit, checkin, checkout);
  steps.push({ step: 'ANTES', unit, checkin, checkout, available: beforeAvailable });
  if (!beforeAvailable) {
    return { status: 'ABORTED_UNIT_NOT_AVAILABLE_BEFORE_TEST', steps };
  }

  const deps = buildFakeGatewayDeps(inventory);
  const reservation = await createManualReservation({ guest, phone: null, unit, checkin, checkout, guests: 1 }, deps);
  steps.push({ step: 'RESERVA_MANUAL_TEST', result: reservation });
  if (reservation.status !== 'HELD') {
    return { status: 'ABORTED_RESERVATION_NOT_HELD', steps };
  }

  // Simula lo que Odoo haria al confirmar el HOLD: la unidad pasa a
  // ocupada en el inventario. Marcado TEST_ para poder identificarla y
  // limpiarla sin ambiguedad.
  const testBooking = { unit, checkIn: checkin, checkOut: checkout, external_reference: reservation.hold_id };
  inventory.push(testBooking);

  const afterReservation = isAvailable(inventory, unit, checkin, checkout);
  steps.push({ step: 'DESPUES_DE_RESERVAR', unit, available: afterReservation });
  if (afterReservation) {
    return { status: 'FAILED_UNIT_STILL_AVAILABLE_AFTER_HOLD', steps };
  }

  const cancelIndex = inventory.findIndex((b) => b.external_reference === testBooking.external_reference);
  inventory.splice(cancelIndex, 1);
  steps.push({
    step: 'CANCELACION',
    simulated: true,
    real_gateway_support: CANCEL_NOT_IMPLEMENTED_IN_GATEWAY_CONTRACT,
  });

  const afterCancel = isAvailable(inventory, unit, checkin, checkout);
  steps.push({ step: 'DESPUES_DE_CANCELAR', unit, available: afterCancel });
  if (!afterCancel) {
    return { status: 'FAILED_UNIT_NOT_AVAILABLE_AFTER_CANCEL', steps };
  }

  return { status: 'PASS', steps, cancel_real_gateway_support: CANCEL_NOT_IMPLEMENTED_IN_GATEWAY_CONTRACT };
}
