import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileByIds, ALERTS } from '../src/id-reconcile.mjs';
import { toPublicReport } from '../src/public-report.mjs';
import { resolveWindow } from '../src/window.mjs';
import { assessBookingAmounts } from '../src/booking-amounts.mjs';
import { readBookingAmounts } from '../src/booking-amounts-read.mjs';
import { planSync, OPS, STATUS } from '../src/sync-intent.mjs';
import { planTotalCorrection, CORRECTION_BLOCKS } from '../src/booking-correction.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';

// ATH-DEV-138 — Conciliador por TOTAL del huesped en Booking. Datos SINTETICOS con la forma real del piloto.
const window = resolveWindow({ RECONCILE_FROM: '2026-11-01', RECONCILE_TO: '2026-11-30' });
const BOOKING = 7208046; const DIRECT = 7192171; const AIRBNB = 7208051;
const ID = 170138001;
const el = (id, type, name, amount, extra = {}) => ({ id, type, name, amount, quantity: 1, currencyCode: 'COP', priceIncludedInId: null, ...extra });
const REAL = [el(1, 'basePrice', 'Base price', 72000), el(2, 'commission', 'Commission', 10800), el(3, 'channelCustom', 'IVA', 13680, { quantity: null })];
const INCL = [el(1, 'basePrice', 'Base price', 72000), el(3, 'channelCustom', 'IVA', 11496, { priceIncludedInId: 1 })];
const bk = (extra = {}) => ({ id: ID, type: 'reservation', arrival: '2026-11-06', departure: '2026-11-07', apartment: { id: 3557506 }, channel: { id: BOOKING }, 'reference-id': '6200000009', price: 72000, ...extra });
const order = (extra = {}) => ({ id: 1, state: 'draft', x_pms_reference: `SMOOBU-${ID} / Booking 6200000009`, x_checkin: '2026-11-06', x_checkout: '2026-11-07', units: ['201'], lineIds: [10],
  lines: [{ price_unit: 85680, x_precio_manual: 85680 }], invoices: [], amount_untaxed: 85680, amount_tax: 0, amount_total: 85680, ...extra });
const amountsOf = (elements, booking = bk()) => new Map([[ID, assessBookingAmounts({ booking, elements })]]);
const alertsOf = (o, amounts = amountsOf(REAL), booking = bk()) => reconcileByIds({ bookings: [booking], window, orders: [o], slots: [], bookingAmounts: amounts }).perReservation[0].alerts;

test('Booking IVA ADICIONAL: pedido por el total 85.680 sin impuesto -> sin PRICE_DIFF ni TAX_MISSING; aviso de revision tributaria', () => {
  assert.deepEqual(alertsOf(order()), [ALERTS.REVISION_TRIBUTARIA]);
  // pedido antiguo con base + 19 % de Odoo (03839): coincide el total, sin avisos
  assert.deepEqual(alertsOf(order({ lines: [{ price_unit: 72000, x_precio_manual: 72000 }], amount_untaxed: 72000, amount_tax: 13680, amount_total: 85680 })), []);
  // piloto 03848 ANTES de corregir (72.000 sin impuesto): no coincide con el total del huesped
  assert.deepEqual(alertsOf(order({ lines: [{ price_unit: 72000, x_precio_manual: 72000 }], amount_untaxed: 72000, amount_total: 72000 })), [ALERTS.PRICE_DIFF, ALERTS.REVISION_TRIBUTARIA]);
  // IVA duplicado: base = total del huesped Y ademas impuesto de Odoo
  assert.deepEqual(alertsOf(order({ amount_tax: 16279.2, amount_total: 101959.2 })), [ALERTS.PRICE_DIFF, ALERTS.IVA_DUPLICADO]);
});

test('Booking IVA INCLUIDO y sin impuesto: el total es la tarifa; la comision NUNCA cuenta como importe del huesped', () => {
  assert.deepEqual(alertsOf(order({ lines: [{ price_unit: 72000, x_precio_manual: 72000 }], amount_untaxed: 72000, amount_total: 72000 }), amountsOf(INCL)), [ALERTS.REVISION_TRIBUTARIA]);
  assert.deepEqual(alertsOf(order({ lines: [{ price_unit: 72000, x_precio_manual: 72000 }], amount_untaxed: 72000, amount_total: 72000 }), amountsOf([REAL[0]])), []);
  // pedido que sumo la comision al total del huesped: diferencia de precio
  assert.deepEqual(alertsOf(order({ lines: [{ price_unit: 96480, x_precio_manual: 96480 }], amount_untaxed: 96480, amount_total: 96480 })), [ALERTS.PRICE_DIFF, ALERTS.REVISION_TRIBUTARIA]);
  const a = assessBookingAmounts({ booking: bk(), elements: REAL });
  assert.deepEqual([a.total, a.commission], [85680, 10800]);
});

test('total NO fiable o sin leer: reglas antiguas + aviso TOTAL_NO_FIABLE; Airbnb y directas sin cambios', () => {
  const legacy = order({ lines: [{ price_unit: 72000, x_precio_manual: 72000 }], amount_untaxed: 72000, amount_total: 72000 });
  assert.deepEqual(alertsOf(legacy, amountsOf(null)), [ALERTS.TOTAL_NO_FIABLE, ALERTS.TAX_MISSING]);
  assert.deepEqual(alertsOf(legacy, new Map()), [ALERTS.TAX_MISSING], 'sin desglose: exactamente como antes');
  assert.deepEqual(alertsOf(order(), new Map()), [ALERTS.PRICE_DIFF, ALERTS.TAX_MISSING], 'sin desglose el total parece distinto (como antes)');
  for (const ch of [DIRECT, AIRBNB]) {
    const b = bk({ channel: { id: ch } });
    // el desglose se ignora fuera de Booking: mismas reglas de siempre
    assert.deepEqual(alertsOf(legacy, amountsOf(REAL, b), b), []);
    assert.deepEqual(alertsOf(order(), amountsOf(REAL, b), b), [ALERTS.PRICE_DIFF]);
  }
});

test('lectura del desglose: solo Booking vigente; fallo = no fiable; sin funcion de lectura = reglas antiguas; con tope', async () => {
  const first = reconcileByIds({ bookings: [bk(), bk({ id: ID + 1, channel: { id: DIRECT }, 'reference-id': null, arrival: '2026-11-10', departure: '2026-11-11' })], window, orders: [order()], slots: [] });
  let calls = 0;
  const r = await readBookingAmounts({ async getPriceElements() { calls += 1; return REAL; } }, first, [bk()]);
  assert.deepEqual([r.requests, calls, r.amounts.get(ID).total, r.amounts.has(ID + 1)], [1, 1, 85680, false]);
  assert.deepEqual((await readBookingAmounts({}, first, [bk()])).amounts.size, 0);
  assert.equal((await readBookingAmounts({ async getPriceElements() { throw new Error('x'); } }, first, [bk()])).amounts.get(ID).ok, false);
  assert.equal((await readBookingAmounts({ async getPriceElements() { return REAL; } }, first, [bk()], { max: 0 })).amounts.get(ID).ok, false);
});

test('informe publico sin importes; desglose solo interno; reserva existente no se duplica; facturada y sobreventa bloqueadas', () => {
  const amounts = amountsOf(REAL);
  const rep = reconcileByIds({ bookings: [bk()], window, orders: [order()], slots: [], bookingAmounts: amounts });
  assert.deepEqual(rep.perReservation[0].bookingAmounts, { ok: true, base: 72000, tax: 13680, total: 85680, taxMode: 'ADICIONAL', commission: 10800, currency: 'COP' });
  const pub = JSON.stringify(toPublicReport(rep));
  for (const banned of ['72000', '13680', '85680', '10800', String(ID)]) assert.ok(!pub.includes(banned), banned);
  assert.ok(pub.includes('REVISION_TRIBUTARIA'));
  const extras = { orderInfo: new Map([[1, { client_order_ref: 'x', x_booking_source: 'booking_com', rental_start_date: 'x', rental_return_date: 'x', qtyInvoiced: 0, transactions: 0, writeDate: 'w' }]]), lineInfo: new Map([[10, { id: 10, price_unit: 85680, x_precio_manual: 85680 }]]), paymentsByOrder: new Map() };
  const plan = planSync({ report: rep, bookings: [bk()], orders: [order()], extras, today: '2026-11-01', amounts });
  assert.ok(!plan.ops.some((o) => o.op === OPS.CREATE_ORDER), 'ya existe: no se crea otro');
  assert.ok(!plan.ops.some((o) => o.guards.includes('TARIFA_DISTINTA')), 'el total del huesped no es "tarifa distinta"');
  const inv = order({ state: 'sale', invoices: [{ id: 3, state: 'posted', move_type: 'out_invoice', amount_total: 85680 }] });
  const repInv = reconcileByIds({ bookings: [bk()], window, orders: [inv], slots: [{ id: 5, role_id: [29, 'x'], start_datetime: '2026-11-06 20:00:00', end_datetime: '2026-11-07 16:00:00', sale_line_id: [10, 'x'] }], bookingAmounts: amounts });
  assert.deepEqual(repInv.perReservation[0].alerts, [ALERTS.REVISION_TRIBUTARIA], 'facturas que cuadran con el total: sin INVOICE_DIFF');
  assert.equal(planTotalCorrection({ order: { ...inv, invoice_ids: [3], x_booking_source: 'booking_com' }, lines: [{ id: 10, product_id: 57846, price_unit: 72000, x_precio_manual: 72000, tax_ids: [] }], booking: bk(), elements: REAL }).block, CORRECTION_BLOCKS.PEDIDO_NO_BORRADOR);
  const over = reconcileByIds({ bookings: [bk(), bk({ id: ID + 2, channel: { id: DIRECT }, 'reference-id': null })], window, orders: [], slots: [], bookingAmounts: amounts });
  const overPlan = planSync({ report: over, bookings: [bk(), bk({ id: ID + 2, channel: { id: DIRECT }, 'reference-id': null })], orders: [], extras: { orderInfo: new Map(), lineInfo: new Map(), paymentsByOrder: new Map() }, today: '2026-11-01', amounts });
  assert.deepEqual(over.perReservation.map((r) => r.verdict), ['MISSING_IN_ODOO', 'MISSING_IN_ODOO']);
  assert.ok(overPlan.ops.every((o) => o.status === STATUS.BLOQUEADO && o.guards.includes('SOBREVENTA')));
});

test('proteccion del precio manual y bloqueo DIAN: nada reescribe el precio aceptado ni emite documentos', () => {
  // precio manual distinto del unitario: aviso propio, y la correccion se niega (no adivina cual vale)
  assert.ok(alertsOf(order({ lines: [{ price_unit: 85680, x_precio_manual: 80000 }] })).includes(ALERTS.MANUAL_PRICE_DIFF));
  assert.equal(planTotalCorrection({ order: { ...order(), invoice_ids: [], x_booking_source: 'booking_com' }, lines: [{ id: 10, product_id: 57846, price_unit: 72000, x_precio_manual: 80000, tax_ids: [] }], booking: bk(), elements: REAL }).block, CORRECTION_BLOCKS.IMPORTE_ACTUAL_INESPERADO);
  assert.throws(() => validateWrite('sale.order.line', 'write', { ids: [10], vals: { price_unit: 85680 } }), /SYNC_WRITE_FIELD_FORBIDDEN/);
  for (const [m, f] of [['account.move', 'action_post'], ['account.move.send', 'action_send_and_print'], ['l10n_co_edi.document', 'create'], ['sale.order', '_create_invoices']]) assert.throws(() => validateWrite(m, f, { ids: [1] }), /SYNC_WRITE/);
});
