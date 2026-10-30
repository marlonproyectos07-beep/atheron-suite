import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReferences } from '../src/reference-parse.mjs';
import { reconcileByIds } from '../src/id-reconcile.mjs';
import { resolveWindow } from '../src/window.mjs';

// ATH-DEV-074: Odoo usa el formato "SMOOBU-<id>" (5 pedidos reales del 29/10). Datos SINTETICOS salvo los ids de control.
const window = resolveWindow({ RECONCILE_FROM: '2026-10-28', RECONCILE_TO: '2027-01-05' });
const booking = (id, unit, arrival, departure, otaRef, extra = {}) => ({ id, type: 'reservation', arrival, departure, apartment: { id: { 201: 3557506, 202: 3557511, 301: 3557521, 302: 3557526 }[unit] }, channel: { id: 7208046 }, ...(otaRef && { 'reference-id': otaRef }), ...extra });
const order = (id, ref, unit, checkin, checkout, extra = {}) => ({ id, state: 'sale', x_pms_reference: ref, x_checkin: checkin, x_checkout: checkout, units: [unit], ...extra });
const verdictOf = (bookings, orders) => reconcileByIds({ bookings, window, orders, slots: [] }).perReservation.map((r) => [r.smoobuId, r.verdict, r.reason, r.matchedBy ?? null]);

test('formato SMOOBU-<id>: reconocido como identificador etiquetado (mayusculas, minusculas y espacios)', () => {
  for (const t of ['SMOOBU-160965781', 'smoobu-160965781', 'Smoobu - 160965781', 'SMOOBU-160965781 pago Nequi']) {
    const r = parseReferences(t);
    assert.deepEqual([r.smoobu, r.unlabeled], [['160965781'], []], t);
  }
});

test('compatibilidad: los formatos ya admitidos siguen igual', () => {
  assert.deepEqual(parseReferences('Smoobu 161079481 / Booking 5357335668').smoobu, ['161079481']);
  assert.deepEqual(parseReferences('Smoobu ID: 161079481').smoobu, ['161079481']);
  assert.deepEqual(parseReferences('Smoobu #161079481').smoobu, ['161079481']);
  assert.deepEqual(parseReferences('Beds24 #94513315 - Hab 201').beds24, ['94513315']);
  assert.deepEqual(parseReferences('Booking.com #6044417870').booking, ['6044417870']);
});

test('formatos invalidos: no producen ID de Smoobu; un numero largo queda sin etiqueta (solo AMBIGUOUS)', () => {
  assert.deepEqual(parseReferences('SMOOBU-12345').smoobu, []);
  assert.deepEqual(parseReferences('SMOOBU-ABC123').smoobu, []);
  const doble = parseReferences('SMOOBU--160965781');
  assert.deepEqual([doble.smoobu, doble.unlabeled], [[], ['160965781']]);
  const largo = parseReferences('SMOOBU-1609657811234');
  assert.deepEqual([largo.smoobu, largo.unlabeled], [[], ['1609657811234']]);
  assert.deepEqual(parseReferences('SMOOBUX-160965781').smoobu, []);
});

test('repetidos: el mismo ID dos veces cuenta una sola vez', () => {
  assert.deepEqual(parseReferences('SMOOBU-160965781 / Smoobu 160965781 / SMOOBU-160965781').smoobu, ['160965781']);
});

test('motor: SMOOBU-<id> con habitacion y fechas iguales da MATCH por ID de Smoobu', () => {
  const b = booking(160965781, '302', '2026-10-31', '2026-11-01', '6044417870');
  assert.deepEqual(verdictOf([b], [order(1, 'SMOOBU-160965781', '302', '2026-10-31', '2026-11-01')]), [[160965781, 'MATCH', 'ID_Y_DATOS_COINCIDEN', 'SMOOBU_ID']]);
  assert.deepEqual(verdictOf([b], [order(1, 'SMOOBU-160965781 / Booking 6044417870', '302', '2026-10-31', '2026-11-01')])[0].slice(1), ['MATCH', 'ID_Y_DATOS_COINCIDEN', 'SMOOBU_ID+OTA_ID']);
});

test('ambiguos y conflictos con SMOOBU-<id>: dos IDs, dos pedidos, fechas u OTA distintas', () => {
  const b = booking(160965781, '302', '2026-10-31', '2026-11-01', '6044417870');
  assert.equal(verdictOf([b], [order(1, 'SMOOBU-160965781 SMOOBU-161787956', '302', '2026-10-31', '2026-11-01')])[0][2], 'PEDIDO_REFERENCIA_VARIAS_RESERVAS');
  assert.equal(verdictOf([b], [order(1, 'SMOOBU-160965781', '302', '2026-10-31', '2026-11-01'), order(2, 'SMOOBU-160965781', '302', '2026-10-31', '2026-11-01')])[0][2], 'VARIOS_PEDIDOS_CON_EL_MISMO_ID');
  assert.equal(verdictOf([b], [order(1, 'SMOOBU-160965781', '302', '2026-10-31', '2026-11-02')])[0][2], 'FECHAS_DISTINTAS');
  assert.equal(verdictOf([b], [order(1, 'SMOOBU-160965781', '301', '2026-10-31', '2026-11-01')])[0][2], 'HABITACION_DISTINTA');
  assert.equal(verdictOf([b], [order(1, 'SMOOBU-160965781 / Booking 1234567890', '302', '2026-10-31', '2026-11-01')])[0][2], 'ID_OTA_DISTINTO_EN_EL_PEDIDO');
});

test('colisiones entre canales: un numero etiquetado en el canal equivocado nunca produce MATCH', () => {
  const b = booking(160965781, '302', '2026-10-31', '2026-11-01', '6044417870');
  // el ID de Smoobu escrito como numero de Booking, y el numero de Booking escrito como ID de Smoobu
  assert.deepEqual(verdictOf([b], [order(1, 'Booking 160965781', '302', '2026-10-31', '2026-11-01')])[0].slice(1, 3), ['MISSING_IN_ODOO', 'SIN_PEDIDO_NI_OCUPACION_EN_ODOO']);
  assert.deepEqual(verdictOf([b], [order(1, 'SMOOBU-6044417870', '302', '2026-10-31', '2026-11-01')])[0].slice(1, 3), ['MISSING_IN_ODOO', 'SIN_PEDIDO_NI_OCUPACION_EN_ODOO']);
  // un pedido con el ID de OTRA reserva de Smoobu no se asigna a esta
  const otra = booking(161787956, '201', '2026-11-01', '2026-11-02', '5122466816');
  const r = verdictOf([b, otra], [order(1, 'SMOOBU-161787956', '201', '2026-11-01', '2026-11-02')]);
  assert.deepEqual(r.map((x) => [x[0], x[1]]), [[160965781, 'MISSING_IN_ODOO'], [161787956, 'MATCH']]);
});

test('escenario del 29/10: cinco pedidos SMOOBU-<id> pasan de AMBIGUOUS (sin etiqueta) a MATCH', () => {
  const casos = [[171000001, '201', '2026-10-29', '2026-10-30'], [171000002, '202', '2026-10-29', '2026-10-31'], [171000003, '302', '2026-10-29', '2026-10-30'], [171000004, '301', '2026-10-29', '2026-10-30'], [171000005, '201', '2026-10-30', '2026-10-31']];
  const bookings = casos.map(([id, u, a, d]) => booking(id, u, a, d, null, { channel: { id: 7192171 } }));
  const orders = casos.map(([id, u, a, d], i) => order(i + 1, `SMOOBU-${id}`, u, a, d));
  const r = reconcileByIds({ bookings, window, orders, slots: [] });
  assert.deepEqual(r.summary, { MATCH: 5, MISSING_IN_ODOO: 0, CONFLICT: 0, CANCELLED: 0, AMBIGUOUS: 0 });
  assert.ok(r.perReservation.every((x) => x.writesEnabled === false)); assert.equal(r.safety.proposals, 0);
});
