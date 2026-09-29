import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWebBookingFlow } from '../src/web-booking-flow.mjs';

test('flujo completo: disponible -> quote -> HOLD', async () => {
  const client = {
    availability: async ({ unit_id }) => ({ available: unit_id === '201' }),
    quote: async () => ({ quote_id: 'q-web-1' }),
    hold: async () => ({ hold_id: 'h-web-1' }),
  };
  const result = await runWebBookingFlow({ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 }, { client });
  assert.equal(result.status, 'HELD');
  assert.equal(result.quote_id, 'q-web-1');
  assert.equal(result.hold_id, 'h-web-1');
});

test('unidad no disponible: nunca llama quote/hold, devuelve alternativas del gateway', async () => {
  let quoteCalled = false;
  const client = {
    availability: async ({ unit_id }) => ({ available: unit_id !== '201' }),
    quote: async () => {
      quoteCalled = true;
      return { quote_id: 'nope' };
    },
    hold: async () => ({ hold_id: 'nope' }),
  };
  const result = await runWebBookingFlow({ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 }, { client });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(quoteCalled, false);
  assert.ok(result.alternatives.length > 0);
});

test('el flujo nunca calcula disponibilidad por su cuenta: si el gateway falla, propaga el error, no inventa un resultado', async () => {
  // Forma REAL de error del gateway (src/server.mjs): { ok:false, error:{code,message} }.
  const client = {
    availability: async () => ({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    quote: async () => ({ quote_id: 'nope' }),
    hold: async () => ({ hold_id: 'nope' }),
  };
  await assert.rejects(
    runWebBookingFlow({ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 }, { client }),
    /AVAILABILITY_FAILED: INTERNAL_ERROR/,
  );
});

test('un error de gateway con forma antigua/desconocida ({error_code} plano) ya NO se cuela como disponible=false silencioso', async () => {
  // Regresion del bug real encontrado en ATH-ODOO-HOTEL-008 (canario web):
  // el chequeo anterior (`response?.error_code`) nunca coincidia con la
  // forma real del gateway, asi que un error se interpretaba como
  // "no disponible" en vez de propagarse. Este caso confirma que CUALQUIER
  // respuesta marcada `ok:false` -- con o sin `error.code` -- se propaga.
  const client = {
    availability: async () => ({ ok: false }),
    quote: async () => ({ quote_id: 'nope' }),
    hold: async () => ({ hold_id: 'nope' }),
  };
  await assert.rejects(
    runWebBookingFlow({ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 }, { client }),
    /AVAILABILITY_FAILED: UNKNOWN/,
  );
});
