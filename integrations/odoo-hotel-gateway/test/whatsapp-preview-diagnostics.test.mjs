import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectTestMessage } from '../src/whatsapp-test-gate.mjs';
import { hotel011PreviewDiagnosticsEnabled, inspectMetaEvent, ignoredReason } from '../src/whatsapp-preview-diagnostics.mjs';

const config = { allowedFrom: '+573001112233', phoneNumberId: '123456' };
const text = 'Hola quiero consultar disponibilidad para dos personas en hotel Atheron suite para mañana';

function payload(body = text, from = '573001112233') {
  return {
    object: 'whatsapp_business_account',
    secret: 'NEVER_LOG_THIS',
    entry: [{ id: 'WABA_PRIVATE', changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123456' },
      messages: [{ id: 'wamid.private', from, type: 'text', text: { body } }],
    } }] }],
  };
}

test('el diagnostico solo se activa en el Preview de la rama HOTEL-011', () => {
  assert.equal(hotel011PreviewDiagnosticsEnabled({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/ath-odoo-hotel-011-whatsapp-controlled-pilot' }), true);
  assert.equal(hotel011PreviewDiagnosticsEnabled({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'feature/ath-odoo-hotel-011-whatsapp-controlled-pilot' }), false);
  assert.equal(hotel011PreviewDiagnosticsEnabled({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'main' }), false);
});

test('registra solo metadatos y redacta numeros, correo y remitentes ajenos', () => {
  const body = `${text} Contacto persona@example.com 573009998877`;
  const raw = payload(body);
  const parsed = [{ from: '573001112233', phone_number_id: '123456', text: body }];
  const gate = inspectTestMessage(parsed, config);
  const diagnostic = inspectMetaEvent(raw, parsed, gate);
  assert.equal(diagnostic.event.messages_present, true);
  assert.equal(diagnostic.event.statuses_present, false);
  assert.equal(diagnostic.message.text_length, body.length);
  assert.equal(diagnostic.message.sender_allowlist_match, true);
  assert.equal(diagnostic.message.text_allowlist_match, false);
  assert.equal(ignoredReason(diagnostic.event, parsed, gate), 'text_not_allowed');
  const logged = JSON.stringify(diagnostic);
  for (const forbidden of ['NEVER_LOG_THIS', 'WABA_PRIVATE', 'wamid.private', '573001112233', '573009998877', 'persona@example.com']) {
    assert.equal(logged.includes(forbidden), false);
  }
  const stranger = payload(body, '573009998877');
  const strangerGate = inspectTestMessage([{ ...parsed[0], from: '573009998877' }], config);
  assert.equal(inspectMetaEvent(stranger, parsed, strangerGate).message.normalized_text, null);
});

test('distingue status sin mensaje y tipo no admitido sin procesarlos', () => {
  const status = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ status: 'delivered' }] } }] }] };
  const emptyGate = inspectTestMessage([], config);
  const statusDiagnostic = inspectMetaEvent(status, [], emptyGate);
  assert.equal(statusDiagnostic.event.statuses_present, true);
  assert.equal(statusDiagnostic.event.messages_present, false);
  assert.equal(ignoredReason(statusDiagnostic.event, [], emptyGate), 'no_messages');
  const image = payload();
  image.entry[0].changes[0].value.messages[0].type = 'image';
  const imageDiagnostic = inspectMetaEvent(image, [], emptyGate);
  assert.equal(ignoredReason(imageDiagnostic.event, [], emptyGate), 'unsupported_message_type');
});
