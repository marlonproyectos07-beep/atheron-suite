import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffContext, HANDOFF_REASONS } from '../src/human-handoff.mjs';
import { createConversation } from '../src/conversation-engine.mjs';

test('buildHandoffContext arma el contexto completo cuando la conversacion ya trae los datos', () => {
  const conv = {
    ...createConversation({ conversationId: 'c1', correlationId: 'r1', channel: 'whatsapp_sim', customer: { identifier: 'Maria', phone: '3001112233' } }),
    requested: { checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 2 },
    selectedUnit: '201',
    quote: { quote_id: 'Q-1', total: 220000 },
  };
  const ctx = buildHandoffContext(conv, 'UNAUTHORIZED_DISCOUNT_REQUEST', 'me haces un descuento?');
  assert.equal(ctx.nombre, 'Maria');
  assert.equal(ctx.telefono, '3001112233');
  assert.deepEqual(ctx.fechas, { checkin: '2026-12-10', checkout: '2026-12-12' });
  assert.equal(ctx.personas, 2);
  assert.equal(ctx.opcion, '201');
  assert.equal(ctx.precio_cotizado, 220000);
  assert.equal(ctx.motivo_de_escalamiento, 'UNAUTHORIZED_DISCOUNT_REQUEST');
  assert.equal(ctx.ultimo_mensaje, 'me haces un descuento?');
  assert.equal(ctx.accion_sugerida, 'TOMAR_CONVERSACION');
});

test('buildHandoffContext nunca inventa un dato que la conversacion no trae -- llega null', () => {
  const conv = createConversation({ conversationId: 'c2', correlationId: 'r2', channel: 'whatsapp_sim' });
  const ctx = buildHandoffContext(conv, 'SENSITIVE_REQUEST', null);
  assert.equal(ctx.nombre, null);
  assert.equal(ctx.telefono, null);
  assert.equal(ctx.fechas, null);
  assert.equal(ctx.precio_cotizado, null);
});

test('un motivo de escalamiento desconocido lanza error en vez de guardarse silenciosamente', () => {
  const conv = createConversation({ conversationId: 'c3', correlationId: 'r3', channel: 'whatsapp_sim' });
  assert.throws(() => buildHandoffContext(conv, 'MOTIVO_INVENTADO'));
});

test('HANDOFF_REASONS cubre los motivos usados por conversation-engine.mjs', () => {
  for (const r of ['UNAUTHORIZED_DISCOUNT_REQUEST', 'LARGE_GROUP_NEEDS_APPROVAL', 'SENSITIVE_REQUEST', 'MANUAL_CONFIRMATION_REQUIRED']) {
    assert.ok(HANDOFF_REASONS.includes(r));
  }
});
