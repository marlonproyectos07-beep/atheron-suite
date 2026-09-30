// Alcance de HOTEL-011: un unico texto de disponibilidad, un remitente
// autorizado y el numero Meta TEST identificado en Preview.
export const HOTEL_011_TEST_MESSAGE = 'Hola, necesito alojamiento del 10 al 12 de noviembre para 2 personas.';

export function isAuthorizedTestMessage(messages, { allowedFrom, phoneNumberId }) {
  if (!/^\+?\d{8,15}$/.test(allowedFrom ?? '') || !/^\d+$/.test(phoneNumberId ?? '')) return false;
  if (messages.length !== 1) return false;
  const [message] = messages;
  return message.from === allowedFrom.replace(/^\+/, '')
    && message.phone_number_id === phoneNumberId
    && typeof message.text === 'string'
    && message.text.trim() === HOTEL_011_TEST_MESSAGE;
}
