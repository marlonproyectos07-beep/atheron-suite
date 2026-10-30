import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileByIds, VERDICTS, ALERTS } from '../src/id-reconcile.mjs';
import { toPublicReport, sensitiveValues, assertPublicSafe } from '../src/public-report.mjs';
import { runReconcileIds } from '../src/reconcile-ids-run.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-CEO-PMS-100 — Datos SINTETICOS (ids 17xxxxxxx, importes inventados, sin personas reales).
const window = resolveWindow({ RECONCILE_FROM: '2026-10-28', RECONCILE_TO: '2027-01-05' });
const APT = { 201: 3557506, 202: 3557511, 301: 3557521, 302: 3557526 };
const ROLE = { 201: 29, 202: 19, 301: 37, 302: 18 };
const BOOKING = 7208046; const DIRECT = 7192171;
const booking = (id, unit, arrival, departure, extra = {}) => ({ id, type: 'reservation', arrival, departure, apartment: { id: APT[unit] }, channel: { id: DIRECT }, ...extra });
const order = (id, ref, unit, ci, co, extra = {}) => ({ id, state: 'sale', x_pms_reference: ref, x_checkin: ci, x_checkout: co, units: [unit], lineIds: [id * 10], lines: [], invoices: [], ...extra });
const night = (unit, ci, co, extra = {}) => ({ id: 1, role_id: [ROLE[unit], 'x'], start_datetime: `${ci} 20:00:00`, end_datetime: `${co} 16:00:00`, state: 'published', sale_line_id: false, ...extra });
const one = (bookings, orders, slots = [], dayuseSlots = []) => reconcileByIds({ bookings, window, orders, slots, dayuseSlots }).perReservation[0];
const pick = (r) => [r.verdict, r.reason];

test('MATCH exige pedido confirmado con turno; borrador o confirmado sin turno = MATCH_DRAFT', () => {
  const b = booking(170100001, '202', '2026-10-31', '2026-11-02');
  const o = order(1, 'SMOOBU-170100001', '202', '2026-10-31', '2026-11-02');
  assert.deepEqual(pick(one([b], [o], [night('202', '2026-10-31', '2026-11-02')])), ['MATCH', 'ID_Y_DATOS_COINCIDEN']);
  assert.deepEqual(pick(one([b], [{ ...o, state: 'draft' }], [])), ['MATCH_DRAFT', 'PEDIDO_EN_BORRADOR']);
  assert.deepEqual(pick(one([b], [{ ...o, state: 'sent' }], [night('202', '2026-10-31', '2026-11-02')])), ['MATCH_DRAFT', 'PEDIDO_EN_BORRADOR']);
  assert.deepEqual(pick(one([b], [o], [])), ['MATCH_DRAFT', 'CONFIRMADO_SIN_TURNO']);
  // turno que cubre solo una de las dos noches
  assert.deepEqual(pick(one([b], [o], [night('202', '2026-10-31', '2026-11-01')])), ['MATCH_DRAFT', 'CONFIRMADO_SIN_TURNO']);
});

test('DAYUSE_OK: entrada = salida = llegada, pedido confirmado y turno DAYUSE etiquetado de menos de 24 h ese dia', () => {
  const b = booking(170100002, '301', '2026-10-31', '2026-11-01');
  const o = order(2, 'SMOOBU-170100002', '301', '2026-10-31', '2026-10-31');
  const du = { id: 9, name: 'DAYUSE SMOOBU-170100002 COT/T/0002', role_id: [25, 'x'], start_datetime: '2026-10-31 19:00:00', end_datetime: '2026-11-01 01:00:00', state: 'published' };
  assert.deepEqual(pick(one([b], [o], [], [du])), ['DAYUSE_OK', 'USO_DIURNO_SIN_PERNOCTA']);
  // sin turno DAYUSE, con turno de otra reserva, de 24 h o mas, en otro dia, o pedido en borrador -> CONFLICT
  assert.deepEqual(pick(one([b], [o], [], [])), ['CONFLICT', 'USO_DIURNO_SIN_TURNO_DAYUSE']);
  assert.deepEqual(pick(one([b], [o], [], [{ ...du, name: 'DAYUSE SMOOBU-170100099' }])), ['CONFLICT', 'USO_DIURNO_SIN_TURNO_DAYUSE']);
  assert.deepEqual(pick(one([b], [o], [], [{ ...du, end_datetime: '2026-11-01 20:00:00' }])), ['CONFLICT', 'USO_DIURNO_SIN_TURNO_DAYUSE']);
  assert.deepEqual(pick(one([b], [o], [], [{ ...du, start_datetime: '2026-11-01 19:00:00', end_datetime: '2026-11-02 01:00:00' }])), ['CONFLICT', 'USO_DIURNO_SIN_TURNO_DAYUSE']);
  assert.deepEqual(pick(one([b], [{ ...o, state: 'draft' }], [], [du])), ['CONFLICT', 'USO_DIURNO_SIN_TURNO_DAYUSE']);
  assert.deepEqual(pick(one([b], [o], [], [{ ...du, name: 'Nota sin marca SMOOBU-170100002' }])), ['CONFLICT', 'USO_DIURNO_SIN_TURNO_DAYUSE']);
  // una estancia de 2 noches nunca es uso diurno
  const b2 = booking(170100003, '301', '2026-10-31', '2026-11-02');
  assert.deepEqual(pick(one([b2], [order(3, 'SMOOBU-170100003', '301', '2026-10-31', '2026-10-31')], [], [{ ...du, name: 'DAYUSE SMOOBU-170100003' }])), ['CONFLICT', 'FECHAS_DISTINTAS']);
});

test('ROOM_MOVED: producto de otra habitacion, pero turnos ENLAZADOS al pedido en la habitacion de Smoobu', () => {
  const b = booking(170100004, '302', '2026-10-30', '2026-10-31');
  const o = order(4, 'SMOOBU-170100004', '201', '2026-10-30', '2026-10-31', { lineIds: [41] });
  const linked = night('302', '2026-10-30', '2026-10-31', { sale_line_id: [41, 'x'] });
  assert.deepEqual(pick(one([b], [o], [linked])), ['ROOM_MOVED', 'TURNO_EN_HABITACION_DE_SMOOBU_PRODUCTO_DISTINTO']);
  // turno en la 302 pero de otro pedido, turno enlazado en la 201, o pedido en borrador -> CONFLICT
  assert.deepEqual(pick(one([b], [o], [{ ...linked, sale_line_id: [99, 'x'] }])), ['CONFLICT', 'HABITACION_DISTINTA']);
  assert.deepEqual(pick(one([b], [o], [night('201', '2026-10-30', '2026-10-31', { sale_line_id: [41, 'x'] })])), ['CONFLICT', 'HABITACION_DISTINTA']);
  assert.deepEqual(pick(one([b], [{ ...o, state: 'draft' }], [linked])), ['CONFLICT', 'HABITACION_DISTINTA']);
  assert.deepEqual(pick(one([b], [o], [])), ['CONFLICT', 'HABITACION_DISTINTA']);
});

test('avisos de importes: PRICE_DIFF, TAX_MISSING, INVOICE_DIFF y MANUAL_PRICE_DIFF (sin cambiar el veredicto)', () => {
  const slot = night('202', '2026-10-31', '2026-11-02');
  const b = booking(170100005, '202', '2026-10-31', '2026-11-02', { price: 160000 });
  const base = order(5, 'SMOOBU-170100005', '202', '2026-10-31', '2026-11-02', { amount_untaxed: 160000, amount_tax: 0, amount_total: 160000 });
  const clean = one([b], [base], [slot]);
  assert.deepEqual([clean.verdict, clean.alerts], ['MATCH', []]);
  // precio de Smoobu distinto de base y total (el caso del desglose de 85.000)
  assert.deepEqual(one([b], [{ ...base, amount_untaxed: 85000, amount_total: 85000 }], [slot]).alerts, [ALERTS.PRICE_DIFF]);
  // Booking: el precio de Smoobu es la base; el total lleva IVA -> sin PRICE_DIFF; sin impuesto -> TAX_MISSING
  const bk = booking(170100006, '201', '2026-11-03', '2026-11-05', { price: 90000, channel: { id: BOOKING }, 'reference-id': '9000000001' });
  const ok = order(6, 'SMOOBU-170100006 / Booking 9000000001', '201', '2026-11-03', '2026-11-05', { amount_untaxed: 90000, amount_tax: 17100, amount_total: 107100 });
  const s201 = night('201', '2026-11-03', '2026-11-05');
  assert.deepEqual(one([bk], [ok], [s201]).alerts, []);
  assert.deepEqual(one([bk], [{ ...ok, amount_untaxed: 65000, amount_tax: 0, amount_total: 65000 }], [s201]).alerts, [ALERTS.PRICE_DIFF, ALERTS.TAX_MISSING]);
  // una reserva directa sin impuesto NO dispara TAX_MISSING (el IVA de directas lo decide el contador)
  assert.ok(!one([b], [base], [slot]).alerts.includes(ALERTS.TAX_MISSING));
  // facturas: solo cuentan las publicadas; las notas credito restan
  const inv = (amount_total, extra = {}) => ({ state: 'posted', move_type: 'out_invoice', amount_total, ...extra });
  assert.deepEqual(one([b], [{ ...base, invoices: [inv(220000)] }], [slot]).alerts, [ALERTS.INVOICE_DIFF]);
  assert.deepEqual(one([b], [{ ...base, invoices: [inv(160000)] }], [slot]).alerts, []);
  assert.deepEqual(one([b], [{ ...base, invoices: [inv(220000), inv(60000, { move_type: 'out_refund' })] }], [slot]).alerts, []);
  assert.deepEqual(one([b], [{ ...base, invoices: [inv(999999, { state: 'draft' })] }], [slot]).alerts, []);
  // precio manual distinto del precio unitario (la proteccion no actuo)
  assert.deepEqual(one([b], [{ ...base, lines: [{ price_unit: 50000, x_precio_manual: 160000 }] }], [slot]).alerts, [ALERTS.MANUAL_PRICE_DIFF]);
  assert.deepEqual(one([b], [{ ...base, lines: [{ price_unit: 160000, x_precio_manual: 160000 }, { price_unit: 1, x_precio_manual: 0 }] }], [slot]).alerts, []);
  // los avisos no cambian un veredicto distinto de MATCH
  assert.equal(one([b], [{ ...base, state: 'draft', amount_total: 85000, amount_untaxed: 85000 }], []).verdict, VERDICTS.MATCH_DRAFT);
});

test('resumen y conteos de avisos incluyen todos los codigos; seguridad intacta', () => {
  const b = booking(170100007, '202', '2026-10-31', '2026-11-02', { price: 160000 });
  const r = reconcileByIds({ bookings: [b], window, orders: [order(7, 'SMOOBU-170100007', '202', '2026-10-31', '2026-11-02', { state: 'draft', amount_untaxed: 85000, amount_total: 85000 })], slots: [] });
  assert.deepEqual(Object.keys(r.summary), ['MATCH', 'MATCH_DRAFT', 'DAYUSE_OK', 'ROOM_MOVED', 'MISSING_IN_ODOO', 'CONFLICT', 'CANCELLED', 'AMBIGUOUS']);
  assert.equal(r.summary.MATCH_DRAFT, 1);
  assert.deepEqual(r.alertCounts, { PRICE_DIFF: 1, TAX_MISSING: 0, INVOICE_DIFF: 0, MANUAL_PRICE_DIFF: 0 });
  assert.deepEqual([r.safety.writesEnabled, r.safety.releaseUnlocked, WRITES_ENABLED, RELEASE_UNLOCKED], [false, false, false, false]);
});

test('informe publico: solo codigos de aviso; nunca importes, notas DAYUSE, referencias ni IDs completos', () => {
  const b = booking(170100008, '301', '2026-10-31', '2026-11-01', { price: 100000, 'guest-name': 'NOMBRE_PRIVADO' });
  const o = order(8, 'SMOOBU-170100008 pago Nequi 0000000000', '301', '2026-10-31', '2026-10-31', { amount_untaxed: 123457, amount_tax: 0, amount_total: 123457 });
  const du = { id: 9, name: 'DAYUSE SMOOBU-170100008 COT/T/0008 NOTA_PRIVADA', role_id: [25, 'x'], start_datetime: '2026-10-31 19:00:00', end_datetime: '2026-11-01 01:00:00' };
  const internal = reconcileByIds({ bookings: [b], window, orders: [o], slots: [], dayuseSlots: [du] });
  assert.deepEqual([internal.perReservation[0].verdict, internal.perReservation[0].alerts], ['DAYUSE_OK', ['PRICE_DIFF']]);
  const pub = toPublicReport(internal); const text = JSON.stringify(pub);
  assert.deepEqual(pub.perReservation[0].alerts, ['PRICE_DIFF']);
  assert.deepEqual(pub.alertCounts, { PRICE_DIFF: 1, TAX_MISSING: 0, INVOICE_DIFF: 0, MANUAL_PRICE_DIFF: 0 });
  for (const banned of ['170100008', '123457', '100000', 'DAYUSE SMOOBU', 'NOTA_PRIVADA', 'COT/T', 'Nequi', '0000000000', 'NOMBRE_PRIVADO']) assert.ok(!text.includes(banned), banned);
  assert.equal(assertPublicSafe(text, { identifiers: sensitiveValues(internal) }).safe, true);
});

test('extremo a extremo: lee importes, facturas y turnos DAYUSE solo con fields_get/search_read; nada de escrituras', async () => {
  const smoobuCalls = []; const odooCalls = [];
  const ok = (data) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
  const bookings = [booking(170100009, '301', '2026-10-31', '2026-11-01', { price: 100000 }), booking(170100010, '202', '2026-10-31', '2026-11-02', { price: 160000 })];
  const sFetch = async (url, init) => { smoobuCalls.push(`${init.method} ${new URL(url).pathname}`); return ok({ page: 1, page_count: 1, total_items: bookings.length, bookings }); };
  const F = {
    'planning.slot': ['id', 'name', 'role_id', 'resource_id', 'start_datetime', 'end_datetime', 'state', 'x_bloqueo_ref', 'sale_line_id'],
    'sale.order': ['id', 'state', 'x_pms_reference', 'x_checkin', 'x_checkout', 'amount_untaxed', 'amount_tax', 'amount_total', 'invoice_ids'],
    'sale.order.line': ['id', 'order_id', 'product_template_id', 'price_unit', 'x_precio_manual'],
    'product.template': ['id', 'default_code', 'planning_role_id'],
    'account.move': ['id', 'state', 'move_type', 'amount_total'],
  };
  const orders = [
    { id: 1, state: 'sale', x_pms_reference: 'SMOOBU-170100009', x_checkin: '2026-10-31', x_checkout: '2026-10-31', amount_untaxed: 100000, amount_tax: 0, amount_total: 100000, invoice_ids: [] },
    { id: 2, state: 'sale', x_pms_reference: 'SMOOBU-170100010', x_checkin: '2026-10-31', x_checkout: '2026-11-02', amount_untaxed: 160000, amount_tax: 0, amount_total: 160000, invoice_ids: [77] },
  ];
  const roomSlots = [{ id: 11, name: false, role_id: [19, 'x'], start_datetime: '2026-10-31 20:00:00', end_datetime: '2026-11-02 16:00:00', state: 'published', sale_line_id: [20, 'x'] }];
  const dayuse = [{ id: 12, name: 'DAYUSE SMOOBU-170100009 COT/T/0009', role_id: [25, 'x'], resource_id: [31, 'x'], start_datetime: '2026-10-31 19:00:00', end_datetime: '2026-11-01 01:00:00', state: 'published' }];
  const oFetch = async (url, init) => {
    const [, , , model, method] = new URL(url).pathname.split('/'); const body = JSON.parse(init.body);
    odooCalls.push(`${init.method} ${model}/${method}`);
    if (method === 'fields_get') return ok(Object.fromEntries(F[model].map((f) => [f, { type: 'char' }])));
    if (model === 'planning.slot') return ok(JSON.stringify(body.domain).includes('DAYUSE') ? dayuse : roomSlots);
    if (model === 'sale.order') return ok(orders);
    if (model === 'sale.order.line') return ok([{ id: 10, order_id: [1, 'x'], product_template_id: [12136, 'x'], price_unit: 100000, x_precio_manual: 100000 }, { id: 20, order_id: [2, 'x'], product_template_id: [12139, 'x'], price_unit: 160000, x_precio_manual: 160000 }]);
    if (model === 'product.template') return ok([{ id: 12136, default_code: 'MAGIA-301', planning_role_id: [37, 'x'] }, { id: 12139, default_code: 'MAGIA-202', planning_role_id: [19, 'x'] }]);
    if (model === 'account.move') return ok([{ id: 77, state: 'posted', move_type: 'out_invoice', amount_total: 220000 }]);
    throw new Error(`no simulado: ${model}/${method}`);
  };
  const out = await runReconcileIds({
    smoobu: new SmoobuClient({ apiKey: 'k_prueba', apiSecret: 's_prueba', fetchImpl: sFetch }),
    odoo: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'prueba', apiKey: 'clave_prueba', fetchImpl: oFetch }),
    window,
  });
  assert.ok(smoobuCalls.every((c) => c === 'GET /api/reservations'));
  assert.ok(odooCalls.every((c) => /^POST [a-z._]+\/(fields_get|search_read)$/.test(c)), odooCalls.join(','));
  assert.ok(odooCalls.includes('POST account.move/search_read'));
  const v = Object.fromEntries(out.perReservation.map((r) => [r.smoobuId, [r.verdict, r.alerts]]));
  assert.deepEqual(v[170100009], ['DAYUSE_OK', []]);
  assert.deepEqual(v[170100010], ['MATCH', ['INVOICE_DIFF']]);
  assert.deepEqual([out.reads.odoo.writes, out.reads.odoo.dayuseSlotsRead, out.reads.odoo.invoicesRead], [0, 1, 1]);
  const text = JSON.stringify(toPublicReport(out));
  for (const banned of ['170100009', '170100010', 'DAYUSE SMOOBU', '220000', 'COT/T', 'k_prueba', 'clave_prueba']) assert.ok(!text.includes(banned), banned);
});
