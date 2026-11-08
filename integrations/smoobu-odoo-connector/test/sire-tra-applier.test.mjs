import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { ApplyError, applyManifest, checkIsolation, fieldCompatibility, rollbackManifest } from '../src/sire-tra/applier.mjs';
import { AUTOMATIONS, FIELDS, MAX_COMPANIONS, MODELS, NS, REQUIRED_MODELS, SERVER_ACTIONS, surveyQuestions } from '../src/sire-tra/manifest.mjs';

/** Odoo en memoria: dominios con '=', '!=', 'in', '=like' (suficiente para el aplicador). */
function fakeOdoo({ extraModels = [], existingFields = [], failOnCreate = null, isolation = {} } = {}) {
  const t = new Map();
  let seq = 1000;
  const table = (m) => { if (!t.has(m)) t.set(m, []); return t.get(m); };
  const writes = [];
  for (const model of [...REQUIRED_MODELS, ...extraModels]) table('ir.model').push({ id: seq++, model });
  for (const f of existingFields) table('ir.model.fields').push({ id: seq++, state: 'base', related: false, selection_ids: [], relation: false, ...f });
  table('ir.model.fields').push({ id: seq++, model: 'survey.question', name: 'triggering_answer_ids', ttype: 'many2many' }, { id: seq++, model: 'survey.question', name: 'is_page', ttype: 'boolean' }, { id: seq++, model: 'survey.question', name: 'constr_mandatory', ttype: 'boolean' }, { id: seq++, model: 'survey.user_input', name: 'state', ttype: 'selection' });
  table('ir.model.data').push({ id: seq++, module: 'base', name: 'group_user', model: 'res.groups', res_id: 1 }, { id: seq++, module: 'base', name: 'group_system', model: 'res.groups', res_id: 2 });
  const match = (r, [f, op, v]) => {
    const x = r[f];
    if (op === '=') return x === v || (v === false && (x === undefined || x === false || x === null));
    if (op === '!=') return x !== v;
    if (op === 'in') return v.includes(x);
    if (op === '=like') return typeof x === 'string' && new RegExp(`^${v.replace(/%/g, '.*')}$`).test(x);
    throw new Error(`op ${op}`);
  };
  let creates = 0;
  return {
    t, writes,
    async searchRead(model, domain, fields) { return table(model).filter((r) => domain.every((leaf) => match(r, leaf))).map((r) => ({ ...r })); },
    async count(model) { return isolation[model] ?? 0; },
    async create(model, vals) {
      creates += 1;
      if (failOnCreate && creates === failOnCreate) throw new Error('caida simulada');
      const id = seq++;
      const rec = { id, ...vals };
      if (model === 'ir.model.fields') { rec.model = vals.model || [...table('ir.model')].find((m) => m.id === vals.model_id)?.model; rec.selection_ids = []; if (vals.selection_ids) for (const [, , s] of vals.selection_ids) { const sid = seq++; table('ir.model.fields.selection').push({ id: sid, field_id: [id, ''], value: s.value }); rec.selection_ids.push(sid); } }
      if (model === 'ir.model') table('ir.model.fields');
      if (model === 'survey.question' && vals.suggested_answer_ids) for (const [, , a] of vals.suggested_answer_ids) table('survey.question.answer').push({ id: seq++, question_id: id, value: a.value });
      table(model).push(rec);
      writes.push(['create', model]);
      return id;
    },
    async write(model, ids, vals) { writes.push(['write', model, ids]); for (const r of table(model)) if (ids.includes(r.id)) Object.assign(r, vals); return true; },
    async unlink(model, ids) { writes.push(['unlink', model, ids]); t.set(model, table(model).filter((r) => !ids.includes(r.id))); return true; },
  };
}
const ours = (o) => o.t.get('ir.model.data').filter((d) => d.module === NS);

test('simulacion por defecto: cero escrituras y plan completo', async () => {
  const o = fakeOdoo();
  const plan = await applyManifest(o);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(o.writes.length, 0);
  assert.ok(plan.create.includes('ir.model:model_x_establishment'));
  assert.ok(plan.create.filter((c) => c.startsWith('ir.model.fields:')).length === FIELDS.length);
});

test('aplicar y repetir: la segunda pasada no crea nada (idempotente)', async () => {
  const o = fakeOdoo();
  const p1 = await applyManifest(o, { apply: true });
  assert.equal(p1.blocked.length, 0);
  const n = ours(o).length;
  assert.ok(n > FIELDS.length + MODELS.length + SERVER_ACTIONS.length);
  const p2 = await applyManifest(o, { apply: true });
  assert.equal(p2.create.length, 0);
  assert.equal(ours(o).length, n);
  assert.equal(o.t.get('ir.actions.server').length, SERVER_ACTIONS.length);
  assert.equal(o.t.get('base.automation').length, AUTOMATIONS.length);
  assert.equal(o.t.get('survey.question').length, surveyQuestions().length);
});

test('ejecucion parcial: tras una caida, la repeticion adopta lo creado y no duplica', async () => {
  for (const k of [3, 40, 90, 200]) {
    const o = fakeOdoo({ failOnCreate: k });
    await assert.rejects(applyManifest(o, { apply: true }));
    await applyManifest(o, { apply: true });
    const names = (m, key) => (o.t.get(m) || []).map((r) => r[key]);
    for (const [m, key] of [['ir.actions.server', 'name'], ['ir.ui.view', 'name'], ['ir.ui.menu', 'name'], ['base.automation', 'name']]) {
      const list = names(m, key);
      assert.equal(new Set(list).size, list.length, `duplicado en ${m} (caida en ${k})`);
    }
    const fieldKeys = o.t.get('ir.model.fields').map((f) => `${f.model}.${f.name}`);
    assert.equal(new Set(fieldKeys).size, fieldKeys.length, `campo duplicado (caida en ${k})`);
  }
});

test('campo existente incompatible (tipo, relacion o seleccion) bloquea sin escribir', async () => {
  for (const ex of [
    { model: 'x_guests_line', name: 'x_given_names', ttype: 'integer' },
    { model: 'x_guests_line', name: 'x_establishment_id', ttype: 'many2one', relation: 'res.partner' },
  ]) {
    const o = fakeOdoo({ existingFields: [ex] });
    const plan = await applyManifest(o, { apply: true });
    assert.ok(plan.blocked.some((b) => b.reason.startsWith('FIELD_INCOMPATIBLE')));
    assert.equal(o.writes.length, 0);
  }
  assert.equal(fieldCompatibility({ ttype: 'selection', selection: [{ value: 'a' }, { value: 'b' }] }, { ttype: 'selection', selection_keys: ['a'] }).ok, false);
  assert.equal(fieldCompatibility({ ttype: 'char' }, { ttype: 'char' }).ok, true);
});

test('campo compatible de modulo se reutiliza sin tocarlo; modelo ajeno con el mismo nombre bloquea', async () => {
  const o = fakeOdoo({ existingFields: [{ model: 'x_guests_line', name: 'x_given_names', ttype: 'char', state: 'base' }] });
  const plan = await applyManifest(o, { apply: true });
  assert.ok(plan.reuse.includes('x_guests_line.x_given_names'));
  const o2 = fakeOdoo({ extraModels: ['x_establishment'] });
  const p2 = await applyManifest(o2, { apply: true });
  assert.ok(p2.blocked.some((b) => b.reason === 'MODEL_EXISTS_NOT_OURS'));
  assert.equal(o2.writes.length, 0);
});

test('nunca escribe fuera de los modelos tecnicos permitidos', async () => {
  const o = fakeOdoo();
  await applyManifest(o, { apply: true });
  const allowed = new Set(['ir.model', 'ir.model.fields', 'ir.model.access', 'ir.model.data', 'ir.actions.server', 'base.automation', 'ir.ui.view', 'ir.actions.act_window', 'ir.ui.menu', 'survey.survey', 'survey.question']);
  for (const [, model] of o.writes) assert.ok(allowed.has(model), model);
});

test('condiciones de acompanantes: k visible si el numero >= k (grupo de 22)', async () => {
  const o = fakeOdoo();
  await applyManifest(o, { apply: true });
  const q = (key) => o.t.get('survey.question').find((r) => r.id === ours(o).find((d) => d.name === `q_${key}`).res_id);
  assert.equal(q('c1_doc_num').triggering_answer_ids[0][2].length, MAX_COMPANIONS);
  assert.equal(q(`c${MAX_COMPANIONS}_doc_num`).triggering_answer_ids[0][2].length, 1);
  assert.equal(q('p_doc_num').triggering_answer_ids, undefined);
});

test('reversion: borra solo registros propios', async () => {
  const o = fakeOdoo();
  o.t.get('ir.model.data');
  await applyManifest(o, { apply: true });
  const foreign = o.t.get('ir.model.data').filter((d) => d.module !== NS).length;
  const dry = await rollbackManifest(o);
  assert.equal(dry.mode, 'rollback-dry-run');
  await rollbackManifest(o, { apply: true });
  assert.equal(ours(o).length, 0);
  assert.equal(o.t.get('ir.model.data').length, foreign);
  assert.equal((o.t.get('ir.actions.server') || []).length, 0);
});

test('aislamiento: cualquier salida externa activa o dato ilegible = no aislada', async () => {
  const ok = fakeOdoo();
  ok.t.set('ir.config_parameter', [{ id: 1, key: 'database.is_neutralized', value: 'true' }]);
  ok.t.set('ir.mail_server', [{ id: 1, active: true, smtp_host: 'invalid' }]);
  ok.t.set('ir.cron', [{ id: 1, active: true, cron_name: 'Base: Auto-vacuum internal data' }]);
  assert.equal((await checkIsolation(ok)).isolated, true);
  ok.t.get('ir.cron').push({ id: 2, active: true, cron_name: 'Smoobu sync' });
  assert.equal((await checkIsolation(ok)).isolated, false);
  const wa = fakeOdoo({ isolation: { 'whatsapp.account': 1 } });
  wa.t.set('ir.config_parameter', [{ id: 1, key: 'database.is_neutralized', value: 'true' }]);
  assert.equal((await checkIsolation(wa)).isolated, false);
  const notNeutral = fakeOdoo();
  assert.equal((await checkIsolation(notNeutral)).isolated, false);
});

test('todo el Python del manifiesto compila (sintaxis), si hay python3', (t) => {
  let py = 'python3';
  try { execFileSync(py, ['--version']); } catch { t.skip('sin python3'); return; }
  const snippets = [...SERVER_ACTIONS.map((s) => [s.xmlid, s.code]), ...FIELDS.filter((f) => f[4].compute).map((f) => [f[1], f[4].compute])];
  for (const [id, code] of snippets) execFileSync(py, ['-c', 'import sys; compile(sys.stdin.read(), "x", "exec")'], { input: code });
  assert.ok(snippets.length >= SERVER_ACTIONS.length);
});

test('ApplyError lleva solo codigos', () => { const e = new ApplyError('X', 'y'); assert.equal(e.code, 'X'); });
