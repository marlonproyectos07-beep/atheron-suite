import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIVO_BASE, MOTIVO_TARGET, applyMotivo, planMotivo, revertMotivo, verifyMotivo } from '../src/sire-tra/delta-motivo-2026-11-26.mjs';
import { NS, surveyQuestions } from '../src/sire-tra/manifest.mjs';
import { reasonStatus } from '../src/sire-tra/tra-emitter.mjs';
import { readFileSync } from 'node:fs';

// Formulario: opcion 'Trabajo' en "Motivo principal del viaje". Odoo en memoria con los ids REALES de produccion
// leidos el 26/11/2026 (pregunta 27, opciones 168-174 con secuencias 1-7).
function prod({ values = MOTIVO_BASE, lines = [] } = {}) {
  const t = {
    'ir.model.data': [{ id: 1, module: NS, name: 'q_p_reason', res_id: 27 }],
    'survey.question.answer': values.map((value, i) => ({ id: 168 + i, question_id: 27, value, sequence: i + 1, is_correct: false })),
    'survey.user_input.line': lines,
  };
  const log = [];
  let seq = 900;
  const match = (r, [f, op, v]) => (op === '=' ? r[f] === v : v.includes(r[f]));
  return {
    t, log,
    async searchRead(model, domain, fields, opts = {}) {
      let rows = (t[model] || []).filter((r) => domain.every((d) => match(r, d))).map((r) => ({ ...r }));
      if (opts.order === 'sequence, id') rows = rows.sort((a, b) => a.sequence - b.sequence || a.id - b.id);
      return rows;
    },
    async write(model, ids, vals) {
      log.push([model, ids[0], JSON.stringify(vals)]);
      for (const cmd of vals.suggested_answer_ids || []) {
        if (cmd[0] === 0) t['survey.question.answer'].push({ id: (seq += 1), question_id: ids[0], is_correct: false, ...cmd[2] });
        if (cmd[0] === 1) Object.assign(t['survey.question.answer'].find((a) => a.id === cmd[1]), cmd[2]);
        if (cmd[0] === 2) t['survey.question.answer'] = t['survey.question.answer'].filter((a) => a.id !== cmd[1]);
      }
    },
  };
}
const order = (o) => o.t['survey.question.answer'].slice().sort((a, b) => a.sequence - b.sequence).map((a) => a.value);

test('manifiesto: Trabajo antes de Otro; las 7 opciones anteriores intactas y en su orden; sin opcion por defecto', () => {
  const q = surveyQuestions().find((x) => x.key === 'p_reason');
  assert.deepEqual(q.answers, MOTIVO_TARGET);
  assert.deepEqual(MOTIVO_BASE, ['Vacaciones, recreación u ocio', 'Visita a familiares o amigos', 'Negocios o motivos profesionales', 'Salud', 'Educación', 'Religión', 'Otro']);
  assert.deepEqual(MOTIVO_TARGET.filter((v) => v !== 'Trabajo'), MOTIVO_BASE);
  assert.equal(MOTIVO_TARGET[MOTIVO_TARGET.length - 1], 'Otro');
  assert.equal(q.default, undefined);
});

test('catalogo: solo Trabajo (declarado tal cual) se envia; Negocios o motivos profesionales NO se asigna a Trabajo', () => {
  const cat = JSON.parse(readFileSync(new URL('../tra-catalog.json', import.meta.url), 'utf8'));
  assert.equal(reasonStatus({ x_travel_reason: 'Trabajo' }, cat), 'OK');
  for (const o of MOTIVO_BASE) assert.notEqual(reasonStatus({ x_travel_reason: o }, cat), 'OK', o);
  assert.equal(cat.reasons['Negocios o motivos profesionales'], undefined);
});

test('plan (solo lecturas) -> aplicar una sola escritura -> verificar: ids y textos anteriores conservados', async () => {
  const o = prod();
  const plan = await planMotivo(o);
  assert.equal(o.log.length, 0);
  assert.deepEqual([plan.status, plan.blocked, plan.qid], ['pendiente', null, 27]);
  assert.deepEqual(plan.change, { createValue: 'Trabajo', createSequence: 7, otroId: 174, otroSequence: 8 });
  assert.deepEqual(plan.backup.answers.map((a) => a.id), [168, 169, 170, 171, 172, 173, 174]);
  const r = await applyMotivo(o, plan);
  assert.equal(o.log.length, 1, 'una sola escritura, sobre la pregunta');
  assert.equal(r.applied.length, 2);
  assert.deepEqual(order(o), MOTIVO_TARGET);
  const v = await verifyMotivo(o, plan.backup);
  assert.deepEqual([v.ok, v.keptIds], [true, true]);
  assert.equal(o.t['survey.question.answer'].find((a) => a.value === 'Trabajo').is_correct, false);
  assert.deepEqual((await applyMotivo(o, await planMotivo(o))).applied, [], 'repetir no escribe');
  assert.equal(o.log.length, 1);
});

test('deriva: opciones distintas de las esperadas -> bloqueado, cero escrituras', async () => {
  for (const values of [[...MOTIVO_BASE.slice(0, 6)], [...MOTIVO_BASE.slice(0, 6), 'Otros'], ['Negocios', ...MOTIVO_BASE.slice(1)]]) {
    const o = prod({ values });
    const plan = await planMotivo(o);
    assert.equal(plan.blocked, 'DERIVA_OPCIONES');
    await assert.rejects(applyMotivo(o, plan), (e) => e.code === 'PLAN_BLOCKED');
    assert.equal(o.log.length, 0);
  }
});

test('reversion: se niega si alguien ya respondio Trabajo; si nadie lo uso, la deja como estaba', async () => {
  const o = prod();
  const plan = await planMotivo(o);
  await applyMotivo(o, plan);
  const trabajoId = o.t['survey.question.answer'].find((a) => a.value === 'Trabajo').id;
  o.t['survey.user_input.line'].push({ id: 1, suggested_answer_id: trabajoId });
  await assert.rejects(revertMotivo(o, plan.backup), (e) => e.code === 'TRABAJO_YA_RESPONDIDO');
  o.t['survey.user_input.line'] = [];
  const r = await revertMotivo(o, JSON.parse(JSON.stringify(plan.backup)));
  assert.equal(r.reverted.length, 2);
  assert.deepEqual(order(o), MOTIVO_BASE);
  assert.equal(o.t['survey.question.answer'].find((a) => a.value === 'Otro').sequence, 7);
});
