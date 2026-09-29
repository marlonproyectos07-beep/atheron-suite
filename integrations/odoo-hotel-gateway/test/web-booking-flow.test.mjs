import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWebBookingFlow } from '../src/web-booking-flow.mjs';

// Mapeo real confirmado por el CEO (ver AI/ATH-ODOO-HOTEL-008_OTA_MAP.md).
const UNIT_ID_MAP = { 201: '1', 202: '2', 203: '3', 301: '4', 302: '5', CASA_COMPLETA: '6' };

function fixtureAvailability(unavailableRoomCodes) {
  // Forma real del gateway: data.opciones = [{unit_id, estado}], nunca
  // acepta unit_id como filtro de entrada (bug real ya corregido).
  return async (req) => {
    assert.equal('unit_id' in req, false, 'availability nunca debe mandar unit_id (UNKNOWN_FIELD real)');
    const opciones = Object.entries(UNIT_ID_MAP).map(([code, unit_id]) => ({
      unit_id,
      estado: unavailableRoomCodes.includes(code) ? 'no_disponible' : 'disponible',
    }));
    return { data: { opciones } };
  };
}

test('flujo completo: disponible -> quote -> HOLD', async () => {
  const client = {
    availability: fixtureAvailability([]),
    quote: async (req) => {
      assert.equal('unit_id' in req, false, 'quote tampoco acepta unit_id');
      return { quote_id: 'q-web-1' };
    },
    hold: async (req) => {
      assert.equal(req.unit_id, UNIT_ID_MAP['201']);
      return { hold_id: 'h-web-1' };
    },
  };
  const result = await runWebBookingFlow(
    { unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { client, unitIdMap: UNIT_ID_MAP },
  );
  assert.equal(result.status, 'HELD');
  assert.equal(result.quote_id, 'q-web-1');
  assert.equal(result.hold_id, 'h-web-1');
});

test('unidad no disponible: nunca llama quote/hold, devuelve alternativas del gateway', async () => {
  let quoteCalled = false;
  const client = {
    availability: fixtureAvailability(['201']),
    quote: async () => {
      quoteCalled = true;
      return { quote_id: 'nope' };
    },
    hold: async () => ({ hold_id: 'nope' }),
  };
  const result = await runWebBookingFlow(
    { unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 },
    { client, unitIdMap: UNIT_ID_MAP },
  );
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
    runWebBookingFlow({ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 }, { client, unitIdMap: UNIT_ID_MAP }),
    /AVAILABILITY_FAILED: INTERNAL_ERROR/,
  );
});

test('un error de gateway con forma antigua/desconocida ({error_code} plano) ya NO se cuela como disponible=false silencioso', async () => {
  const client = {
    availability: async () => ({ ok: false }),
    quote: async () => ({ quote_id: 'nope' }),
    hold: async () => ({ hold_id: 'nope' }),
  };
  await assert.rejects(
    runWebBookingFlow({ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 }, { client, unitIdMap: UNIT_ID_MAP }),
    /AVAILABILITY_FAILED: UNKNOWN/,
  );
});

test('availability se llama UNA sola vez aunque haya varias alternativas que revisar', async () => {
  let calls = 0;
  const client = {
    availability: async (req) => {
      calls += 1;
      return fixtureAvailability(['201'])(req);
    },
    quote: async () => ({ quote_id: 'nope' }),
    hold: async () => ({ hold_id: 'nope' }),
  };
  await runWebBookingFlow({ unit: '201', checkIn: '2026-09-28', checkOut: '2026-09-29', guests: 2 }, { client, unitIdMap: UNIT_ID_MAP });
  assert.equal(calls, 1);
});
