import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { RESULT } from '../src/sync-apply.mjs';
import { reconcileByIds } from '../src/id-reconcile.mjs';
import { planSync, toPublicPlan, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';
import { assessBookingAmounts, amountsNote, AMOUNT_BLOCKS, TAX_MODES } from '../src/booking-amounts.mjs';
import { readBookingAmounts } from '../src/sync-dryrun-run.mjs';
import { runAuto, autoWriter, shutdownReason } from '../src/sync-auto.mjs';
import { planTotalCorrection, validateCorrection, CORRECTION_BLOCKS } from '../src/booking-correction.mjs';

// ATH-DEV-137 — Datos SINTETICOS con la misma forma que el piloto (tarifa 72.000 + IVA 13.680 = 85.680; comision 10.800).
const BOOKING = 7208046; const APT201 = 3557506;
const ID = 170137001;
const el = (id, type, name, amount, extra = {}) => ({ id, type, name, amount, quantity: null, tax: null, currencyCode: 'COP', sortOrder: id, priceIncludedInId: null, ...extra });
const ADICIONAL = [el(1, 'basePrice', 'Base Price', 72000), el(2, 'addon', 'IVA', 13680)];
const INCLUIDO = [el(1, 'basePrice', 'Base Price', 72000), el(2, 'addon', 'IVA', 11496, { priceIncludedInId: 1 })];
const SIN = [el(1, 'basePrice', 'Base Price', 72000)];
const bk = (extra = {}) => ({ id: ID, type: 'reservation', arrival: '2026-11-06', departure: '2026-11-07', apartment: { id: APT201 }, channel: { id: BOOKING },
  'reference-id': '6200000001', 'guest-name': 'Ana Sintetica Ficticia', email: 'sintetica@guest.booking.invalid', phone: null, price: 72000, 'commission-included': 10800, adults: 2, ...extra });
const W = { from: '2026-11-01', to: '2026-11-30', nights: 30 };
const plan = (bookings, amounts, orders = [], extras = {}, slots = []) => {
  const report = reconcileByIds({ bookings, window: W, orders, slots });
  return { report, plan: planSync({ report, bookings, orders, extras: { orderInfo: new Map(), lineInfo: new Map(), paymentsByOrder: new Map(), ...extras }, today: '2026-11-01', slots, amounts }) };
};
const smoobuOf = (booking, elements) => ({ calls: 0, async getReservation() { return booking; }, async getPriceElements() { this.calls += 1; return typeof elements === 'function' ? elements() : elements; } });
function env() { const odoo = new FakeOdoo(); return { odoo, reader: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch }) }; }
const run = (e, p, smoobu, extra = {}) => runAuto({ plan: p, env: { SYNC_ENABLED: 'true' }, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu, journal: new Journal(), lock: new MemoryLock(), today: '2026-11-01', ...extra });

test('Booking con IVA ADICIONAL: pedido por el TOTAL 85.680, sin impuesto de Odoo, desglose y comision aparte en la nota', async () => {
  const a = assessBookingAmounts({ booking: bk(), elements: ADICIONAL });
  assert.deepEqual(a, { ok: true, base: 72000, tax: 13680, total: 85680, taxMode: TAX_MODES.ADICIONAL, commission: 10800, currency: 'COP' });
  const { plan: p } = plan([bk()], new Map([[ID, a]]));
  const [op] = p.ops;
  assert.deepEqual([op.op, op.status], [OPS.CREATE_ORDER, STATUS.LISTO]);
  assert.deepEqual([op.payload.lines[0].price_unit, op.payload.lines[0].x_precio_manual, op.payload.lines[0].tax_ids], [85680, 85680, []]);
  assert.deepEqual(op.payload.amounts, { base: 72000, tax: 13680, total: 85680, taxMode: 'ADICIONAL', commission: 10800, currency: 'COP' });
  const e = env();
  const r = await run(e, p, smoobuOf(bk(), ADICIONAL));
  assert.equal(r.results[0].result, RESULT.APLICADA, JSON.stringify(r));
  const [o] = e.odoo.t['sale.order']; const [l] = e.odoo.t['sale.order.line'];
  assert.deepEqual([o.state, l.price_unit, l.x_precio_manual, l.tax_ids], ['draft', 85680, 85680, []]);
  const note = e.odoo.t.notes[0].body;
  assert.match(note, /^ATH-SYNC \| clave [0-9a-f]{16} \| SMOOBU-170137001 \| CREATE_ORDER \| importes Booking COP: tarifa base 72000 ; impuestos 13680 \(adicional a la tarifa\) ; total huesped 85680 ; comision Booking 10800 \(no incluida en el total\)/);
  assert.deepEqual([e.odoo.t['planning.slot'].length, e.odoo.t['account.move'].length, e.odoo.t['account.payment'].length], [0, 0, 0]);
});

test('forma REAL de Smoobu (piloto): basePrice + commission + channelCustom IVA -> total 85.680, comision aparte', () => {
  const real = [el(1, 'basePrice', 'Base price', 72000, { quantity: 1 }), el(2, 'commission', 'Commission', 10800, { quantity: 1 }), el(3, 'channelCustom', 'IVA', 13680)];
  assert.deepEqual(assessBookingAmounts({ booking: bk({ 'commission-included': undefined }), elements: real }), { ok: true, base: 72000, tax: 13680, total: 85680, taxMode: TAX_MODES.ADICIONAL, commission: 10800, currency: 'COP' });
  // una comision marcada como incluida en otro elemento, o un channelCustom que no es impuesto, se bloquean
  assert.equal(assessBookingAmounts({ booking: bk(), elements: [real[0], { ...real[1], priceIncludedInId: 1 }, real[2]] }).block, AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO);
  assert.equal(assessBookingAmounts({ booking: bk(), elements: [real[0], el(4, 'channelCustom', 'Cleaning', 20000)] }).block, AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO);
});

test('Booking con IVA INCLUIDO en la tarifa y reserva SIN impuestos: el total es la tarifa; nunca se suma el impuesto otra vez', () => {
  const inc = assessBookingAmounts({ booking: bk(), elements: INCLUIDO });
  assert.deepEqual([inc.ok, inc.taxMode, inc.base, inc.tax, inc.total], [true, TAX_MODES.INCLUIDO, 72000, 11496, 72000]);
  const sin = assessBookingAmounts({ booking: bk({ 'commission-included': null }), elements: SIN });
  assert.deepEqual([sin.ok, sin.taxMode, sin.tax, sin.total, sin.commission], [true, TAX_MODES.SIN_IMPUESTO, 0, 72000, null]);
  assert.match(amountsNote(sin), /comision Booking no disponible/);
  for (const a of [inc, sin]) {
    const { plan: p } = plan([bk()], new Map([[ID, a]]));
    assert.deepEqual([p.ops[0].op, p.ops[0].payload.lines[0].price_unit, p.ops[0].payload.lines[0].tax_ids], [OPS.CREATE_ORDER, 72000, []]);
  }
});

test('total DESCONOCIDO o no fiable: la reserva se BLOQUEA y no se calcula nada (ni 19 % propio)', async () => {
  const cases = [
    [null, AMOUNT_BLOCKS.TOTAL_DESCONOCIDO], [[], AMOUNT_BLOCKS.TOTAL_DESCONOCIDO], [[el(2, 'addon', 'IVA', 13680)], AMOUNT_BLOCKS.TOTAL_DESCONOCIDO],
    [[el(1, 'basePrice', 'x', 72000, { currencyCode: 'USD' })], AMOUNT_BLOCKS.MONEDA_NO_COP],
    [[el(1, 'basePrice', 'x', 72000), el(3, 'cleaningFee', 'Limpieza', 10000)], AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO],
    [[el(1, 'basePrice', 'x', 72000), el(3, 'addon', 'Desayuno', 10000)], AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO],
    [[el(1, 'basePrice', 'x', 72000), el(3, 'coupon', 'Cupon', 5000)], AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO],
    [[el(1, 'basePrice', 'x', 70000)], AMOUNT_BLOCKS.BASE_NO_COINCIDE],
    [[el(1, 'basePrice', 'x', 72000.123)], AMOUNT_BLOCKS.IMPORTE_INVALIDO], [[el(1, 'basePrice', 'x', '72000')], AMOUNT_BLOCKS.IMPORTE_INVALIDO],
    [[el(1, 'basePrice', 'x', 72000, { quantity: 2 })], AMOUNT_BLOCKS.CANTIDAD_NO_SOPORTADA],
    [[el(1, 'basePrice', 'x', 72000), el(2, 'addon', 'IVA', 100, { priceIncludedInId: 1 }), el(3, 'addon', 'IVA', 100)], AMOUNT_BLOCKS.IMPUESTO_MIXTO],
    [[el(1, 'basePrice', 'x', 72000), el(2, 'addon', 'IVA', 100, { priceIncludedInId: 99 })], AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO],
  ];
  for (const [elements, code] of cases) assert.deepEqual(assessBookingAmounts({ booking: bk(), elements }), { ok: false, block: code }, code);
  // sin lectura de importes (o con fallo de lectura) el plan BLOQUEA la creacion de Booking
  const { plan: p } = plan([bk()], new Map());
  assert.deepEqual([p.ops[0].op, p.ops[0].status, p.ops[0].guards], [OPS.BLOCKED, STATUS.BLOQUEADO, [GUARDS.TOTAL_NO_FIABLE]]);
  const { report } = plan([bk()], new Map());
  const failing = { async getPriceElements() { throw new Error('caida'); } };
  const read = await readBookingAmounts(failing, report, [bk()]);
  assert.deepEqual([read.requests, read.amounts.get(ID)], [1, { ok: false, block: AMOUNT_BLOCKS.TOTAL_DESCONOCIDO }]);
  const { plan: p2 } = plan([bk()], read.amounts);
  assert.deepEqual(p2.ops[0].guards, [GUARDS.TOTAL_NO_FIABLE, AMOUNT_BLOCKS.TOTAL_DESCONOCIDO]);
  // las reservas que no son de Booking no leen elementos de precio
  const direct = await readBookingAmounts(smoobuOf(null, ADICIONAL), plan([bk({ channel: { id: 7192171 } })], new Map()).report, [bk({ channel: { id: 7192171 } })]);
  assert.equal(direct.requests, 0);
});

test('prevencion de duplicados e idempotencia: segunda ejecucion no crea; importes cambiados en Smoobu = parada sin escribir', async () => {
  const a = assessBookingAmounts({ booking: bk(), elements: ADICIONAL });
  const e = env();
  const p1 = plan([bk()], new Map([[ID, a]])).plan;
  assert.equal((await run(e, p1, smoobuOf(bk(), ADICIONAL))).results[0].result, RESULT.APLICADA);
  // misma reserva, bitacora nueva, plan VIEJO: el pedido ya existe -> duplicado detectado, nada nuevo
  const again = await run(e, p1, smoobuOf(bk(), ADICIONAL));
  assert.deepEqual([again.halted, again.results[0].code, e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], ['DUPLICADO_DETECTADO', 'PEDIDO_YA_EXISTE', 1, 1]);
  // plan recalculado desde Odoo: la reserva ya esta emparejada y no se vuelve a crear
  const orders = e.odoo.t['sale.order'].map((o) => ({ ...o, units: ['201'], lineIds: e.odoo.t['sale.order.line'].filter((l) => l.order_id === o.id).map((l) => l.id), lines: [{ price_unit: 85680, x_precio_manual: 85680 }], invoices: [], amount_untaxed: 85680, amount_tax: 0, amount_total: 85680 }));
  const p2 = plan([bk()], new Map([[ID, a]]), orders).plan;
  assert.ok(!p2.ops.some((o) => o.op === OPS.CREATE_ORDER));
  assert.equal(plan([bk()], new Map([[ID, a]])).plan.ops[0].key, p1.ops[0].key, 'misma reserva + mismos importes = misma clave');
  // el desglose cambia entre el plan y la escritura: no escribe y apaga (cambio inesperado)
  const e2 = env();
  const changed = await run(e2, p1, smoobuOf(bk(), [el(1, 'basePrice', 'Base Price', 72000), el(2, 'addon', 'IVA', 13000)]));
  assert.deepEqual([changed.halted, changed.results[0].code, e2.odoo.t['sale.order'].length, shutdownReason({ run: changed, report: {} })], ['CAMBIO_INESPERADO', 'IMPORTES_CAMBIARON_EN_SMOOBU', 0, 'CAMBIO_INESPERADO']);
  const gone = await run(env(), p1, smoobuOf(bk(), null));
  assert.deepEqual([gone.halted, gone.results[0].code], ['CAMBIO_INESPERADO', AMOUNT_BLOCKS.TOTAL_DESCONOCIDO]);
});

test('reserva previamente FACTURADA y SOBREVENTA: nunca se escriben, con total fiable o sin el', () => {
  const a = assessBookingAmounts({ booking: bk(), elements: ADICIONAL });
  const order = { id: 9, state: 'sale', x_pms_reference: `SMOOBU-${ID}`, x_checkin: '2026-11-06', x_checkout: '2026-11-07', amount_untaxed: 72000, amount_tax: 0, amount_total: 72000, units: ['201'], lineIds: [90], lines: [{ price_unit: 72000, x_precio_manual: 0 }], invoices: [{ id: 1, state: 'posted', move_type: 'out_invoice', amount_total: 72000 }] };
  const { plan: inv } = plan([bk()], new Map([[ID, a]]), [order], { orderInfo: new Map([[9, { client_order_ref: 'x', x_booking_source: 'booking_com', rental_start_date: 'x', rental_return_date: 'x', qtyInvoiced: 1, transactions: 0 }]]), lineInfo: new Map([[90, { id: 90, price_unit: 72000, x_precio_manual: 0 }]]) },
    [{ id: 5, role_id: [29, 'x'], start_datetime: '2026-11-06 20:00:00', end_datetime: '2026-11-07 16:00:00', sale_line_id: [90, 'x'] }]);
  assert.equal(inv.ops[0].verdict, 'MATCH');
  assert.deepEqual([inv.ops[0].status, inv.ops[0].guards.includes(GUARDS.PEDIDO_FACTURADO)], [STATUS.BLOQUEADO, true]);
  const other = bk({ id: ID + 1, 'reference-id': '6200000002', channel: { id: 7192171 } });
  const { plan: over } = plan([bk(), other], new Map([[ID, a]]));
  assert.ok(over.ops.every((o) => o.status === STATUS.BLOQUEADO && o.guards.includes(GUARDS.SOBREVENTA)), JSON.stringify(over.ops.map((o) => o.guards)));
});

test('bloqueo de emision DIAN: ni el escritor automatico ni la lista blanca permiten facturas, envios DIAN, pagos ni asientos', async () => {
  const w = autoWriter(new RecordingWriter(), { maxOps: 1 });
  const forbidden = [['account.move', 'create'], ['account.move', 'action_post'], ['account.move', 'action_send_and_print'], ['account.move.send', 'action_send_and_print'],
    ['account.move.send.wizard', 'action_send_and_print'], ['l10n_co_edi.document', 'create'], ['account.edi.document', 'create'], ['account.payment', 'create'], ['account.payment.register', 'action_create_payments'],
    ['sale.order', '_create_invoices'], ['sale.order', 'action_invoice_create'], ['sale.advance.payment.inv', 'create_invoices'], ['sale.order', 'action_confirm'], ['planning.slot', 'create']];
  for (const [m, f] of forbidden) {
    await assert.rejects(w.execute(m, f, { ids: [1], vals: {} }), /SYNC_WRITE_AUTO_METHOD_FORBIDDEN/, `${m}.${f}`);
    assert.throws(() => validateWrite(m, f, { ids: [1], vals: {} }), /SYNC_WRITE_(FINANCIAL_MODEL_FORBIDDEN|NOT_ALLOWED)|SYNC_WRITE_ONE_RECORD_ONLY|SYNC_WRITE/, `${m}.${f}`);
  }
  // la lista blanca general sigue sin permitir cambiar price_unit en un pedido existente
  assert.throws(() => validateWrite('sale.order.line', 'write', { ids: [1], vals: { price_unit: 85680, x_precio_manual: 85680 } }), /SYNC_WRITE_FIELD_FORBIDDEN/);
  // y ningun impuesto de Odoo en la linea creada (evita duplicar el IVA de Booking)
  const vals = { partner_id: 1, x_pms_reference: `SMOOBU-${ID}`, order_line: [[0, 0, { product_id: 57846, product_uom_qty: 1, price_unit: 85680, x_precio_manual: 85680, tax_ids: [[6, 0, [251]]] }]] };
  assert.throws(() => validateWrite('sale.order', 'create', { vals_list: [vals] }), /SYNC_WRITE_TAXES_NOT_ALLOWED/);
});

test('trazabilidad y conservacion de importes: plan publico sin importes; correccion PREPARADA de 03848 a 85.680 (simulada)', async () => {
  const a = assessBookingAmounts({ booking: bk(), elements: ADICIONAL });
  const { plan: p } = plan([bk()], new Map([[ID, a]]));
  const pub = JSON.stringify(toPublicPlan(p));
  for (const banned of ['72000', '13680', '85680', '10800', 'Ana Sintetica', String(ID)]) assert.ok(!pub.includes(banned), banned);
  // pedido piloto sintetico: borrador, linea en la tarifa base, sin impuestos
  const order = { id: 22193, name: 'COT/2026/03848', state: 'draft', x_booking_source: 'booking_com', x_pms_reference: `SMOOBU-${ID} / Booking 6200000001`, invoice_ids: [] };
  const line = { id: 31250, product_id: [57846, 'MAGIA-201'], price_unit: 72000, x_precio_manual: 72000, tax_ids: [], qty_invoiced: 0 };
  const c = planTotalCorrection({ order, lines: [line], booking: bk(), elements: ADICIONAL });
  assert.deepEqual([c.ok, c.noop, c.before, c.after, c.odooTaxes], [true, false, { price_unit: 72000, x_precio_manual: 72000 }, { price_unit: 85680, x_precio_manual: 85680 }, []]);
  assert.deepEqual(c.writes.map(([m, f]) => `${m}.${f}`), ['sale.order.line.write', 'sale.order.message_post']);
  assert.ok(validateCorrection(c, { orderId: 22193, lineId: 31250 }));
  assert.ok(!validateCorrection({ writes: [...c.writes, ['account.move', 'create', {}]] }, { orderId: 22193, lineId: 31250 }));
  assert.ok(!validateCorrection({ writes: [['sale.order.line', 'write', { ids: [31250], vals: { price_unit: 85680, x_precio_manual: 85680, tax_ids: [[6, 0, [251]]] } }], c.writes[1]] }, { orderId: 22193, lineId: 31250 }));
  assert.match(c.writes[1][2].body, /^ATH-SYNC \| correccion total Booking \| SMOOBU-170137001 \| UPDATE_LINE_TOTAL \| antes 72000 -> despues 85680 \| importes Booking COP: tarifa base 72000 ; impuestos 13680/);
  // simulacion sobre Odoo en memoria: total 85.680, sin impuesto, sin turno, factura ni pago
  const odoo = new FakeOdoo({ 'sale.order': [{ ...order }], 'sale.order.line': [{ ...line, order_id: 22193, tax_ids: [] }] });
  for (const [m, f, params] of c.writes) {
    if (m === 'sale.order.line') Object.assign(odoo.t['sale.order.line'].find((x) => x.id === params.ids[0]), params.vals);
    else odoo.t.notes.push({ id: params.ids[0], body: params.body });
  }
  const [after] = odoo.t['sale.order.line'];
  assert.deepEqual([after.price_unit, after.x_precio_manual, after.tax_ids, odoo.t['planning.slot'].length, odoo.t['account.move'].length, odoo.t['account.payment'].length, odoo.t['sale.order'][0].state], [85680, 85680, [], 0, 0, 0, 'draft']);
  // idempotente: ya corregido -> nada que hacer; y se niega en pedidos confirmados, facturados, con impuesto o con otro importe
  assert.deepEqual(planTotalCorrection({ order, lines: [after], booking: bk(), elements: ADICIONAL }).code, 'YA_CORREGIDO');
  for (const [o, l, code] of [[{ ...order, state: 'sale' }, line, CORRECTION_BLOCKS.PEDIDO_NO_BORRADOR], [{ ...order, invoice_ids: [5] }, line, CORRECTION_BLOCKS.PEDIDO_FACTURADO],
    [order, { ...line, tax_ids: [251] }, CORRECTION_BLOCKS.LINEA_CON_IMPUESTOS], [order, { ...line, price_unit: 60000, x_precio_manual: 60000 }, CORRECTION_BLOCKS.IMPORTE_ACTUAL_INESPERADO],
    [{ ...order, x_booking_source: 'direct' }, line, CORRECTION_BLOCKS.NO_ES_BOOKING], [{ ...order, x_pms_reference: 'SMOOBU-170137999' }, line, CORRECTION_BLOCKS.REFERENCIA_NO_COINCIDE]]) {
    assert.equal(planTotalCorrection({ order: o, lines: [l], booking: bk(), elements: ADICIONAL }).block, code, code);
  }
  assert.equal(planTotalCorrection({ order, lines: [line], booking: bk(), elements: null }).block, AMOUNT_BLOCKS.TOTAL_DESCONOCIDO);
});
