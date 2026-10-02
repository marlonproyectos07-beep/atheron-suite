// HOTEL-011 conserva dos textos exactos para regresion.
// HOTEL-013 puede habilitar lenguaje natural, pero SOLO despues de pasar
// el gate de transporte/seguridad: remitente TEST autorizado + Phone Number ID.
export const HOTEL_011_TEST_MESSAGE = 'Hola, necesito alojamiento del 10 al 12 de noviembre para 2 personas.';
export const HOTEL_011_TEST_MESSAGE_2 = 'Hola quiero consultar disponibilidad para dos personas en hotel Atheron suite para mañana';

export function normalizeTestText(text) {
  return text.trim().toLowerCase().replace(/ {2,}/g, ' ');
}

const allowedMessages = new Set([
  HOTEL_011_TEST_MESSAGE,
  HOTEL_011_TEST_MESSAGE_2,
].map(normalizeTestText));

export function inspectTestMessage(messages, { allowedFrom, phoneNumberId, naturalTextEnabled = false }) {
  const configured = /^\+?\d{8,15}$/.test(allowedFrom ?? '') && /^\d+$/.test(phoneNumberId ?? '');
  const message = messages.length === 1 ? messages[0] : null;
  const senderAllowlistMatch = Boolean(configured && message?.from === allowedFrom.replace(/^\+/, '')
    && message?.phone_number_id === phoneNumberId);
  const normalizedText = typeof message?.text === 'string' ? normalizeTestText(message.text) : null;

  // En HOTEL-011 el contenido sigue siendo allowlist exacta.
  // En HOTEL-013, una vez validado remitente + numero TEST, se permite
  // cualquier texto NO VACIO para que la NLU/conversation-engine haga
  // la interpretacion. Esto NO amplia permisos comerciales.
  const textAllowlistMatch = naturalTextEnabled
    ? Boolean(normalizedText)
    : normalizedText !== null && allowedMessages.has(normalizedText);

  return {
    allowed: senderAllowlistMatch && textAllowlistMatch,
    senderAllowlistMatch,
    textAllowlistMatch,
    normalizedText,
    naturalTextEnabled,
  };
}

export function isAuthorizedTestMessage(messages, config) {
  return inspectTestMessage(messages, config).allowed;
}
