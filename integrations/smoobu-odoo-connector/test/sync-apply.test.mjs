import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { SyncWriteClient, RecordingWriter, armedBy, SYNC_ARM_PHRASE } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock, FileLock, PHASES } from '../src/sync-journal.mjs';
import { applyPlan, RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-DEV-116 — Todo SINTETICO y en memoria (ids 17xxxxxxx, nombres, correos e importes inventados). Ninguna llamada de red.
const TODAY = '2026-11-05';
const APT = { 201: 3557506, 202: 3557511, 302: 3557526, CASA: 3557501 };
const smoobuOf = (map) => ({ requests: 0, async getReservation(id) { this.requests += 1; const b = map[id]; if (!b) { const e = new Error('SMOOBU_NOT_FOUND'); e.code = 'SMOOBU_NOT_FOUND'; e.status = 404; throw e; } return b; } });
const booking = (id, unit, arrival, departure, price, extra = {}) => ({ id, type: 'reservation', apartment: { id: APT[unit] }, arrival, departure, price, ...extra });
const createOp = (id, unit, arrival, departure, price, { email = 'sintetico@example.invalid', status = STATUS.LISTO, source = 'direct', name = 'Ana Sintetica Ficticia', phone = null } = {}) => {
  const payload = buildCreatePayload({ smoobuId: id, unit, arrival, departure, source, otaRef: null, price, guest: { name, email, phone } });
  return { smoobuId: id, unit, arrival, departure, op: OPS.CREATE_ORDER, status, guards: [GUARDS.IMPUESTO_PENDIENTE], payload, changes: [], key: opKey(id, OPS.CREATE_ORDER, payload) };
};
const opOn = (op, id, orderId, payload, { status = STATUS.REQUIERE_APROBACION, guards = [], snapshot = null, unit = '201', arrival = '2026-11-20', departure = '2026-11-21', changes = [] } = {}) =>
  ({ smoobuId: id, unit, arrival, departure, op, status, guards, payload, orderId, snapshot, changes, key: opKey(id, op, payload) });
function env(seed = {}, smoobuMap = {}) {
  const odoo = new FakeOdoo(seed);
  return { odoo, reader: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch }), writer: fakeWriter(odoo, validateWrite), smoobu: smoobuOf(smoobuMap), journal: new Journal(), lock: new MemoryLock() };
}
const run = (e, plan, extra = {}) => applyPlan({ plan: { ops: plan }, reader: e.reader, writer: e.writer, smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY, ...extra });
const orderSeed = (id, sid, { state = 'sale', price = 100000, manual = 100000, partner = 7, unit = 57846, from = '2026-11-20', to = '2026-11-21', extra = {} } = {}) => ({
  'sale.order': [{ id, state, partner_id: partner, x_pms_reference: `SMOOBU-${sid}`, x_checkin: from, x_checkout: to, rental_start_date: `${from} 20:00:00`, rental_return_date: `${to} 16:00:00`, write_date: 'W0', invoice_ids: [], ...extra }],
  'sale.order.line': [{ id: id * 10, order_id: id, product_id: unit, price_unit: price, x_precio_manual: manual, qty_invoiced: 0, tax_ids: [] }],
  'planning.slot': state === 'sale' ? [{ id: id * 100, role_id: 29, start_datetime: `${from} 20:00:00`, end_datetime: `${to} 16:00:00`, sale_line_id: id * 10 }] : [],
});

/* ---------- cliente y lista blanca ---------- */

test('cliente real DESARMADO: con las constantes en false ni la frase de armado permite escribir; nunca llega a la red', async () => {
  let fetched = 0;
  const c = new SyncWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', arm: SYNC_ARM_PHRASE, fetchImpl: async () => { fetched += 1; return { ok: true, json: async () => [1] }; } });
  assert.equal(c.armed, false);
  await assert.rejects(c.execute('sale.order', 'create', { vals_list: [{}] }), /SYNC_WRITES_DISABLED/);
  assert.equal(fetched, 0);
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED], [false, false]);
  // tabla de verdad: hacen falta las tres llaves
  assert.equal(armedBy({ writesEnabled: true, releaseUnlocked: true, arm: SYNC_ARM_PHRASE }), true);
  for (const k of [{ writesEnabled: false, releaseUnlocked: true, arm: SYNC_ARM_PHRASE }, { writesEnabled: true, releaseUnlocked: false, arm: SYNC_ARM_PHRASE }, { writesEnabled: true, releaseUnlocked: true, arm: 'si' }]) assert.equal(armedBy(k), false);
});

test('lista blanca: rechaza borrar, pagos, facturas, turnos, cambiar precio, impuestos, productos ajenos y notas publicas', () => {
  const line = (o = {}) => [0, 0, { product_id: 57846, product_uom_qty: 1, price_unit: 100, x_precio_manual: 100, tax_ids: [[6, 0, []]], ...o }];
  const order = (o = {}) => ({ vals_list: [{ partner_id: 1, x_pms_reference: 'SMOOBU-1', order_line: [line()], ...o }] });
  assert.ok(validateWrite('sale.order', 'create', order()));
  const bad = [
    ['sale.order', 'unlink', { ids: [1] }, 'SYNC_WRITE_NOT_ALLOWED'], ['account.payment', 'create', {}, 'SYNC_WRITE_NOT_ALLOWED'], ['account.move', 'write', {}, 'SYNC_WRITE_NOT_ALLOWED'],
    ['planning.slot', 'create', {}, 'SYNC_WRITE_NOT_ALLOWED'], ['sale.order.line', 'write', { ids: [1], vals: { price_unit: 1 } }, 'SYNC_WRITE_FIELD_FORBIDDEN'],
    ['sale.order', 'write', { ids: [1], vals: { state: 'sale' } }, 'SYNC_WRITE_FIELD_FORBIDDEN'], ['sale.order', 'write', { ids: [1, 2], vals: { x_checkin: 'x' } }, 'SYNC_WRITE_ONE_RECORD_ONLY'],
    ['sale.order', 'create', order({ order_line: [line({ tax_ids: [[6, 0, [251]]] })] }), 'SYNC_WRITE_TAXES_NOT_ALLOWED'], ['sale.order', 'create', order({ order_line: [line({ product_id: 1 })] }), 'SYNC_WRITE_PRODUCT_NOT_ALLOWED'],
    ['sale.order', 'create', order({ order_line: [line({ x_precio_manual: 0 })] }), 'SYNC_WRITE_MANUAL_PRICE_MISMATCH'], ['sale.order', 'create', order({ order_line: [line({ product_uom_qty: 2 })] }), 'SYNC_WRITE_QTY_NOT_ONE'],
    ['sale.order', 'create', order({ x_pms_reference: 'Smoobu 1' }), 'SYNC_WRITE_REFERENCE_INVALID'], ['sale.order', 'create', order({ pricelist_id: 17 }), 'SYNC_WRITE_FIELD_FORBIDDEN'],
    ['sale.order', 'message_post', { ids: [1], body: 'ATH-SYNC | x', message_type: 'comment', subtype_xmlid: 'mail.mt_comment' }, 'SYNC_WRITE_ONLY_INTERNAL_NOTES'],
    ['res.partner', 'create', { vals_list: [{ name: 'x', vat: '1' }] }, 'SYNC_WRITE_FIELD_FORBIDDEN'], ['res.partner', 'write', { ids: [1], vals: { name: 'x' } }, 'SYNC_WRITE_NOT_ALLOWED'],
  ];
  for (const [m, meth, p, code] of bad) assert.throws(() => validateWrite(m, meth, p), new RegExp(code), `${m}.${meth}`);
});

test('el escritor de simulacion aplica la MISMA lista blanca y no envia nada', async () => {
  const w = new RecordingWriter();
  await assert.rejects(w.execute('sale.order', 'unlink', { ids: [1] }), /SYNC_WRITE_NOT_ALLOWED/);
  await assert.rejects(w.execute('res.partner', 'create', { vals_list: [{ name: 'N' }] }), /SYNC_WRITE_PARTNER_REF_REQUIRED/);
  assert.deepEqual(await w.execute('res.partner', 'create', { vals_list: [{ name: 'N', ref: 'SMOOBU-1' }] }), [-1]);
  assert.equal(w.log.length, 1);
});

/* ---------- creacion ---------- */

test('CREAR: borrador con referencia unica, precio = precio manual, sin impuesto, nota y diario INTENT -> DONE; repetir no duplica', async () => {
  const e = env({}, { 170400001: booking(170400001, '302', '2026-11-22', '2026-11-23', 90100) });
  const op = createOp(170400001, '302', '2026-11-22', '2026-11-23', 90100);
  const r1 = await run(e, [op]);
  assert.equal(r1.results[0].result, RESULT.APLICADA, JSON.stringify(r1));
  const [o] = e.odoo.t['sale.order']; const [l] = e.odoo.t['sale.order.line'];
  assert.deepEqual([o.state, o.x_pms_reference, l.price_unit, l.x_precio_manual, l.tax_ids.length, l.product_id], ['draft', 'SMOOBU-170400001', 90100, 90100, 0, 57847]);
  assert.equal(e.odoo.t['res.partner'].length, 1); assert.match(e.odoo.t.notes[0].body, /^ATH-SYNC \| clave /);
  assert.deepEqual(e.journal.entries.map((x) => x.phase), [PHASES.INTENT, PHASES.DONE]);
  const r2 = await run(e, [op]);
  assert.equal(r2.results[0].result, RESULT.YA_APLICADA);
  // aunque se pierda el diario, Odoo impide el duplicado: la prevalidacion encuentra el pedido
  const r3 = await run({ ...e, journal: new Journal() }, [op]);
  assert.deepEqual([r3.results[0].result, r3.results[0].code], [RESULT.PRECONDICION_FALLIDA, 'PEDIDO_YA_EXISTE']);
  assert.equal(e.odoo.t['sale.order'].length, 1); assert.equal(e.odoo.t['res.partner'].length, 1);
});

test('CREAR: reutiliza el contacto por correo exacto; correo repetido en dos contactos = no se crea nada', async () => {
  const e = env({ 'res.partner': [{ id: 5, name: 'Ana Sintetica', email: 'Sintetico@Example.invalid' }] }, { 170400002: booking(170400002, '201', '2026-11-24', '2026-11-25', 85000) });
  await run(e, [createOp(170400002, '201', '2026-11-24', '2026-11-25', 85000)]);
  assert.equal(e.odoo.t['res.partner'].length, 1); assert.equal(e.odoo.t['sale.order'][0].partner_id, 5);
  const d = env({ 'res.partner': [{ id: 5, email: 'sintetico@example.invalid' }, { id: 6, email: 'sintetico@example.invalid' }] }, { 170400003: booking(170400003, '201', '2026-11-24', '2026-11-25', 85000) });
  const r = await run(d, [createOp(170400003, '201', '2026-11-24', '2026-11-25', 85000)]);
  assert.deepEqual([r.results[0].code, d.odoo.t['sale.order'].length, d.writer.writes], ['CONTACTOS_DUPLICADOS', 0, 0]);
});

test('CREAR: si Smoobu cambio el precio o las noches se ocuparon desde el plan, no se escribe nada', async () => {
  const e = env({}, { 170400004: booking(170400004, '201', '2026-11-24', '2026-11-25', 99999) });
  const r = await run(e, [createOp(170400004, '201', '2026-11-24', '2026-11-25', 85000)]);
  assert.equal(r.results[0].code, 'PRECIO_CAMBIO_EN_SMOOBU');
  const f = env({ 'planning.slot': [{ id: 1, role_id: 29, start_datetime: '2026-11-24 20:00:00', end_datetime: '2026-11-25 16:00:00', sale_line_id: 77 }] }, { 170400005: booking(170400005, '201', '2026-11-24', '2026-11-25', 85000) });
  const r2 = await run(f, [createOp(170400005, '201', '2026-11-24', '2026-11-25', 85000)]);
  assert.equal(r2.results[0].code, 'NOCHES_OCUPADAS_EN_ODOO');
  const g = env({}, { 170400006: booking(170400006, '201', '2026-11-24', '2026-11-25', 85000, { type: 'cancellation' }) });
  assert.equal((await run(g, [createOp(170400006, '201', '2026-11-24', '2026-11-25', 85000)])).results[0].code, 'RESERVA_CANCELADA_EN_SMOOBU');
  for (const x of [e, f, g]) assert.equal(x.writer.writes, 0);
});

test('CREAR sin correo (Airbnb): crea el contacto con nombre real y ref SMOOBU-<id>, sin inventar correo ni telefono', async () => {
  const e = env({}, { 170400007: booking(170400007, '201', '2026-11-24', '2026-11-25', 85000) });
  const op = createOp(170400007, '201', '2026-11-24', '2026-11-25', 85000, { email: null });
  assert.equal((await run(e, [op])).results[0].result, RESULT.APLICADA);
  assert.deepEqual(e.odoo.t['res.partner'][0], { id: e.odoo.t['res.partner'][0].id, name: 'Ana Sintetica Ficticia', ref: 'SMOOBU-170400007' });
});

test('CONTACTOS: telefono reutiliza; mismo correo con otro nombre, dos coincidencias o solo nombre = bloqueo sin escribir', async () => {
  const mk = (seed, opts) => { const e = env({ 'res.partner': seed }, { 170400100: booking(170400100, '201', '2026-11-24', '2026-11-25', 85000) }); return [e, createOp(170400100, '201', '2026-11-24', '2026-11-25', 85000, opts)]; };
  let [e, op] = mk([{ id: 5, name: 'Ana Sintetica', phone: '+57 300 111 2233' }], { email: null, phone: '3001112233' });
  assert.equal((await run(e, [op])).results[0].result, RESULT.APLICADA); assert.equal(e.odoo.t['sale.order'][0].partner_id, 5);
  for (const [seed, opts, code] of [
    [[{ id: 5, name: 'Pedro Otro Distinto', email: 'sintetico@example.invalid' }], {}, 'IDENTIDAD_AMBIGUA'],
    [[{ id: 5, name: 'Ana Sintetica', email: 'sintetico@example.invalid' }, { id: 6, name: 'Ana Sintetica', phone: '3001112233' }], { phone: '3001112233' }, 'IDENTIDAD_AMBIGUA'],
    [[{ id: 5, name: 'Ana Sintetica', phone: '3001112233' }, { id: 6, name: 'Ana S', phone: '(300) 111-2233' }], { email: null, phone: '3001112233' }, 'CONTACTOS_DUPLICADOS'],
    [[{ id: 5, name: 'ANA SINTÉTICA FICTICIA' }], { email: null }, 'COINCIDENCIA_SOLO_POR_NOMBRE'],
  ]) { [e, op] = mk(seed, opts); const r = await run(e, [op]); assert.deepEqual([r.results[0].code, e.writer.writes], [code, 0], code); }
});

test('CONTACTOS concurrentes/recuperacion: el contacto creado por un intento fallido se reutiliza por ref, nunca se duplica', async () => {
  const e = env({}, { 170400101: booking(170400101, '201', '2026-11-24', '2026-11-25', 85000) });
  const op = createOp(170400101, '201', '2026-11-24', '2026-11-25', 85000, { email: null });
  e.odoo.fault({ model: 'sale.order', method: 'create', when: 'before', status: 400 }); // Odoo rechaza el pedido tras crear el contacto
  const r1 = await run(e, [op]);
  assert.equal(r1.halted, 'FALLO_PARCIAL');
  const r2 = await run(e, [op]);
  assert.deepEqual(r2.recovered.map((x) => x.code), ['CONTACTO_CREADO_SE_REUTILIZA_POR_REF']);
  assert.equal(r2.results[0].result, RESULT.APLICADA);
  assert.deepEqual([e.odoo.t['res.partner'].length, e.odoo.t['sale.order'].length], [1, 1]);
});

test('CASA COMPLETA: un pedido con CASA-MAGIA; al confirmar Odoo bloquea las cinco habitaciones y se verifica; con menos de 10 personas Odoo rechaza', async () => {
  const e = env({}, { 170400110: booking(170400110, 'CASA', '2026-11-28', '2026-11-29', 600000) });
  const payload = buildCreatePayload({ smoobuId: 170400110, unit: 'CASA', arrival: '2026-11-28', departure: '2026-11-29', source: 'direct', price: 600000, persons: 12, guest: { name: 'Ana Sintetica Ficticia', email: null } });
  const create = { smoobuId: 170400110, unit: 'CASA', arrival: '2026-11-28', departure: '2026-11-29', op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [], payload, changes: [], key: opKey(170400110, OPS.CREATE_ORDER, payload) };
  assert.equal((await run(e, [create])).results[0].result, RESULT.APLICADA);
  assert.deepEqual(e.odoo.t['sale.order.line'].map((l) => [l.product_id, l.price_unit, l.x_personas]), [[57850, 600000, 12]]); // un solo ingreso
  const orderId = e.odoo.t['sale.order'][0].id; e.odoo.t['sale.order'][0].write_date = 'W1';
  const confirm = opOn(OPS.CONFIRM_ORDER, 170400110, orderId, { action: 'action_confirm' }, { unit: 'CASA', arrival: '2026-11-28', departure: '2026-11-29' });
  assert.equal((await run(e, [confirm], { approvals: new Set([confirm.key]) })).results[0].result, RESULT.APLICADA);
  assert.equal(e.odoo.t['planning.slot'].filter((s) => s.x_bloqueo_ref).length, 5);
  // si Odoo no bloqueara las habitaciones, la verificacion lo detecta
  const f = env({}, { 170400111: booking(170400111, 'CASA', '2026-11-28', '2026-11-29', 600000) }); f.odoo.skipCasaBlocks = true;
  const p2 = buildCreatePayload({ smoobuId: 170400111, unit: 'CASA', arrival: '2026-11-28', departure: '2026-11-29', source: 'direct', price: 600000, persons: 12, guest: { name: 'Bea Sintetica Ficticia' } });
  await run(f, [{ ...create, smoobuId: 170400111, payload: p2, key: opKey(170400111, OPS.CREATE_ORDER, p2) }]);
  const c2 = opOn(OPS.CONFIRM_ORDER, 170400111, f.odoo.t['sale.order'][0].id, { action: 'action_confirm' }, { unit: 'CASA', arrival: '2026-11-28', departure: '2026-11-29' });
  assert.equal((await run(f, [c2], { approvals: new Set([c2.key]) })).results[0].code, 'VERIFICACION_HABITACIONES_NO_BLOQUEADAS');
  // la lista blanca no deja enviar Casa con menos de 10 personas (Odoo tambien lo rechazaria: automatizacion 71)
  assert.throws(() => validateWrite('sale.order', 'create', { vals_list: [{ partner_id: 1, x_pms_reference: 'SMOOBU-1', order_line: [[0, 0, { product_id: 57850, product_uom_qty: 1, price_unit: 1, x_precio_manual: 1, tax_ids: [[6, 0, []]], x_personas: 6 }]] }] }), /SYNC_WRITE_CASA_PERSONAS/);
});

/* ---------- actualizacion ---------- */

test('ACTUALIZAR: rellena canal y precio manual sin tocar el precio; si el pedido cambio desde el plan, se salta', async () => {
  const seed = orderSeed(10, 170400010, { manual: 0 });
  const payload = { order: { x_booking_source: 'direct' }, line: { lineId: 100, x_precio_manual: 100000 } };
  const e = env(seed);
  const op = opOn(OPS.UPDATE_ORDER, 170400010, 10, payload, { status: STATUS.LISTO, snapshot: { writeDate: 'W0' }, changes: ['x_booking_source', 'line.x_precio_manual'] });
  assert.equal((await run(e, [op])).results[0].result, RESULT.APLICADA);
  const l = e.odoo.t['sale.order.line'][0];
  assert.deepEqual([e.odoo.t['sale.order'][0].x_booking_source, l.x_precio_manual, l.price_unit], ['direct', 100000, 100000]);
  const stale = env(orderSeed(11, 170400011, { manual: 0, extra: { write_date: 'W9' } }));
  const r = await run(stale, [opOn(OPS.UPDATE_ORDER, 170400011, 11, { order: { x_booking_source: 'direct' } }, { status: STATUS.LISTO, snapshot: { writeDate: 'W0' } })]);
  assert.deepEqual([r.results[0].code, stale.writer.writes], ['PEDIDO_MODIFICADO_DESDE_EL_PLAN', 0]);
  const inv = env({ ...orderSeed(12, 170400012), 'account.move': [{ id: 1, state: 'posted' }] });
  inv.odoo.t['sale.order'][0].invoice_ids = [1];
  assert.equal((await run(inv, [opOn(OPS.UPDATE_ORDER, 170400012, 12, { order: { x_booking_source: 'direct' } }, { status: STATUS.LISTO })])).results[0].code, 'PEDIDO_FACTURADO');
});

/* ---------- confirmacion ---------- */

test('CONFIRMAR: con IVA no validado se bloquea aunque gerencia la apruebe; sin precio manual tampoco', async () => {
  const e = env(orderSeed(20, 170400020, { state: 'draft' }));
  const op = opOn(OPS.CONFIRM_ORDER, 170400020, 20, { action: 'action_confirm' }, { guards: [GUARDS.IMPUESTO_PENDIENTE] });
  assert.deepEqual([(await run(e, [op], { approvals: new Set([op.key]) })).results[0].code, e.odoo.t['sale.order'][0].state], ['IVA_NO_VALIDADO', 'draft']);
  const m = env(orderSeed(21, 170400021, { state: 'draft', manual: 0 }));
  const op2 = opOn(OPS.CONFIRM_ORDER, 170400021, 21, { action: 'action_confirm' });
  assert.equal((await run(m, [op2], { approvals: new Set([op2.key]) })).results[0].code, 'PRECIO_MANUAL_NO_PROTEGIDO');
});

test('CONFIRMAR (IVA ya validado y aprobada): crea el turno, conserva la tarifa y Odoo puede rechazar el choque sin dejar nada a medias', async () => {
  const e = env(orderSeed(22, 170400022, { state: 'draft' }));
  const op = opOn(OPS.CONFIRM_ORDER, 170400022, 22, { action: 'action_confirm' });
  assert.equal((await run(e, [op], { approvals: new Set([op.key]) })).results[0].result, RESULT.APLICADA);
  assert.deepEqual([e.odoo.t['sale.order'][0].state, e.odoo.t['sale.order.line'][0].price_unit, e.odoo.t['planning.slot'].length], ['sale', 100000, 1]);
  // CHOQUE DE RESERVA: Odoo rechaza (400) y no hubo pasos previos -> FALLIDA, se sigue con la siguiente
  const c = env({ ...orderSeed(23, 170400023, { state: 'draft' }), 'planning.slot': [{ id: 1, role_id: 29, start_datetime: '2026-11-20 10:00:00', end_datetime: '2026-11-21 10:00:00', sale_line_id: 999 }] });
  const op2 = opOn(OPS.CONFIRM_ORDER, 170400023, 23, { action: 'action_confirm' });
  c.odoo.t['planning.slot'] = []; // libre al prevalidar...
  c.odoo.fault({ model: 'sale.order', method: 'action_confirm', when: 'before', status: 400, message: 'CHOQUE DE RESERVA' }); // ...ocupado al escribir
  const r = await run(c, [op2], { approvals: new Set([op2.key]) });
  assert.deepEqual([r.results[0].result, r.halted, c.odoo.t['sale.order'][0].state], [RESULT.RECHAZADA_POR_ODOO, null, 'draft']);
});

/* ---------- cancelacion ---------- */

test('CANCELAR: solo aprobada, con la reserva aun cancelada en Smoobu, sin pagos ni facturas y antes de la llegada', async () => {
  const cancelled = { 170400030: booking(170400030, '201', '2026-11-20', '2026-11-21', 100000, { type: 'cancellation' }) };
  const e = env(orderSeed(30, 170400030), cancelled);
  const op = opOn(OPS.CANCEL_ORDER, 170400030, 30, { action: 'action_cancel' }, { snapshot: { writeDate: 'W0' } });
  assert.equal((await run(e, [op])).results[0].result, RESULT.NO_ELEGIBLE); // sin aprobacion no se toca
  assert.equal((await run(e, [op], { approvals: new Set([op.key]) })).results[0].result, RESULT.APLICADA);
  assert.deepEqual([e.odoo.t['sale.order'][0].state, e.odoo.t['planning.slot'].length], ['cancel', 0]);
  const pay = env({ ...orderSeed(31, 170400031), 'account.payment': [{ id: 1, partner_id: 7, state: 'paid' }] }, { 170400031: { ...cancelled[170400030], id: 170400031 } });
  const op2 = opOn(OPS.CANCEL_ORDER, 170400031, 31, { action: 'action_cancel' });
  assert.equal((await run(pay, [op2], { approvals: new Set([op2.key]) })).results[0].code, 'PAGOS_EXISTENTES');
  const back = env(orderSeed(32, 170400032), { 170400032: booking(170400032, '201', '2026-11-20', '2026-11-21', 100000) });
  const op3 = opOn(OPS.CANCEL_ORDER, 170400032, 32, { action: 'action_cancel' });
  assert.equal((await run(back, [op3], { approvals: new Set([op3.key]) })).results[0].code, 'RESERVA_YA_NO_ESTA_CANCELADA_EN_SMOOBU');
  const started = env(orderSeed(33, 170400033, { from: TODAY, to: '2026-11-06' }), { 170400033: booking(170400033, '201', TODAY, '2026-11-06', 100000, { type: 'cancellation' }) });
  const op4 = opOn(OPS.CANCEL_ORDER, 170400033, 33, { action: 'action_cancel' }, { arrival: TODAY, departure: '2026-11-06' });
  assert.equal((await run(started, [op4], { approvals: new Set([op4.key]) })).results[0].code, 'ESTANCIA_INICIADA');
  for (const x of [pay, back, started]) assert.equal(x.writer.writes, 0);
});

/* ---------- fallos de red, parciales y recuperacion ---------- */

test('red caida ANTES de aplicar: resultado ambiguo y parada; la siguiente ejecucion lo recupera leyendo y lo aplica una sola vez', async () => {
  const e = env({}, { 170400040: booking(170400040, '201', '2026-11-24', '2026-11-25', 85000) });
  const op = createOp(170400040, '201', '2026-11-24', '2026-11-25', 85000);
  e.odoo.fault({ model: 'sale.order', method: 'create', when: 'before', kind: 'network' });
  const r1 = await run(e, [op]);
  assert.deepEqual([r1.results[0].result, r1.halted], [RESULT.AMBIGUA, 'RESULTADO_AMBIGUO']);
  assert.equal(e.odoo.t['sale.order'].length, 0);
  const r2 = await run(e, [op]);
  assert.deepEqual(r2.recovered.map((x) => [x.phase, x.code]), [[PHASES.RECOVERED_NOT_APPLIED, 'CONTACTO_CREADO_SE_REUTILIZA_POR_REF']]);
  assert.equal(r2.results[0].result, RESULT.APLICADA);
  assert.equal(e.odoo.t['sale.order'].length, 1);
  assert.equal(e.odoo.t['res.partner'].length, 1); // el contacto del primer intento se reutiliza por correo, no se duplica
});

test('red caida DESPUES de aplicar (respuesta perdida): la recuperacion encuentra el pedido y NO lo vuelve a crear', async () => {
  const e = env({}, { 170400041: booking(170400041, '201', '2026-11-24', '2026-11-25', 85000) });
  const op = createOp(170400041, '201', '2026-11-24', '2026-11-25', 85000);
  e.odoo.fault({ model: 'sale.order', method: 'create', when: 'after', kind: 'network' });
  assert.equal((await run(e, [op])).halted, 'RESULTADO_AMBIGUO');
  const r2 = await run(e, [op]);
  assert.equal(r2.recovered[0].phase, PHASES.RECOVERED_DONE);
  assert.equal(r2.results[0].result, RESULT.YA_APLICADA);
  assert.equal(e.odoo.t['sale.order'].length, 1);
});

test('fallo parcial (pedido creado, nota rechazada): parada FALLO_PARCIAL y recuperacion como hecha', async () => {
  const e = env({}, { 170400042: booking(170400042, '201', '2026-11-24', '2026-11-25', 85000) });
  const op = createOp(170400042, '201', '2026-11-24', '2026-11-25', 85000);
  e.odoo.fault({ model: 'sale.order', method: 'message_post', when: 'before', status: 400 });
  const r1 = await run(e, [op, createOp(170400043, '201', '2026-11-26', '2026-11-27', 85000)]);
  assert.deepEqual([r1.halted, r1.results.length], ['FALLO_PARCIAL', 1]); // la segunda operacion ni se intenta
  const r2 = await run(e, [op]);
  assert.equal(r2.recovered[0].phase, PHASES.RECOVERED_DONE);
});

test('recuperacion con DUPLICADO en Odoo: se detiene todo y no se escribe', async () => {
  const e = env({ 'sale.order': [{ id: 1, state: 'draft', x_pms_reference: 'SMOOBU-170400044' }, { id: 2, state: 'draft', x_pms_reference: 'SMOOBU-170400044 / Booking 1' }] });
  const op = createOp(170400044, '201', '2026-11-24', '2026-11-25', 85000);
  e.journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: PHASES.AMBIGUOUS });
  const r = await run(e, [op]);
  assert.deepEqual([r.halted, e.writer.writes], ['RECUPERACION_DUPLICADO_DETECTADO', 0]);
});

test('verificacion posterior: si Odoo alterara la tarifa al crear, se detiene y queda VERIFY_FAILED (sin seguir)', async () => {
  const e = env({}, { 170400045: booking(170400045, '201', '2026-11-24', '2026-11-25', 85000) });
  e.odoo.priceOverwriteOnCreate = true;
  const r = await run(e, [createOp(170400045, '201', '2026-11-24', '2026-11-25', 85000)]);
  assert.deepEqual([r.results[0].result, r.results[0].code, r.halted], [RESULT.VERIFICACION_FALLIDA, 'VERIFICACION_PRECIO_O_IMPUESTO', 'VERIFICACION_FALLIDA']);
  assert.equal(e.journal.incomplete().length, 1); // la proxima ejecucion empieza por recuperarla
});

/* ---------- concurrencia, parada, tope ---------- */

test('ejecucion simultanea: con el cerrojo tomado no se lee ni se escribe nada; el cerrojo de archivo es exclusivo', async () => {
  const shared = { held: true };
  const e = env({}, {}); e.lock = new MemoryLock(shared);
  const r = await run(e, [createOp(170400050, '201', '2026-11-24', '2026-11-25', 85000)]);
  assert.deepEqual([r.halted, e.odoo.calls.length], ['SYNC_LOCKED', 0]);
  const dir = mkdtempSync(join(tmpdir(), 'sync-lock-'));
  try {
    const a = new FileLock(join(dir, 'lock')); const b = new FileLock(join(dir, 'lock'));
    a.acquire(); assert.throws(() => b.acquire(), /SYNC_LOCKED/); a.release(); b.acquire(); b.release();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('interruptor de parada y tope por ejecucion', async () => {
  const e = env({}, {});
  const stop = await run(e, [createOp(170400051, '201', '2026-11-24', '2026-11-25', 85000)], { halt: true });
  assert.deepEqual([stop.halted, e.odoo.calls.length], ['PARADA_MANUAL', 0]);
  const map = {}; const ops = [];
  for (let i = 0; i < 4; i += 1) { const id = 170400060 + i; const d = `2026-11-${10 + i * 2}`; const d2 = `2026-11-${11 + i * 2}`; map[id] = booking(id, '201', d, d2, 85000); ops.push(createOp(id, '201', d, d2, 85000, { email: `s${i}@example.invalid`, name: ['Ana Uno Ficticia', 'Bea Dos Ficticia', 'Carla Tres Ficticia', 'Dora Cuatro Ficticia'][i] })); }
  const t = env({}, map);
  const r = await run(t, ops, { maxOps: 2 });
  assert.deepEqual(r.results.map((x) => x.result), [RESULT.APLICADA, RESULT.APLICADA, RESULT.NO_PROCESADA, RESULT.NO_PROCESADA]);
});

test('operaciones BLOQUEADAS o sin aprobar nunca se ejecutan', async () => {
  const e = env({}, {});
  const blocked = { ...createOp(170400070, 'CASA', '2026-11-24', '2026-11-25', 500000), status: STATUS.BLOQUEADO, guards: [GUARDS.CASA_MINIMO_10_PERSONAS] };
  const r = await run(e, [blocked]);
  assert.deepEqual([r.results[0].result, e.odoo.calls.length], [RESULT.NO_ELEGIBLE, 0]);
});

/* ---------- diario ---------- */

test('diario: sin datos personales (campos fijos) y persistente en archivo', () => {
  const j = new Journal();
  assert.throws(() => j.record({ key: 'k', phase: 'INTENT', name: 'NOMBRE' }), /SYNC_JOURNAL_FIELD_FORBIDDEN/);
  const dir = mkdtempSync(join(tmpdir(), 'sync-journal-'));
  try {
    const path = join(dir, 'j.jsonl');
    const a = Journal.fromFile(path); a.record({ key: 'k1', smoobuId: 1, op: 'CREATE_ORDER', phase: PHASES.INTENT });
    const b = Journal.fromFile(path); assert.equal(b.incomplete().length, 1);
    b.record({ key: 'k1', smoobuId: 1, op: 'CREATE_ORDER', phase: PHASES.DONE, orderId: 5 });
    assert.equal(Journal.fromFile(path).isDone('k1'), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('codigo: ningun modulo de sincronizacion borra registros ni toca pagos/facturas/turnos', () => {
  for (const f of ['sync-apply.mjs', 'sync-write-client.mjs', 'sync-write-guard.mjs', 'sync-journal.mjs', 'sync-intent.mjs']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/execute\('(account\.|planning\.slot)|'unlink'\)|execute\([^)]*'unlink'/.test(src), f);
  }
  const apply = readFileSync(new URL('../src/sync-apply.mjs', import.meta.url), 'utf8');
  assert.ok(!/new SyncWriteClient/.test(apply), 'el ejecutor no fabrica su propio escritor');
});
