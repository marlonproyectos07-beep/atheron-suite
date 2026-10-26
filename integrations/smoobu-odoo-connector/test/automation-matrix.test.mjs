import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEUTRALIZATION_CHECKLIST, EXTERNAL_EFFECT_CATEGORIES } from '../src/staging-plan.mjs';
import { runIsolationCheck, ALLOWED_STAGING_CRON } from '../src/isolation-check.mjs';
import { PRODUCTION_SLOT_AUTOMATIONS } from '../src/odoo-facts.mjs';
import { STAGING_DATABASE } from '../src/staging-guard.mjs';

const M = JSON.parse(readFileSync(new URL('../fixtures/automation-matrix-2026-10-26.json', import.meta.url)));

test('matriz estatica: las 13 automatizaciones auditadas, cada una con evento, efecto, riesgo y control', () => {
  assert.deepEqual(M.automations.map((a) => a.id), [12, 22, 23, 51, 55, 157, 158, 164, 167, 168, 169, 170, 171]);
  for (const a of M.automations) {
    assert.ok(a.name && a.events.length && a.effect.length > 20 && a.control.length > 10, `fila ${a.id}`);
    assert.ok(['BAJO', 'MEDIO', 'ALTO'].some((r) => a.risk.startsWith(r)), `riesgo ${a.id}`);
    assert.equal(typeof a.external, 'boolean');
    assert.ok(PRODUCTION_SLOT_AUTOMATIONS[a.id], `facts ${a.id}`);
  }
  assert.ok(M.automations.every((a) => a.id !== 55 && a.id !== 157 ? true : a.accion === null)); // 55 y 157 sin acciones enlazadas
});

test('matriz: el conector solo toca las automatizaciones 12, 22, 167 y 169 al crear; ninguna usa x_nobeds_id', () => {
  const touched = M.automations.filter((a) => a.conector_toca).map((a) => a.id);
  assert.deepEqual(touched, [12, 22, 167, 169]);
  for (const id of [164, 170, 171]) assert.match(M.automations.find((a) => a.id === id).control, /x_nobeds_id/);
});

test('matriz de eventos: draft y cancelled NO liberan; borrar es la unica via y arrastra espejos', () => {
  const ev = Object.fromEntries(M.events.map((e) => [e.event, e]));
  assert.match(ev['state = draft'].net, /NO libera/);
  assert.match(ev['x_checkin_state = cancelled'].net, /NO libera/);
  assert.match(ev['BORRAR un turno (unlink)'].net, /Unica via/);
  assert.match(ev['MODIFICAR fechas/recurso de un turno'].net, /desfasado/);
  assert.ok(ev['CREAR turno de habitacion (publicado, sin x_nobeds_id, sin x_bloqueo_ref)'].chain.some((c) => /cron 147/.test(c)));
});

test('todo efecto externo de la matriz tiene control y cada categoria esta cubierta por la lista de neutralizacion', () => {
  for (const r of [...M.automations, ...M.crons]) if (r.external) assert.ok(r.control.length > 10, `sin control ${r.id}`);
  const cats = new Set(NEUTRALIZATION_CHECKLIST.map((i) => i.category));
  for (const c of EXTERNAL_EFFECT_CATEGORIES) assert.ok(cats.has(c), `categoria sin control: ${c}`);
  assert.ok(NEUTRALIZATION_CHECKLIST.every((i) => i.blocksWrites === true));
  assert.ok(M.crons.some((c) => c.id === 147 && /iCal|\.ics/i.test(c.effect)));
  const ids = new Set(NEUTRALIZATION_CHECKLIST.map((i) => i.id)); assert.equal(ids.size, NEUTRALIZATION_CHECKLIST.length);
});

test('cada comprobacion automatica citada en la lista existe en el comprobador de aislamiento', async () => {
  const r = await runIsolationCheck({ odoo: { searchRead: async () => [] }, database: STAGING_DATABASE, expectedDatabase: STAGING_DATABASE });
  const names = new Set(r.checks.map((c) => c.name));
  for (const i of NEUTRALIZATION_CHECKLIST) if (i.autoCheck) assert.ok(names.has(i.autoCheck), `${i.id} -> ${i.autoCheck}`);
  assert.equal(r.passed, true);
});

test('aislamiento: solo se permite el cron del Booking Engine; webhooks y alertas NOBEDS activos bloquean', async () => {
  const run = (rows) => runIsolationCheck({ odoo: { searchRead: async (m, d) => rows[m] ?? [] }, database: STAGING_DATABASE, expectedDatabase: STAGING_DATABASE });
  assert.ok(ALLOWED_STAGING_CRON.test('Booking Engine: Update Availabilities'));
  assert.equal((await run({ 'ir.cron': [{ id: 1, cron_name: 'Booking Engine: Update Availabilities' }] })).passed, true);
  for (const [m, rows] of [['ir.cron', [{ id: 147, cron_name: 'ATHERON - Refrescar iCal NOBEDS (salida)' }]], ['base.automation', [{ id: 51, name: 'NOBEDS Recibir' }]],
    ['ir.config_parameter', [{ key: 'nobeds.health_enabled', value: '1' }]]]) {
    const r = await run({ [m]: rows }); assert.equal(r.passed, false, m); assert.match(r.verdict, /DETENER/);
  }
});
