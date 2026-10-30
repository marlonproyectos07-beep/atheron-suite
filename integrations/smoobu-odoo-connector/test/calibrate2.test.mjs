import test from 'node:test';
import assert from 'node:assert/strict';
import { runCalibration2, redactCode, mirrorEvidence } from '../src/calibrate2.mjs';

const H = 3600000; const T = (s) => s;
const row = (id, role, s, e, res = 5, co = 1, state = 'draft') => ({ id, role_id: [role, 'x'], resource_id: [res, 'r'], company_id: [co, 'c'], start_datetime: s, end_datetime: e, state });

test('redactCode oculta tokens largos y correos', () => {
  const r = redactCode("t='abcdefghijklmnopqrstuvwxyz0123' mail a@b.com env['planning.slot']");
  assert.ok(!r.includes('abcdefghijklmnopqrstuvwxyz') && !r.includes('a@b.com') && r.includes("planning.slot"));
});

test('espejos: turno de varias noches con Casa exacta vs sin espejo', () => {
  const rows = [row(1, 29, '2026-10-24 20:00:00', '2026-10-26 16:00:00'), row(2, 69, '2026-10-24 20:00:00', '2026-10-26 16:00:00'),
    row(3, 19, '2026-10-24 20:00:00', '2026-10-25 16:00:00')];
  const m = mirrorEvidence(rows);
  assert.deepEqual(m.rooms['2+_noches'], { total: 1, casaExactMirror: 1, casaCovers: 1 });
  assert.deepEqual(m.rooms['1_noche'], { total: 1, casaExactMirror: 0, casaCovers: 1 });
  assert.deepEqual(m.casaToRooms, { total: 1, withAnyRoomCovering: 1 });
});

test('segunda calibracion con cliente simulado: solo lecturas, accion enlazada por action_server_ids', async () => {
  const calls = [];
  const odoo = {
    fieldsGet: async (m) => { calls.push(['fields_get', m]);
      if (m === 'planning.slot') return { state: { type: 'selection', selection: [['draft', 'D'], ['published', 'P']] }, role_id: { type: 'many2one' }, company_id: { type: 'many2one', required: true } };
      if (m === 'base.automation') return { action_server_ids: { type: 'many2many' }, name: {}, active: {}, trigger: {}, model_id: {}, filter_domain: {} };
      return { name: {}, resource_type: {}, company_id: {}, tz: {}, resource_ids: {} }; },
    searchRead: async (m, d) => { calls.push(['search_read', m]);
      if (m === 'planning.slot') return [row(1, 37, '2026-10-26 20:00:00', '2026-10-27 16:00:00', 7, 1)];
      if (m === 'planning.role') return [{ id: 37, resource_ids: [7], company_id: [1, 'c'] }];
      if (m === 'resource.resource') return [{ id: 7, name: 'Maria Perez', resource_type: 'user', company_id: [1, 'c'], tz: 'America/Bogota', active: true, user_id: [3, 'u'] }];
      if (m === 'res.company') return [{ id: 1, name: 'Atheron' }];
      if (m === 'base.automation') return [{ id: 167, name: 'R', active: true, trigger: 'on_create_or_write', model_id: [9, 'Planning Shift'], filter_domain: '[]', action_server_ids: [555] }];
      if (m === 'ir.actions.server') { assert.deepEqual(d, [['id', 'in', [555]]]); return [{ id: 555, name: 'A', state: 'code', model_id: [9, 'Planning Shift'], code: "env['planning.slot'].create({})" }]; }
      return []; },
  };
  const r = await runCalibration2({ odoo });
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.equal(r.overall, 'OK');
  assert.equal(by['planning.slot.fields'].hasActive, false);
  assert.deepEqual(by['planning.slot.fields'].mechanismCandidates.state.selection, ['draft', 'published']);
  assert.deepEqual(by['planning.slot.history-resources-company'].roleResources, { 37: { 7: 1 } });
  assert.deepEqual(by['planning.slot.history-resources-company'].roleCompany, { 37: { 1: 1 } });
  assert.ok(!JSON.stringify(by['resource.resource.used']).includes('Maria')); // recurso de persona: solo forma
  assert.equal(by['rules.167-169.linked-actions'].automations[0].linkedActionIds[0], 555);
  assert.equal(by['rules.167-169.linked-actions'].automations[0].actions[0].traits.creates, 1);
  assert.ok(calls.every(([op]) => op === 'fields_get' || op === 'search_read'));
});
