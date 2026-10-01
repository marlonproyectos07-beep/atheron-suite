// Alcance de HOTEL-011: dos textos de disponibilidad explicitos, un remitente
// autorizado y el numero Meta TEST identificado en Preview.
export const HOTEL_011_TEST_MESSAGE = 'Hola, necesito alojamiento del 10 al 12 de noviembre para 2 personas.';
export const HOTEL_011_TEST_MESSAGE_2 = 'Hola quiero consultar disponibilidad para dos personas en hotel Atheron suite para mañana';

function normalizeTestText(text) {
  return text.trim().toLowerCase().replace(/ {2,}/g, ' ');
}

const allowedMessages = new Set([
  HOTEL_011_TEST_MESSAGE,
  HOTEL_011_TEST_MESSAGE_2,
].map(normalizeTestText));

export function isAuthorizedTestMessage(messages, { allowedFrom, phoneNumberId }) {
  if (!/^\+?\d{8,15}$/.test(allowedFrom ?? '') || !/^\d+$/.test(phoneNumberId ?? '')) return false;
  if (messages.length !== 1) return false;
  const [message] = messages;
  return message.from === allowedFrom.replace(/^\+/, '')
    && message.phone_number_id === phoneNumberId
    && typeof message.text === 'string'
    && allowedMessages.has(normalizeTestText(message.text));
}
