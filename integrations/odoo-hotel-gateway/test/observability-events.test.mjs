import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent, EVENT_TYPES } from '../src/observability-events.mjs';

test('buildEvent arma la traza completa mas el timestamp', () => {
  const event = buildEvent('quote_generated', { conversation_id: 'c1', correlation_id: 'r1', channel: 'whatsapp_sim' }, { unit: '201' });
  assert.equal(event.type, 'quote_generated');
  assert.equal(event.conversation_id, 'c1');
  assert.equal(event.correlation_id, 'r1');
  assert.equal(event.channel, 'whatsapp_sim');
  assert.equal(event.unit, '201');
  assert.ok(typeof event.timestamp === 'string' && !Number.isNaN(Date.parse(event.timestamp)));
});

test('un tipo de evento desconocido lanza error, no se guarda silenciosamente', () => {
  assert.throws(() => buildEvent('evento_inventado', { conversation_id: 'c1', correlation_id: 'r1', channel: 'x' }));
});

test('falta conversation_id/correlation_id/channel -> error explicito, nunca un evento incompleto', () => {
  assert.throws(() => buildEvent('hold_created', { conversation_id: 'c1' }));
});

test('EVENT_TYPES cubre exactamente los 8 eventos pedidos por el Frente K', () => {
  assert.deepEqual(EVENT_TYPES, [
    'availability_checked',
    'quote_generated',
    'option_selected',
    'hold_created',
    'hold_expired',
    'human_handoff',
    'reservation_created',
    'reservation_cancelled',
  ]);
});
