import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppGatewayTools, UNIT_ID_MAP } from '../src/whatsapp-gateway-tools.mjs';

function tools(fetchImpl) {
  return buildWhatsAppGatewayTools({ baseUrl: 'https://gw.test', agentId: 'test-agent', rawKey: 'test-key', fetchImpl });
}

test('checkAvailability real -- true cuando la unidad pedida viene disponible en opciones', async () => {
  const fetchImpl = async () => ({ json: async () => ({ ok: true, data: { opciones: [{ unit_id: '1', estado: 'disponible' }] } }) });
  const available = await tools(fetchImpl).checkAvailability({ unit: '201', checkIn: '2026-12-15', checkOut: '2026-12-17', guests: 2 });
  assert.equal(available, true);
});

test('checkAvailability real -- false cuando la unidad no aparece o esta ocupada', async () => {
  const fetchImpl = async () => ({ json: async () => ({ ok: true, data: { opciones: [{ unit_id: '1', estado: 'ocupada' }] } }) });
  const available = await tools(fetchImpl).checkAvailability({ unit: '201', checkIn: '2026-12-15', checkOut: '2026-12-17', guests: 2 });
  assert.equal(available, false);
});

test('checkAvailability propaga el error real del gateway, nunca lo silencia', async () => {
  const fetchImpl = async () => ({ json: async () => ({ ok: false, error: { code: 'BAD_REQUEST' } }) });
  await assert.rejects(
    tools(fetchImpl).checkAvailability({ unit: '201', checkIn: '2026-12-15', checkOut: '2026-12-17', guests: 2 }),
    /GATEWAY_AVAILABILITY_ERROR:BAD_REQUEST/,
  );
});

test('quote real -- arma quote_id/total/requires_manual_confirmation desde la opcion correcta', async () => {
  const fetchImpl = async () => ({
    json: async () => ({ ok: true, data: { quote_id: 150, opciones: [{ unit_id: '1', precio_total: 80000, requires_manual_confirmation: false }] } }),
  });
  const quote = await tools(fetchImpl).quote({ unit: '201', checkIn: '2026-12-15', checkOut: '2026-12-17', guests: 2 });
  assert.deepEqual(quote, { quote_id: 150, total: 80000, requires_manual_confirmation: false });
});

test('createHold real -- manda unit_id mapeado (nunca el nombre de unidad crudo) y devuelve hold_id', async () => {
  let sentBody;
  const fetchImpl = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return { json: async () => ({ ok: true, data: { hold_id: 22230 } }) };
  };
  const hold = await tools(fetchImpl).createHold({ quoteId: 150, unit: '201' });
  assert.equal(hold.hold_id, 22230);
  assert.equal(sentBody.unit_id, UNIT_ID_MAP['201']);
  assert.equal(sentBody.quote_id, 150);
});

test('createHold propaga el error real del gateway (p.ej. unidad ya tomada), nunca inventa un hold_id', async () => {
  const fetchImpl = async () => ({ json: async () => ({ ok: false, error: { code: 'UNIT_UNAVAILABLE' } }) });
  await assert.rejects(tools(fetchImpl).createHold({ quoteId: 150, unit: '201' }), /GATEWAY_HOLD_ERROR:UNIT_UNAVAILABLE/);
});

test('status real -- delega en /hotel/status con operation_id, devuelve data tal cual', async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.operation_id, 22230);
    return { json: async () => ({ ok: true, data: { estado: 'pendiente' } }) };
  };
  const result = await tools(fetchImpl).status({ operationId: 22230 });
  assert.deepEqual(result, { estado: 'pendiente' });
});
