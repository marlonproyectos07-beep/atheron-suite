/**
 * ATH-ODOO-HOTEL-010 (preparacion), Gate 010-C - politica explicita de
 * autonomia de la IA. No es solo documentacion: `classify()` es la
 * fuente unica de verdad que cualquier capa (conversation-engine.mjs,
 * un futuro canal real) puede consultar para decidir si una accion la
 * puede hacer la IA sola o necesita a Angela/Marlon.
 *
 * Principio (ya aprobado desde HOTEL-006/007): la IA nunca es autoridad
 * comercial. GREEN = puede hacerlo sola. YELLOW = puede prepararlo, pero
 * el paso sensible (HOLD, cambios) pasa siempre por el Gateway/Odoo real,
 * nunca por un calculo propio. RED = siempre HUMAN_REQUIRED.
 */

export const AUTONOMY_POLICY = Object.freeze({
  GREEN: Object.freeze([
    'greet',
    'collect_dates',
    'collect_guests',
    'check_availability',
    'get_quote',
    'present_options',
    'collect_guest_data',
    'check_status',
    'answer_approved_info',
  ]),
  YELLOW: Object.freeze([
    'prepare_hold',
    'change_dates',
    'change_guests',
    'handle_group_request',
    'handle_special_conditions',
  ]),
  RED: Object.freeze([
    'unauthorized_discount',
    'refund',
    'complaint',
    'capacity_exception',
    'manual_price',
    'overbooking_override',
    'sensitive_modification',
    'conflicted_payment',
    'cancellation_with_economic_impact',
    'unsupported_operation',
  ]),
});

/** @returns {'GREEN'|'YELLOW'|'RED'|null} null si la accion no esta catalogada. */
export function classify(action) {
  for (const tier of Object.keys(AUTONOMY_POLICY)) {
    if (AUTONOMY_POLICY[tier].includes(action)) return tier;
  }
  return null;
}

/** Una accion no catalogada NUNCA se asume segura: se trata como RED. */
export function isAutonomousAllowed(action) {
  return classify(action) === 'GREEN';
}
