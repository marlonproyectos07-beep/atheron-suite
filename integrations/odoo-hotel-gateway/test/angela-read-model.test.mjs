import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAngelaRow, buildAngelaBoard, deriveStatus } from '../src/angela-read-model.mjs';
import { CAMILO, ALL_RESERVATIONS } from '../fixtures/reservation-fixtures.mjs';

const REQUIRED_FIELDS = [
  'unit',
  'status',
  'guest',
  'channel',
  'external_reference',
  'reservation_date',
  'checkin',
  'checkout',
  'guests',
  'gross_sale',
  'ota_commission',
  'expected_payout',
  'received_payout',
  'invoiced',
  'collected',
  'balance',
  'reconciliation_status',
];

test('buildAngelaRow trae exactamente los campos pedidos para el tablero', () => {
  const row = buildAngelaRow(CAMILO, { referenceDate: '2026-09-28' });
  for (const field of REQUIRED_FIELDS) {
    assert.ok(field in row, `falta el campo ${field}`);
  }
});

test('deriveStatus: OCUPADA durante la estancia, CHECK-OUT el dia de salida, RESERVADA antes', () => {
  assert.equal(deriveStatus(CAMILO, '2026-09-28'), 'OCUPADA');
  assert.equal(deriveStatus(CAMILO, '2026-09-29'), 'CHECK-OUT');
  assert.equal(deriveStatus(CAMILO, '2026-09-27'), 'RESERVADA');
});

test('deriveStatus: sin fechas verificadas -> BLOQUEADA (nunca un estado optimista inventado)', () => {
  const sinFechas = { checkin: 'PENDIENTE_DE_VERIFICAR', checkout: 'PENDIENTE_DE_VERIFICAR' };
  assert.equal(deriveStatus(sinFechas, '2026-09-28'), 'BLOQUEADA');
});

test('buildAngelaRow: saldo = venta - cobrado, nunca negativo', () => {
  const row = buildAngelaRow({ ...CAMILO, gross_sale: 150000, collected: 0 });
  assert.equal(row.balance, 150000);
});

test('buildAngelaBoard construye el tablero completo sin lanzar error sobre todas las fixtures reales', () => {
  const board = buildAngelaBoard(ALL_RESERVATIONS, { referenceDate: '2026-09-28' });
  assert.equal(board.length, ALL_RESERVATIONS.length);
});
