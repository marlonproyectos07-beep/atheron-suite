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
  return `Para ${unit}, el valor es ${currency} $${Number(total).toLocaleString('es-CO')}.`;
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
  askGuestName,
  preparingHold,
  holdCreated,
  escalateToHuman,
  temporaryError,
  farewell,
});
