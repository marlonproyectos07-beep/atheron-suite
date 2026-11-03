import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { SyncWriteClient, SYNC_ARM_PHRASE } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock, PHASES } from '../src/sync-journal.mjs';
import { RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS } from '../src/sync-intent.mjs';
import { pilotApprovalToken, pilotPreflight, stateFingerprint, PILOT_REQUIRED_WRITES } from '../src/sync-pilot.mjs';
import { AUTO_ARMED } from '../src/sync-auto-client.mjs';
import {
  runPilotWa, ShadowWaWriter, pilotWaPreflight, pilotWaApprovalToken, pilotWaAdminToken, parsePilotSelection, planConflicts, daysUntil, PILOT_WA_MIN_LEAD_DAYS,
} from '../src/sync-pilot-wa.mjs';
import { PilotWaWriteClient, pilotWaArmedBy, PILOT_WA_ARMED, PILOT_WA_NOT_BEFORE, PILOT_WA_NOT_AFTER, PILOT_WA_ARM_PHRASE } from '../src/sync-pilot-wa-client.mjs';
import { PILOT_ARM_PHRASE } from '../src/sync-pilot-client.mjs';

// ATH-DEV-140 — Todo SINTETICO y en memoria (ids 1705xxxxx, nombres, telefonos y correos inventados). Ninguna llamada de red ni envio.
const TODAY = '2026-11-03';
const ID = 170500101;
const PHONE = '+57 300 123 4567';
const APT = { 201: 3557506, 302: 3557526, CASA: 3557501 };
const reservation = (id = ID, o = {}) => ({ id, type: 'reservation', apartment: { id: APT[302] }, arrival: '2026-11-20', departure: '2026-11-21', price: 90100, 'guest-name': 'Ana Sintetica Ficticia', email: 'sintetico@example.invalid', phone: PHONE, ...o });
const opFor = (id = ID, { unit = '302', arrival = '2026-11-20', departure = '2026-11-21', phone = PHONE, name = 'Ana Sintetica Ficticia', price = 90100, status = STATUS.LISTO } = {}) => {
  const payload = buildCreatePayload({ smoobuId: id, unit, arrival, departure, source: 'direct', otaRef: null, price, guest: { name, email: 'sintetico@example.invalid', phone } });
  return { smoobuId: id, unit, arrival, departure, op: OPS.CREATE_ORDER, status, guards: [], payload, changes: [], key: opKey(id, OPS.CREATE_ORDER, payload) };
};
// pedidos HISTORICOS sinteticos (equivalentes a COT/2026/03847 y 03848): no deben cambiar nunca
const HIST = () => ({
  'sale.order': [
    { id: 22192, name: 'COT/2026/03847', state: 'draft', partner_id: 9001, x_pms_reference: 'SMOOBU-170100001 / Airbnb HMSINTET', x_checkin: '2027-01-14', x_checkout: '2027-01-15', write_date: 'W0', invoice_ids: [] },
    { id: 22193, name: 'COT/2026/03848', state: 'draft', partner_id: 9002, x_pms_reference: 'SMOOBU-170100002 / Booking 6000000001', x_checkin: '2026-11-06', x_checkout: '2026-11-07', write_date: 'W0', invoice_ids: [] },
  ],
  'sale.order.line': [{ id: 221920, order_id: 22192, product_id: 57847, price_unit: 100000, x_precio_manual: 100000, qty_invoiced: 0, tax_ids: [] }, { id: 221930, order_id: 22193, product_id: 57846, price_unit: 85000, x_precio_manual: 85000, qty_invoiced: 0, tax_ids: [] }],
  'mail.message': [{ id: 7001, model: 'sale.order', res_id: 22192, body: 'ATH-SYNC | clave bd829cbcd0bdfd4c | SMOOBU-170100001 | CREATE_ORDER', message_type: 'comment', date: '2026-10-31 02:30:41' }],
  'res.partner': [{ id: 9001, name: 'Cliente Historico Uno', ref: 'SMOOBU-170100001' }, { id: 9002, name: 'Cliente Historico Dos', ref: 'SMOOBU-170100002' }],
});
function env({ admin = false, seed = {}, res = reservation() } = {}) {
  const h = HIST();
  const odoo = new FakeOdoo({ ...h, 'ir.model.data': [{ id: 1, module: 'base', name: 'group_system', model: 'res.groups', res_id: 4 }], 'res.users': [{ id: 2, group_ids: admin ? [1, 4] : [1] }],
    ...Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, [...(h[k] ?? []), ...v]])) });
  const orig = odoo.apply.bind(odoo); odoo.apply = (m, meth, p) => (meth === 'context_get' ? { uid: 2 } : orig(m, meth, p));
  const cfg = { baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', fetchImpl: odoo.fetch };
  const smoobu = { async getReservation(id) { return Number(id) === ID ? res : null; } };
  return { odoo, cfg, reader: new OdooJson2Client(cfg), smoobu, journal: new Journal(), lock: new MemoryLock(), snapshot: JSON.stringify(h) };
}
const histNow = (e) => JSON.stringify({ 'sale.order': e.odoo.t['sale.order'].filter((o) => o.id < 90000 && o.id >= 22192 && o.id <= 22193), 'sale.order.line': e.odoo.t['sale.order.line'].filter((l) => l.order_id === 22192 || l.order_id === 22193) });
const histBefore = (e) => { const h = JSON.parse(e.snapshot); return JSON.stringify({ 'sale.order': h['sale.order'], 'sale.order.line': h['sale.order.line'] }); };
const go = (e, o, extra = {}) => {
  const op = o ?? opFor();
  const fp = stateFingerprint(extra.fresh ?? reservation());
  return runPilotWa({ plan: extra.plan ?? { ops: [op] }, smoobuId: extra.id ?? ID, approval: pilotWaApprovalToken(op, fp), adminApproval: pilotWaAdminToken(op, fp), reader: e.reader, writer: extra.writer ?? new ShadowWaWriter({ maxWrites: 3 }),
    smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY, ...extra.rest });
};
const failing = (r) => (r.checks ?? []).filter((c) => !c.ok).map((c) => `${c.name}:${c.code}`);
const decoded = (html) => decodeURIComponent(new URL(/href="([^"]+)"/.exec(html)[1]).searchParams.get('text'));

/* ---------- simulacion en sombra ---------- */

test('simulacion: una reserva valida pasa los 17 controles, simula 3 escrituras y la nota HTML queda bien formada; 0 cambios en Odoo', async () => {
  const e = env();
  const w = new ShadowWaWriter({ maxWrites: 3 });
  const r = await go(e, null, { writer: w });
  assert.equal(r.halted, null, JSON.stringify(r));
  assert.equal(r.results.length, 1); assert.equal(r.results[0].op, OPS.CREATE_ORDER);
  assert.equal(w.writes, PILOT_REQUIRED_WRITES);
  assert.deepEqual(r.checks.map((c) => c.ok), r.checks.map(() => true));
  assert.ok(r.checks.length >= 17, `controles: ${r.checks.map((c) => c.name).join(',')}`);
  assert.deepEqual(w.noteFacts(PHONE), { present: true, anchors: 1, host: 'wa.me', phoneMatches: true, internalNote: true });
  // nada llega a Odoo: ni contactos, ni pedidos, ni notas nuevas, y los historicos intactos
  assert.deepEqual([e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length, e.odoo.t['mail.message'].length], [2, 2, 1]);
  assert.equal(histNow(e), histBefore(e));
  assert.ok(e.odoo.calls.every((c) => /search_read|search_count|fields_get|context_get/.test(c)), e.odoo.calls.join(','));
});

test('no repite ATH-DEV-118: con notas ATH-SYNC historicas el piloto anterior se niega y el aislado no', async () => {
  const e = env();
  const op = opFor();
  const old = await pilotPreflight({ op, fresh: reservation(), fp: stateFingerprint(reservation()), approval: pilotApprovalToken(op, stateFingerprint(reservation())), admin: false, reader: e.reader, writer: { maxWrites: 3, writes: 0 } });
  assert.ok(old.checks.some((c) => c.name === 'PILOTO_NO_EJECUTADO_ANTES' && !c.ok && c.code === 'PILOTO_YA_EJECUTADO'));
  const r = await go(e);
  assert.equal(r.halted, null, JSON.stringify(r));
  // el token del piloto anterior no sirve para el nuevo
  const fp = stateFingerprint(reservation());
  const bad = await runPilotWa({ plan: { ops: [op] }, smoobuId: ID, approval: pilotApprovalToken(op, fp), reader: e.reader, writer: new ShadowWaWriter({ maxWrites: 3 }), smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY });
  assert.equal(bad.halted, 'PILOTO_TOKEN_NO_CORRESPONDE_AL_ESTADO_ACTUAL');
});

/* ---------- validaciones previas ---------- */

const cases = [
  ['telefono vacio', { res: reservation(ID, { phone: '' }), op: { phone: '' } }, 'TELEFONO_VALIDO:SIN_TELEFONO'],
  ['telefono sin codigo de pais', { res: reservation(ID, { phone: '6012345678' }), op: { phone: '6012345678' } }, 'TELEFONO_VALIDO:NUMERO_SIN_CODIGO_DE_PAIS'],
  ['telefono distinto al del plan', { res: reservation(ID, { phone: '+57 310 555 1212' }) }, 'TELEFONO_IGUAL_AL_PLAN:TELEFONO_DISTINTO_AL_PLAN'],
  ['llegada con menos de 7 dias', { res: reservation(ID, { arrival: '2026-11-08', departure: '2026-11-09' }), op: { arrival: '2026-11-08', departure: '2026-11-09' } }, 'LLEGADA_FUTURA_CON_MARGEN:LLEGADA_MENOR_AL_MARGEN'],
  ['llegada pasada', { res: reservation(ID, { arrival: '2026-11-02', departure: '2026-11-04' }), op: { arrival: '2026-11-02', departure: '2026-11-04' } }, 'LLEGADA_FUTURA_CON_MARGEN:LLEGADA_NO_FUTURA'],
  ['reserva cancelada', { res: reservation(ID, { type: 'cancellation' }) }, 'RESERVA_VIGENTE:RESERVA_NO_VIGENTE'],
  ['habitacion distinta', { res: reservation(ID, { apartment: { id: APT[201] } }) }, 'HABITACION:HABITACION_DISTINTA'],
  ['fechas distintas', { res: reservation(ID, { departure: '2026-11-22' }) }, 'FECHAS:FECHAS_DISTINTAS'],
  ['importe distinto', { res: reservation(ID, { price: 95000 }) }, 'IMPORTE_COHERENTE:IMPORTE_DISTINTO'],
];
for (const [name, c, expected] of cases) {
  test(`validacion previa: ${name} => no escribe, 0 escrituras y el control exacto falla`, async () => {
    const e = env({ res: c.res ?? reservation() });
    const op = opFor(ID, c.op ?? {});
    const w = new ShadowWaWriter({ maxWrites: 3 });
    // los tokens se calculan sobre el estado FRESCO (como en la ejecucion real) para que el unico fallo sea el control probado
    const fp = stateFingerprint(c.res ?? reservation());
    const r = await runPilotWa({ plan: { ops: [op] }, smoobuId: ID, approval: pilotWaApprovalToken(op, fp), adminApproval: pilotWaAdminToken(op, fp), reader: e.reader, writer: w, smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY });
    assert.equal(r.halted, 'PILOTO_VERIFICACION_PREVIA_FALLIDA', JSON.stringify(r));
    assert.ok(failing(r).includes(expected), `${failing(r)}`);
    assert.deepEqual([w.writes, r.writes], [0, 0]);
    assert.equal(histNow(e), histBefore(e));
  });
}

test('validacion previa: pedido duplicado en Odoo => se detiene por lectura, sin escribir', async () => {
  const e = env({ seed: { 'sale.order': [{ id: 500, name: 'COT/X', state: 'draft', x_pms_reference: `SMOOBU-${ID}`, x_checkin: '2026-11-20', x_checkout: '2026-11-21', write_date: 'W0', invoice_ids: [] }], 'sale.order.line': [{ id: 5000, order_id: 500, product_id: 57847, price_unit: 90100, x_precio_manual: 90100, qty_invoiced: 0, tax_ids: [] }] } });
  const w = new ShadowWaWriter({ maxWrites: 3 });
  const r = await go(e, null, { writer: w });
  assert.equal(r.halted, 'PILOTO_YA_APLICADO_VERIFICADO_POR_LECTURA'); assert.equal(w.writes, 0);
  const dupOnly = await pilotWaPreflight({ plan: { ops: [opFor()] }, op: opFor(), fresh: reservation(), fp: 'x', approval: 'x', admin: false, reader: e.reader, smoobu: e.smoobu, selectedId: ID, today: TODAY });
  assert.ok(dupOnly.checks.some((c) => c.name === 'SIN_PEDIDO_DUPLICADO' && !c.ok && c.code === 'PEDIDO_YA_EXISTE'));
});

test('conflictos con Casa Completa y con otras reservas: en el plan y en Odoo (incluye borradores)', async () => {
  const line = (order_id, product_id) => ({ id: order_id * 10, order_id, product_id, price_unit: 1, x_precio_manual: 1, qty_invoiced: 0, tax_ids: [] });
  const order = (id, ref, a, d) => ({ id, name: `COT/${id}`, state: 'draft', x_pms_reference: ref, x_checkin: a, x_checkout: d, write_date: 'W0', invoice_ids: [] });
  // 1) pedido de Casa Completa en borrador que cubre esas noches (sin turnos todavia)
  let e = env({ seed: { 'sale.order': [order(600, 'SMOOBU-170500900', '2026-11-19', '2026-11-22')], 'sale.order.line': [line(600, 57850)] } });
  let r = await go(e);
  assert.ok(failing(r).includes('SIN_CONFLICTO_EN_ODOO_NI_CASA:CONFLICTO_CON_PEDIDO_O_CASA'), JSON.stringify(r));
  // 2) otro pedido de la MISMA habitacion
  e = env({ seed: { 'sale.order': [order(601, 'SMOOBU-170500901', '2026-11-20', '2026-11-22')], 'sale.order.line': [line(601, 57847)] } });
  assert.ok(failing(await go(e)).includes('SIN_CONFLICTO_EN_ODOO_NI_CASA:CONFLICTO_CON_PEDIDO_O_CASA'));
  // 3) pedido de OTRA habitacion: no es conflicto
  e = env({ seed: { 'sale.order': [order(602, 'SMOOBU-170500902', '2026-11-20', '2026-11-22')], 'sale.order.line': [line(602, 57846)] } });
  assert.equal((await go(e)).halted, null);
  // 4) reservas de Smoobu en el plan: misma habitacion, Casa Completa, y la cancelada no cuenta
  const me = opFor();
  const other = (id, unit, o = {}) => ({ ...opFor(id, { unit, arrival: '2026-11-19', departure: '2026-11-22' }), ...o });
  assert.equal(planConflicts({ ops: [me, other(170500911, '302')] }, me).length, 1);
  assert.equal(planConflicts({ ops: [me, other(170500912, 'CASA')] }, me).length, 1, 'Casa Completa ocupa todas las habitaciones');
  assert.equal(planConflicts({ ops: [me, other(170500913, '201')] }, me).length, 0);
  assert.equal(planConflicts({ ops: [me, other(170500914, '302', { op: OPS.CANCEL_ORDER })] }, me).length, 0);
  assert.equal(planConflicts({ ops: [me, other(170500915, '302', { arrival: '2026-11-21', departure: '2026-11-23' })] }, me).length, 0, 'salir el dia que otro llega no es conflicto');
  const casaOp = opFor(ID, { unit: 'CASA' });
  assert.equal(planConflicts({ ops: [casaOp, { ...me, smoobuId: 170500916, arrival: '2026-11-20', departure: '2026-11-21' }] }, casaOp).length, 1);
  e = env();
  const w = new ShadowWaWriter({ maxWrites: 3 });
  const res = await go(e, me, { plan: { ops: [me, other(170500917, 'CASA')] }, writer: w });
  assert.ok(failing(res).includes('SIN_CONFLICTO_EN_EL_PLAN:CONFLICTO_CON_OTRA_RESERVA')); assert.equal(w.writes, 0);
});

/* ---------- seleccion unica ---------- */

test('seleccion unica por ID: formato estricto, debe estar exactamente una vez en el plan; las demas operaciones no se ejecutan', async () => {
  for (const bad of ['', 'abc', '12345', '1234567890123', '170500101; rm -rf /', '170500101 ', null, undefined]) {
    if (bad === '170500101 ') { assert.equal(parsePilotSelection(bad), ID); continue; } // los espacios del borde se recortan
    assert.throws(() => parsePilotSelection(bad), /PILOTO_ID_INVALIDO/, String(bad));
  }
  const e = env();
  assert.equal((await go(e, null, { plan: { ops: [] } })).halted, 'PILOTO_RESERVA_NO_UNICA_EN_EL_PLAN');
  assert.equal((await go(e, null, { plan: { ops: [opFor(), opFor()] } })).halted, 'PILOTO_RESERVA_NO_UNICA_EN_EL_PLAN');
  // dos reservas listas en el plan: se ejecuta SOLO la elegida
  const A = opFor(ID); const B = opFor(170500102, { arrival: '2026-12-10', departure: '2026-12-11' });
  const w = new ShadowWaWriter({ maxWrites: 3 });
  const r = await go(e, A, { plan: { ops: [B, A] }, writer: w });
  assert.equal(r.halted, null, JSON.stringify(r));
  assert.deepEqual([r.results.length, w.writes], [1, 3]);
  // un token de otra operacion no autoriza la elegida
  const fp = stateFingerprint(reservation());
  const wrongTok = await runPilotWa({ plan: { ops: [A, B] }, smoobuId: ID, approval: pilotWaApprovalToken(B, fp), reader: e.reader, writer: new ShadowWaWriter({ maxWrites: 3 }), smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY });
  assert.equal(wrongTok.halted, 'PILOTO_TOKEN_NO_CORRESPONDE_AL_ESTADO_ACTUAL');
  // si la reserva cambia en Smoobu despues de aprobar, el token deja de valer
  const changed = await go(e, A, { rest: {} , fresh: reservation(ID, { price: 91000 }) });
  assert.equal(changed.halted, 'PILOTO_TOKEN_NO_CORRESPONDE_AL_ESTADO_ACTUAL');
});

test('clave de administrador: exige el segundo token propio (-WA-); sin el, no lee mas ni escribe', async () => {
  const e = env({ admin: true });
  const op = opFor(); const fp = stateFingerprint(reservation());
  const w = new ShadowWaWriter({ maxWrites: 3 });
  const base = { plan: { ops: [op] }, smoobuId: ID, approval: pilotWaApprovalToken(op, fp), reader: e.reader, writer: w, smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: TODAY };
  assert.equal((await runPilotWa(base)).halted, 'PILOTO_REQUIERE_APROBACION_ADMIN');
  assert.equal((await runPilotWa({ ...base, adminApproval: 'APROBADO' })).halted, 'PILOTO_REQUIERE_APROBACION_ADMIN');
  assert.equal(w.writes, 0);
  assert.equal((await runPilotWa({ ...base, adminApproval: pilotWaAdminToken(op, fp) })).halted, null);
  assert.notEqual(pilotWaApprovalToken(op, fp), pilotWaAdminToken(op, fp));
  for (const t of [pilotWaApprovalToken(op, fp), pilotWaAdminToken(op, fp)]) assert.ok(!t.includes(String(ID)));
});

/* ---------- escritura real (cliente armado SOLO en la prueba) ---------- */

const armedClient = (e, op, { selectedId = ID } = {}) => { const c = new PilotWaWriteClient({ ...e.cfg, op, selectedId, arm: PILOT_WA_ARM_PHRASE }); c.armCheck = () => true; return c; };

test('borrador sintetico completo: contacto + pedido en BORRADOR + nota HTML con wa.me; despues el cliente queda CONSUMIDO y los historicos intactos', async () => {
  const e = env();
  const op = opFor();
  const c = armedClient(e, op);
  const r = await go(e, op, { writer: c });
  assert.deepEqual([r.results[0].result, c.writes, c.spent], [RESULT.APLICADA, 3, true], JSON.stringify(r));
  const created = e.odoo.t['sale.order'].find((o) => o.x_pms_reference === `SMOOBU-${ID}`);
  assert.deepEqual([created.state, e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], ['draft', 3, 3]);
  const line = e.odoo.t['sale.order.line'].find((l) => l.order_id === created.id);
  assert.deepEqual([line.price_unit, line.x_precio_manual, line.tax_ids.length], [90100, 90100, 0]);
  assert.deepEqual([e.odoo.t['planning.slot'].length, (e.odoo.t['account.move'] ?? []).length, (e.odoo.t['account.payment'] ?? []).length], [0, 0, 0]);
  const note = e.odoo.t.notes.at(-1);
  assert.equal(note.id, created.id);
  assert.match(note.body, /^ATH-SYNC \| clave [0-9a-f]{16} \| SMOOBU-170500101 \| CREATE_ORDER \| WhatsApp \(abre el chat, envio manual\): <a href="https:\/\/wa\.me\/573001234567\?text=[A-Za-z0-9%._~-]+" target="_blank" rel="noopener noreferrer">Abrir chat de WhatsApp<\/a>$/);
  assert.ok(decoded(note.body).startsWith('Hola Ana, le escribimos de Atheron Hotels. Recibimos su reserva del 20/11/2026 al 21/11/2026.'));
  assert.equal(histNow(e), histBefore(e), 'COT/2026/03847 y 03848 (sinteticos) no cambian');
  assert.equal(e.odoo.t['mail.message'].filter((m) => m.res_id === 22192).length, 1, 'ni siquiera se les agrega una nota');
  await assert.rejects(c.execute('sale.order', 'create', { vals_list: [{}] }), /PILOT_CONSUMED/);
  const again = await go(e, op, { writer: armedClient(e, op) });
  assert.equal(again.halted, 'PILOTO_YA_APLICADO_VERIFICADO_POR_LECTURA'); // repetirlo no duplica
  assert.deepEqual([e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], [3, 3]);
});

test('el cliente solo puede escribir la reserva elegida: otra reserva, otro numero en la nota o una nota sin wa.me quedan fuera de alcance', async () => {
  const e = env();
  const op = opFor();
  assert.throws(() => new PilotWaWriteClient({ ...e.cfg, op, selectedId: 170500999, arm: PILOT_WA_ARM_PHRASE }), /PILOT_WA_SELECCION_NO_COINCIDE/);
  const other = opFor(170500102, { arrival: '2026-12-10', departure: '2026-12-11' });
  const c = armedClient(e, op);
  // contacto o pedido de OTRA reserva
  await assert.rejects(c.execute('res.partner', 'create', { vals_list: [{ name: 'Otra Persona', ref: 'SMOOBU-170500102' }] }), /PILOT_WRITE_OUTSIDE_SCOPE/);
  await assert.rejects(c.execute('sale.order', 'create', { vals_list: [{ partner_id: 1, x_pms_reference: 'SMOOBU-170500102', order_line: other.payload.lines.map((l) => [0, 0, { ...l, tax_ids: [[6, 0, []]] }]) }] }), /PILOT_WRITE_OUTSIDE_SCOPE/);
  assert.equal(c.writes, 0);
  // nota: simula haber creado el pedido y prueba cuerpos incorrectos
  c.orderId = 777; c.partnerCreated = true;
  const base = { ids: [777], message_type: 'comment', subtype_xmlid: 'mail.mt_note', body_is_html: true };
  const head = `ATH-SYNC | clave ${op.key} | SMOOBU-${ID} | CREATE_ORDER`;
  const a = (digits) => `<a href="https://wa.me/${digits}?text=Hola" target="_blank" rel="noopener noreferrer">Abrir</a>`;
  for (const body of [`${head} | ${a('573109999999')}`, `${head} | sin enlace`, `${head} | ${a('573001234567')}${a('573001234567')}`, `ATH-SYNC | clave otra | SMOOBU-${ID} | CREATE_ORDER | ${a('573001234567')}`, `${head} | https://wa.me/573001234567?text=Hola`]) {
    await assert.rejects(c.execute('sale.order', 'message_post', { ...base, body }), /PILOT_WA_NOTA_FUERA_DE_ALCANCE|SYNC_WRITE_NOTE_HTML_INVALID/, body);
  }
  assert.equal(c.writes, 0);
  // nunca confirmar, cancelar, modificar, facturar ni cobrar
  for (const [m, meth, p] of [['sale.order', 'action_confirm', { ids: [777] }], ['sale.order', 'write', { ids: [777], vals: { x_checkin: 'x' } }], ['sale.order', 'write', { ids: [22192], vals: { x_checkin: 'x' } }], ['account.move', 'create', {}], ['account.payment', 'create', {}]]) {
    await assert.rejects(c.execute(m, meth, p), /PILOT_WRITE_OUTSIDE_SCOPE|SYNC_WRITE/, `${m}.${meth}`);
  }
  assert.equal(c.writes, 0);
});

test('recuperacion: si falla la nota despues de crear contacto y pedido, el cliente queda consumido, nada se borra y repetir no duplica', async () => {
  const e = env();
  const op = opFor();
  e.odoo.fault({ model: 'sale.order', method: 'message_post', when: 'before', status: 400 });
  const c = armedClient(e, op);
  const r = await go(e, op, { writer: c });
  assert.equal(r.halted, 'FALLO_PARCIAL', JSON.stringify(r));
  assert.equal(c.spent, true);
  assert.deepEqual([e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], [3, 3], 'quedan contacto y pedido; no se borra nada');
  assert.equal(histNow(e), histBefore(e));
  assert.equal(e.journal.incomplete().length, 1);
  const again = await go(e, op, { writer: armedClient(e, op) });
  assert.ok(['PILOTO_YA_APLICADO_VERIFICADO_POR_LECTURA'].includes(again.halted) || again.recovered?.length, JSON.stringify(again));
  assert.deepEqual([e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], [3, 3], 'sin duplicados');
});

/* ---------- desactivado, aislamiento y privacidad ---------- */

test('desactivado: PILOT_WA_ARMED=false y sin ventana; ni la frase propia ni la del piloto anterior ni la global permiten escribir', async () => {
  const disarmed = PILOT_WA_ARMED === false && PILOT_WA_NOT_BEFORE === null && PILOT_WA_NOT_AFTER === null;
  const validWindow = PILOT_WA_ARMED === true && Date.parse(PILOT_WA_NOT_AFTER) - Date.parse(PILOT_WA_NOT_BEFORE) <= 15 * 60000;
  assert.ok(disarmed || validWindow, 'configuracion del piloto aislado fuera de lo autorizado');
  const e = env(); const op = opFor();
  let fetched = 0;
  const cfg = { ...e.cfg, fetchImpl: async () => { fetched += 1; return { ok: true, json: async () => [1] }; } };
  for (const arm of [PILOT_WA_ARM_PHRASE, PILOT_ARM_PHRASE, SYNC_ARM_PHRASE, null]) {
    const c = new PilotWaWriteClient({ ...cfg, op, selectedId: ID, arm, clock: () => new Date('2026-11-04T12:00:00Z') });
    await assert.rejects(c.execute('res.partner', 'create', { vals_list: [{ name: 'Ana Sintetica Ficticia', ref: `SMOOBU-${ID}` }] }), /SYNC_WRITES_DISABLED/);
  }
  assert.equal(fetched, 0);
  const r = await go(e, op, { writer: new PilotWaWriteClient({ ...cfg, op, selectedId: ID, arm: PILOT_WA_ARM_PHRASE }) });
  assert.equal(r.halted, 'PILOTO_DESACTIVADO');
  assert.deepEqual([e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], [2, 2]);
  const now = new Date('2026-11-04T12:00:00Z'); const w = { notBefore: '2026-11-04T11:55:00Z', notAfter: '2026-11-04T12:10:00Z' };
  assert.equal(pilotWaArmedBy({ armed: true, ...w, arm: PILOT_WA_ARM_PHRASE, now }), true);
  for (const k of [{ armed: false, ...w, arm: PILOT_WA_ARM_PHRASE }, { armed: true, ...w, arm: PILOT_ARM_PHRASE }, { armed: true, notBefore: '2026-11-04T11:50:00Z', notAfter: '2026-11-04T12:10:00Z', arm: PILOT_WA_ARM_PHRASE }, { armed: true, notBefore: null, notAfter: w.notAfter, arm: PILOT_WA_ARM_PHRASE }]) assert.equal(pilotWaArmedBy({ now, ...k }), false, JSON.stringify(k));
  assert.notEqual(PILOT_WA_ARM_PHRASE, PILOT_ARM_PHRASE);
});

test('aislamiento: no usa SYNC_ARM, SYNC_DESBLOQUEO, SYNC_ENABLED ni el bloqueo #101; la sincronizacion programada sigue como estaba', () => {
  const root = new URL('../', import.meta.url);
  const files = ['src/sync-pilot-wa.mjs', 'src/sync-pilot-wa-client.mjs', 'scripts/sync-pilot-wa.mjs'].map((f) => [f, readFileSync(new URL(f, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')]);
  for (const [f, src] of files) {
    for (const banned of ['SYNC_ARM', 'SYNC_DESBLOQUEO', 'SYNC_ENABLED', 'SYNC_KILL', 'readWriteLatch', 'AUTO_ARMED', 'AutoWriteClient', 'BLOQUEO-ESCRITURA', 'process.env.GH_TOKEN']) assert.ok(!src.includes(banned), `${f} menciona ${banned}`);
  }
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-pilot-wa.yml', import.meta.url), 'utf8').replace(/^\s*#.*$/gm, '');
  assert.ok(!/schedule:|cron:/.test(wf), 'sin programacion');
  for (const banned of ['SYNC_ARM', 'SYNC_DESBLOQUEO', 'SYNC_ENABLED', 'SYNC_KILL', 'issues:', 'contents: write', 'secrets.ODOO_API_KEY_']) assert.ok(!wf.includes(banned), banned);
  assert.ok(wf.includes('SMOOBU_API_KEY: ${{ secrets.SMOOBU_API_SECRET }}') && wf.includes('SMOOBU_API_SECRET: ${{ secrets.SMOOBU_API_KEY }}'), 'cruce de secretos de Smoobu');
  assert.ok(wf.includes("PILOT_WA_DRY: ${{ inputs.modo == 'real' && '0' || '1' }}") && wf.includes('PILOT_WA_ID: ${{ inputs.reservation_id }}'));
  assert.ok(!/run:.*inputs\./.test(wf), 'las entradas van por entorno, nunca interpoladas en el script');
  // el interruptor de la sincronizacion programada no cambia con este desarrollo
  assert.equal(AUTO_ARMED, true);
  const sched = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-sync-scheduled.yml', import.meta.url), 'utf8');
  assert.ok(sched.includes("vars.SYNC_ENABLED == 'true'") && !sched.includes('pilot-wa'));
});

test('privacidad: ni el script ni el modulo imprimen telefono, correo, nombre, enlaces ni IDs completos; la salida usa solo hechos', async () => {
  const src = readFileSync(new URL('../scripts/sync-pilot-wa.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('assertPublicSafe(') && src.includes('maskSmoobu(') && src.includes('noteHtml: note'));
  assert.ok(!/console\.log\([^)]*(phone|email|guest|name)/.test(src.replace(/phone: \{ valid/, '')));
  const e = env(); const w = new ShadowWaWriter({ maxWrites: 3 });
  const r = await go(e, null, { writer: w });
  const facts = JSON.stringify({ results: r.results, checks: r.checks, note: w.noteFacts(PHONE), fp: r.fingerprint });
  for (const banned of ['573001234567', '300 123 4567', 'wa.me/', 'sintetico@example.invalid', 'Ana Sintetica']) assert.ok(!facts.includes(banned), banned);
  assert.equal(daysUntil('2026-11-03', '2026-11-20'), 17);
  assert.equal(PILOT_WA_MIN_LEAD_DAYS, 7);
});
