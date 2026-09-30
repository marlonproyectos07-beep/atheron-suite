import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertImplementsMessagingProvider, LabMessagingProvider } from '../src/messaging-provider.mjs';

test('LabMessagingProvider implementa el contrato completo', () => {
  assert.doesNotThrow(() => assertImplementsMessagingProvider(new LabMessagingProvider()));
});

test('un objeto que no implementa el contrato completo lanza error explicito, fail closed', () => {
  assert.throws(() => assertImplementsMessagingProvider({ sendMessage: async () => {} }), /MESSAGING_PROVIDER_MISSING_METHOD/);
});

test('receiveMessage entrega el mensaje a los handlers registrados (simula un webhook real, sin red)', async () => {
  const provider = new LabMessagingProvider();
  const received = [];
  provider.onMessage(async (msg) => received.push(msg));
  await provider.receiveMessage({ from: '3000000000', text: 'hola' });
  assert.deepEqual(received, [{ from: '3000000000', text: 'hola' }]);
});

test('sendMessage guarda el mensaje enviado sin llamar a ningun servicio real', async () => {
  const provider = new LabMessagingProvider();
  const result = await provider.sendMessage('3000000000', 'Tengo estas opciones disponibles');
  assert.ok(result.message_id.startsWith('LAB-'));
  assert.deepEqual(provider.sentMessages, [{ to: '3000000000', text: 'Tengo estas opciones disponibles', message_id: result.message_id }]);
});

test('verifyWebhook nunca habla con Meta -- siempre responde localmente', () => {
  const provider = new LabMessagingProvider();
  assert.equal(provider.verifyWebhook({ any: 'query' }), true);
});
