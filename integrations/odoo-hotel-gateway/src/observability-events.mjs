/**
 * ATH-ODOO-HOTEL-010 (preparacion), Frente K - eventos de observabilidad.
 *
 * Constructores puros (no escriben a ningun log ni red): arman el objeto
 * de evento con la traza pedida (conversation_id/correlation_id/
 * reservation_id/hold_id/quote_id/channel/timestamp) y NUNCA incluyen
 * datos sensibles (password/token/api key) ni mas datos personales de los
 * ya presentes en la conversacion.
 */

const EVENT_TYPES = Object.freeze([
  'availability_checked',
  'quote_generated',
  'option_selected',
  'hold_created',
  'hold_expired',
  'human_handoff',
  'reservation_created',
  'reservation_cancelled',
]);

export { EVENT_TYPES };

function assertKnownType(type) {
  if (!EVENT_TYPES.includes(type)) {
    throw new Error(`UNKNOWN_EVENT_TYPE: ${type}`);
  }
}

/**
 * @param {string} type - uno de EVENT_TYPES
 * @param {{conversation_id: string, correlation_id: string, channel: string}} trace
 * @param {object} data - datos propios del evento (nunca secretos)
 */
export function buildEvent(type, trace, data = {}) {
  assertKnownType(type);
  const { conversation_id, correlation_id, channel } = trace;
  if (!conversation_id || !correlation_id || !channel) {
    throw new Error('EVENT_REQUIRES_CONVERSATION_ID_CORRELATION_ID_CHANNEL');
  }
  return {
    type,
    conversation_id,
    correlation_id,
    channel,
    timestamp: new Date().toISOString(),
    ...data,
  };
}
