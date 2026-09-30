import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAvailabilityTool,
  quoteTool,
  createHoldTool,
  holdStatusTool,
  cancelHoldTool,
  createReservationTool,
  reservationStatusTool,
  NOT_IMPLEMENTED,
} from '../src/ai-tool-adapters.mjs';

test('checkAvailabilityTool delega en deps.checkAvailability sin calcular nada por su cuenta', async () => {
  const deps = { checkAvailability: async (req) => req.unit === '201' };
  assert.equal(await checkAvailabilityTool({ unit: '201', checkIn: 'x', checkOut: 'y', guests: 1 }, deps), true);
  assert.equal(await checkAvailabilityTool({ unit: '202', checkIn: 'x', checkOut: 'y', guests: 1 }, deps), false);
});

test('quoteTool y createHoldTool delegan en deps, nunca inventan un precio ni un id', async () => {
  const deps = { quote: async () => ({ quote_id: 'Q-1', total: 999 }), createHold: async () => ({ hold_id: 'H-1' }) };
  assert.deepEqual(await quoteTool({ unit: '201', checkIn: 'x', checkOut: 'y', guests: 1 }, deps), { quote_id: 'Q-1', total: 999 });
  assert.deepEqual(await createHoldTool({ quoteId: 'Q-1', unit: '201' }, deps), { hold_id: 'H-1' });
});

test('createHoldTool reenvia unit ademas de quoteId -- el contrato real de hold exige unit_id (hallazgo E2E LIVE)', async () => {
  let received = null;
  const deps = { createHold: async (payload) => { received = payload; return { hold_id: 'H-1' }; } };
  await createHoldTool({ quoteId: 'Q-1', unit: '201' }, deps);
  assert.deepEqual(received, { quoteId: 'Q-1', unit: '201' });
});

test('holdStatusTool reutiliza la operacion real `status` del Gateway por operation_id', async () => {
  const deps = { status: async ({ operationId }) => ({ operation_id: operationId, found: true }) };
  assert.deepEqual(await holdStatusTool({ holdId: 'H-1' }, deps), { operation_id: 'H-1', found: true });
});

test('holdStatusTool marca NOT_IMPLEMENTED si no se inyecta soporte (nunca inventa un estado)', async () => {
  const result = await holdStatusTool({ holdId: 'H-1' }, {});
  assert.equal(result.status, NOT_IMPLEMENTED);
});

test('cancelHoldTool: el Gateway real no tiene esta operacion, se declara explicito, no se simula como si existiera', async () => {
  const result = await cancelHoldTool({ holdId: 'H-1' });
  assert.equal(result.status, NOT_IMPLEMENTED);
});

test('create_reservation/reservation_status: fuera de alcance de HOTEL-009, declarados explicitos', async () => {
  assert.equal((await createReservationTool()).status, NOT_IMPLEMENTED);
  assert.equal((await reservationStatusTool()).status, NOT_IMPLEMENTED);
});
