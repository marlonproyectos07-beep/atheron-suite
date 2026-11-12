import test from 'node:test';
import assert from 'node:assert/strict';
import { atenderConsultaOcupacion } from '../src/mobile-occupancy.mjs';
import { handleOccupancyRequest } from '../api/occupancy.mjs';

const TOKEN = 'o'.repeat(48);
const DATE = '2026-11-12';
const REPORT = {
  exitCode: 0,
  stdout: { at: '2026-11-12T18:00:00.000Z' },
  report: {
    result: 'CONCILIACION_POR_IDS_EN_MEMORIA',
    window: { from: DATE, to: DATE },
    safety: { writesEnabled: false, releaseUnlocked: false },
    perReservation: [
      { smoobuRef: '1001', unit: '201', arrival: DATE, departure: '2026-11-13', smoobuStatus: 'ACTIVE', verdict: 'MATCH' },
    ],
    counts: { blocksActive: 1 },
    summary: { CONFLICT: 0 },
    smoobuOverbooking: [],
  },
};

function request({ method = 'GET', date = DATE, authorization = `Bearer ${TOKEN}` } = {}) {
  return { method, url: `/api/occupancy?date=${encodeURIComponent(date)}`, headers: { authorization } };
}

test('ocupacion rechaza peticiones sin bearer antes de leer fuentes', async () => {
  let calls = 0;
  const r = await atenderConsultaOcupacion(
    { method: 'GET', path: '/v1/occupancy', date: DATE },
    { token: TOKEN, obtenerInforme: async () => { calls += 1; return REPORT; } },
  );
  assert.equal(r.status, 401);
  assert.equal(calls, 0);
});

test('ocupacion valida fecha y no consulta APIs para fechas invalidas', async () => {
  let calls = 0;
  const r = await atenderConsultaOcupacion(
    { method: 'GET', path: '/v1/occupancy', date: '2026-02-30', authorization: `Bearer ${TOKEN}` },
    { token: TOKEN, obtenerInforme: async () => { calls += 1; return REPORT; } },
  );
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'FECHA_INVALIDA');
  assert.equal(calls, 0);
});

test('ocupacion devuelve solo las cinco habitaciones, sin nombres ni valores', async () => {
  const r = await atenderConsultaOcupacion(
    { method: 'GET', path: '/v1/occupancy', date: DATE, authorization: `Bearer ${TOKEN}` },
    { token: TOKEN, obtenerInforme: async () => REPORT },
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.escrituras, 0);
  assert.equal(r.body.disponibilidadCertificada, false);
  assert.equal(r.body.unidades.length, 5);
  assert.equal(JSON.stringify(r.body).includes('1001'), false);
  assert.equal(JSON.stringify(r.body).includes('smoobuRef'), false);
});

test('API falla cerrado si faltan variables de entorno', async () => {
  const r = await handleOccupancyRequest(request(), {});
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: 'CONFIGURACION_PENDIENTE' });
});

test('API devuelve error seguro si la fuente falla', async () => {
  const r = await atenderConsultaOcupacion(
    { method: 'GET', path: '/v1/occupancy', date: DATE, authorization: `Bearer ${TOKEN}` },
    { token: TOKEN, obtenerInforme: async () => ({ exitCode: 1, stdout: {}, report: null }) },
  );
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: 'FUENTE_NO_VERIFICABLE' });
});
