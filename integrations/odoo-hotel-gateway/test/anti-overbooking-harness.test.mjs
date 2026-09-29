import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runQueenTest, CANCEL_NOT_IMPLEMENTED_IN_GATEWAY_CONTRACT } from '../src/anti-overbooking-harness.mjs';

test('prueba reina: 201 disponible -> reserva -> bloqueada -> cancelacion -> disponible de nuevo (PASS)', async () => {
  const result = await runQueenTest({ unit: '201', checkin: '2026-12-10', checkout: '2026-12-12' });
  assert.equal(result.status, 'PASS');
  const stepNames = result.steps.map((s) => s.step);
  assert.deepEqual(stepNames, ['ANTES', 'RESERVA_MANUAL_TEST', 'DESPUES_DE_RESERVAR', 'CANCELACION', 'DESPUES_DE_CANCELAR']);
  assert.equal(result.steps[0].available, true);
  assert.equal(result.steps[2].available, false); // bloqueada tras el HOLD
  assert.equal(result.steps[4].available, true); // libre de nuevo tras cancelar
});

test('prueba reina: nunca oculta que la cancelacion real contra el Gateway no esta implementada', async () => {
  const result = await runQueenTest({ unit: '201', checkin: '2026-12-10', checkout: '2026-12-12' });
  assert.equal(result.cancel_real_gateway_support, CANCEL_NOT_IMPLEMENTED_IN_GATEWAY_CONTRACT);
});

test('prueba reina: si la unidad ya esta ocupada antes de empezar, se aborta sin forzar overbooking', async () => {
  const yaOcupada = [{ unit: '201', checkIn: '2026-12-10', checkOut: '2026-12-12', external_reference: 'OTRA_RESERVA' }];
  const result = await runQueenTest({ unit: '201', checkin: '2026-12-10', checkout: '2026-12-12', bookings: yaOcupada });
  assert.equal(result.status, 'ABORTED_UNIT_NOT_AVAILABLE_BEFORE_TEST');
});

test('prueba reina: reservar CASA_COMPLETA bloquea las habitaciones (bloqueo cruzado real, no reimplementado)', async () => {
  const result = await runQueenTest({ unit: 'CASA_COMPLETA', checkin: '2026-12-15', checkout: '2026-12-16' });
  assert.equal(result.status, 'PASS');
});

test('prueba reina: es idempotente -- correrla dos veces con el mismo inventario inicial da el mismo resultado, sin acumular estado', async () => {
  const inventarioInicial = [];
  const primera = await runQueenTest({ unit: '202', checkin: '2027-01-05', checkout: '2027-01-07', bookings: inventarioInicial });
  const segunda = await runQueenTest({ unit: '202', checkin: '2027-01-05', checkout: '2027-01-07', bookings: inventarioInicial });
  assert.equal(primera.status, 'PASS');
  assert.equal(segunda.status, 'PASS');
  assert.deepEqual(inventarioInicial, []); // el arnes nunca muta el array que recibe
});

test('prueba reina: no deja rastro en el inventario del llamador (limpieza real, no solo declarada)', async () => {
  const inventarioInicial = [{ unit: '301', checkIn: '2026-11-01', checkOut: '2026-11-03', external_reference: 'RESERVA_REAL_AJENA' }];
  const antes = JSON.stringify(inventarioInicial);
  await runQueenTest({ unit: '302', checkin: '2026-11-01', checkout: '2026-11-03', bookings: inventarioInicial });
  assert.equal(JSON.stringify(inventarioInicial), antes);
});
