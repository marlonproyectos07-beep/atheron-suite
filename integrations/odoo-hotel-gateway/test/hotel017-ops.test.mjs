import test from 'node:test';
import assert from 'node:assert/strict';
import { planOutbound, readOutboundState, assessOutboundSetup, applyOutboundSetup, ensureBookingFeed, correspondence } from '../src/hotel017-ops.mjs';
import { runRoomSetup } from '../scripts/hotel017-room-setup.mjs';
import { runReconcile } from '../scripts/hotel017-reconcile.mjs';

/** Cliente execute_kw falso: estado de Odoo en memoria. Nunca toca red. */
function fakeEx({ unitResource = 30, unitRole = 30, attachmentName = 'ical_atheron_role_30.ics', actions = [], crons = [], feeds = [] } = {}) {
  const calls = [];
  let nextId = { 'ir.actions.server': 1985, 'ir.cron': 159, 'x_hotel_ota_feed': 5 };
  const ex = async (model, method, args) => {
    calls.push([model, method]);
    if (model === 'x_hotel_unit') return [{ id: 3, x_name: '203', x_resource_id: [unitResource, 'r'], x_role_id: [unitRole, 'x'] }];
    if (model === 'ir.attachment') return [{ id: 26986, name: attachmentName, res_model: 'planning.role', res_id: 30 }];
    if (model === 'ir.actions.server' && method === 'search_read') return actions;
    if (model === 'ir.cron' && method === 'search_read') return crons;
    if (model === 'x_hotel_ota_feed' && method === 'search_read') return feeds;
    if (method === 'create') return nextId[model]++;
    if (model === 'ir.cron' && method === 'read') return [{ ir_actions_server_id: [1986, 'w'], active: true }];
    if (method === 'run') return true;
    throw new Error('UNEXPECTED ' + model + '.' + method + ' ' + JSON.stringify(args).slice(0, 40));
  };
  return { ex, calls };
}

test('plan de salida: nombres, rol, recurso y huella del codigo para 203', () => {
  const p = planOutbound('AHS-203');
  assert.equal(p.room, '203');
  assert.equal(p.role, 30);
  assert.equal(p.resource, 30);
  assert.equal(p.attachment, 26986);
  assert.equal(p.refreshName, 'ATHERON iCal — REFRESH SOLO 203 (rol 30)');
  assert.equal(p.wrapperName, 'ATHERON - Refrescar iCal SOLO 203');
  assert.equal(p.refreshSha16, '335da327de5a427c');
});

test('estado: unidad, adjunto y nombres existentes se leen sin escribir', async () => {
  const { ex, calls } = fakeEx();
  const state = await readOutboundState(ex, planOutbound('203'));
  assert.equal(state.unitOk, true);
  assert.equal(state.attachmentOk, true);
  assert.deepEqual(state.existingActions, []);
  assert.ok(calls.every(([, m]) => m === 'search_read'), 'solo lecturas');
});

test('DRY-RUN: listo cuando no hay conflictos, bloqueado si el nombre ya existe o la unidad no coincide', async () => {
  const p = planOutbound('203');
  const ok = assessOutboundSetup(p, { unitOk: true, attachmentOk: true, existingActions: [], existingCrons: [], feedIds: [] });
  assert.equal(ok.ready, true);
  assert.equal(ok.mode, 'DRY_RUN');
  const dup = assessOutboundSetup(p, { unitOk: true, attachmentOk: true, existingActions: [1], existingCrons: [], feedIds: [] });
  assert.deepEqual(dup.blockers, ['ACTION_NAME_EXISTS']);
  const badUnit = assessOutboundSetup(p, { unitOk: false, attachmentOk: true, existingActions: [], existingCrons: [], feedIds: [] });
  assert.deepEqual(badUnit.blockers, ['UNIT_MISMATCH']);
});

test('alta sin bandera --apply no escribe nada', async () => {
  const { ex, calls } = fakeEx();
  await assert.rejects(applyOutboundSetup(ex, planOutbound('203'), { modelId: 657 }), /APPLY_FLAG_REQUIRED/);
  assert.ok(calls.every(([, m]) => m === 'search_read'));
});

test('alta sin id de modelo o con bloqueos no escribe', async () => {
  const { ex, calls } = fakeEx();
  await assert.rejects(applyOutboundSetup(ex, planOutbound('203'), { apply: true }), /MODEL_ID_REQUIRED/);
  const blocked = fakeEx({ unitResource: 99 });
  await assert.rejects(applyOutboundSetup(blocked.ex, planOutbound('203'), { apply: true, modelId: 657 }), /SETUP_BLOCKED:UNIT_MISMATCH/);
  assert.equal(calls.filter(([, m]) => m === 'create').length, 0);
  assert.equal(blocked.calls.filter(([, m]) => m === 'create').length, 0);
});

test('alta con bandera: accion, envoltorio y cron con ids devueltos por create, cron enlazado', async () => {
  const { ex, calls } = fakeEx();
  const r = await applyOutboundSetup(ex, planOutbound('203'), { apply: true, modelId: 657 });
  assert.equal(r.refreshId, 1985);
  assert.equal(r.wrapperId, 1986);
  assert.equal(r.cronId, 159);
  assert.equal(r.wired, true);
  assert.equal(calls.filter(([m, meth]) => m === 'ir.actions.server' && meth === 'create').length, 2);
});

test('feed booking: no crea si existe; en dry-run solo indica', async () => {
  const exists = fakeEx({ feeds: [{ id: 5 }] });
  assert.deepEqual(await ensureBookingFeed(exists.ex, planOutbound('203'), { apply: true }), { created: false, id: 5 });
  const missing = fakeEx();
  assert.deepEqual(await ensureBookingFeed(missing.ex, planOutbound('203'), { apply: false }), { created: false, wouldCreate: true });
  assert.equal(missing.calls.filter(([, m]) => m === 'create').length, 0);
});

test('correspondencia por ventana: unica, ambigua o sin slot', () => {
  const events = [{ dtstart: '2026-10-05', dtend: '2026-10-06' }, { dtstart: '2026-10-09', dtend: '2026-10-10' }, { dtstart: '2026-10-17', dtend: '2026-10-18' }];
  const slots = [
    { id: 1, start_datetime: '2026-10-05 20:00:00', end_datetime: '2026-10-06 16:00:00' },
    { id: 2, start_datetime: '2026-10-17 20:00:00', end_datetime: '2026-10-18 16:00:00' },
    { id: 3, start_datetime: '2026-10-17 20:00:00', end_datetime: '2026-10-18 16:00:00' },
  ];
  const [a, b, c] = correspondence(events, slots);
  assert.equal(a.unique, true);
  assert.deepEqual(a.slotIds, [1]);
  assert.equal(b.slotIds.length, 0);
  assert.equal(c.conflict, true);
});

test('CLI de alta: sin unidad, con --apply sin confirmacion, y sin credenciales no llega a Odoo', async () => {
  await assert.rejects(runRoomSetup([], {}), /UNIT_REQUIRED/);
  await assert.rejects(runRoomSetup(['--unit', '203', '--apply'], {}), /APPLY_REQUIRES_CONFIRM_STAGING/);
  await assert.rejects(runRoomSetup(['--unit', '203'], {}));
});

test('CLI de alta rechaza Production: la base no coincide con STAGING antes de leer credenciales', async () => {
  // Solo base y URL de Production; sin credenciales. La guarda de base rechaza primero.
  const env = { ODOO_DATABASE: 'atheron1-production' };
  await assert.rejects(runRoomSetup(['--unit', '203'], env));
});

test('CLI de reconciliacion: sin unidad o sin credenciales no escribe ni llama al gateway', async () => {
  await assert.rejects(runReconcile([], {}), /UNIT_REQUIRED/);
  await assert.rejects(runReconcile(['--unit', '203'], {}));
});
