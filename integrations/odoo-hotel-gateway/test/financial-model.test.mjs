import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyClose, assertGrossSaleMatchesPayoutPlusCommission, PENDIENTE_DE_VERIFICAR } from '../src/financial-model.mjs';
import { CAMILO, PAOLA, KEVIN, JHON, BLANCA_301, BLANCA_203, MONICA, DANIEL, ALL_RESERVATIONS } from '../fixtures/reservation-fixtures.mjs';

test('Camilo: venta bruta = comision OTA + payout esperado', () => {
  assert.equal(150000, 27667.5 + 122332.5);
  assert.ok(assertGrossSaleMatchesPayoutPlusCommission(CAMILO));
});

test('Camilo: el cierre nunca reporta el payout neto como venta', () => {
  const close = dailyClose([CAMILO], '2026-09-27');
  assert.equal(close.sales_created_today_total, 150000); // venta bruta, no 122332.5
});

test('Camilo: reserva (27), estancia (28) y payout (29) producen TRES cierres diarios distintos', () => {
  const day27 = dailyClose([CAMILO], '2026-09-27');
  const day28 = dailyClose([CAMILO], '2026-09-28');
  const day29 = dailyClose([CAMILO], '2026-09-29');

  assert.equal(day27.sales_created_today, 1);
  assert.equal(day27.stays_today, 0);
  assert.equal(day27.ota_payout_received, 0);

  assert.equal(day28.sales_created_today, 0);
  assert.equal(day28.stays_today, 1);
  assert.equal(day28.ota_payout_received, 0);

  assert.equal(day29.sales_created_today, 0);
  assert.equal(day29.stays_today, 0);
  // received_payout sigue null (no confirmado): aunque el payout estaba
  // PROGRAMADO para el 29, no se cuenta como recibido sin evidencia.
  assert.equal(day29.ota_payout_received, 0);

  // Los tres reportes son objetivamente diferentes entre si.
  assert.notDeepEqual(day27, day28);
  assert.notDeepEqual(day28, day29);
  assert.notDeepEqual(day27, day29);
});

test('Paola (Casa Completa, Booking): venta bruta se reporta separada de la comision', () => {
  const close = dailyClose([PAOLA], '2026-09-27');
  assert.equal(close.sales_created_today_total, 700000);
  assert.equal(close.ota_commissions, 105000);
});

test('Kevin: cobro Bancolombia el mismo dia de la venta aparece en la columna correcta', () => {
  const close = dailyClose([KEVIN], '2026-09-27');
  assert.equal(close.bancolombia, 86448);
  assert.equal(close.daviplata, 0);
  assert.equal(close.cash, 0);
});

test('Jhon: cobro por Daviplata aparece en su propia columna', () => {
  const close = dailyClose([JHON], '2026-09-28');
  assert.equal(close.daviplata, 55000);
  assert.equal(close.bancolombia, 0);
});

test('Blanca: pago mixto (Bancolombia + efectivo) en la misma reserva se separa por medio real', () => {
  const close = dailyClose([BLANCA_301, BLANCA_203], '2026-09-28');
  // BLANCA_203 se cobro 40.000 Bancolombia + 15.000 efectivo
  assert.equal(close.bancolombia, 40000);
  assert.equal(close.cash, 15000);
});

test('Blanca 301 (cobrada el 27) no se mezcla con el cierre del 28', () => {
  const close28 = dailyClose([BLANCA_301, BLANCA_203], '2026-09-28');
  assert.equal(close28.bancolombia, 40000); // NO incluye los 210.000 del 27
});

test('Monica: el cierre usa la fecha de venta CORREGIDA (27), no la fecha original mal registrada (28)', () => {
  const close27 = dailyClose([MONICA], '2026-09-27');
  const close28 = dailyClose([MONICA], '2026-09-28');
  assert.equal(close27.sales_created_today, 1);
  assert.equal(close28.sales_created_today, 0);
});

test('Daniel: fecha de venta no confirmada se reporta como PENDIENTE_DE_VERIFICAR, nunca se asume', () => {
  assert.equal(DANIEL.reservation_date, PENDIENTE_DE_VERIFICAR);
  const close = dailyClose([DANIEL], '2026-09-27');
  assert.equal(close.sales_created_today, 0); // no se cuenta en ningun dia concreto
  assert.deepEqual(close.unverified_reservation_dates, ['COT/2026/03614']);
});

test('sin evidencia bancaria real, unreconciled es PENDIENTE_DE_VERIFICAR, nunca 0', () => {
  const close = dailyClose([KEVIN], '2026-09-27');
  assert.equal(close.unreconciled, PENDIENTE_DE_VERIFICAR);
});

test('con extracto bancario real, unreconciled se calcula (no queda en PENDIENTE)', () => {
  const close = dailyClose([KEVIN], '2026-09-27', {
    bankStatementLines: [{ matched_reference: 'COT/2026/03615', amount: 86448 }],
  });
  assert.equal(close.unreconciled, 0);
});

test('con extracto bancario que NO matchea la referencia, queda como monto sin conciliar (no se declara 0 falsamente)', () => {
  const close = dailyClose([KEVIN], '2026-09-27', { bankStatementLines: [] });
  assert.equal(close.unreconciled, 86448);
});

test('cierre completo de todas las fixtures no lanza error (robusto a fechas no verificadas)', () => {
  assert.doesNotThrow(() => dailyClose(ALL_RESERVATIONS, '2026-09-28'));
});
