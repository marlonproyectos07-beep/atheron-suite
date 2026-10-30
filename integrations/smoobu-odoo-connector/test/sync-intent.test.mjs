import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileByIds } from '../src/id-reconcile.mjs';
import { planSync, toPublicPlan, buildCreatePayload, referenceFor, OPS, STATUS, GUARDS, PRODUCT_BY_UNIT } from '../src/sync-intent.mjs';
import { readSyncExtras, runSyncDryRun } from '../src/sync-dryrun-run.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { assertPublicSafe } from '../src/public-report.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-DEV-115 — Datos SINTETICOS: ids 17xxxxxxx, nombres, correos e importes inventados.
const APT = { 201: 3557506, 202: 3557511, 203: 3557516, 301: 3557521, 302: 3557526, CASA: 3557501 };
const CH = { DIRECTA: 7192171, BOOKING: 7208046, AIRBNB: 7208051 };
const ROLE = { 201: 29, 202: 19, 203: 30, 301: 37, 302: 18, CASA: 69 };
const TMPL = { 201: 12135, 202: 12139, 302: 12141 };
const W = { from: '2026-11-01', to: '2026-11-30', nights: 30 };
const TODAY = '2026-11-05';
const bk = (id, unit, arrival, departure, extra = {}) => ({ id, type: 'reservation', arrival, departure, apartment: { id: APT[unit] }, channel: { id: CH.DIRECTA },
  'guest-name': 'NOMBRE_SINTETICO', email: 'sintetico@example.invalid', phone: '+00 000 0000', price: 100000, ...extra });
const order = (id, sid, unit, checkin, checkout, extra = {}) => ({ id, state: 'sale', x_pms_reference: `SMOOBU-${sid}`, x_checkin: checkin, x_checkout: checkout,
  amount_untaxed: 100000, amount_tax: 0, amount_total: 100000, units: [unit], lineIds: [id * 10], lines: [{ price_unit: 100000, x_precio_manual: 100000 }], invoices: [], ...extra });
const slot = (id, unit, from, to, lineId) => ({ id, role_id: [ROLE[unit], 'x'], start_datetime: `${from} 20:00:00`, end_datetime: `${to} 16:00:00`, sale_line_id: lineId ? [lineId, 'x'] : false });
const info = (extra = {}) => ({ client_order_ref: 'Smoobu x', x_booking_source: 'direct', rental_start_date: 'x', rental_return_date: 'x', transactions: 0, qtyInvoiced: 0, ...extra });
const line = (id, extra = {}) => ({ id, price_unit: 100000, x_precio_manual: 100000, taxes: 0, ...extra });

function plan({ bookings, orders = [], slots = [], orderInfo = {}, lineInfo = {}, payments = {}, today = TODAY, watchAlerts = [] }) {
  const report = reconcileByIds({ bookings, window: W, orders, slots });
  const extras = { orderInfo: new Map(Object.entries(orderInfo).map(([k, v]) => [Number(k), v])), lineInfo: new Map(Object.entries(lineInfo).map(([k, v]) => [Number(k), v])), paymentsByOrder: new Map(Object.entries(payments).map(([k, v]) => [Number(k), v])) };
  return planSync({ report, bookings, orders, extras, today, slots, watchAlerts });
}
const opOf = (p, id) => p.ops.find((o) => o.smoobuId === id);

test('reserva que falta: CREATE_ORDER LISTO con precio manual = precio de Smoobu, referencia unica y borrador sin impuesto', () => {
  const p = plan({ bookings: [bk(170300001, '302', '2026-11-14', '2026-11-15', { channel: { id: CH.AIRBNB }, 'reference-id': 'HMSINTET01', price: 90100 })] });
  const o = opOf(p, 170300001);
  assert.deepEqual([o.op, o.status], [OPS.CREATE_ORDER, STATUS.LISTO]);
  assert.ok(o.guards.includes(GUARDS.IMPUESTO_PENDIENTE));
  assert.equal(o.payload.state, 'draft');
  assert.deepEqual(o.payload.lines, [{ product_id: PRODUCT_BY_UNIT[302], product_uom_qty: 1, price_unit: 90100, x_precio_manual: 90100, tax_ids: [] }]);
  assert.equal(o.payload.order.x_pms_reference, 'SMOOBU-170300001 / Airbnb HMSINTET01');
  assert.equal(o.payload.order.x_booking_source, 'airbnb');
  assert.deepEqual([o.payload.order.rental_start_date, o.payload.order.rental_return_date], ['2026-11-14 20:00:00', '2026-11-15 16:00:00']);
  assert.ok(o.preconditions.includes('NINGUN_PEDIDO_CON_SMOOBU_ID'));
});

test('crear se bloquea: Casa sin producto, precio 0, canal desconocido y noches ya ocupadas sin ID', () => {
  const p = plan({
    bookings: [bk(170300002, 'CASA', '2026-11-20', '2026-11-21'), bk(170300003, '201', '2026-11-03', '2026-11-04', { price: 0 }),
      bk(170300004, '202', '2026-11-03', '2026-11-04', { channel: { id: 999 } }), bk(170300005, '203', '2026-11-10', '2026-11-11')],
    slots: [slot(1, '203', '2026-11-10', '2026-11-11', null)],
  });
  assert.ok(opOf(p, 170300002).guards.includes(GUARDS.CASA_REPARTO_PENDIENTE));
  assert.ok(opOf(p, 170300003).guards.includes(GUARDS.PRECIO_FALTANTE));
  assert.ok(opOf(p, 170300004).guards.includes(GUARDS.CANAL_DESCONOCIDO));
  assert.deepEqual([opOf(p, 170300005).op, opOf(p, 170300005).guards], [OPS.BLOCKED, [GUARDS.AMBIGUA]]); // ocupado sin ID = AMBIGUOUS
  for (const id of [170300002, 170300003, 170300004]) assert.deepEqual([opOf(p, id).op, opOf(p, id).status], [OPS.BLOCKED, STATUS.BLOQUEADO]);
});

test('sobreventa en Smoobu: ninguna de las dos reservas se crea', () => {
  const p = plan({ bookings: [bk(170300010, '301', '2026-11-12', '2026-11-13'), bk(170300011, 'CASA', '2026-11-12', '2026-11-13')] });
  for (const id of [170300010, 170300011]) { assert.equal(opOf(p, id).op, OPS.BLOCKED); assert.ok(opOf(p, id).guards.includes(GUARDS.SOBREVENTA)); }
});

test('pedido conciliado sin precio manual ni canal: UPDATE_ORDER LISTO que solo rellena; nunca toca price_unit ni fechas', () => {
  const p = plan({ bookings: [bk(170300020, '201', '2026-11-07', '2026-11-08')], orders: [order(20, 170300020, '201', '2026-11-07', '2026-11-08')],
    slots: [slot(2, '201', '2026-11-07', '2026-11-08', 200)], orderInfo: { 20: info({ x_booking_source: null }) }, lineInfo: { 200: line(200, { x_precio_manual: 0 }) } });
  const o = opOf(p, 170300020);
  assert.deepEqual([o.op, o.status], [OPS.UPDATE_ORDER, STATUS.LISTO]);
  assert.deepEqual(o.payload, { order: { x_booking_source: 'direct' }, line: { lineId: 200, x_precio_manual: 100000 } });
  assert.ok(!JSON.stringify(o.payload).includes('price_unit') && !JSON.stringify(o.payload).includes('x_checkin'));
});

test('pedido conciliado completo: NOOP; con tarifa distinta se BLOQUEA y no se corrige', () => {
  const ok = plan({ bookings: [bk(170300030, '201', '2026-11-07', '2026-11-08')], orders: [order(30, 170300030, '201', '2026-11-07', '2026-11-08')],
    slots: [slot(3, '201', '2026-11-07', '2026-11-08', 300)], orderInfo: { 30: info() }, lineInfo: { 300: line(300) } });
  assert.deepEqual([opOf(ok, 170300030).op, opOf(ok, 170300030).status], [OPS.NOOP, STATUS.SIN_CAMBIOS]);
  const diff = plan({ bookings: [bk(170300031, '201', '2026-11-07', '2026-11-08', { price: 120000 })], orders: [order(31, 170300031, '201', '2026-11-07', '2026-11-08', { lines: [{ price_unit: 100000, x_precio_manual: 0 }] })],
    slots: [slot(4, '201', '2026-11-07', '2026-11-08', 310)], orderInfo: { 31: info() }, lineInfo: { 310: line(310, { x_precio_manual: 0 }) } });
  const d = opOf(diff, 170300031);
  assert.equal(d.status, STATUS.BLOQUEADO); assert.ok(d.guards.includes(GUARDS.TARIFA_DISTINTA)); assert.equal(d.payload, null);
});

test('borrador completo: CONFIRM_ORDER siempre con aprobacion mientras la politica de impuestos este pendiente', () => {
  const p = plan({ bookings: [bk(170300040, '202', '2026-11-03', '2026-11-05')], orders: [order(40, 170300040, '202', '2026-11-03', '2026-11-05', { state: 'draft' })],
    orderInfo: { 40: info() }, lineInfo: { 400: line(400) } });
  const o = opOf(p, 170300040);
  assert.deepEqual([o.op, o.status], [OPS.CONFIRM_ORDER, STATUS.REQUIERE_APROBACION]);
  assert.ok(o.guards.includes(GUARDS.IMPUESTO_PENDIENTE));
});

test('cancelacion: nunca LISTO; con aprobacion solo si la estancia no empezo y no hay facturas ni pagos', () => {
  const canc = (id, oid, arrival, departure, opts = {}) => plan({ bookings: [bk(id, '302', arrival, departure, { type: 'cancellation' })],
    orders: [order(oid, id, '302', arrival, departure, opts.order)], orderInfo: { [oid]: info(opts.info) }, payments: { [oid]: opts.payments ?? 0 }, lineInfo: {} });
  const future = opOf(canc(170300050, 50, '2026-11-20', '2026-11-21'), 170300050);
  assert.deepEqual([future.op, future.status], [OPS.CANCEL_ORDER, STATUS.REQUIERE_APROBACION]);
  assert.ok(future.preconditions.includes('CONFIRMACION_HUMANA_DE_QUE_NO_SE_ALOJO'));
  // caso 302 del 30/10: cancelada en Smoobu el mismo dia de llegada -> no se cancela sin una persona
  const sameDay = opOf(canc(170300051, 51, TODAY, '2026-11-06'), 170300051);
  assert.deepEqual([sameDay.op, sameDay.guards], [OPS.BLOCKED, [GUARDS.ESTANCIA_INICIADA]]);
  assert.ok(opOf(canc(170300052, 52, '2026-11-20', '2026-11-21', { payments: 1 }), 170300052).guards.includes(GUARDS.PAGOS_EXISTENTES));
  assert.ok(opOf(canc(170300053, 53, '2026-11-20', '2026-11-21', { order: { invoices: [{ state: 'posted', move_type: 'out_invoice', amount_total: 100000 }] } }), 170300053).guards.includes(GUARDS.PEDIDO_FACTURADO));
  assert.ok(opOf(canc(170300054, 54, '2026-11-20', '2026-11-21', { info: { transactions: 1 } }), 170300054).guards.includes(GUARDS.PAGOS_EXISTENTES));
});

test('cambio de fechas: con aprobacion si las noches nuevas estan libres; bloqueado si hay factura, otro turno o tarifa distinta', () => {
  const base = { bookings: [bk(170300060, '201', '2026-11-12', '2026-11-13')], orders: [order(60, 170300060, '201', '2026-11-10', '2026-11-11')], orderInfo: { 60: info() } };
  const free = opOf(plan(base), 170300060);
  assert.deepEqual([free.op, free.status], [OPS.UPDATE_ORDER, STATUS.REQUIERE_APROBACION]);
  assert.deepEqual(free.payload.order, { x_checkin: '2026-11-12', x_checkout: '2026-11-13', rental_start_date: '2026-11-12 20:00:00', rental_return_date: '2026-11-13 16:00:00' });
  const taken = opOf(plan({ ...base, slots: [slot(6, '201', '2026-11-12', '2026-11-13', 999)] }), 170300060);
  assert.ok(taken.status === STATUS.BLOQUEADO);
  const inv = opOf(plan({ ...base, orders: [order(60, 170300060, '201', '2026-11-10', '2026-11-11', { invoices: [{ state: 'posted', move_type: 'out_invoice', amount_total: 100000 }] })] }), 170300060);
  assert.ok(inv.guards.includes(GUARDS.PEDIDO_FACTURADO));
  const price = opOf(plan({ ...base, bookings: [bk(170300060, '201', '2026-11-12', '2026-11-13', { price: 150000 })] }), 170300060);
  assert.ok(price.guards.includes(GUARDS.TARIFA_DISTINTA));
});

test('cambio de habitacion, pedido cancelado con reserva vigente y referencia ajena: siempre BLOQUEADO', () => {
  const room = plan({ bookings: [bk(170300070, '202', '2026-11-12', '2026-11-13')], orders: [order(70, 170300070, '201', '2026-11-12', '2026-11-13')], orderInfo: { 70: info() } });
  assert.ok(opOf(room, 170300070).guards.includes(GUARDS.CAMBIO_DE_HABITACION));
  const reac = plan({ bookings: [bk(170300071, '202', '2026-11-12', '2026-11-13')], orders: [order(71, 170300071, '202', '2026-11-12', '2026-11-13', { state: 'cancel' })], orderInfo: { 71: info() } });
  assert.ok(opOf(reac, 170300071).guards.includes(GUARDS.CANCELADA_EN_ODOO_VIGENTE_EN_SMOOBU));
});

test('invariantes: solo CREATE/UPDATE pueden quedar LISTO; CANCEL y CONFIRM nunca; todo plan declara 0 aplicadas', () => {
  const p = plan({ bookings: [bk(170300080, '201', '2026-11-20', '2026-11-21', { type: 'cancellation' }), bk(170300081, '302', '2026-11-22', '2026-11-23')],
    orders: [order(80, 170300080, '201', '2026-11-20', '2026-11-21')], orderInfo: { 80: info() } });
  for (const o of p.ops) if (o.status === STATUS.LISTO) assert.ok([OPS.CREATE_ORDER, OPS.UPDATE_ORDER].includes(o.op));
  assert.ok(p.ops.every((o) => !(o.op === OPS.CANCEL_ORDER && o.status === STATUS.LISTO)));
  assert.deepEqual(p.safety, { writesEnabled: false, releaseUnlocked: false, applied: 0, mode: 'PLAN_SOLO_LECTURA' });
});

test('idempotencia: misma entrada = mismas claves; una reserva ya creada (MATCH) no vuelve a planificar CREATE', () => {
  const input = { bookings: [bk(170300090, '302', '2026-11-22', '2026-11-23')] };
  assert.equal(opOf(plan(input), 170300090).key, opOf(plan(input), 170300090).key);
  const after = plan({ ...input, orders: [order(90, 170300090, '302', '2026-11-22', '2026-11-23')], slots: [slot(9, '302', '2026-11-22', '2026-11-23', 900)], orderInfo: { 90: info() }, lineInfo: { 900: line(900) } });
  assert.equal(opOf(after, 170300090).op, OPS.NOOP);
});

test('vista publica: IDs enmascarados, solo nombres de campos; sin nombres, correos, telefonos ni importes', () => {
  const p = plan({ bookings: [bk(170300100, '302', '2026-11-22', '2026-11-23', { price: 87654, channel: { id: CH.BOOKING }, 'reference-id': '5409999999' })] });
  const text = JSON.stringify(toPublicPlan(p));
  for (const banned of ['NOMBRE_SINTETICO', 'sintetico@', '+00 000', '87654', '170300100', '5409999999', '"payload"']) assert.ok(!text.includes(banned), banned);
  assert.match(text, /SM\*\.\.\.0100/); assert.match(text, /line\.x_precio_manual/);
  assert.ok(assertPublicSafe(text, { identifiers: ['170300100', '5409999999', 'NOMBRE_SINTETICO'] }).safe);
});

test('referencia y payload: formato de los pedidos hechos a mano (03839/03845/03846)', () => {
  assert.deepEqual(referenceFor({ smoobuId: 1, source: 'booking_com', otaRef: '9' }), { x_pms_reference: 'SMOOBU-1 / Booking 9', client_order_ref: 'Smoobu 1 / Booking 9' });
  assert.deepEqual(referenceFor({ smoobuId: 2, source: 'direct', otaRef: null }), { x_pms_reference: 'SMOOBU-2', client_order_ref: 'Smoobu 2' });
  const pl = buildCreatePayload({ smoobuId: 3, unit: '301', arrival: '2026-11-01', departure: '2026-11-03', source: 'direct', price: 200000, guest: { name: 'N', email: null } });
  assert.equal(pl.partner.match, 'ninguno'); assert.equal(pl.lines[0].product_id, 57845); assert.equal(pl.lines[0].product_uom_qty, 1);
  const casa = buildCreatePayload({ smoobuId: 4, unit: 'CASA', arrival: '2026-11-01', departure: '2026-11-02', source: 'direct', price: 500000, guest: {} });
  assert.deepEqual(casa.lines.map((l) => l.product_id), [57846, 57848, 57849, 57845, 57847]); // cinco habitaciones, ningun sexto producto
  assert.ok(casa.lines.every((l) => l.price_unit === null)); // sin reparto definido no hay precios inventados
});

// ---- lecturas reales simuladas: solo fields_get/search_read ----
const ok = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => data, text: async () => JSON.stringify(data) });
function fakeOdoo({ orders = [], lines = [], slots = [], payments = [] }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const [, , , model, method] = new URL(url).pathname.split('/'); const body = JSON.parse(init.body);
    calls.push(`${model}/${method}`);
    if (method === 'fields_get') return ok(Object.fromEntries(['id', 'name', 'state', 'partner_id', 'client_order_ref', 'x_booking_source', 'rental_start_date', 'rental_return_date', 'transaction_ids', 'write_date',
      'x_pms_reference', 'x_checkin', 'x_checkout', 'amount_untaxed', 'amount_tax', 'amount_total', 'invoice_ids', 'order_id', 'product_template_id', 'price_unit', 'x_precio_manual', 'qty_invoiced', 'tax_ids',
      'role_id', 'start_datetime', 'end_datetime', 'sale_line_id', 'default_code', 'planning_role_id', 'move_type', 'resource_id'].map((f) => [f, { type: 'char' }])));
    if (model === 'planning.slot') return ok(JSON.stringify(body.domain).includes('DAYUSE') ? [] : slots);
    if (model === 'sale.order') return ok(orders);
    if (model === 'sale.order.line') return ok(lines);
    if (model === 'product.template') return ok(Object.entries(TMPL).map(([u, id]) => ({ id, default_code: `MAGIA-${u}`, planning_role_id: [ROLE[u], 'x'] })));
    if (model === 'account.move') return ok([]);
    if (model === 'account.payment') return ok(payments);
    throw new Error(`no simulado ${model}/${method}`);
  };
  return { calls, client: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'clave_prueba', fetchImpl }) };
}

test('readSyncExtras: solo lecturas, pagos solo para candidatos a cancelacion y tope de resultados', async () => {
  const f = fakeOdoo({ orders: [{ id: 5, partner_id: [7, 'x'], transaction_ids: [], client_order_ref: false }], lines: [{ id: 50, order_id: [5, 'x'], price_unit: 1, x_precio_manual: 0, qty_invoiced: 0, tax_ids: [] }], payments: [{ id: 1, partner_id: [7, 'x'], state: 'paid' }] });
  const ex = await readSyncExtras(f.client, { orderIds: [5], cancelOrderIds: [5] });
  assert.equal(ex.paymentsByOrder.get(5), 1); assert.equal(ex.lineInfo.get(50).x_precio_manual, 0);
  assert.ok(f.calls.every((c) => /\/(fields_get|search_read)$/.test(c)));
  await assert.rejects(readSyncExtras(f.client, { orderIds: [5] }, { orders: 1, lines: 10, payments: 10 }), /ODOO_SYNC_ORDER_LIMIT/);
});

test('simulacion completa con clientes falsos: plan sin escrituras y solo GET/search_read', async () => {
  const sCalls = [];
  const smoobu = new SmoobuClient({ apiKey: 'k', apiSecret: 's', pathPrefix: '/api', fetchImpl: async (url, init) => { sCalls.push(init.method); return ok({ page: 1, page_count: 1, total_items: 1, bookings: [bk(170300200, '302', '2026-11-22', '2026-11-23')] }); } });
  const f = fakeOdoo({});
  const res = await runSyncDryRun({ smoobu, odoo: f.client, window: { ...W, smoobuQuery: { from: W.from, to: W.to }, odooSlotRange: { start: '2026-11-01 05:00:00', end: '2026-12-01 05:00:00' }, orderRange: { checkinOnOrBefore: W.to, checkoutAfter: W.from } }, today: TODAY });
  assert.equal(opOf(res.plan, 170300200).op, OPS.CREATE_ORDER);
  assert.equal(res.reads.odoo.writes, 0);
  assert.ok(sCalls.every((m) => m === 'GET'));
  assert.ok(f.calls.every((c) => /\/(fields_get|search_read)$/.test(c)));
});

test('sin camino de escritura: interruptores en false y ningun metodo de escritura en los modulos nuevos', () => {
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED], [false, false]);
  for (const f of ['../src/sync-intent.mjs', '../src/sync-dryrun-run.mjs', '../scripts/sync-dryrun.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/\.(create|write|unlink|executeKw|_request|callKw)\(|P0WriteClient|recompute-client|p0-client|odoo-json2-p0|method:\s*'(POST|PUT|DELETE|PATCH)'/.test(src), f);
  }
});

test('sobreventa vigilada fuera del listado (caso Casa/301 del 04/01): la reserva que la pisa se bloquea', () => {
  const watchAlerts = [{ smoobuId: 170300399, unit: '301', arrival: '2026-11-25', departure: '2026-11-26', status: 'OVERBOOKING_ALERT' }];
  // (Casa y 203 se prueban por separado: entre ellas ya serian sobreventa dentro del listado)
  const casa = plan({ bookings: [bk(170300300, 'CASA', '2026-11-25', '2026-11-26')], watchAlerts });
  assert.ok(opOf(casa, 170300300).guards.includes(GUARDS.SOBREVENTA)); // Casa pisa la 301
  const other = plan({ bookings: [bk(170300301, '203', '2026-11-25', '2026-11-26'), bk(170300302, '201', '2026-11-27', '2026-11-28')], watchAlerts });
  assert.equal(opOf(other, 170300301).op, OPS.CREATE_ORDER); // otra habitacion fisica no
  assert.equal(opOf(other, 170300302).op, OPS.CREATE_ORDER); // otra fecha no
});

test('borrador retenido (caso 03824): rellenar datos requiere aprobacion, nunca LISTO', () => {
  const p = plan({ bookings: [bk(170300310, '202', '2026-11-03', '2026-11-05')], orders: [order(31, 170300310, '202', '2026-11-03', '2026-11-05', { state: 'draft' })],
    orderInfo: { 31: info({ rental_start_date: null, rental_return_date: null }) }, lineInfo: { 310: line(310) } });
  const o = opOf(p, 170300310);
  assert.deepEqual([o.op, o.status], [OPS.UPDATE_ORDER, STATUS.REQUIERE_APROBACION]);
});
