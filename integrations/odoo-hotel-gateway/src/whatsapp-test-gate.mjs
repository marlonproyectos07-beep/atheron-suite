// Alcance de HOTEL-011: dos textos de disponibilidad explicitos, un remitente
// autorizado y el numero Meta TEST identificado en Preview.
export const HOTEL_011_TEST_MESSAGE = 'Hola, necesito alojamiento del 10 al 12 de noviembre para 2 personas.';
export const HOTEL_011_TEST_MESSAGE_2 = 'Hola quiero consultar disponibilidad para dos personas en hotel Atheron suite para mañana';

export function normalizeTestText(text) {
  return text.trim().toLowerCase().replace(/ {2,}/g, ' ');
}

const allowedMessages = new Set([
  HOTEL_011_TEST_MESSAGE,
  HOTEL_011_TEST_MESSAGE_2,
].map(normalizeTestText));

export function inspectTestMessage(messages, { allowedFrom, phoneNumberId }) {
  const configured = /^\+?\d{8,15}$/.test(allowedFrom ?? '') && /^\d+$/.test(phoneNumberId ?? '');
  const message = messages.length === 1 ? messages[0] : null;
  const senderAllowlistMatch = Boolean(configured && message?.from === allowedFrom.replace(/^\+/, '')
    && message?.phone_number_id === phoneNumberId);
  const normalizedText = typeof message?.text === 'string' ? normalizeTestText(message.text) : null;
  const textAllowlistMatch = normalizedText !== null && allowedMessages.has(normalizedText);
  return {
    allowed: senderAllowlistMatch && textAllowlistMatch,
    senderAllowlistMatch,
    textAllowlistMatch,
    normalizedText,
  };
}

export function isAuthorizedTestMessage(messages, config) {
  return inspectTestMessage(messages, config).allowed;
}
