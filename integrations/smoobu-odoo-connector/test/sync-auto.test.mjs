import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';
import { runAuto, autoWriter, autoPlan, maxOpsFromEnv, alertsFrom, renderAlerts, buildOccupancyBoard, renderOccupancyBoard, CELL, readDailyCreates, readTotalCreates, shutdownReason, haltOnPrecondition, AUTO_DAILY_MAX, DAILY_READ_LIMIT } from '../src/sync-auto.mjs';
import { approvalToken, DEFAULT_LIMITS } from '../src/sync-semiauto.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-DEV-125 — Datos SINTETICOS, Odoo simulado.
const APT = { 201: 3557506, 202: 3557511, 302: 3557526 };
const NAMES = ['Ana Uno Ficticia', 'Bea Dos Ficticia', 'Carla Tres Ficticia', 'Dora Cuatro Ficticia', 'Eva Cinco Ficticia'];
const mk = (i, unit = '201', price = 85000) => {
  const id = 170800000 + i; const a = `2026-11-${String(10 + i * 2).padStart(2, '0')}`; const d = `2026-11-${String(11 + i * 2).padStart(2, '0')}`;
  const payload = buildCreatePayload({ smoobuId: id, unit, arrival: a, departure: d, source: 'direct', price, guest: { name: NAMES[i], email: null, phone: null } });
  return { op: { smoobuId: id, unit, arrival: a, departure: d, op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [], payload, changes: [], key: opKey(id, OPS.CREATE_ORDER, payload) }, bk: { id, type: 'reservation', apartment: { id: APT[unit] }, arrival: a, departure: d, price } };
};
const other = (op, id, status = STATUS.REQUIERE_APROBACION) => { const payload = { action: op }; return { smoobuId: id, unit: '201', arrival: '2026-11-30', departure: '2026-12-01', op, status, guards: [], payload, orderId: 9, changes: [], key: opKey(id, op, payload) }; };
function env() { const odoo = new FakeOdoo(); return { odoo, reader: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch }), journal: new Journal(), lock: new MemoryLock() }; }
const sm = (list) => ({ async getReservation(id) { return list.find((b) => b.id === id); } });
const ON = { SYNC_ENABLED: 'true' };

test('incremental: crea en lote solo los borradores que faltan, con tope SYNC_MAX_OPS; la siguiente ejecucion no repite', async () => {
  const e = env(); const items = [0, 1, 2, 3].map((i) => mk(i));
  const plan = { ops: items.map((x) => x.op) };
  const r1 = await runAuto({ plan, env: { ...ON, SYNC_MAX_OPS: '2' }, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm(items.map((x) => x.bk)), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  // ATH-DEV-128: la variable pide 2, pero el tope fijo de la fase es 1 reserva por ejecucion
  assert.deepEqual(r1.results.map((x) => x.result), [RESULT.APLICADA, RESULT.NO_PROCESADA, RESULT.NO_PROCESADA, RESULT.NO_PROCESADA]);
  assert.ok(e.odoo.t['sale.order'].every((o) => o.state === 'draft'));
  const r2 = await runAuto({ plan, env: { ...ON, SYNC_MAX_OPS: '2' }, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm(items.map((x) => x.bk)), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual(r2.results.map((x) => x.result), [RESULT.YA_APLICADA, RESULT.APLICADA, RESULT.NO_PROCESADA, RESULT.NO_PROCESADA]);
  assert.equal(e.odoo.t['sale.order'].length, 2); assert.equal(e.odoo.t['planning.slot'].length, 0);
});

test('nunca confirma, cancela ni modifica: ni con tokens de aprobacion; y el escritor rechaza esos metodos', async () => {
  const conf = other(OPS.CONFIRM_ORDER, 170800100); const canc = other(OPS.CANCEL_ORDER, 170800101); const upd = other(OPS.UPDATE_ORDER, 170800102, STATUS.LISTO);
  const p = autoPlan({ ops: [conf, canc, upd] }, { limits: DEFAULT_LIMITS });
  assert.ok(p.ops.every((o) => o.status === STATUS.REQUIERE_APROBACION));
  const e = env();
  const r = await runAuto({ plan: { ops: [conf, canc, upd] }, env: { ...ON, SYNC_APPROVALS: [conf, canc, upd].map(approvalToken).join(',') }, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm([]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.ok(r.results.every((x) => x.result === RESULT.NO_ELEGIBLE)); assert.equal(e.odoo.calls.filter((c) => !/search_read|fields_get|search_count/.test(c)).length, 0);
  const w = autoWriter(new RecordingWriter(), { maxOps: 3 });
  for (const [m, meth] of [['sale.order', 'action_confirm'], ['sale.order', 'action_cancel'], ['sale.order', 'write'], ['sale.order.line', 'write'], ['account.payment', 'create'], ['account.move', 'create']]) await assert.rejects(w.execute(m, meth, { ids: [1], vals: {} }), /SYNC_WRITE_AUTO_METHOD_FORBIDDEN/, `${m}.${meth}`);
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED], [false, false]);
});

test('apagado y limites: sin SYNC_ENABLED no arranca; SYNC_MAX_OPS fuera de 1..10 es error; escritor con tope por lote', async () => {
  const e = env();
  assert.equal((await runAuto({ plan: { ops: [mk(0).op] }, env: {}, reader: e.reader, writer: new RecordingWriter(), smoobu: sm([]), journal: e.journal, lock: e.lock, today: '2026-11-05' })).halted, 'APAGADO_NO_HABILITADO');
  assert.equal(e.odoo.calls.length, 0);
  assert.equal(maxOpsFromEnv({}), 1); assert.equal(maxOpsFromEnv({ SYNC_MAX_OPS: '3' }), 1); for (const bad of ['0', '11', 'x', '2.5']) assert.throws(() => maxOpsFromEnv({ SYNC_MAX_OPS: bad }), /SYNC_MAX_OPS_INVALID/);
  assert.equal(autoWriter(new RecordingWriter(), { maxOps: 2 }).maxWrites, 6);
});

test('alertas: paradas graves, conflictos y sobreventas; enmascaradas', () => {
  const report = { perReservation: [{ smoobuId: 170800200, unit: '302', arrival: '2026-11-20', verdict: 'CONFLICT', reason: 'CANCELADA_EN_SMOOBU_VIGENTE_EN_ODOO' }, { smoobuId: 170800201, unit: 'CASA', arrival: '2027-01-04', verdict: 'MISSING_IN_ODOO', manualReview: 'X' }] };
  const a = alertsFrom({ run: { halted: 'RESULTADO_AMBIGUO', results: [{ smoobuId: 170800202, op: 'CREATE_ORDER', result: 'AMBIGUA', code: 'ODOO_NETWORK_ERROR' }] }, report });
  assert.deepEqual(a.map((x) => x.level), ['error', 'error', 'warning', 'warning']);
  assert.ok(!JSON.stringify(a).match(/1708002\d\d/));
  assert.equal(alertsFrom({ run: { halted: 'APAGADO_NO_HABILITADO', results: [] }, report: { perReservation: [] } }).length, 0);
});

test('tablero de ocupacion: cinco habitaciones fisicas (Casa NO es fila), Casa marca las cinco con K; codigos C/B/P/X', () => {
  const report = { perReservation: [
    { smoobuId: 1, unit: '201', arrival: '2026-11-05', departure: '2026-11-07', smoobuStatus: 'ACTIVE', verdict: 'MATCH' },
    { smoobuId: 2, unit: '302', arrival: '2026-11-06', departure: '2026-11-07', smoobuStatus: 'ACTIVE', verdict: 'MATCH_DRAFT' },
    { smoobuId: 3, unit: '202', arrival: '2026-11-05', departure: '2026-11-06', smoobuStatus: 'ACTIVE', verdict: 'MISSING_IN_ODOO' },
    { smoobuId: 4, unit: 'CASA', arrival: '2026-11-08', departure: '2026-11-09', smoobuStatus: 'ACTIVE', verdict: 'MISSING_IN_ODOO' },
    { smoobuId: 5, unit: '203', arrival: '2026-11-05', departure: '2026-11-06', smoobuStatus: 'CANCELLED', verdict: 'CONFLICT' },
  ] };
  const plan = { ops: [{ smoobuId: 4, status: STATUS.BLOQUEADO, guards: [GUARDS.SOBREVENTA] }] };
  const b = buildOccupancyBoard({ report, plan, from: '2026-11-05', nights: 5 });
  assert.deepEqual(b.rows.map((r) => r.unit), ['201', '202', '203', '301', '302']);
  const row = (u) => b.rows.find((r) => r.unit === u).cells;
  assert.deepEqual(row('201'), ['C', 'C', '.', 'K' + CELL.CONFLICTO, '.']);
  assert.deepEqual(row('302'), ['.', 'B', '.', 'KX', '.']);
  assert.deepEqual(row('202')[0], 'P'); assert.deepEqual(row('203')[0], 'X');
  assert.ok(b.rows.every((r) => r.cells[3] === 'KX')); // Casa: las cinco marcadas, sin sexta fila
  const md = renderOccupancyBoard(b); assert.ok(!/CASA \|/.test(md)); assert.match(md, /\| 301 \|/);
});

test('workflow programado: cron + manual, guardado por SYNC_ENABLED, solo lectura de repo, sin simultaneidad, frase enmascarada', () => {
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-sync-scheduled.yml', import.meta.url), 'utf8');
  assert.match(wf, /\n {2}schedule:\n(?: {4}#[^\n]*\n)* {4}- cron: '\d+ [^']+'/); assert.match(wf, /\n {2}workflow_dispatch:/);
  assert.match(wf, /if: \$\{\{ vars\.SYNC_ENABLED == 'true' \}\}/);
  assert.match(wf, /\npermissions:\n {2}contents: read\n/);
  // ATH-DEV-130: el UNICO permiso de escritura es issues:write en el job de apagado (abrir el pestillo); nada deshabilita el workflow
  assert.deepEqual(wf.match(/^.*: write.*$/gm), ['      issues: write']);
  assert.ok(!/workflow disable|actions: write/.test(wf), 'el apagado ya no deshabilita la vigilancia en sombra');
  const off = wf.slice(wf.indexOf('\n  apagado:'));
  assert.match(off, /needs: sync/); assert.match(off, /needs\.sync\.result != 'success' && needs\.sync\.result != 'skipped'/);
  assert.match(off, /\n {4}permissions:\n {6}issues: write\n {4}steps:/); assert.match(off, /BLOQUEO-ESCRITURA-SYNC/); assert.match(off, /\|\| MAX=-1/);
  assert.ok(!/secrets\.|checkout|npm /.test(off), 'el job de apagado no lee secretos ni ejecuta codigo del repo');
  const sync = wf.slice(wf.indexOf('\n  sync:'), wf.indexOf('\n  apagado:'));
  assert.match(sync, /\n {4}permissions:\n {6}contents: read\n {6}issues: read\n/);
  assert.match(sync, /SYNC_DESBLOQUEO: \$\{\{ vars\.SYNC_DESBLOQUEO \}\}/); assert.match(sync, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(wf, /cancel-in-progress: false/); assert.match(wf, /::add-mask::\$SYNC_ARM/); assert.match(wf, /SYNC_KILL: \$\{\{ vars\.SYNC_KILL \}\}/);
  assert.ok(!/run:.*\$\{\{/.test(wf));
  const diag = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-diagnose.yml', import.meta.url), 'utf8');
  assert.match(diag.slice(diag.indexOf("inputs.mode == 'sync-auto-shadow'")).slice(0, 500), /SYNC_SHADOW: '1'/);
});

test('tablero: una operacion pendiente o bloqueada sobre un pedido existente no cambia su ocupacion (caso real 30/10)', () => {
  const report = { perReservation: [
    { smoobuId: 11, unit: '201', arrival: '2026-11-05', departure: '2026-11-06', smoobuStatus: 'ACTIVE', verdict: 'MATCH' }, // relleno pendiente
    { smoobuId: 12, unit: '202', arrival: '2026-11-05', departure: '2026-11-06', smoobuStatus: 'ACTIVE', verdict: 'MATCH' }, // facturado: relleno bloqueado
    { smoobuId: 13, unit: '203', arrival: '2026-11-05', departure: '2026-11-06', smoobuStatus: 'ACTIVE', verdict: 'MATCH_DRAFT' }, // borrador con aprobacion pendiente
  ] };
  const plan = { ops: [{ smoobuId: 11, status: STATUS.REQUIERE_APROBACION }, { smoobuId: 12, status: STATUS.BLOQUEADO }, { smoobuId: 13, status: STATUS.REQUIERE_APROBACION }] };
  const b = buildOccupancyBoard({ report, plan, from: '2026-11-05', nights: 1 });
  assert.deepEqual(b.rows.slice(0, 3).map((r) => r.cells[0]), ['C', 'C', 'B']);
});

test('interruptor propio: AUTO_ARMED=true (ATH-DEV-134) pero SIN la frase SYNC_ARM no escribe; sin depender de los globales', async () => {
  const { AutoWriteClient, AUTO_ARMED, AUTO_ARM_PHRASE, autoArmedBy } = await import('../src/sync-auto-client.mjs');
  assert.equal(AUTO_ARMED, true);
  assert.deepEqual([autoArmedBy({ armed: true, arm: AUTO_ARM_PHRASE }), autoArmedBy({ armed: true, arm: 'si' }), autoArmedBy({ armed: false, arm: AUTO_ARM_PHRASE })], [true, false, false]);
  let sent = 0;
  const fetchImpl = async () => { sent += 1; return { ok: true, json: async () => [1] }; };
  // sin SYNC_ARM (hoy no existe), con otra frase o contra otro Odoo: ni una peticion
  for (const opts of [{ arm: null }, { arm: '' }, { arm: 'ACTIVAR' }, { arm: AUTO_ARM_PHRASE.toLowerCase() }]) {
    const off = new AutoWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', fetchImpl, ...opts });
    await assert.rejects(off.execute('sale.order', 'create', { vals_list: [{}] }), /SYNC_WRITES_DISABLED/);
  }
  const other = new AutoWriteClient({ baseUrl: 'https://otro.odoo.com', database: 'otro', apiKey: 'k', arm: AUTO_ARM_PHRASE, fetchImpl });
  await assert.rejects(other.execute('sale.order', 'create', { vals_list: [{}] }), /SYNC_TARGET_NOT_AUTHORIZED/);
  assert.equal(sent, 0);
  const c = new AutoWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', arm: null, fetchImpl });
  c.armed = true; // solo en la prueba: aun armado, nada fuera de crear contacto/pedido/nota
  for (const [m, meth] of [['sale.order', 'action_confirm'], ['sale.order', 'action_cancel'], ['sale.order', 'write'], ['account.payment', 'create']]) await assert.rejects(c.execute(m, meth, { ids: [1] }), /SYNC_WRITE_AUTO_METHOD_FORBIDDEN/);
  assert.equal(sent, 0);
  const src = readFileSync(new URL('../scripts/sync-auto.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/WRITES_ENABLED|RELEASE_UNLOCKED|SyncWriteClient/.test(src), 'el script no depende de los interruptores globales');
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED], [false, false]);
});

test('ATH-DEV-128: precio EXACTO, estado vigente, canal y huesped sin cambios en Smoobu; si no, no se escribe y se avisa', async () => {
  const base = mk(0);
  const op = { ...base.op, channelId: 7192171 };
  const cases = [
    [{ price: base.bk.price + 1 }, 'PRECIO_CAMBIO_EN_SMOOBU'],
    [{ type: 'OverBooking' }, 'ESTADO_NO_VALIDO_EN_SMOOBU'],
    [{ 'is-blocked-booking': true }, 'ESTADO_NO_VALIDO_EN_SMOOBU'],
    [{ channel: { id: 7208046 } }, 'CANAL_CAMBIO_EN_SMOOBU'],
    [{ 'guest-name': 'Otra Persona Distinta' }, 'HUESPED_CAMBIO_EN_SMOOBU'],
  ];
  for (const [change, code] of cases) {
    const e = env();
    const r = await runAuto({ plan: { ops: [op] }, env: ON, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm([{ ...base.bk, channel: { id: 7192171 }, 'guest-name': NAMES[0], ...change }]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
    assert.deepEqual([r.results[0].result, r.results[0].code, e.odoo.t['sale.order'].length], [RESULT.PRECONDICION_FALLIDA, code, 0], code);
    assert.ok(alertsFrom({ run: r, report: { perReservation: [] } }).some((a) => a.level === 'warning' && a.text.includes(code)));
  }
});

test('ATH-DEV-128: el cliente automatico no puede anotar ni tocar pedidos existentes ni crear dos pedidos con la misma referencia', async () => {
  const { AutoWriteClient, AUTO_ARM_PHRASE } = await import('../src/sync-auto-client.mjs');
  const odoo = new FakeOdoo({ 'sale.order': [{ id: 22192, state: 'draft', x_pms_reference: 'SMOOBU-1' }] });
  const c = new AutoWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', arm: AUTO_ARM_PHRASE, fetchImpl: odoo.fetch });
  c.armed = true; // solo en la prueba
  const note = (id) => ({ ids: [id], body: 'ATH-SYNC | x', message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
  await assert.rejects(c.execute('sale.order', 'message_post', note(22192)), /SYNC_WRITE_AUTO_EXISTING_ORDER_FORBIDDEN/); // p. ej. COT/2026/03847
  const { op } = mk(1);
  const vals = { vals_list: [{ partner_id: 1, ...op.payload.order, order_line: op.payload.lines.map((l) => [0, 0, { ...l, tax_ids: [[6, 0, []]] }]) }] };
  const [id] = await c.execute('sale.order', 'create', vals);
  await c.execute('sale.order', 'message_post', note(id)); // sobre su propio pedido: permitido
  await assert.rejects(c.execute('sale.order', 'create', vals), /SYNC_WRITE_AUTO_DUPLICATE_REF/);
  assert.equal(odoo.t['sale.order'].length, 2); assert.equal(odoo.t.notes.length, 1);
});

/* ---------------- ATH-DEV-129: cupo diario persistente, apagado automatico, idempotencia entre ejecuciones ---------------- */

// plan RECONSTRUIDO en cada ejecucion (como hace planSync): solo las reservas sin pedido con su referencia SMOOBU-<id>
const freshPlan = (odoo, items) => ({ ops: items.filter((x) => !odoo.t['sale.order'].some((o) => String(o.x_pms_reference ?? '').includes(`SMOOBU-${x.op.smoobuId}`))).map((x) => x.op) });
// cada ejecucion empieza con bitacora y candado NUEVOS: GitHub Actions no conserva nada entre ejecuciones ni tras reinicios
const fresh = (e, items, today = '2026-11-05', extra = {}) => runAuto({ plan: freshPlan(e.odoo, items), env: { ...ON, SYNC_MAX_OPS: '3' }, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm(items.map((x) => x.bk)), journal: new Journal(), lock: new MemoryLock(), today, ...extra });

test('ATH-DEV-129: cupo diario PERSISTENTE de 3, una por ejecucion; no se reinicia entre ejecuciones; al dia siguiente sigue', async () => {
  const e = env(); const items = [0, 1, 2, 3, 4].map((i) => mk(i));
  const runs = [];
  for (let i = 0; i < 5; i += 1) runs.push(await fresh(e, items));
  assert.deepEqual(runs.map((r) => r.results.filter((x) => x.result === RESULT.APLICADA).length), [1, 1, 1, 0, 0]);
  assert.deepEqual(runs.map((r) => r.daily.used), [0, 1, 2, 3, 3]);
  assert.deepEqual(runs.slice(3).map((r) => r.halted), ['CUPO_DIARIO_AGOTADO', 'CUPO_DIARIO_AGOTADO']);
  assert.equal(e.odoo.t['sale.order'].length, AUTO_DAILY_MAX); assert.ok(e.odoo.t['sale.order'].every((o) => o.state === 'draft'));
  // el cupo agotado es funcionamiento normal: no apaga la sincronizacion
  assert.equal(shutdownReason({ run: runs[4], report: { perReservation: [] } }), null);
  // nuevo dia de Bogota (desde las 05:00 UTC): vuelve a haber cupo
  e.odoo.msgDate = '2026-11-06 05:00:00';
  const next = await fresh(e, items, '2026-11-06');
  assert.deepEqual([next.daily.used, next.results.filter((x) => x.result === RESULT.APLICADA).length, e.odoo.t['sale.order'].length], [0, 1, 4]);
  assert.equal(await readTotalCreates(e.reader), 4);
});

test('ATH-DEV-129: el contador cuenta solo notas de CREAR de la sincronizacion de hoy; si no se puede leer completo, no se escribe', async () => {
  const note = (res_id, body, date = '2026-11-05 06:00:00') => ({ id: res_id + 1, model: 'sale.order', res_id, message_type: 'comment', body, date });
  const odoo = new FakeOdoo({ 'mail.message': [
    note(1, '<p>ATH-SYNC | clave aaaa | SMOOBU-1 | CREATE_ORDER</p>'), note(1, '<p>ATH-SYNC | clave aaaa | SMOOBU-1 | CREATE_ORDER</p>'), // mismo pedido: cuenta 1
    note(2, 'ATH-SYNC | clave bbbb | SMOOBU-2 | CONFIRM_ORDER'), note(3, 'nota manual de recepcion'),
    note(4, 'ATH-SYNC | clave cccc | SMOOBU-4 | CREATE_ORDER', '2026-11-05 04:59:59'), // 23:59 de ayer en Bogota
  ] });
  const reader = new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch });
  assert.equal(await readDailyCreates(reader, '2026-11-05'), 1);
  await assert.rejects(readDailyCreates(reader, '05/11/2026'), /CUPO_DIARIO_FECHA_INVALIDA/);
  odoo.t['mail.message'] = Array.from({ length: DAILY_READ_LIMIT }, (_, i) => note(100 + i, 'ATH-SYNC | clave x | SMOOBU-9 | CREATE_ORDER'));
  await assert.rejects(readDailyCreates(reader, '2026-11-05'), /CUPO_DIARIO_NO_VERIFICABLE/);
  // con 3 o mas ya creados hoy, runAuto no escribe nada
  const e = env(); e.odoo.t['mail.message'] = [1, 2, 3].map((i) => note(i, `ATH-SYNC | clave k${i} | SMOOBU-${i} | CREATE_ORDER`));
  const r = await runAuto({ plan: { ops: [mk(0).op] }, env: ON, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm([mk(0).bk]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual([r.halted, r.writes, e.odoo.t['sale.order'].length], ['CUPO_DIARIO_AGOTADO', 0, 0]);
});

test('ATH-DEV-129: idempotencia tras reinicio: bitacora perdida + plan viejo -> no duplica, se detecta como DUPLICADO y apaga', async () => {
  const e = env(); const items = [mk(0), mk(1)];
  await fresh(e, items);
  assert.equal(e.odoo.t['sale.order'].length, 1);
  // runner reiniciado: sin bitacora y con un plan calculado ANTES de la escritura (la reserva aun "falta")
  const stale = await runAuto({ plan: { ops: items.map((x) => x.op) }, env: ON, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm(items.map((x) => x.bk)), journal: new Journal(), lock: new MemoryLock(), today: '2026-11-05' });
  assert.deepEqual([stale.results[0].code, stale.halted, stale.results.length], ['PEDIDO_YA_EXISTE', 'DUPLICADO_DETECTADO', 1]);
  assert.deepEqual([e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], [1, 1]);
  assert.equal(shutdownReason({ run: stale, report: {} }), 'DUPLICADO_DETECTADO');
  // contacto creado y pedido NO (corte entre las dos escrituras): ATH-DEV-130 -> la siguiente ejecucion NO escribe (cerrojo
  // en Odoo: contacto SMOOBU-<id> sin pedido) hasta que una persona lo resuelva; nunca duplica
  const e2 = env(); const [x] = [mk(2)];
  e2.odoo.fault({ model: 'sale.order', method: 'create', when: 'before', kind: 'network' });
  const cut = await fresh(e2, [x]);
  assert.deepEqual([cut.halted, shutdownReason({ run: cut, report: {} }) != null, e2.odoo.t['res.partner'].length, e2.odoo.t['sale.order'].length], ['RESULTADO_AMBIGUO', true, 1, 0]);
  const again = await fresh(e2, [x]);
  assert.deepEqual([again.halted, again.audit.problems.map((p) => p.code), again.writes, e2.odoo.t['res.partner'].length, e2.odoo.t['sale.order'].length], ['AUDITORIA_ESCRITURAS', ['CONTACTO_SIN_PEDIDO'], 0, 1, 0]);
  assert.equal(shutdownReason({ run: again, report: {} }), 'AUDITORIA_ESCRITURAS');
});

test('ATH-DEV-129: apagado automatico ante cambios inesperados, duplicados, escrituras parciales o rechazos; no ante identidad dudosa', async () => {
  // cambio inesperado en Smoobu entre el plan y la escritura: para TODO (no sigue con la siguiente reserva)
  const e = env(); const a = mk(0); const b = mk(1);
  const r = await runAuto({ plan: { ops: [a.op, b.op] }, env: ON, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm([{ ...a.bk, price: a.bk.price + 1000 }, b.bk]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual([r.halted, r.results.length, e.odoo.t['sale.order'].length], ['CAMBIO_INESPERADO', 1, 0]);
  assert.equal(shutdownReason({ run: r, report: {} }), 'CAMBIO_INESPERADO');
  for (const c of ['PRECIO_CAMBIO_EN_SMOOBU', 'FECHAS_CAMBIARON_EN_SMOOBU', 'NOCHES_OCUPADAS_EN_ODOO', 'CONTACTO_BUSQUEDA_INCOMPLETA', 'RESERVA_CANCELADA_EN_SMOOBU']) assert.equal(haltOnPrecondition(c), 'CAMBIO_INESPERADO', c);
  for (const c of ['PEDIDO_YA_EXISTE', 'CONTACTOS_DUPLICADOS']) assert.equal(haltOnPrecondition(c), 'DUPLICADO_DETECTADO', c);
  // identidad dudosa: queda para una persona, NO apaga y NO consume el cupo de la ejecucion (la siguiente reserva sigue)
  const e2 = env(); e2.odoo.t['res.partner'].push({ id: 5, name: NAMES[0], ref: false, email: false, phone: false });
  const r2 = await runAuto({ plan: { ops: [a.op, b.op] }, env: ON, reader: e2.reader, writer: fakeWriter(e2.odoo, validateWrite), smoobu: sm([a.bk, b.bk]), journal: e2.journal, lock: e2.lock, today: '2026-11-05' });
  assert.deepEqual(r2.results.map((x) => [x.result, x.code ?? null]), [[RESULT.PRECONDICION_FALLIDA, 'COINCIDENCIA_SOLO_POR_NOMBRE'], [RESULT.APLICADA, null]]);
  assert.deepEqual([r2.halted, shutdownReason({ run: r2, report: {} })], [null, null]);
  // duplicados ya presentes en Odoo (conciliador): no se escribe nada
  const dup = { perReservation: [{ smoobuId: 170899999, verdict: 'AMBIGUOUS', reason: 'VARIOS_PEDIDOS_CON_EL_MISMO_ID' }] };
  const e3 = env();
  const r3 = await runAuto({ plan: { ops: [a.op] }, report: dup, env: ON, reader: e3.reader, writer: fakeWriter(e3.odoo, validateWrite), smoobu: sm([a.bk]), journal: e3.journal, lock: e3.lock, today: '2026-11-05' });
  assert.deepEqual([r3.halted, e3.odoo.calls.length, shutdownReason({ run: r3, report: dup })], ['DUPLICADO_DETECTADO', 0, 'DUPLICADO_DETECTADO']);
  // escritura parcial (contacto creado, Odoo rechaza el pedido) y fallos de verificacion/ambiguos
  const e4 = env(); e4.odoo.fault({ model: 'sale.order', method: 'create', when: 'before', status: 400, message: 'CHOQUE DE RESERVA' });
  const r4 = await runAuto({ plan: { ops: [a.op] }, env: ON, reader: e4.reader, writer: fakeWriter(e4.odoo, validateWrite), smoobu: sm([a.bk]), journal: e4.journal, lock: e4.lock, today: '2026-11-05' });
  assert.deepEqual([r4.halted, shutdownReason({ run: r4, report: {} })], ['FALLO_PARCIAL', 'FALLO_PARCIAL']);
  for (const result of ['AMBIGUA', 'VERIFICACION_FALLIDA', 'RECHAZADA_POR_ODOO']) assert.ok(shutdownReason({ run: { results: [{ result, code: 'X' }] }, report: {} }), result);
  for (const halted of ['APAGADO_NO_HABILITADO', 'APAGADO_INMEDIATO', 'CUPO_DIARIO_AGOTADO', null]) assert.equal(shutdownReason({ run: { halted, results: [{ result: RESULT.SIMULADA }, { result: RESULT.NO_ELEGIBLE }, { result: RESULT.PRECONDICION_FALLIDA, code: 'IDENTIDAD_AMBIGUA' }] }, report: { perReservation: [{ verdict: 'CONFLICT', reason: 'PEDIDO_FACTURADO' }] } }), null, String(halted));
  for (const halted of ['ODOO_NETWORK_ERROR', 'LECTURA_FALLIDA', 'SYNC_LOCKED', 'RECUPERACION_DUPLICADO_DETECTADO', 'PRIVACIDAD']) assert.ok(shutdownReason({ run: { halted }, report: {} }), halted);
});

test('ATH-DEV-129: el script programado sale con error ante cualquier motivo de apagado e informa el cupo', () => {
  const src = readFileSync(new URL('../scripts/sync-auto.mjs', import.meta.url), 'utf8');
  assert.match(src, /const stop = shutdownReason\(\{ run, report \}\);/); assert.match(src, /if \(stop\) process\.exit\(1\);/);
  assert.match(src, /runAuto\(\{ plan, report, env/); assert.match(src, /cupo diario = /);
});

/* ---------------- ATH-DEV-130: bloqueo persistente de escritura ---------------- */

test('ATH-DEV-130: pestillo de GitHub: un fallo bloquea; solo SYNC_DESBLOQUEO de gerencia lo quita; si no se puede leer, bloqueado', async () => {
  const { readWriteLatch, ackFrom } = await import('../src/sync-latch.mjs');
  const bot = { login: 'github-actions[bot]' };
  const issues = (rows) => async () => ({ ok: true, json: async () => rows });
  const call = (rows, ack) => readWriteLatch({ repo: 'o/r', token: 't', ack, fetchImpl: issues(rows) });
  assert.deepEqual(await call([], undefined), { latched: false, reason: null, pending: [], ack: 0 });
  const one = [{ number: 97, title: 'BLOQUEO-ESCRITURA-SYNC ejecucion 1', user: bot, state: 'open' }];
  assert.equal((await call(one, undefined)).latched, true);
  assert.equal((await call([{ ...one[0], state: 'closed' }], undefined)).latched, true, 'cerrar la incidencia no desbloquea');
  assert.equal((await call(one, 'DESBLOQUEO-97')).latched, false);
  assert.equal((await call([...one, { ...one[0], number: 120 }], 'DESBLOQUEO-97')).latched, true, 'un fallo nuevo vuelve a bloquear');
  for (const bad of ['si', 'DESBLOQUEO-', 'desbloqueo-97', 'DESBLOQUEO-97 x', '1', 'true']) assert.equal(ackFrom(bad), 0, bad);
  // solo cuentan las incidencias del bot con el titulo exacto; las pull requests no cuentan
  assert.equal((await call([{ ...one[0], user: { login: 'otra-persona' } }, { ...one[0], pull_request: {} }, { ...one[0], title: 'otra cosa' }], undefined)).latched, false);
  // falla cerrado
  for (const r of [
    await readWriteLatch({ repo: 'o/r', token: '', fetchImpl: issues([]) }),
    await readWriteLatch({ repo: '', token: 't', fetchImpl: issues([]) }),
    await readWriteLatch({ repo: 'o/r', token: 't', fetchImpl: async () => ({ ok: false, status: 403 }) }),
    await readWriteLatch({ repo: 'o/r', token: 't', fetchImpl: async () => { throw new TypeError('fetch failed'); } }),
    await readWriteLatch({ repo: 'o/r', token: 't', fetchImpl: issues({ message: 'raro' }) }),
    await readWriteLatch({ repo: 'o/r', token: 't', fetchImpl: issues(Array.from({ length: 100 }, (_, i) => ({ number: i, title: 'x', user: bot }))) }),
  ]) assert.deepEqual([r.latched, r.reason], [true, 'BLOQUEO_NO_VERIFICABLE']);
});

test('ATH-DEV-130: el script solo escribe si esta armado Y sin bloqueo; ninguna otra variable lo reactiva', () => {
  const src = readFileSync(new URL('../scripts/sync-auto.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.match(src, /const real = armed && !latch\.latched;/);
  assert.match(src, /readWriteLatch\(\{ repo: process\.env\.SYNC_LATCH_REPO, token: process\.env\.GH_TOKEN, ack: process\.env\.SYNC_DESBLOQUEO \}\)/);
  assert.equal((src.match(/new AutoWriteClient/g) ?? []).length, 1); assert.match(src, /const writer = real \? new AutoWriteClient/);
  assert.ok(!/SYNC_DESBLOQUEO|latch/.test(readFileSync(new URL('../src/sync-auto-client.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), 'el cliente no tiene otra puerta');
});

test('ATH-DEV-130: cerrojo en Odoo: contacto sin pedido o pedido duplicado de la sincronizacion bloquea; lectura truncada bloquea', async () => {
  const { auditSyncWrites, AUDIT_LIMIT } = await import('../src/sync-latch.mjs');
  const rd = (seed) => { const odoo = new FakeOdoo(seed); return { odoo, reader: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch }) }; };
  const msg = (res_id) => ({ id: res_id + 5000, model: 'sale.order', res_id, message_type: 'comment', body: `ATH-SYNC | clave k | SMOOBU-170900001 | CREATE_ORDER`, date: '2026-11-05 06:00:00' });
  const ok = rd({ 'res.partner': [{ id: 1, ref: 'SMOOBU-170900001' }, { id: 2, ref: 'CLIENTE-9' }], 'sale.order': [{ id: 10, state: 'draft', x_pms_reference: 'SMOOBU-170900001 / Airbnb HMXSINTET' }], 'mail.message': [msg(10)] });
  assert.deepEqual(await auditSyncWrites(ok.reader), { ok: true, problems: [] });
  const orphan = rd({ 'res.partner': [{ id: 1, ref: 'SMOOBU-170900001' }, { id: 3, ref: 'SMOOBU-170900002' }], 'sale.order': [{ id: 10, state: 'draft', x_pms_reference: 'SMOOBU-170900001' }], 'mail.message': [msg(10)] });
  assert.deepEqual((await auditSyncWrites(orphan.reader)).problems, [{ code: 'CONTACTO_SIN_PEDIDO', smoobuId: 170900002 }]);
  const dup = rd({ 'sale.order': [{ id: 10, state: 'draft', x_pms_reference: 'SMOOBU-170900001' }, { id: 11, state: 'sale', x_pms_reference: 'SMOOBU-170900001' }, { id: 12, state: 'cancel', x_pms_reference: 'SMOOBU-170900001' }], 'mail.message': [msg(10)] });
  assert.deepEqual((await auditSyncWrites(dup.reader)).problems, [{ code: 'PEDIDO_DUPLICADO', smoobuId: 170900001 }]);
  const many = rd({ 'res.partner': Array.from({ length: AUDIT_LIMIT }, (_, i) => ({ id: i + 1, ref: `SMOOBU-${i}` })) });
  assert.deepEqual((await auditSyncWrites(many.reader)).problems.map((p) => p.code), ['AUDITORIA_NO_VERIFICABLE']);
  // con el cerrojo activo runAuto no escribe ni lee reservas
  const e = env(); e.odoo.t['res.partner'].push({ id: 3, ref: 'SMOOBU-170900002' });
  const r = await runAuto({ plan: { ops: [mk(0).op] }, env: ON, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: { async getReservation() { throw new Error('no debe leer'); } }, journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual([r.halted, r.writes, e.odoo.t['sale.order'].length], ['AUDITORIA_ESCRITURAS', 0, 0]);
});

/* ---------------- ATH-DEV-132: alertas de conflictos conocidos y prueba controlada del bloqueo ---------------- */

test('ATH-DEV-132: pedido facturado, sobreventa y demas bloqueos del plan son AVISOS de GitHub y salen en el resumen; no apagan', () => {
  const blk = (id, unit, arrival, guards) => ({ smoobuId: id, unit, arrival, departure: '2027-01-05', op: OPS.BLOCKED, status: STATUS.BLOQUEADO, guards, payload: null, changes: [], key: 'k' });
  const plan = { ops: [blk(170825511, '203', '2026-10-18', ['PEDIDO_FACTURADO']), blk(170827596, 'CASA', '2027-01-04', ['SOBREVENTA']), { ...mk(0).op }] };
  const report = { perReservation: [{ smoobuId: 170829171, unit: '301', arrival: '2027-01-04', verdict: 'MATCH', overbookingWith: [1] }] };
  const run = { halted: null, results: [{ result: RESULT.SIMULADA }], plan };
  const alerts = alertsFrom({ run, report });
  assert.deepEqual(alerts, [
    { level: 'warning', text: 'SM*...9171 301 2027-01-04: SOBREVENTA' },
    { level: 'warning', text: 'SM*...5511 203 2026-10-18: BLOQUEADO PEDIDO_FACTURADO' },
    { level: 'warning', text: 'SM*...7596 CASA 2027-01-04: BLOQUEADO SOBREVENTA' },
  ]);
  assert.ok(alerts.every((a) => !/1708\d{5}/.test(a.text)), 'IDs enmascarados');
  assert.equal(shutdownReason({ run, report }), null, 'conflictos conocidos: no paran la vigilancia ni abren bloqueo');
  const md = renderAlerts(alerts);
  assert.match(md, /^### Alertas/); assert.match(md, /- \*\*AVISO\*\* SM\*\.\.\.5511 203 2026-10-18: BLOQUEADO PEDIDO_FACTURADO/);
  assert.match(renderAlerts([]), /\(ninguna\)/);
  // sin duplicados si el mismo aviso aparece dos veces
  assert.equal(alertsFrom({ run: { ...run, plan: { ops: [plan.ops[0], plan.ops[0]] } }, report: {} }).length, 1);
  const src = readFileSync(new URL('../scripts/sync-auto.mjs', import.meta.url), 'utf8');
  assert.match(src, /renderOccupancyBoard\(board\), renderAlerts\(alerts\)/); assert.match(src, /console\.log\(`::\$\{a\.level\}::/);
});

test('ATH-DEV-132: prueba controlada del bloqueo: solo manual, solo tras una sincronizacion correcta, solo puede anadir un bloqueo', () => {
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-sync-scheduled.yml', import.meta.url), 'utf8');
  assert.match(wf, /\n {6}prueba_bloqueo:\n(?: {8}#[^\n]*\n)* {8}description: [^\n]+\n {8}type: boolean\n {8}default: false\n/);
  const off = wf.slice(wf.indexOf('\n  apagado:'));
  assert.match(off, /\(github\.event_name == 'workflow_dispatch' && inputs\.prueba_bloqueo == true && needs\.sync\.result == 'success'\)/);
  // misma ruta que un fallo real: mismo paso, mismo titulo, misma deduplicacion; nada que quite un bloqueo
  assert.equal((off.match(/gh api -X POST "repos\/\$GH_REPO\/issues"/g) ?? []).length, 1);
  assert.match(off, /if \[ "\$MAX" -gt "\$ACK" \]/);
  assert.ok(!/state=closed|-X (PATCH|DELETE)|variables|SYNC_DESBLOQUEO=/.test(off), 'el apagado nunca cierra incidencias ni toca variables');
  const sync = wf.slice(wf.indexOf('\n  sync:'), wf.indexOf('\n  apagado:'));
  assert.ok(!/prueba_bloqueo/.test(sync), 'la prueba no cambia la sincronizacion');
});

test('ATH-DEV-134: la sobreventa VIGILADA (registro overbooking de Smoobu, fuera del plan) es aviso individual; no apaga ni bloquea', () => {
  const watch = [{ smoobuId: 160829171, unit: '301', arrival: '2027-01-04', departure: '2027-01-05' }];
  const run = { halted: null, results: [], plan: { ops: [] } };
  const alerts = alertsFrom({ run, report: { perReservation: [] }, watch });
  assert.deepEqual(alerts, [{ level: 'warning', text: 'SM*...9171 301 2027-01-04: SOBREVENTA_VIGILADA (revision manual)' }]);
  assert.equal(shutdownReason({ run, report: { perReservation: [] } }), null);
  assert.deepEqual(alertsFrom({ run, report: {} }), [], 'sin vigilancia no hay aviso');
  const src = readFileSync(new URL('../scripts/sync-auto.mjs', import.meta.url), 'utf8');
  assert.match(src, /const \{ plan, report, watchAlerts \} = await runSyncDryRun\(/); assert.match(src, /alertsFrom\(\{ run, report, watch: watchAlerts \}\)/);
  const dry = readFileSync(new URL('../src/sync-dryrun-run.mjs', import.meta.url), 'utf8');
  assert.match(dry, /watchAlerts: watchAlerts\.map\(\(e\) => \(\{ smoobuId: e\.smoobuId, unit: e\.unit, arrival: e\.arrival, departure: e\.departure \}\)\)/);
});

