/**
 * ATH-ODOO-HOTEL-010 (preparacion), Frente I - contrato de herramientas
 * que la capa de IA puede invocar. Cada funcion es un adaptador delgado:
 * la IA NUNCA calcula disponibilidad, tarifa, ni aprueba una reserva por
 * su cuenta -- solo orquesta llamadas a estas herramientas, que a su vez
 * delegan en el Gateway ya probado (HOTEL-007/008).
 *
 * `deps` trae las funciones reales (o fakes deterministicos de prueba/
 * simulador). Nunca se importa un cliente HTTP directamente aqui: eso
 * mantiene la maquina de estados (conversation-engine.mjs) probable sin
 * red y sin acoplarla a un canal concreto (WhatsApp, web, etc).
 *
 * Herramientas que el Gateway real SI soporta hoy (ver src/contract.mjs,
 * OPERATIONS): availability, quote, hold, status (sirve para consultar
 * el estado de una cotizacion o un HOLD por operation_id).
 *
 * Herramienta que el Gateway real NO soporta todavia (hallazgo real,
 * documentado tambien en anti-overbooking-harness.mjs): cancelacion.
 * 'cancel' esta bloqueado a proposito en COMMON_FORBIDDEN como defensa en
 * profundidad, pero nunca se implemento como operacion. Se marca
 * NOT_IMPLEMENTED en vez de inventar un comportamiento.
 *
 * create_reservation/reservation_status: fuera del alcance de HOTEL-009
 * (el Gateway no expone un concepto de "reserva confirmada" mas alla de
 * disponibilidad/cotizacion/HOLD) -- NOT_IMPLEMENTED hasta que exista.
 */

export const NOT_IMPLEMENTED = 'NOT_IMPLEMENTED_REQUIRES_HOTEL_009';

export async function checkAvailabilityTool({ unit, checkIn, checkOut, guests }, deps) {
  return deps.checkAvailability({ unit, checkIn, checkOut, guests });
}

export async function quoteTool({ unit, checkIn, checkOut, guests }, deps) {
  return deps.quote({ unit, checkIn, checkOut, guests });
}

/**
 * `unit` viaja junto a `quoteId`: el contrato real de `hold` exige
 * `unit_id` ademas de `quote_id` (src/contract.mjs) -- hallazgo real de
 * HOTEL-009 al conectar esto contra el Gateway LIVE por primera vez: sin
 * `unit`, la llamada real fallaria por falta del campo obligatorio.
 */
export async function createHoldTool({ quoteId, unit }, deps) {
  return deps.createHold({ quoteId, unit });
}

/** Reutiliza la operacion real `status` del Gateway (por operation_id). */
export async function holdStatusTool({ holdId }, deps) {
  if (!deps.status) return { status: NOT_IMPLEMENTED, hold_id: holdId };
  return deps.status({ operationId: holdId });
}

/** Sin operacion real en el Gateway todavia -- ver encabezado del archivo. */
export async function cancelHoldTool({ holdId }) {
  return { status: NOT_IMPLEMENTED, hold_id: holdId };
}

export async function createReservationTool() {
  return { status: NOT_IMPLEMENTED };
}

export async function reservationStatusTool() {
  return { status: NOT_IMPLEMENTED };
}
