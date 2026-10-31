import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS, GUARDS } from '../src/sync-intent.mjs';
import { semiautoPlan, runSemiauto, approvalToken, limitsFromEnv, killState, DEFAULT_LIMITS, SEMIAUTO_GUARDS } from '../src/sync-semiauto.mjs';
import { buildDashboard, renderDashboard, readPendingPayments } from '../src/sync-dashboard.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-DEV-120 — Todo SINTETICO y en memoria.
const APT = { 201: 3557506, 302: 3557526 };
const mkCreate = (id, unit, a, d, price, name = 'Ana Sintetica Ficticia') => {
  const payload = buildCreatePayload({ smoobuId: id, unit, arrival: a, departure: d, source: 'direct', price, guest: { name, email: null, phone: null } });
  return { smoobuId: id, unit, arrival: a, departure: d, op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [], payload, changes: [], key: opKey(id, OPS.CREATE_ORDER, payload) };
};
const mkOp = (op, id, orderId, status = STATUS.REQUIERE_APROBACION) => { const payload = { action: op }; return { smoobuId: id, unit: '201', arrival: '2026-11-20', departure: '2026-11-21', op, status, guards: [], payload, orderId, changes: [], key: opKey(id, op, payload) }; };
const smoobuOf = (list) => ({ async getReservation(id) { return list.find((b) => b.id === id); } });
const bk = (id, unit, a, d, price, extra = {}) => ({ id, type: 'reservation', apartment: { id: APT[unit] }, arrival: a, departure: d, price, ...extra });
function env(seed = {}) { const odoo = new FakeOdoo(seed); return { odoo, reader: new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch }), journal: new Journal(), lock: new MemoryLock() }; }
const ON = { SYNC_ENABLED: 'true' };

test('semiautomatico: solo CREAR queda automatico; rellenos, confirmar y cancelar pasan a aprobacion por operacion', () => {
  const plan = { ops: [mkCreate(1, '201', '2026-11-24', '2026-11-25', 85000), { ...mkOp(OPS.UPDATE_ORDER, 2, 20), status: STATUS.LISTO }, mkOp(OPS.CONFIRM_ORDER, 3, 30), mkOp(OPS.CANCEL_ORDER, 4, 40), { ...mkOp(OPS.BLOCKED, 5, null), status: STATUS.BLOQUEADO }] };
  const s = semiautoPlan(plan);
  assert.deepEqual(s.ops.map((o) => o.status), [STATUS.LISTO, STATUS.REQUIERE_APROBACION, STATUS.REQUIERE_APROBACION, STATUS.REQUIERE_APROBACION, STATUS.BLOQUEADO]);
  assert.ok(s.ops[1].guards.includes(SEMIAUTO_GUARDS.SOLO_BORRADORES_AUTOMATICOS));
});

test('limites de importe y noches configurables: fuera de rango = excepcion de precio con aprobacion; configuracion invalida = error', () => {
  const big = mkCreate(1, '201', '2026-11-01', '2026-11-03', 2000000); const long = mkCreate(2, '201', '2026-11-01', '2026-11-20', 900000);
  const s = semiautoPlan({ ops: [big, long] }, { limits: DEFAULT_LIMITS });
  assert.ok(s.ops[0].guards.includes(SEMIAUTO_GUARDS.IMPORTE_FUERA_DE_LIMITE)); assert.ok(s.ops[1].guards.includes(SEMIAUTO_GUARDS.ESTANCIA_LARGA));
  assert.deepEqual(limitsFromEnv({ SYNC_MAX_AMOUNT: '3000000' }).maxAmount, 3000000);
  for (const bad of [{ SYNC_MAX_AMOUNT: 'x' }, { SYNC_MAX_AMOUNT: '-1' }, { SYNC_MIN_AMOUNT: '5', SYNC_MAX_AMOUNT: '1' }]) assert.throws(() => limitsFromEnv(bad), /SYNC_LIMIT_INVALID/);
});

test('CREA automaticamente contacto y pedido en BORRADOR con referencia unica y precio exacto; nada mas', async () => {
  const e = env();
  const op = mkCreate(170600001, '201', '2026-11-24', '2026-11-25', 85000);
  const r = await runSemiauto({ plan: { ops: [op] }, env: ON, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: smoobuOf([bk(170600001, '201', '2026-11-24', '2026-11-25', 85000)]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.equal(r.results[0].result, RESULT.APLICADA);
  const [o] = e.odoo.t['sale.order']; const [l] = e.odoo.t['sale.order.line'];
  assert.deepEqual([o.state, o.x_pms_reference, l.price_unit, l.x_precio_manual], ['draft', 'SMOOBU-170600001', 85000, 85000]);
  assert.deepEqual([e.odoo.t['planning.slot'].length, e.odoo.t['account.move'].length, e.odoo.t['account.payment'].length], [0, 0, 0]);
  // idempotencia: la segunda ejecucion no hace nada
  const r2 = await runSemiauto({ plan: { ops: [op] }, env: ON, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: smoobuOf([bk(170600001, '201', '2026-11-24', '2026-11-25', 85000)]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.equal(r2.results[0].result, RESULT.YA_APLICADA); assert.equal(e.odoo.t['sale.order'].length, 1);
});

test('aprobacion por operacion: el token de UNA operacion no aprueba otra; sin token queda pendiente y se publica el token', async () => {
  const seed = { 'sale.order': [{ id: 30, state: 'sale', partner_id: 7, x_pms_reference: 'SMOOBU-170600030', x_checkin: '2026-11-20', x_checkout: '2026-11-21', write_date: 'W0', invoice_ids: [] }],
    'sale.order.line': [{ id: 300, order_id: 30, product_id: 57846, price_unit: 100000, x_precio_manual: 100000, qty_invoiced: 0, tax_ids: [] }] };
  const cancel = mkOp(OPS.CANCEL_ORDER, 170600030, 30); const other = mkOp(OPS.CANCEL_ORDER, 170600031, 31);
  const sm = smoobuOf([bk(170600030, '201', '2026-11-20', '2026-11-21', 100000, { type: 'cancellation' })]);
  const e = env(seed);
  const r1 = await runSemiauto({ plan: { ops: [cancel] }, env: { ...ON, SYNC_APPROVALS: approvalToken(other) }, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm, journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual([r1.results[0].result, r1.approvalsPending[0].token], [RESULT.NO_ELEGIBLE, approvalToken(cancel)]);
  assert.ok(!r1.approvalsPending[0].token.includes('170600030')); // el token publicado no lleva el ID
  const r2 = await runSemiauto({ plan: { ops: [cancel] }, env: { ...ON, SYNC_APPROVALS: approvalToken(cancel) }, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: sm, journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.equal(r2.results[0].result, RESULT.APLICADA); assert.equal(e.odoo.t['sale.order'][0].state, 'cancel');
});

test('apagado: sin SYNC_ENABLED=true no arranca; SYNC_KILL=1 detiene; el apagado inmediato corta entre operaciones', async () => {
  assert.equal(killState({}), 'APAGADO_NO_HABILITADO'); assert.equal(killState({ SYNC_ENABLED: 'true', SYNC_KILL: '1' }), 'APAGADO_INMEDIATO');
  assert.equal(killState({ SYNC_ENABLED: 'true' }, { killFileExists: true }), 'APAGADO_INMEDIATO');
  const e = env();
  const off = await runSemiauto({ plan: { ops: [mkCreate(1, '201', '2026-11-24', '2026-11-25', 85000)] }, env: {}, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: smoobuOf([]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual([off.halted, e.odoo.calls.length], ['APAGADO_NO_HABILITADO', 0]);
  const ops = [mkCreate(170600041, '201', '2026-11-10', '2026-11-11', 85000, 'Ana Uno Ficticia'), mkCreate(170600042, '201', '2026-11-12', '2026-11-13', 85000, 'Bea Dos Ficticia')];
  let killed = false; const w = fakeWriter(e.odoo, validateWrite); const inner = w.execute.bind(w);
  w.execute = async (m, meth, p) => { const r = await inner(m, meth, p); if (meth === 'message_post') killed = true; return r; }; // se "apaga" al terminar la primera
  const r = await runSemiauto({ plan: { ops }, env: ON, isKilled: () => killed, reader: e.reader, writer: w, smoobu: smoobuOf([bk(170600041, '201', '2026-11-10', '2026-11-11', 85000), bk(170600042, '201', '2026-11-12', '2026-11-13', 85000)]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual([r.halted, r.results.length, e.odoo.t['sale.order'].length], ['APAGADO_INMEDIATO', 1, 1]);
});

test('lista blanca: pagos, facturas, asientos y banca prohibidos de forma explicita', () => {
  for (const model of ['account.payment', 'account.move', 'account.move.line', 'account.bank.statement', 'account.bank.statement.line', 'res.partner.bank', 'res.bank', 'payment.transaction', 'account.journal']) {
    for (const method of ['create', 'write', 'action_post', 'unlink']) assert.throws(() => validateWrite(model, method, { ids: [1], vals: {} }), /SYNC_WRITE_FINANCIAL_MODEL_FORBIDDEN/, `${model}.${method}`);
  }
  assert.throws(() => validateWrite('res.partner', 'create', { vals_list: [{ name: 'Ana Sintetica', ref: 'SMOOBU-1', bank_ids: [[0, 0, {}]] }] }), /SYNC_WRITE_FIELD_FORBIDDEN/);
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED], [false, false]);
});

test('tablero: recibidas, borradores, aprobaciones, conflictos y pagos sin confirmar; sin nombres ni importes', async () => {
  const e = env({
    'account.journal': [{ id: 79, name: 'Efectivo_Atheron_Suite', type: 'cash', company_id: 5 }, { id: 65, name: 'Bancolombia', type: 'bank', company_id: 5 }, { id: 61, name: 'Efectivo_Atheron_Security', type: 'cash', company_id: 5 }],
    'account.payment': [
      { id: 1, name: 'PEFHS/2026/00999', date: '2026-10-28', state: 'draft', company_id: 5, journal_id: 79, amount: 315000 }, // Suite, reciente, sin confirmar -> SI
      { id: 2, name: 'PEFHS/2026/00998', date: '2026-10-29', state: 'paid', company_id: 5, journal_id: 79 }, // confirmado -> no
      { id: 3, name: 'PEFHS/2026/00100', date: '2026-07-11', state: 'in_process', company_id: 5, journal_id: 79 }, // antiguo -> no
      { id: 4, name: 'PBC/00684', date: '2026-10-28', state: 'draft', company_id: 5, journal_id: 65 }, // Bancolombia compartido -> no
      { id: 5, name: 'CSH1/0001', date: '2026-10-28', state: 'draft', company_id: 5, journal_id: 61 }, // Security -> no
    ] });
  const pending = await readPendingPayments(e.reader, { today: '2026-10-30', sinceDays: 30 });
  await assert.rejects(readPendingPayments(e.reader, {}), /DASHBOARD_TODAY_REQUIRED/);
  const report = { perReservation: [{ smoobuId: 170600099, unit: '202', arrival: '2026-10-31', departure: '2026-11-02', smoobuStatus: 'ACTIVE', verdict: 'MATCH_DRAFT' }, { smoobuId: 170600098, unit: '302', arrival: '2026-10-30', departure: '2026-10-31', smoobuStatus: 'CANCELLED', verdict: 'CONFLICT', reason: 'CANCELADA_EN_SMOOBU_VIGENTE_EN_ODOO' }] };
  const plan = semiautoPlan({ ops: [mkCreate(170600097, '201', '2026-11-24', '2026-11-25', 85000), mkOp(OPS.CONFIRM_ORDER, 170600099, 9), { ...mkOp(OPS.BLOCKED, 170600096, null), status: STATUS.BLOQUEADO, guards: [GUARDS.SOBREVENTA] }] });
  const d = buildDashboard({ report, plan, pendingPayments: pending });
  assert.deepEqual([d.received, d.drafts.existing.length, d.drafts.toCreate.length, d.approvalsPending.length, d.conflicts.length, d.paymentsReportedNotConfirmed.map((p) => p.ref)], [1, 1, 1, 1, 2, ['PEFHS/2026/00999']]);
  const md = renderDashboard(d);
  for (const banned of ['Ana Sintetica', '315000', '85000', '170600097', '170600099']) assert.ok(!md.includes(banned) && !JSON.stringify(d).includes(banned), banned);
});

test('piloto de UN borrador en modo semiautomatico: tope 1 operacion aunque haya varias listas', async () => {
  const e = env();
  const ops = [mkCreate(170600051, '201', '2026-11-10', '2026-11-11', 85000, 'Ana Uno Ficticia'), mkCreate(170600052, '201', '2026-11-12', '2026-11-13', 85000, 'Bea Dos Ficticia')];
  const r = await runSemiauto({ plan: { ops }, env: ON, maxOps: 1, reader: e.reader, writer: fakeWriter(e.odoo, validateWrite), smoobu: smoobuOf([bk(170600051, '201', '2026-11-10', '2026-11-11', 85000), bk(170600052, '201', '2026-11-12', '2026-11-13', 85000)]), journal: e.journal, lock: e.lock, today: '2026-11-05' });
  assert.deepEqual(r.results.map((x) => x.result), [RESULT.APLICADA, RESULT.NO_PROCESADA]);
  assert.equal(e.odoo.t['sale.order'].length, 1);
  assert.deepEqual(e.journal.entries.map((x) => x.phase), ['INTENT', 'DONE']); // bitacora
});
