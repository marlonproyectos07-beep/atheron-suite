/**
 * ATH-ODOO-HOTEL-010 (preparacion), Frente J - contexto de escalamiento
 * humano. Cuando la conversacion pasa a HUMAN_REQUIRED, Angela/Marlon
 * necesitan ver de un vistazo lo que ya se sabe -- sin tener que leer
 * todo el historial ni entender JSON.
 *
 * Nunca inventa un campo: lo que la conversacion no trae llega como null,
 * nunca como texto de relleno.
 */

const REASONS = Object.freeze([
  'UNAUTHORIZED_DISCOUNT_REQUEST',
  'LARGE_GROUP_NEEDS_APPROVAL',
  'SENSITIVE_REQUEST',
  'MANUAL_CONFIRMATION_REQUIRED',
  'AMBIGUOUS_REQUEST',
]);

export { REASONS as HANDOFF_REASONS };

/**
 * @param {object} conversation - misma forma que produce conversation-engine.mjs
 * @param {string} reason - uno de HANDOFF_REASONS
 * @param {string|null} lastMessage - ultimo mensaje del cliente, texto crudo
 */
export function buildHandoffContext(conversation, reason, lastMessage = null) {
  if (!REASONS.includes(reason)) {
    throw new Error(`UNKNOWN_HANDOFF_REASON: ${reason}`);
  }
  const { customer, requested, selectedUnit, quote } = conversation;
  return {
    conversation_id: conversation.conversationId,
    nombre: customer?.identifier ?? null,
    telefono: customer?.phone ?? null,
    fechas: requested?.checkIn && requested?.checkOut ? { checkin: requested.checkIn, checkout: requested.checkOut } : null,
    personas: requested?.guests ?? null,
    opcion: selectedUnit ?? null,
    precio_cotizado: quote?.total ?? null,
    motivo_de_escalamiento: reason,
    ultimo_mensaje: lastMessage,
    accion_sugerida: 'TOMAR_CONVERSACION',
  };
}
