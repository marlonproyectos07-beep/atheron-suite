import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeOdoo, fakeWriter } from './helpers/fake-odoo.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { validateWrite } from '../src/sync-write-guard.mjs';
import { RecordingWriter, SyncWriteClient, SYNC_ARM_PHRASE } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { RESULT } from '../src/sync-apply.mjs';
import { buildCreatePayload, opKey, OPS, STATUS } from '../src/sync-intent.mjs';
import { selectPilotOp, pilotWriter, runPilot, adminApprovalToken, pilotApprovalToken, keyFromApproval, findPilotTarget, PILOT_TARGET } from '../src/sync-pilot.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';

// ATH-DEV-118 — Datos SINTETICOS y Odoo simulado. Ninguna llamada de red.
const ID = 170500001;
const payload = buildCreatePayload({ smoobuId: ID, unit: '302', arrival: '2026-11-22', departure: '2026-11-23', source: 'airbnb', otaRef: 'HMSINTET', price: 90100, guest: { name: 'Ana Sintetica Ficticia', email: null, phone: '3001112233' } });
const create = { smoobuId: ID, unit: '302', arrival: '2026-11-22', departure: '2026-11-23', op: OPS.CREATE_ORDER, status: STATUS.LISTO, guards: [], payload, changes: [], key: opKey(ID, OPS.CREATE_ORDER, payload) };
const smoobu = { async getReservation() { return { id: ID, type: 'reservation', apartment: { id: 3557526 }, arrival: '2026-11-22', departure: '2026-11-23', price: 90100 }; } };

function env({ admin }) {
  const odoo = new FakeOdoo({ 'ir.model.data': [{ id: 1, module: 'base', name: 'group_system', model: 'res.groups', res_id: 4 }], 'res.users': [{ id: 2, group_ids: admin ? [1, 4] : [1, 16] }] });
  const orig = odoo.apply.bind(odoo);
  odoo.apply = (m, meth, p) => (meth === 'context_get' ? { uid: 2, tz: 'America/Bogota' } : orig(m, meth, p));
  const t = odoo.t; t['ir.model.data'] = t['ir.model.data'] ?? []; t['res.users'] = t['res.users'] ?? [];
  const reader = new OdooJson2Client({ baseUrl: 'https://odoo.invalid', database: 'p', apiKey: 'k', fetchImpl: odoo.fetch });
  return { odoo, reader, journal: new Journal(), lock: new MemoryLock() };
}
const pilot = (e, writer, extra = {}) => runPilot({ plan: { ops: [create] }, smoobuId: ID, approvedKey: create.key, reader: e.reader, writer, smoobu, journal: e.journal, lock: e.lock, today: '2026-11-05', ...extra });

test('seleccion: exactamente una reserva, solo CREAR, solo LISTO y con su clave aprobada', () => {
  assert.equal(selectPilotOp({ ops: [create] }, { smoobuId: ID, approvedKey: create.key }), create);
  assert.throws(() => selectPilotOp({ ops: [create] }, { smoobuId: ID, approvedKey: 'otra' }), /PILOTO_CLAVE_NO_APROBADA/);
  assert.throws(() => selectPilotOp({ ops: [] }, { smoobuId: ID, approvedKey: create.key }), /PILOTO_RESERVA_NO_UNICA/);
  assert.throws(() => selectPilotOp({ ops: [{ ...create, op: OPS.CONFIRM_ORDER }] }, { smoobuId: ID, approvedKey: create.key }), /PILOTO_SOLO_CREAR/);
  assert.throws(() => selectPilotOp({ ops: [{ ...create, status: STATUS.REQUIERE_APROBACION }] }, { smoobuId: ID, approvedKey: create.key }), /PILOTO_OPERACION_NO_LISTA/);
});

test('escritor del piloto: solo crear contacto, crear pedido y nota; nunca confirmar, cancelar, modificar, facturar ni cobrar', async () => {
  const w = pilotWriter(new RecordingWriter());
  for (const [m, meth, p] of [['sale.order', 'action_confirm', { ids: [1] }], ['sale.order', 'action_cancel', { ids: [1] }], ['sale.order', 'write', { ids: [1], vals: { x_checkin: 'x' } }], ['sale.order.line', 'write', { ids: [1], vals: { x_precio_manual: 1 } }], ['account.move', 'create', {}], ['account.payment', 'create', {}]]) {
    await assert.rejects(w.execute(m, meth, p), /SYNC_WRITE_PILOT_METHOD_FORBIDDEN/, `${m}.${meth}`);
  }
});

test('clave de ADMINISTRADOR: el piloto se detiene sin leer reservas ni escribir, salvo segunda aprobacion ligada a la operacion', async () => {
  const e = env({ admin: true });
  const r = await pilot(e, fakeWriter(e.odoo, validateWrite));
  assert.deepEqual([r.halted, e.odoo.t['sale.order'].length], ['PILOTO_REQUIERE_APROBACION_ADMIN', 0]);
  const wrong = await pilot(e, fakeWriter(e.odoo, validateWrite), { adminApproval: 'APROBADO' });
  assert.equal(wrong.halted, 'PILOTO_REQUIERE_APROBACION_ADMIN');
  const ok = await pilot(e, fakeWriter(e.odoo, validateWrite), { adminApproval: adminApprovalToken(create) });
  assert.equal(ok.results[0].result, RESULT.APLICADA);
});

test('usuario tecnico (no administrador): crea contacto y pedido en BORRADOR, sin confirmar, sin turno, sin factura ni pago', async () => {
  const e = env({ admin: false });
  const r = await pilot(e, fakeWriter(e.odoo, validateWrite));
  assert.deepEqual([r.admin, r.results[0].result, r.writes], [false, RESULT.APLICADA, 3]);
  const [o] = e.odoo.t['sale.order'];
  assert.deepEqual([o.state, e.odoo.t['planning.slot'].length, e.odoo.t['account.move'].length, e.odoo.t['account.payment'].length], ['draft', 0, 0, 0]);
  assert.deepEqual(e.odoo.t['res.partner'].map((p) => [p.name, p.ref]), [['Ana Sintetica Ficticia', 'SMOOBU-170500001']]);
  // repetir el piloto no duplica nada
  const again = await pilot(e, fakeWriter(e.odoo, validateWrite));
  assert.equal(again.results[0].result, RESULT.YA_APLICADA);
  assert.deepEqual([e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], [1, 1]);
});

test('con las escrituras desactivadas el cliente real no puede ejecutar el piloto', async () => {
  assert.deepEqual([WRITES_ENABLED, RELEASE_UNLOCKED], [false, false]);
  const e = env({ admin: false });
  let sent = 0;
  const real = new SyncWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', arm: SYNC_ARM_PHRASE, fetchImpl: async () => { sent += 1; return { ok: true, json: async () => [1] }; } });
  const r = await pilot(e, real);
  assert.ok(['RESULTADO_AMBIGUO', 'SYNC_WRITES_DISABLED'].includes(r.halted) || r.results[0]?.code === 'SYNC_WRITES_DISABLED', JSON.stringify(r));
  assert.deepEqual([sent, e.odoo.t['sale.order'].length, e.odoo.t['res.partner'].length], [0, 0, 0]);
});

test('si no se puede comprobar el grupo del usuario, se trata como administrador (lo mas restrictivo)', async () => {
  const e = env({ admin: false });
  const orig = e.odoo.apply.bind(e.odoo);
  e.odoo.apply = (m, meth, p) => (m === 'res.users' && meth === 'fields_get' ? { id: { type: 'integer' } } : orig(m, meth, p));
  assert.equal((await pilot(e, fakeWriter(e.odoo, validateWrite))).halted, 'PILOTO_REQUIERE_APROBACION_ADMIN');
});

test('reserva piloto (Airbnb 302, 14/01): se localiza por sufijo, habitacion, fechas y canal; debe ser unica; tokens sin IDs', () => {
  const op = { ...create, smoobuId: 170527631, unit: '302', arrival: '2027-01-14', departure: '2027-01-15', channelId: 7208051 };
  assert.equal(findPilotTarget({ ops: [op, { ...op, smoobuId: 170520001 }] }), op);
  assert.throws(() => findPilotTarget({ ops: [op, { ...op, key: 'x' }] }), /PILOTO_RESERVA_NO_UNICA/);
  assert.throws(() => findPilotTarget({ ops: [{ ...op, channelId: 7208046 }] }), /PILOTO_RESERVA_NO_UNICA/);
  assert.deepEqual([PILOT_TARGET.unit, PILOT_TARGET.arrival], ['302', '2027-01-14']);
  for (const t of [pilotApprovalToken(op), adminApprovalToken(op)]) assert.ok(!t.includes('170527631') && t.endsWith(op.key));
  assert.equal(keyFromApproval(pilotApprovalToken(op)), op.key); assert.equal(keyFromApproval(adminApprovalToken(op)), null); // un token no sirve por el otro
});
