import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppCloudProvider } from '../src/whatsapp-cloud-adapter.mjs';
import { assertImplementsMessagingProvider } from '../src/messaging-provider.mjs';
import { createWhatsAppOrchestrator } from '../src/whatsapp-orchestrator.mjs';

// Forma real de payload entrante de WhatsApp Cloud API (documentada
// publicamente por Meta) -- no inventada.
const REAL_INBOUND_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '000000000000000',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550001111', phone_number_id: '123456789012345' },
            contacts: [{ profile: { name: 'Cliente Prueba' }, wa_id: '573000000000' }],
            messages: [
              {
                from: '573000000000',
                id: 'wamid.HBgLNTczMDAwMDAwMDAVAgARGBI',
                timestamp: '1730300000',
                text: { body: 'Hola, necesito habitación del 10 al 12 para 2 personas.' },
                type: 'text',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

test('WhatsAppCloudProvider implementa el contrato completo de MessagingProvider', () => {
  assert.doesNotThrow(() => assertImplementsMessagingProvider(new WhatsAppCloudProvider({})));
});

test('sin accessToken/phoneNumberId, sendMessage falla cerrado con MISCONFIGURED (nunca en silencio)', async () => {
  const provider = new WhatsAppCloudProvider({});
  await assert.rejects(() => provider.sendMessage('573000000000', 'hola'), /WHATSAPP_ADAPTER_MISCONFIGURED/);
});

test('con config completa pero SIN httpClient inyectado, sendMessage nunca llama a Meta por su cuenta', async () => {
  const provider = new WhatsAppCloudProvider({ accessToken: 'test-token', phoneNumberId: '123456789012345' });
  await assert.rejects(() => provider.sendMessage('573000000000', 'hola'), /WHATSAPP_ADAPTER_NOT_CONNECTED/);
});

test('con httpClient fake inyectado, sendMessage arma el request real de Meta (Bearer + shape correcto)', async () => {
  const calls = [];
  const fakeHttpClient = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };
  const provider = new WhatsAppCloudProvider({
    accessToken: 'test-token-not-real',
    phoneNumberId: '123456789012345',
    httpClient: fakeHttpClient,
  });
  await provider.sendMessage('573000000000', 'Tengo estas opciones disponibles');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://graph.facebook.com/v25.0/123456789012345/messages');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token-not-real');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body, { messaging_product: 'whatsapp', to: '573000000000', type: 'text', text: { body: 'Tengo estas opciones disponibles' } });
});

test('un rechazo HTTP de Meta falla sin exponer su respuesta', async () => {
  const provider = new WhatsAppCloudProvider({
    accessToken: 'test-token-not-real',
    phoneNumberId: '123456789012345',
    httpClient: async () => ({ ok: false, status: 401, body: 'private-data' }),
  });
  await assert.rejects(
    () => provider.sendMessage('573000000000', 'hola'),
    (error) => error.message === 'WHATSAPP_API_REQUEST_FAILED',
  );
});

test('verifyWebhook: handshake real de Meta -- token correcto devuelve el challenge', () => {
  const provider = new WhatsAppCloudProvider({ verifyToken: 'mi-verify-token-test' });
  const challenge = provider.verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'mi-verify-token-test', 'hub.challenge': 'abc123' });
  assert.equal(challenge, 'abc123');
});

test('verifyWebhook: token incorrecto devuelve null, nunca el challenge', () => {
  const provider = new WhatsAppCloudProvider({ verifyToken: 'mi-verify-token-test' });
  const challenge = provider.verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro-token', 'hub.challenge': 'abc123' });
  assert.equal(challenge, null);
});

test('parseInboundPayload traduce el payload real de Meta a nuestro formato interno', () => {
  const provider = new WhatsAppCloudProvider({});
  const messages = provider.parseInboundPayload(REAL_INBOUND_PAYLOAD);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].from, '573000000000');
  assert.equal(messages[0].message_id, 'wamid.HBgLNTczMDAwMDAwMDAVAgARGBI');
  assert.equal(messages[0].text, 'Hola, necesito habitación del 10 al 12 para 2 personas.');
  assert.equal(messages[0].phone_number_id, '123456789012345');
});

test('parseInboundPayload ignora tipos no-texto y payload corrupto sin lanzar', () => {
  const provider = new WhatsAppCloudProvider({});
  assert.doesNotThrow(() => provider.parseInboundPayload({}));
  assert.doesNotThrow(() => provider.parseInboundPayload(null));
  assert.deepEqual(provider.parseInboundPayload({ entry: [{ changes: [{ value: { messages: [{ type: 'image' }] } }] }] }), []);
});

test('receiveMessage deduplica por message_id -- el mismo mensaje repetido (reintento de Meta) solo se procesa una vez', async () => {
  const provider = new WhatsAppCloudProvider({});
  const received = [];
  provider.onMessage(async (m) => received.push(m));
  await provider.receiveMessage(REAL_INBOUND_PAYLOAD);
  await provider.receiveMessage(REAL_INBOUND_PAYLOAD); // Meta reintentando el mismo webhook
  assert.equal(received.length, 1);
});

test('primer mensaje Cloud llega al orquestador una vez, sin llamada real a Meta', async () => {
  const provider = new WhatsAppCloudProvider({});
  const events = [];
  let availabilityCalls = 0;
  const orchestrator = createWhatsAppOrchestrator({
    provider,
    referenceDate: '2026-12-01',
    tools: { checkAvailability: async () => { availabilityCalls++; return true; } },
    onEvent: (event) => events.push(event.type),
  });
  const payload = structuredClone(REAL_INBOUND_PAYLOAD);
  payload.entry[0].changes[0].value.messages[0].text.body = 'Del viernes al domingo, somos 2';

  const first = await provider.receiveMessage(payload);
  const retry = await provider.receiveMessage(payload);

  assert.deepEqual(first, { accepted: 1, duplicates: 0 });
  assert.deepEqual(retry, { accepted: 0, duplicates: 1 });
  assert.equal(availabilityCalls, 1);
  assert.ok(orchestrator.getConversation('573000000000'));
  assert.ok(events.includes('send_failed'));
});

test('markDelivered nunca inventa un endpoint que Meta no expone -- no-op documentado', async () => {
  const provider = new WhatsAppCloudProvider({});
  const result = await provider.markDelivered('wamid.x');
  assert.equal(result.status, 'NOT_APPLICABLE_DELIVERY_IS_META_REPORTED');
});
