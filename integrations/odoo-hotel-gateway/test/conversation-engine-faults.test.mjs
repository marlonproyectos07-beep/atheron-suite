import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversation, advanceConversation } from '../src/conversation-engine.mjs';

function newConversation() {
  return createConversation({ conversationId: 'c-fault', correlationId: 'r-fault', channel: 'whatsapp_sim' });
}

test('GATE 010-E (caso 18): un timeout del Gateway se propaga, nunca se convierte en un resultado inventado', async () => {
  const tools = {
    checkAvailability: async () => {
      throw new Error('GATEWAY_TIMEOUT');
    },
  };
  await assert.rejects(
    () => advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1 }, tools),
    /GATEWAY_TIMEOUT/,
  );
});

test('GATE 010-E (caso 19): un error real de Odoo en quote se propaga, nunca se inventa una cotizacion', async () => {
  const tools = {
    checkAvailability: async () => true,
    quote: async () => {
      throw new Error('ODOO_ERROR:INSUFFICIENT_CAPACITY');
    },
  };
  await assert.rejects(
    () => advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, askPrice: true }, tools),
    /ODOO_ERROR/,
  );
});

test('GATE 010-E (caso 20): respuesta malformada (undefined) de disponibilidad se trata fail-closed como no disponible', async () => {
  const tools = { checkAvailability: async () => undefined };
  const conv = await advanceConversation(newConversation(), { checkIn: '2026-12-10', checkOut: '2026-12-11', guests: 1, selectUnit: '201' }, tools);
  assert.equal(conv.state, 'OPTIONS_PRESENTED');
  assert.deepEqual(conv.options, []); // nunca asume disponible ante una respuesta rara
});
