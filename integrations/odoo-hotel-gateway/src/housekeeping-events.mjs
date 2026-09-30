/**
 * ATH-ODOO-HOTEL-012, Fase 3 - eventos de notificacion de housekeeping.
 *
 * Constructores puros (no escriben a ningun log, cola ni red). Deja la
 * arquitectura lista para que un futuro dispatcher elija canal (Odoo,
 * PWA, WhatsApp, email) sin acoplar el nucleo a ninguno -- en esta fase
 * NO se conecta WhatsApp real (regla explicita de HOTEL-012).
 *
 * Modulo separado de `observability-events.mjs` a proposito: ese archivo
 * tiene un test que fija sus 8 EVENT_TYPES exactos (contrato cerrado de
 * HOTEL-010, Frente K); este modulo no lo modifica.
 */

export const HOUSEKEEPING_EVENT_TYPES = Object.freeze([
  'checkout_completed',
  'cleaning_started',
  'cleaning_finished',
  'ready_for_guest',
  'incident_reported',
]);

function assertKnownType(type) {
  if (!HOUSEKEEPING_EVENT_TYPES.includes(type)) {
    throw new Error(`UNKNOWN_HOUSEKEEPING_EVENT_TYPE: ${type}`);
  }
}

/**
 * @param {string} type - uno de HOUSEKEEPING_EVENT_TYPES
 * @param {{unit: string, correlation_id: string}} trace
 * @param {object} data - datos propios del evento (nunca secretos, nunca telefono/huesped salvo que ya viniera en el dato de origen)
 */
export function buildHousekeepingEvent(type, trace, data = {}) {
  assertKnownType(type);
  const { unit, correlation_id } = trace;
  if (!unit || !correlation_id) {
    throw new Error('HOUSEKEEPING_EVENT_REQUIRES_UNIT_AND_CORRELATION_ID');
  }
  return {
    type,
    unit,
    correlation_id,
    timestamp: new Date().toISOString(),
    ...data,
  };
}
