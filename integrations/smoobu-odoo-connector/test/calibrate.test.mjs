import test from 'node:test';
import assert from 'node:assert/strict';
import { runCalibration, analyzeSlots, textShape, codeTraits, pilotView } from '../src/calibrate.mjs';

const row = (id, role, s, e, name = 'Maria Perez 301') => ({ id, role_id: [role, 'x'], resource_id: [5, 'r'], start_datetime: s, end_datetime: e, name });

test('forma del texto: no revela nombres', () => {
  assert.equal(textShape('Maria Perez 301'), 'a a 9');
  assert.equal(textShape('SMOOBU-161419736:301:2026-10-26'), 'a-9:9:9-9-9');
  assert.equal(textShape(false), '(vacio)');
  assert.ok(!JSON.stringify(analyzeSlots([row(1, 37, '2026-10-26 20:00:00', '2026-10-27 17:00:00')])).includes('Maria'));
});

test('histograma horario en UTC y en hora de Bogota', () => {
  const a = analyzeSlots([row(1, 37, '2026-10-26 20:00:00', '2026-10-27 17:00:00'), row(2, 29, '2026-10-26 20:00:00', '2026-10-27 17:00:00')]);
  assert.deepEqual([a.startHourUtc['20:00'], a.startHourBogota['15:00'], a.endHourBogota['12:00'], a.durations['21h'], a.withResource], [2, 2, 2, 2, 2]);
  assert.equal(a.perRole['37:301'], 1);
});

test('rasgos de codigo: cuenta sin exponer el texto', () => {
  const t = codeTraits("env['planning.slot'].create({})\nrec.write({})\nTOKEN='abc'");
  assert.deepEqual([t.mentionsPlanningSlot, t.creates, t.writes, t.unlinks], [true, 1, 1, 0]);
  assert.ok(!JSON.stringify(t).includes('abc'));
});

test('calibracion con cliente simulado: solo lecturas, campos confirmados, 167/169 con limitacion', async () => {
  const calls = [];
  const odoo = {
    fieldsGet: async (m) => { calls.push(['fields_get', m]); return { name: { type: 'char', required: false }, role_id: { type: 'many2one', required: false, relation: 'planning.role' },
      resource_id: { type: 'many2one', required: true, relation: 'resource.resource' }, start_datetime: { type: 'datetime', required: true }, end_datetime: { type: 'datetime', required: true } }; },
    searchRead: async (m, d, f) => { calls.push(['search_read', m]);
      if (m === 'base.automation') { const e = new Error('x'); e.code = 'ODOO_AUTH_REJECTED'; e.status = 403; throw e; }
      if (m === 'ir.actions.server') return [{ id: 167, name: 'R', state: 'code', model_id: [1, 'Planning Slot'], code: "x.create({})" }];
      if (m === 'planning.role') return [{ id: 37, name: '301' }];
      if (m === 'resource.resource') return [{ id: 5, tz: 'America/Bogota' }];
      return [row(1, 37, '2026-10-26 20:00:00', '2026-10-27 17:00:00')]; },
  };
  const r = await runCalibration({ odoo });
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.equal(by['planning.slot.fields_get'].selected.resource_id.required, true);
  assert.deepEqual(by['planning.slot.fields_get'].requiredFields, ['end_datetime', 'resource_id', 'start_datetime']);
  assert.equal(by['rules.167-169']['base.automation'].httpStatus, 403);
  assert.equal(by['rules.167-169']['ir.actions.server'][0].code.creates, 1);
  assert.equal(by['resource.timezones'].tz['America/Bogota'], 1);
  assert.ok(calls.every(([op]) => op === 'fields_get' || op === 'search_read'));
  assert.equal(pilotView([row(1, 37, '2026-10-26 20:00:00', '2026-10-27 17:00:00')])[0].durationH, 21);
});
