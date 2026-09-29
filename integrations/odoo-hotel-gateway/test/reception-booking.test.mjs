import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualReservation, REJECTED_UNIT_NOT_AVAILABLE } from '../src/reception-booking.mjs';

test('rechaza sin crear cotizacion ni HOLD si la unidad no esta disponible (no hay bypass)', async () => {
  let quoteCalled = false;
  let holdCalled = false;
  const result = await createManualReservation(
    { guest: 'Huesped X', phone: '3000000000', checkin: '2026-09-28', checkout: '2026-09-29', guests: 2, unit: '201' },
    {
      checkAvailability: async () => false,
      createQuote: async () => {
        quoteCalled = true;
        return { quote_id: 'q1' };
      },
      createHold: async () => {
        holdCalled = true;
        return { hold_id: 'h1' };
      },
    },
  );
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, REJECTED_UNIT_NOT_AVAILABLE);
  assert.equal(quoteCalled, false);
  assert.equal(holdCalled, false);
});

test('camino feliz: disponibilidad -> cotizacion -> HOLD, en ese orden, con source_channel=reception', async () => {
  const calls = [];
  const result = await createManualReservation(
    { guest: 'Huesped Y', phone: '3000000001', checkin: '2026-09-28', checkout: '2026-09-29', guests: 2, unit: '202' },
    {
      checkAvailability: async () => {
        calls.push('availability');
        return true;
      },
      createQuote: async (req) => {
        calls.push('quote');
        assert.equal(req.source_channel, 'reception');
        return { quote_id: 'q2' };
      },
      createHold: async (req) => {
        calls.push('hold');
        assert.equal(req.source_channel, 'reception');
        assert.equal(req.quote_id, 'q2');
        return { hold_id: 'h2' };
      },
    },
  );
  assert.deepEqual(calls, ['availability', 'quote', 'hold']);
  assert.equal(result.status, 'HELD');
  assert.equal(result.quote_id, 'q2');
  assert.equal(result.hold_id, 'h2');
});

test('campos minimos requeridos: falla explicito si falta huesped/unidad/fechas', async () => {
  await assert.rejects(
    createManualReservation({ guest: '', unit: '201', checkin: '', checkout: '', guests: 2 }, {
      checkAvailability: async () => true,
      createQuote: async () => ({ quote_id: 'x' }),
      createHold: async () => ({ hold_id: 'y' }),
    }),
    /MANUAL_RESERVATION_REQUIRES/,
  );
});
