import { normalizeTestText } from './whatsapp-test-gate.mjs';

const HOTEL_011_BRANCH = 'feature/ath-odoo-hotel-011-whatsapp-controlled-pilot';

export function hotel011PreviewDiagnosticsEnabled(env = process.env) {
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === HOTEL_011_BRANCH;
}

function knownValue(value, allowed) {
  return allowed.includes(value) ? value : 'other';
}

export function inspectMetaEvent(payload, messages, gate) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const changes = entries.flatMap((entry) => Array.isArray(entry?.changes) ? entry.changes : []);
  const rawMessages = changes.flatMap((change) => Array.isArray(change?.value?.messages) ? change.value.messages : []);
  const statusesPresent = changes.some((change) => Array.isArray(change?.value?.statuses) && change.value.statuses.length > 0);
  const rawMessage = rawMessages.find((message) => message?.type === 'text') ?? rawMessages[0];
  const text = typeof rawMessage?.text?.body === 'string' ? rawMessage.text.body : null;

  // Solo el remitente y numero TEST autorizados pueden aportar texto al log.
  // Se redactan posibles numeros/correos y se acota la longitud.
  const normalizedText = gate.senderAllowlistMatch && text !== null
    ? normalizeTestText(text).replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email]')
      .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]').slice(0, 180)
    : null;

  return {
    event: {
      timestamp: new Date().toISOString(),
      object: knownValue(payload?.object, ['whatsapp_business_account']),
      entry_count: entries.length,
      change_field: knownValue(changes[0]?.field, ['messages']),
      messages_present: rawMessages.length > 0,
      statuses_present: statusesPresent,
    },
    message: {
      message_type: knownValue(rawMessage?.type, ['text', 'image', 'audio', 'video', 'document', 'interactive', 'button', 'location', 'contacts', 'reaction', 'sticker']),
      text_present: text !== null,
      text_length: text?.length ?? 0,
      normalized_text: normalizedText,
      sender_allowlist_match: gate.senderAllowlistMatch,
      text_allowlist_match: gate.textAllowlistMatch,
    },
  };
}

export function ignoredReason(event, parsedMessages, gate) {
  if (event.object !== 'whatsapp_business_account' || event.change_field !== 'messages') return 'unsupported_event';
  if (!event.messages_present) return 'no_messages';
  if (parsedMessages.length === 0) return 'unsupported_message_type';
  if (!gate.senderAllowlistMatch) return 'sender_not_allowed';
  if (!gate.textAllowlistMatch) return 'text_not_allowed';
  return 'other';
}

export function logHotel011Diagnostic(eventName, fields) {
  if (!hotel011PreviewDiagnosticsEnabled()) return;
  // Los llamadores solo pasan metadatos con lista cerrada, nunca el payload.
  console.log('[hotel-011-diagnostic]', JSON.stringify({ event: eventName, ...fields }));
}
