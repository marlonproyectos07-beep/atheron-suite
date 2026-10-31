import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FakeOdoo } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS } from '../src/sync-intent.mjs';
import { runPilot, pilotApprovalToken, adminApprovalToken, stateFingerprint, PILOT_REQUIRED_WRITES } from '../src/sync-pilot.mjs';
import { PilotWriteClient, pilotArmedBy, PILOT_ARMED, PILOT_NOT_BEFORE, PILOT_NOT_AFTER, PILOT_ARM_PHRASE, PILOT_MAX_WINDOW_MINUTES } from '../src/sync-pilot-client.mjs';
import { pilotPreflight, pilotRecoveryRead } from '../src/sync-pilot.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-DEV-122 — Datos SINTETICOS; Odoo simulado en memoria. Nada sale a la red.
const ID = 170707631;
const RES = { id: ID, type: 'reservation', apartment: { id: 3557526 }, channel: { id: 7208051 }, arrival: '2027-01-14', departure: '2027-01-15', price: 90100, 'guest-name': 'Ana Sintetica Ficticia', phone: '3001112233' };
const payload = buildCreatePayload({ smoobuId: ID, unit: '302', arrival: '2027-01-14', departure: '2027-01-15', source: 'airbnb', otaRef: null, price: 90100, guest: { name: 'Ana Sintetica Ficticia', email: null, phone: '3001112233' } });
const op = { smoobuId: ID, unit: '302', arrival: '2027-01-14', departure: '2027-01-15', channelId: 7208051, op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [], payload, changes: [], key: opKey(ID, OPS.CREATE_ORDER, payload) };
const FP = stateFingerprint(RES);

function env({ admin = true, reservation = RES } = {}) {
  const odoo = new FakeOdoo({ 'ir.model.data': [{ id: 1, module: 'base', name: 'group_system', model: 'res.groups', res_id: 4 }], 'res.users': [{ id: 2, group_ids: admin ? [1, 4] : [1] }] });
  const orig = odoo.apply.bind(odoo); odoo.apply = (m, meth, p) => (meth === 'context_get' ? { uid: 2 } : orig(m, meth, p));
  const cfg = { baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', fetchImpl: odoo.fetch };
  return { odoo, cfg, reader: new OdooJson2Client(cfg), smoobu: { async getReservation() { return reservation; } }, journal: new Journal(), lock: new MemoryLock() };
}
/** Cliente del piloto ARMADO solo para la prueba (en el codigo real PILOT_ARMED=false lo impide). */
const armedClient = (e, o = op) => { const c = new PilotWriteClient({ ...e.cfg, op: o, arm: PILOT_ARM_PHRASE }); c.armCheck = () => true; return c; };
const run = (e, writer, extra = {}) => runPilot({ plan: { ops: [op] }, smoobuId: ID, approval: pilotApprovalToken(op, FP), adminApproval: adminApprovalToken(op, FP), reader: e.reader, writer, smoobu: e.smoobu, journal: e.journal, lock: e.lock, today: '2026-10-30', ...extra });

test('desactivado: PILOT_ARMED=false y sin fecha limite; ni la frase de armado permite escribir; interruptores globales en false', async () => {
  // en el repositorio: desarmado, o (solo durante la activacion autorizada) armado con una ventana de 15 minutos como maximo
  const disarmed = PILOT_ARMED === false && PILOT_NOT_BEFORE === null && PILOT_NOT_AFTER === null;
  const validWindow = PILOT_ARMED === true && Date.parse(PILOT_NOT_AFTER) - Date.parse(PILOT_NOT_BEFORE) <= PILOT_MAX_WINDOW_MINUTES * 60000;
  assert.ok(disarmed || validWindow, 'configuracion del piloto fuera de lo autorizado');
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED, PILOT_MAX_WINDOW_MINUTES], [false, false, 15]);
  let fetched = 0;
  // reloj muy en el futuro: aunque estuviera activado, la ventana estaria cerrada
  const c = new PilotWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', op, arm: PILOT_ARM_PHRASE, clock: () => new Date('2099-01-01T00:00:00Z'), fetchImpl: async () => { fetched += 1; return { ok: true, json: async () => [1] }; } });
  await assert.rejects(c.execute('sale.order', 'create', { vals_list: [{}] }), /SYNC_WRITES_DISABLED/); assert.equal(fetched, 0);
  const now = new Date('2027-01-10T12:00:00Z');
  const w = { notBefore: '2027-01-10T11:55:00Z', notAfter: '2027-01-10T12:10:00Z' }; // 15 minutos
  assert.equal(pilotArmedBy({ armed: true, ...w, arm: PILOT_ARM_PHRASE, now }), true);
  for (const k of [{ armed: false, ...w }, { armed: true, notBefore: null, notAfter: w.notAfter }, { armed: true, notBefore: '2027-01-10T11:00:00Z', notAfter: '2027-01-10T11:10:00Z' }, // caducada
    { armed: true, notBefore: '2027-01-10T12:01:00Z', notAfter: '2027-01-10T12:10:00Z' }, // aun no empieza
    { armed: true, notBefore: '2027-01-10T11:50:00Z', notAfter: '2027-01-10T12:10:00Z' }, // 20 minutos: demasiado larga
    { armed: true, notBefore: 'x', notAfter: 'y' }]) assert.equal(pilotArmedBy({ arm: PILOT_ARM_PHRASE, now, ...k }), false, JSON.stringify(k));
  assert.equal(pilotArmedBy({ armed: true, ...w, arm: 'si', now }), false);
});

test('piloto completo con el cliente exclusivo: contacto + borrador + nota = 3 escrituras; despues queda CONSUMIDO', async () => {
  const e = env();
  const c = armedClient(e);
  const r = await run(e, c);
  assert.deepEqual([r.results[0].result, c.writes, c.spent], [RESULT.APLICADA, PILOT_REQUIRED_WRITES, true]);
  const [o] = e.odoo.t['sale.order'];
  assert.deepEqual([o.state, o.x_pms_reference, e.odoo.t['sale.order.line'][0].price_unit, e.odoo.t['res.partner'][0].ref], ['draft', `SMOOBU-${ID}`, 90100, `SMOOBU-${ID}`]);
  assert.deepEqual([e.odoo.t['planning.slot'].length, e.odoo.t['account.move'].length, e.odoo.t['account.payment'].length], [0, 0, 0]);
  await assert.rejects(c.execute('sale.order', 'message_post', { ids: [o.id], body: 'ATH-SYNC | x', message_type: 'comment', subtype_xmlid: 'mail.mt_note' }), /PILOT_CONSUMED/);
  // una segunda ejecucion (cliente nuevo) no duplica: Odoo ya tiene el pedido
  const r2 = await run({ ...e, journal: new Journal() }, armedClient(e));
  assert.deepEqual([r2.halted, r2.recovery], ['PILOTO_YA_APLICADO_VERIFICADO_POR_LECTURA', { found: 1, state: 'draft', linesOk: true, noteOk: true }]);
  assert.equal(e.odoo.t['sale.order'].length, 1);
});

test('fuera del piloto: otro contacto, otro pedido, otras lineas, nota en otro pedido, confirmar, cancelar, facturas o pagos = rechazo antes de la red', async () => {
  const e = env(); const c = armedClient(e);
  const line = [[0, 0, { ...payload.lines[0], tax_ids: [[6, 0, []]] }]];
  const order = (o = {}) => ({ vals_list: [{ partner_id: 1, ...payload.order, order_line: line, ...o }] });
  const bad = [
    ['res.partner', 'create', { vals_list: [{ name: 'Otra Persona', ref: 'SMOOBU-1' }] }, /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['res.partner', 'create', { vals_list: [{ name: 'Otra Persona', ref: `SMOOBU-${ID}` }] }, /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['res.partner', 'create', { vals_list: [{ name: 'Ana Sintetica Ficticia', ref: `SMOOBU-${ID}`, phone: '3000000000' }] }, /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['sale.order', 'create', order({ x_pms_reference: 'SMOOBU-1' }), /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['sale.order', 'create', order({ order_line: [[0, 0, { ...payload.lines[0], price_unit: 1, x_precio_manual: 1, tax_ids: [[6, 0, []]] }]] }), /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['sale.order', 'create', order({ x_checkout: '2027-01-16' }), /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['sale.order', 'message_post', { ids: [5], body: 'ATH-SYNC | x', message_type: 'comment', subtype_xmlid: 'mail.mt_note' }, /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['sale.order', 'action_confirm', { ids: [5] }, /PILOT_WRITE_OUTSIDE_SCOPE/], ['sale.order', 'action_cancel', { ids: [5] }, /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['sale.order', 'write', { ids: [5], vals: { x_checkin: 'x' } }, /PILOT_WRITE_OUTSIDE_SCOPE/],
    ['account.move', 'create', {}, /SYNC_WRITE_FINANCIAL_MODEL_FORBIDDEN/], ['account.payment', 'create', {}, /SYNC_WRITE_FINANCIAL_MODEL_FORBIDDEN/],
  ];
  for (const [m, meth, p, re] of bad) await assert.rejects(c.execute(m, meth, p), re, `${m}.${meth}`);
  assert.deepEqual([c.writes, e.odoo.calls.length], [0, 0]);
  // segundo pedido tras el primero: rechazado
  await c.execute('sale.order', 'create', order());
  await assert.rejects(c.execute('sale.order', 'create', order()), /PILOT_WRITE_OUTSIDE_SCOPE/);
});

test('presupuesto: si el escritor no puede completar contacto + pedido + nota, no se empieza (0 escrituras)', async () => {
  const e = env();
  const r = await run(e, new RecordingWriter({ maxWrites: PILOT_REQUIRED_WRITES - 1 }));
  assert.deepEqual([r.halted, r.writes], ['PILOTO_PRESUPUESTO_INSUFICIENTE', 0]);
  assert.equal(new PilotWriteClient({ ...e.cfg, op, arm: null }).maxWrites, PILOT_REQUIRED_WRITES); // el cliente del piloto cubre la operacion completa
});

test('doble aprobacion ligada al ESTADO ACTUAL: si la reserva cambia (precio, telefono, fechas, tipo), los tokens dejan de valer', async () => {
  for (const change of [{ price: 95000 }, { phone: '3009998877' }, { departure: '2027-01-16' }, { type: 'cancellation' }, { modifiedAt: '2026-10-31 10:00:00' }]) {
    const e = env({ reservation: { ...RES, ...change } });
    const r = await run(e, armedClient(e));
    assert.deepEqual([r.halted, e.odoo.t['sale.order'].length], ['PILOTO_TOKEN_NO_CORRESPONDE_AL_ESTADO_ACTUAL', 0], JSON.stringify(change));
  }
  const e = env();
  const r = await run(e, armedClient(e), { adminApproval: adminApprovalToken(op, 'otroestado00') });
  assert.equal(r.halted, 'PILOTO_REQUIERE_APROBACION_ADMIN');
  const r2 = await run(e, armedClient(e), { approval: adminApprovalToken(op, FP) }); // el token de admin no sirve como el de gerencia
  assert.equal(r2.halted, 'PILOTO_TOKEN_NO_CORRESPONDE_AL_ESTADO_ACTUAL');
});

test('fallo de red a mitad: el cliente queda consumido, la ejecucion para y la siguiente lo recupera por referencia sin duplicar', async () => {
  const e = env();
  e.odoo.fault({ model: 'sale.order', method: 'create', when: 'after', kind: 'network' });
  const c = armedClient(e);
  const r = await run(e, c);
  assert.deepEqual([r.halted, c.spent], ['RESULTADO_AMBIGUO', true]);
  const r2 = await run(e, armedClient(e));
  // el pedido llego a crearse pero no la nota: se detecta por lectura, no se recrea ni se reintenta la nota sin una persona
  assert.deepEqual([r2.halted, r2.recovery.found, r2.recovery.linesOk, r2.recovery.noteOk], ['PILOTO_YA_APLICADO_VERIFICADO_POR_LECTURA', 1, true, false]);
  assert.equal(e.odoo.t['sale.order'].length, 1);
});

test('workflow del piloto: solo manual, sin programacion, permisos de lectura, sin secretos dentro de run; diagnose siempre simulado', () => {
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-pilot-run.yml', import.meta.url), 'utf8');
  assert.match(wf, /\non:\n {2}workflow_dispatch:/); assert.ok(!/schedule:|push:|pull_request/.test(wf));
  assert.match(wf, /\npermissions:\n {2}contents: read\n/); assert.ok(!/: write/.test(wf));
  assert.match(wf, /cancel-in-progress: false/); assert.match(wf, /PILOT_ARM: \$\{\{ vars\.PILOT_ARM \}\}/);
  assert.ok(!/run:.*\$\{\{/.test(wf), 'ningun valor interpolado dentro de run');
  const diag = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-diagnose.yml', import.meta.url), 'utf8');
  const step = diag.slice(diag.indexOf("inputs.mode == 'sync-pilot-dry'")); assert.match(step.slice(0, 600), /PILOT_DRY: '1'/);
  assert.ok(!/PILOT_ARM/.test(diag));
});

test('modo real con el piloto desactivado: se para antes de leer Smoobu u Odoo y sin tocar la bitacora', async () => {
  const e = env(); let smoobuReads = 0; e.smoobu = { async getReservation() { smoobuReads += 1; return RES; } };
  const r = await run(e, new PilotWriteClient({ ...e.cfg, op, arm: null }));
  assert.deepEqual([r.halted, smoobuReads, e.odoo.calls.length, e.journal.entries.length], ['PILOTO_DESACTIVADO', 0, 0, 0]);
});

test('verificacion previa: reserva vigente, identidad, duplicados, precio, fechas, disponibilidad, tokens y limite; todo en verde en el caso limpio', async () => {
  const e = env();
  const pre = await pilotPreflight({ op, fresh: RES, fp: FP, approval: pilotApprovalToken(op, FP), adminApproval: adminApprovalToken(op, FP), admin: true, reader: e.reader, writer: { maxWrites: 3, writes: 0 } });
  assert.equal(pre.ok, true, JSON.stringify(pre.checks));
  assert.deepEqual(pre.checks.map((c) => c.name), ['TOKEN_GERENCIA_ESTADO_ACTUAL', 'TOKEN_ADMINISTRADOR', 'RESERVA_VIGENTE', 'HABITACION', 'FECHAS', 'PRECIO_EXACTO', 'SIN_PEDIDO_DUPLICADO', 'PILOTO_NO_EJECUTADO_ANTES', 'DISPONIBILIDAD', 'IDENTIDAD_CONTACTO', 'LIMITE_3_ESCRITURAS']);
  const big = await pilotPreflight({ op, fresh: RES, fp: FP, approval: pilotApprovalToken(op, FP), adminApproval: adminApprovalToken(op, FP), admin: true, reader: e.reader, writer: { maxWrites: 20, writes: 0 } });
  assert.equal(big.checks.find((c) => c.name === 'LIMITE_3_ESCRITURAS').ok, false); // un escritor con mas presupuesto no sirve para el piloto
});

test('ejecucion unica: si Odoo ya tiene un pedido creado por la sincronizacion (otra reserva), el piloto no escribe', async () => {
  const e = env();
  e.odoo.t['mail.message'].push({ id: 1, model: 'sale.order', res_id: 99, body: 'ATH-SYNC | clave abc | SMOOBU-1 | CREATE_ORDER' });
  const c = armedClient(e);
  const r = await run(e, c);
  assert.equal(r.halted, 'PILOTO_VERIFICACION_PREVIA_FALLIDA');
  assert.equal(r.checks.find((x) => x.name === 'PILOTO_NO_EJECUTADO_ANTES').code, 'PILOTO_YA_EJECUTADO');
  assert.deepEqual([c.writes, e.odoo.t['sale.order'].length], [0, 0]);
});

test('duplicado previo en Odoo (dos pedidos con la referencia): se detiene sin escribir', async () => {
  const e = env();
  e.odoo.t['sale.order'].push({ id: 1, state: 'draft', x_pms_reference: `SMOOBU-${ID}` }, { id: 2, state: 'draft', x_pms_reference: `SMOOBU-${ID} / Airbnb X` });
  const c = armedClient(e);
  assert.equal((await run(e, c)).halted, 'PILOTO_DUPLICADO_DETECTADO'); assert.equal(c.writes, 0);
  assert.deepEqual(await pilotRecoveryRead({ op, reader: e.reader }), { found: 2 });
});

test('ATH-DEV-124: la ventana se comprueba en CADA escritura; si vence entre dos escrituras, se corta y el cliente queda consumido', async () => {
  const e = env();
  let t = Date.parse('2027-01-10T12:00:00Z');
  const window = { notBefore: '2027-01-10T11:55:00Z', notAfter: '2027-01-10T12:10:00Z' };
  const c = new PilotWriteClient({ ...e.cfg, op, arm: PILOT_ARM_PHRASE, clock: () => new Date(t) });
  c.armCheck = () => pilotArmedBy({ armed: true, ...window, arm: PILOT_ARM_PHRASE, now: new Date(t) }); // misma regla, constantes simuladas
  // la ventana vence justo despues de crear el contacto
  const inner = c._request.bind(c);
  c._request = async (m, meth, p) => { const r = await inner(m, meth, p); if (m === 'res.partner') t = Date.parse('2027-01-10T12:11:00Z'); return r; };
  const r = await run(e, c);
  assert.deepEqual([r.halted, c.writes, c.spent], ['SYNC_WRITE_WINDOW_CLOSED', 1, true]);
  assert.deepEqual([e.odoo.t['res.partner'].length, e.odoo.t['sale.order'].length], [1, 0]); // nada despues del vencimiento
  await assert.rejects(c.execute('sale.order', 'create', { vals_list: [{}] }), /PILOT_CONSUMED/);
  // ventana ya vencida antes de la primera escritura: ninguna escritura
  const e2 = env(); t = Date.parse('2027-01-10T12:20:00Z');
  const c2 = new PilotWriteClient({ ...e2.cfg, op, arm: PILOT_ARM_PHRASE, clock: () => new Date(t) });
  c2.armCheck = () => pilotArmedBy({ armed: true, ...window, arm: PILOT_ARM_PHRASE, now: new Date(t) });
  assert.equal((await run(e2, c2)).halted, 'PILOTO_DESACTIVADO'); assert.equal(e2.odoo.calls.length, 0);
});

test('ATH-DEV-124: el modo real no publica tokens (script y workflow)', () => {
  const src = readFileSync(new URL('../scripts/sync-pilot.mjs', import.meta.url), 'utf8');
  assert.match(src, /dry \? \{ tokensRequired: tokens \} : \{ tokensRequired: 'NO_SE_PUBLICAN_EN_MODO_REAL' \}/);
  assert.match(src, /dry \? \[`Token de aprobacion/);
  assert.match(src, /process\.env\.PILOT_APPROVAL, process\.env\.PILOT_ADMIN_APPROVAL, process\.env\.PILOT_ARM\]/); // barrera de privacidad sobre los tokens
  const wf = readFileSync(new URL('../../../.github/workflows/smoobu-odoo-pilot-run.yml', import.meta.url), 'utf8');
  assert.match(wf, /::add-mask::\$v/);
  assert.ok(!/echo .*PILOT_(APPROVAL|ADMIN_APPROVAL|ARM)(?!.*add-mask)/.test(wf.replace(/for v in .*$/m, '')));
});
