/**
 * ATH-ODOO-HOTEL-010 (preparacion), Gate 010-G - copy conversacional.
 * Mensajes cortos y naturales, NUNCA afirmando una reserva confirmada
 * sin confirmacion real del Gateway/Odoo. Texto puro (datos, no HTML ni
 * markup) -- el canal real decide el formato de envio.
 *
 * Regla que gobierna este archivo: ningun mensaje aqui inventa un precio,
 * una fecha ni un estado -- cada funcion recibe los datos ya confirmados
 * y solo los redacta. Sigue el mismo principio que `sofia-adapter.mjs`
 * (presentAvailabilityMessage): datos y presentacion separados.
 */

export function greeting() {
  return '¡Hola! 👋 Soy el asistente de Atheron Hotels. ¿Para qué fecha buscas alojamiento?';
}

export function askDates() {
  return '¿Del cuándo al cuándo sería tu estadía?';
}

export function askGuests() {
  return 'Perfecto. ¿Para cuántas personas?';
}

export function presentOptions(options) {
  if (!options || options.length === 0) {
    return 'Por ahora no tengo disponibilidad para esas fechas. ¿Quieres que revise otras fechas?';
  }
  const lista = options.map((o) => `• ${o.unit} (hasta ${o.capacity} personas)`).join('\n');
  return `Tengo estas opciones disponibles 👇\n${lista}\n¿Cuál te gustaría?`;
}

export function presentPrice({ unit, total, currency = 'COP' }) {
  return `Para la habitación ${unit}, el valor total para las fechas que me indicaste es ${currency} ${Number(total).toLocaleString('es-CO')}. 😊 Si quieres, también puedo mostrarte fotos reales antes de que decidas.`;
}

export function offerNextStep({ unit } = {}) {
  const label = unit ? `la habitación ${unit}` : 'esa opción';
  return `Claro 😊 ¿Quieres que te muestre fotos de ${label} o prefieres que te diga el precio?`;
}

export function mediaIntro({ unit, hasVideo = false } = {}) {
  const extra = hasVideo ? ' También te envío el video real.' : '';
  return `Claro 👇 Te muestro fotos reales de la habitación ${unit} para que puedas verla antes de decidir.${extra}`;
}

export function mediaUnavailable({ unit } = {}) {
  return unit
    ? `Todavía no tengo fotos cargadas de la habitación ${unit}. Puedo ayudarte con el precio o revisar otra opción.`
    : 'Todavía no tengo fotos asociadas a esa opción. Puedo ayudarte con el precio o revisar otra alternativa.';
}

export function bookingIntentSafe({ unit } = {}) {
  const label = unit ? `la habitación ${unit}` : 'esa opción';
  return `Perfecto 😊 Ya sé que te interesa ${label}. En esta prueba todavía no voy a crear una reserva ni bloquear inventario. Primero confirmemos que los datos estén correctos.`;
}

export function contextualClarification({ unit } = {}) {
  if (unit) return `Te sigo con la habitación ${unit} 😊 Puedo decirte el precio, mostrarte fotos reales o ayudarte a revisar otra opción. ¿Qué prefieres?`;
  return 'Claro 😊 Puedo ayudarte con disponibilidad, precio, fotos o con otra fecha. ¿Qué quieres revisar?';
}

export function askGuestName() {
  return '¿A nombre de quién hago la reserva y a qué número te puedo contactar?';
}

export function preparingHold() {
  return 'Dame un momento, estoy verificando la disponibilidad final antes de reservar...';
}

export function holdCreated({ holdId }) {
  return `¡Listo! Dejé la unidad reservada temporalmente (referencia ${holdId}). En breve te confirmamos el resto.`;
}

export function escalateToHuman() {
  return 'Voy a pasarte con alguien de nuestro equipo para ayudarte mejor con esto. Un momento, por favor.';
}

export function temporaryError() {
  return 'Tuve un problema consultando la disponibilidad. ¿Me das un momento y lo intento de nuevo?';
}

export function farewell() {
  return '¡Gracias por escribirnos! Cualquier otra cosa que necesites, aquí estamos. 🙌';
}

export const WHATSAPP_COPY = Object.freeze({
  greeting,
  askDates,
  askGuests,
  presentOptions,
  presentPrice,
  offerNextStep,
  mediaIntro,
  mediaUnavailable,
  bookingIntentSafe,
  contextualClarification,
  askGuestName,
  preparingHold,
  holdCreated,
  escalateToHuman,
  temporaryError,
  farewell,
});
