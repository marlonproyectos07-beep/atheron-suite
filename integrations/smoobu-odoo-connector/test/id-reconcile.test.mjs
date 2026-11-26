import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileByIds, smoobuOverlaps } from '../src/id-reconcile.mjs';
import { parseReferences, normalizeOtaRef } from '../src/reference-parse.mjs';
import { resolveWindow } from '../src/window.mjs';
import { SMOOBU_BOOKINGS, ODOO_ORDERS, ODOO_SLOTS, WINDOW_ENV } from './fixtures/reconcile-ids-control.mjs';

const window = resolveWindow(WINDOW_ENV);
const run = (over = {}) => reconcileByIds({ bookings: SMOOBU_BOOKINGS, window, orders: ODOO_ORDERS, slots: ODOO_SLOTS, ...over });
const byId = (r) => Object.fromEntries(r.perReservation.map((x) => [x.smoobuId, x]));

test('referencias: solo cuentan los identificadores con etiqueta; numeros sueltos (p. ej. cedulas) quedan aparte', () => {
  assert.deepEqual(parseReferences('Smoobu 161079481 / Booking 5357335668'), { smoobu: ['161079481'], booking: ['5357335668'], airbnb: [], beds24: [], unlabeled: [] });
  assert.deepEqual(parseReferences('Beds24 #94513315 - Hab 201 - Total Booking COP 80.000').beds24, ['94513315']);
  assert.deepEqual(parseReferences('Booking COP 80.000').booking, []);
  assert.deepEqual(parseReferences('Airbnb hmabc12345').airbnb, ['HMABC12345']);
  assert.deepEqual(parseReferences('Booking.com #6044417870').booking, ['6044417870']);
  const r = parseReferences('huesped X (CC 0000000000) - Nequi M11030822');
  assert.deepEqual([r.smoobu, r.booking, r.unlabeled], [[], [], ['0000000000']]);
  assert.deepEqual(parseReferences(false).smoobu, []);
  assert.equal(normalizeOtaRef(' 6044417870 '), '6044417870'); assert.equal(normalizeOtaRef('x y'), null); assert.equal(normalizeOtaRef(null), null);
});

test('casos de control: 302 y 201 FALTAN en Odoo; 301 de enero con alerta de sobreventa y revision manual', () => {
  const r = run(); const v = byId(r);
  assert.equal(v[160965781].verdict, 'MISSING_IN_ODOO'); assert.equal(v[160965781].odooOccupancy, 'NONE'); assert.deepEqual(v[160965781].odooFreeNights, ['2026-10-31']);
  assert.equal(v[161787956].verdict, 'MISSING_IN_ODOO'); assert.deepEqual(v[161787956].odooFreeNights, ['2026-11-01']);
  assert.equal(v[160829171].manualReview, 'ALERTA_SOBREVENTA_NO_RESOLVER_AUTOMATICAMENTE');
  assert.deepEqual(v[160829171].overbookingWith, [170000099]);
  assert.ok(r.controlCases.every((c) => c.found && c.consistentWithControl));
  assert.deepEqual(r.controlCases.map((c) => c.verdict), ['MISSING_IN_ODOO', 'MISSING_IN_ODOO', 'MISSING_IN_ODOO']);
  assert.ok(r.availabilityRisk.some((x) => x.smoobuId === 160965781 && x.unit === '302'));
});

test('cinco veredictos: MATCH, CONFLICT (fechas / cancelada vigente), CANCELLED, AMBIGUOUS (duplicado, sin etiqueta, ocupado sin ID)', () => {
  const r = run(); const v = byId(r);
  assert.equal(v[170000002].verdict, 'MATCH'); assert.equal(v[170000002].matchedBy, 'SMOOBU_ID+OTA_ID'); assert.equal(v[170000002].odooOccupancy, 'FULL');
  assert.deepEqual([v[170000003].verdict, v[170000003].reason, v[170000003].matchedBy], ['CONFLICT', 'FECHAS_DISTINTAS', 'OTA_ID']);
  assert.deepEqual([v[170000001].verdict, v[170000001].reason], ['CONFLICT', 'CANCELADA_EN_SMOOBU_VIGENTE_EN_ODOO']);
  assert.deepEqual([v[170000008].verdict, v[170000008].reason], ['CANCELLED', 'CANCELADA_EN_AMBOS']);
  assert.deepEqual([v[170000004].verdict, v[170000004].reason], ['AMBIGUOUS', 'VARIOS_PEDIDOS_CON_EL_MISMO_ID']);
  assert.deepEqual([v[170000005].verdict, v[170000005].reason], ['AMBIGUOUS', 'NUMERO_SIN_ETIQUETA_EN_REFERENCIA']);
  assert.deepEqual([v[161661036].verdict, v[161661036].reason], ['AMBIGUOUS', 'ODOO_OCUPADO_SIN_ID']);
  assert.deepEqual(r.summary, { MATCH: 1, MATCH_DRAFT: 0, DAYUSE_OK: 0, ROOM_MOVED: 0, MISSING_IN_ODOO: 6, CONFLICT: 2, CANCELLED: 1, AMBIGUOUS: 3 });
  assert.deepEqual([r.counts.blocksActive, r.counts.excludedCarrera19, r.counts.outsideWindow], [1, 1, 1]);
  assert.ok(!r.perReservation.some((x) => x.smoobuId === 170000011), 'Carrera 19 nunca entra');
});

test('habitacion, fecha o nombre NUNCA bastan: sin ID etiquetado no hay MATCH aunque coincidan habitacion y noches', () => {
  const orders = [{ id: 70, name: 'COT/T/0070', state: 'sale', x_pms_reference: false, x_checkin: '2026-10-31', x_checkout: '2026-11-01', units: ['302'] }];
  const slots = [{ id: 1, role_id: [18, 'x'], start_datetime: '2026-10-31 20:00:00', end_datetime: '2026-11-01 16:00:00', state: 'published' }];
  const r = reconcileByIds({ bookings: [SMOOBU_BOOKINGS[0]], window, orders, slots });
  assert.deepEqual([r.perReservation[0].verdict, r.perReservation[0].reason], ['AMBIGUOUS', 'ODOO_OCUPADO_SIN_ID']);
});

test('conflictos de identificador y de estado', () => {
  const bk = SMOOBU_BOOKINGS[0];
  // ATH-CEO-PMS-100: un MATCH exige pedido confirmado con turno que cubra la noche
  const cover = [{ id: 1, role_id: [18, 'x'], start_datetime: '2026-10-31 20:00:00', end_datetime: '2026-11-01 16:00:00', state: 'published' }];
  const mk = (ref, extra = {}) => reconcileByIds({ bookings: [bk], window, slots: cover, orders: [{ id: 80, name: 'COT/T/0080', state: 'sale', x_pms_reference: ref, x_checkin: '2026-10-31', x_checkout: '2026-11-01', units: ['302'], ...extra }] }).perReservation[0];
  assert.equal(mk('Smoobu 160965781 / Booking 6044417870').verdict, 'MATCH');
  assert.equal(mk('Smoobu 160965781 / Booking 1234567890').reason, 'ID_OTA_DISTINTO_EN_EL_PEDIDO');
  assert.equal(mk('Smoobu 160965780 / Booking 6044417870').reason, 'ID_SMOOBU_DISTINTO_EN_EL_PEDIDO');
  assert.equal(mk('Smoobu 160965781', { units: ['301'] }).reason, 'HABITACION_DISTINTA');
  assert.equal(mk('Smoobu 160965781', { units: [] }).reason, 'HABITACION_DEL_PEDIDO_DESCONOCIDA');
  assert.deepEqual([mk('Smoobu 160965781', { units: ['302', '201'] }).verdict, mk('Smoobu 160965781', { units: ['302', '201'] }).reason], ['AMBIGUOUS', 'PEDIDO_CON_VARIAS_HABITACIONES']);
  assert.equal(mk('Smoobu 160965781', { state: 'cancel' }).reason, 'VIGENTE_EN_SMOOBU_CANCELADA_EN_ODOO');
  assert.equal(mk('Smoobu 160965781 y Smoobu 161787956').reason, 'PEDIDO_REFERENCIA_VARIAS_RESERVAS');
  assert.deepEqual([mk('Smoobu 160965781 / Booking 6044417870 / Booking 9999999999').verdict, mk('Smoobu 160965781 / Booking 6044417870 / Booking 9999999999').reason], ['AMBIGUOUS', 'PEDIDO_REFERENCIA_VARIAS_RESERVAS']);
  assert.equal(mk('Smoobu 160965781', { x_reservation_status: 'cancelled' }).verdict, 'CONFLICT');
});

test('sobreventa en Smoobu: misma habitacion, Casa Completa contra habitacion; noches contiguas no chocan', () => {
  const s = (id, unit, arrival, departure) => ({ id, unit, arrival, departure });
  assert.deepEqual(smoobuOverlaps([s(1, '301', '2027-01-04', '2027-01-05'), s(2, '301', '2027-01-04', '2027-01-05')]), [[1, 2]]);
  assert.deepEqual(smoobuOverlaps([s(1, 'CASA', '2026-11-20', '2026-11-21'), s(2, '201', '2026-11-20', '2026-11-21')]), [[1, 2]]);
  assert.deepEqual(smoobuOverlaps([s(1, '201', '2026-11-20', '2026-11-21'), s(2, '202', '2026-11-20', '2026-11-21')]), []);
  assert.deepEqual(smoobuOverlaps([s(1, '201', '2026-11-20', '2026-11-21'), s(2, '201', '2026-11-21', '2026-11-22')]), []);
  assert.deepEqual(run().smoobuOverbooking, [[160829171, 170000099], [170000006, 170000007]]);
});

test('pedidos de Odoo con ID que Smoobu no devolvio; cancelados y sin etiqueta no se listan', () => {
  assert.deepEqual(run().ordersNotReturnedBySmoobu, [{ id: 8, refKinds: ['smoobu'] }]);
});

test('un turno draft bloquea disponibilidad en Odoo y el informe nunca imprime texto libre del pedido', () => {
  const orders = ODOO_ORDERS.map((o) => ({ ...o, name: 'NOMBRE_PRIVADO', x_reservation_status: o.id === 2 ? 'NOMBRE_PRIVADO' : o.x_reservation_status }));
  const draft = { id: 70, role_id: [18, 'ROL_PRIVADO'], start_datetime: '2026-10-31 20:00:00', end_datetime: '2026-11-01 16:00:00', state: 'draft' };
  const r = run({ orders, slots: [...ODOO_SLOTS, draft] });
  const control = byId(r)[160965781];
  assert.equal(control.odooOccupancy, 'FULL');
  assert.ok(!r.availabilityRisk.some((x) => x.smoobuId === 160965781));
  assert.ok(!JSON.stringify(r).includes('NOMBRE_PRIVADO'));
});

test('seguridad: sin propuestas ni escrituras, y el informe no lleva nombres, textos libres ni cedulas', () => {
  const r = run(); const out = JSON.stringify(r);
  assert.equal(r.safety.writesEnabled, false); assert.equal(r.safety.releaseUnlocked, false); assert.equal(r.safety.proposals, 0);
  assert.ok(r.perReservation.every((x) => x.writesEnabled === false));
  for (const banned of ['PRIVADO', 'privado@', '0000000000', 'Nequi', 'pago ', 'Booking.com']) assert.ok(!out.includes(banned), `no debe aparecer: ${banned}`);
});

// ATH-SYNC-RES-2026-11-26: reserva de Booking con VARIAS habitaciones (Smoobu la parte en una reserva por habitacion con el
// MISMO ID de Booking). Caso real del 22/11/2026 (ids sinteticos): el pedido creado para una habitacion casaba tambien con
// la otra por el ID de Booking -> PEDIDO_COMPARTIDO_POR_VARIAS_RESERVAS -> DUPLICADO_DETECTADO -> sincronizacion apagada.
test('Booking con varias habitaciones: el ID de Booking compartido no casa pedidos; solo el ID de Smoobu; sin falso duplicado', async () => {
  const { duplicatesIn } = await import('../src/sync-auto.mjs');
  const APT = { 201: 3557506, 202: 3557511 };
  const bk = (id, unit) => ({ id, type: 'reservation', arrival: '2026-12-24', departure: '2026-12-25', apartment: { id: APT[unit], name: 'UNIDAD_PRIVADA' }, channel: { id: 7192171, name: 'Booking.com' }, 'guest-name': 'NOMBRE_PRIVADO_HUESPED', 'reference-id': '5000000001' });
  const bookings = [bk(170000202, '202'), bk(170000201, '201')];
  const ord = (id, ref, units) => ({ id, name: `COT/T/${id}`, state: 'draft', x_pms_reference: ref, x_booking_source: 'booking_com', x_checkin: '2026-12-24', x_checkout: '2026-12-25', units });

  // 1) estado real: un solo pedido, el de la 202, con su ID de Smoobu y el ID de Booking compartido
  const r1 = reconcileByIds({ bookings, window, orders: [ord(90, 'Smoobu 170000202 / Booking 5000000001', ['202'])], slots: [] });
  const v1 = byId(r1);
  assert.notEqual(v1[170000202].verdict, 'AMBIGUOUS', 'la 202 casa con su pedido por el ID de Smoobu');
  assert.equal(v1[170000202].matchedBy, 'SMOOBU_ID+OTA_ID');
  assert.equal(v1[170000201].verdict, 'MISSING_IN_ODOO', 'la 201 no tiene pedido propio');
  assert.deepEqual(v1[170000201].odooOrders, [], 'el pedido de la 202 no se le asigna');
  assert.deepEqual(duplicatesIn(r1), [], 'no es un duplicado: la sincronizacion no se apaga');

  // 2) con un pedido por habitacion, cada reserva casa con el suyo
  const r2 = reconcileByIds({ bookings, window, orders: [ord(90, 'Smoobu 170000202 / Booking 5000000001', ['202']), ord(91, 'Smoobu 170000201 / Booking 5000000001', ['201'])], slots: [] });
  const v2 = byId(r2);
  assert.deepEqual([v2[170000202].odooOrders.map((o) => o.id), v2[170000201].odooOrders.map((o) => o.id)], [[90], [91]]);
  assert.ok(![v2[170000202], v2[170000201]].some((x) => x.verdict === 'AMBIGUOUS'));
  assert.deepEqual(duplicatesIn(r2), []);

  // 3) un pedido que solo lleva el ID de Booking compartido (sin ID de Smoobu): revision humana, nunca se crea otro
  const r3 = reconcileByIds({ bookings, window, orders: [ord(92, 'Booking 5000000001', ['202'])], slots: [] });
  for (const x of r3.perReservation) assert.deepEqual([x.verdict, x.reason], ['AMBIGUOUS', 'ID_OTA_COMPARTIDO_SIN_ID_SMOOBU']);
  assert.deepEqual(duplicatesIn(r3), []);

  // 4) un ID de Booking que NO esta compartido sigue casando por OTA como antes
  const r4 = reconcileByIds({ bookings: [bookings[0]], window, orders: [ord(93, 'Booking 5000000001', ['202'])], slots: [] });
  assert.equal(r4.perReservation[0].matchedBy, 'OTA_ID');

  // 5) dos pedidos con el MISMO ID de Smoobu siguen siendo duplicado real (la proteccion no se debilita)
  const r5 = reconcileByIds({ bookings, window, orders: [ord(90, 'Smoobu 170000202 / Booking 5000000001', ['202']), ord(94, 'Smoobu 170000202', ['202'])], slots: [] });
  assert.deepEqual([byId(r5)[170000202].verdict, byId(r5)[170000202].reason], ['AMBIGUOUS', 'VARIOS_PEDIDOS_CON_EL_MISMO_ID']);
  assert.equal(duplicatesIn(r5).length, 1);
});
