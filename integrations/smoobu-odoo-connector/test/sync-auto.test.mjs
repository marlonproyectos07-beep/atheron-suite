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
import { runAuto, autoWriter, autoPlan, maxOpsFromEnv, alertsFrom, buildOccupancyBoard, renderOccupancyBoard, CELL } from '../src/sync-auto.mjs';
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
  assert.match(wf, /\npermissions:\n {2}contents: read\n/); assert.ok(!/: write/.test(wf));
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

test('interruptor propio: AUTO_ARMED=false y sin depender de los globales (el conciliador diario exige que sigan en false)', async () => {
  const { AutoWriteClient, AUTO_ARMED, AUTO_ARM_PHRASE, autoArmedBy } = await import('../src/sync-auto-client.mjs');
  assert.equal(AUTO_ARMED, false);
  assert.deepEqual([autoArmedBy({ armed: true, arm: AUTO_ARM_PHRASE }), autoArmedBy({ armed: true, arm: 'si' }), autoArmedBy({ armed: false, arm: AUTO_ARM_PHRASE })], [true, false, false]);
  let sent = 0;
  const c = new AutoWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', arm: AUTO_ARM_PHRASE, fetchImpl: async () => { sent += 1; return { ok: true, json: async () => [1] }; } });
  await assert.rejects(c.execute('sale.order', 'create', { vals_list: [{}] }), /SYNC_WRITES_DISABLED/); assert.equal(sent, 0);
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
