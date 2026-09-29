import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesByChannel, salesByUnit, adr, managerDashboard } from '../src/financial-model.mjs';
import { CAMILO, PAOLA, KEVIN, JHON, BLANCA_301, BLANCA_203, MONICA, DANIEL, ALL_RESERVATIONS } from '../fixtures/reservation-fixtures.mjs';

test('salesByChannel: Camilo (AIRBNB) y Paola (BOOKING) el 27, cada canal separado', () => {
  const byChannel = salesByChannel([CAMILO, PAOLA], '2026-09-27');
  const airbnb = byChannel.find((c) => c.channel === 'AIRBNB');
  const booking = byChannel.find((c) => c.channel === 'BOOKING');
  assert.equal(airbnb.total, 150000);
  assert.equal(booking.total, 700000);
});

test('salesByChannel: Monica (sin canal en la fuente) se agrupa en SIN_CANAL_REGISTRADO, no se inventa un canal', () => {
  const byChannel = salesByChannel([MONICA], '2026-09-27');
  assert.equal(byChannel.length, 1);
  assert.equal(byChannel[0].channel, 'SIN_CANAL_REGISTRADO');
  assert.equal(byChannel[0].total, 120000);
});

test('salesByUnit: Kevin (302) y Camilo (301) el mismo dia no se mezclan', () => {
  const byUnit = salesByUnit([CAMILO], '2026-09-27');
  assert.equal(byUnit.length, 1);
  assert.equal(byUnit[0].unit, '301');
  assert.equal(byUnit[0].total, 150000);
});

test('adr: Kevin (302, 1 noche, 86448) ocupado solo el 27 produce ADR = 86448', () => {
  assert.equal(adr([KEVIN], '2026-09-27'), 86448);
});

test('adr: null (no 0) cuando nadie esta ocupado ese dia -- no inventa tarifa de un dia sin ocupacion', () => {
  assert.equal(adr([CAMILO], '2026-09-27'), null); // Camilo hace checkin el 28, no el 27
});

test('adr: promedia entre varias unidades ocupadas el mismo dia (Jhon 302 + Blanca 203 el 28)', () => {
  const value = adr([JHON, BLANCA_203], '2026-09-28');
  assert.equal(value, (55000 + 55000) / 2);
});

test('managerDashboard: conserva la forma de dailyClose y agrega canal/alojamiento/ADR', () => {
  const dashboard = managerDashboard([CAMILO, PAOLA], '2026-09-27');
  assert.equal(dashboard.sales_created_today_total, 850000); // mismo campo que dailyClose ya probado
  assert.equal(dashboard.sales_by_channel.length, 2);
  assert.equal(dashboard.sales_by_unit.length, 2);
});

test('managerDashboard sobre el set completo de fixtures reales nunca lanza error', () => {
  assert.doesNotThrow(() => managerDashboard(ALL_RESERVATIONS, '2026-09-28'));
});

test('Daniel (fecha PENDIENTE_DE_VERIFICAR) nunca aparece en salesByChannel/salesByUnit de un dia concreto', () => {
  const byChannel = salesByChannel([DANIEL], '2026-09-27');
  const byUnit = salesByUnit([DANIEL], '2026-09-27');
  assert.deepEqual(byChannel, []);
  assert.deepEqual(byUnit, []);
});
