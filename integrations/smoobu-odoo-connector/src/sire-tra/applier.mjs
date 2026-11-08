import { ACLS, AUTOMATIONS, FIELDS, MENUS, MODELS, NS, REQUIRED_MODELS, SERVER_ACTIONS, SURVEY, VIEWS, WINDOW_ACTIONS, WRITABLE_MODELS, surveyQuestions } from './manifest.mjs';

/**
 * Aplicador repetible del manifiesto. Independiente del transporte: recibe `odoo` con
 *   searchRead(model, domain, fields, opts) · count(model, domain) · create(model, vals)->id
 *   write(model, ids, vals) · unlink(model, ids)
 * Por defecto SIMULA (solo lecturas). Nunca escribe en registros que no tengan xmlid del modulo NS
 * o que no haya creado en esta ejecucion. Los errores y la bitacora solo llevan nombres tecnicos.
 */
export class ApplyError extends Error {
  constructor(code, detail = null) { super(code); this.name = 'ApplyError'; this.code = code; this.detail = detail; }
}

const INTERNAL_CRONS = ['Base: Auto-vacuum internal data', 'Post Upgrade: certificate: recompute PEM keys content', 'Publisher: Update Notification'];

/** Comprobacion de aislamiento de una copia de pruebas. Separa lo automatico de Odoo de lo adicional nuestro. */
export async function checkIsolation(odoo) {
  const checks = [];
  const add = (id, group, ok, detail) => checks.push({ id, group, ok: ok === true, detail: String(detail ?? '') });
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { error: e.code || e.message || 'ERROR' }; } };
  const p = await safe(() => odoo.searchRead('ir.config_parameter', [['key', '=', 'database.is_neutralized']], ['value']));
  add('E1_base_neutralizada', 'odoo_automatico', Array.isArray(p) && ['true', '1'].includes(String(p[0]?.value).toLowerCase()), Array.isArray(p) ? p[0]?.value : p.error);
  const crons = await safe(() => odoo.searchRead('ir.cron', [['active', '=', true]], ['cron_name']));
  const extra = Array.isArray(crons) ? crons.filter((c) => !INTERNAL_CRONS.includes(c.cron_name)).length : -1;
  add('A1_crons_no_internos_activos_0', 'adicional_nuestro', extra === 0, extra);
  const mail = await safe(() => odoo.searchRead('ir.mail_server', [['active', '=', true]], ['smtp_host']));
  add('A2_correo_saliente_solo_invalido', 'adicional_nuestro', Array.isArray(mail) && mail.every((m) => m.smtp_host === 'invalid'), Array.isArray(mail) ? mail.length : mail.error);
  const counts = [
    ['A3_webhooks_entrantes_activos_0', 'base.automation', [['active', '=', true], ['trigger', '=', 'on_webhook']]],
    ['A4_automatizaciones_con_salida_externa_0', 'base.automation', [['active', '=', true], ['action_server_ids.state', 'in', ['webhook', 'whatsapp', 'sms']]]],
    ['A5_whatsapp_activas_0', 'whatsapp.account', [['active', '=', true]]],
    ['A6_pagos_habilitados_0', 'payment.provider', [['state', '!=', 'disabled']]],
    ['A7_correo_entrante_activo_0', 'fetchmail.server', [['active', '=', true]]],
  ];
  for (const [id, model, domain] of counts) {
    const n = await safe(() => odoo.count(model, domain));
    add(id, 'adicional_nuestro', n === 0, typeof n === 'number' ? n : n.error);
  }
  return { isolated: checks.every((c) => c.ok), checks };
}

function fieldSpec([model, name, ttype, label, extra]) { return { model, name, ttype, label, ...extra }; }
export const xmlidOfField = (model, name) => `field_${model.replace(/\./g, '_')}__${name}`;

/** Compatibilidad real de un campo existente con la especificacion (no solo el nombre). */
export function fieldCompatibility(spec, existing) {
  if (!existing) return { ok: true, reason: 'NEW' };
  if (existing.ttype !== spec.ttype) return { ok: false, reason: `TTYPE ${existing.ttype}!=${spec.ttype}` };
  if (['many2one', 'one2many', 'many2many'].includes(spec.ttype) && existing.relation !== spec.relation) return { ok: false, reason: `RELATION ${existing.relation}!=${spec.relation}` };
  if (spec.related && (existing.related || '') !== spec.related) return { ok: false, reason: 'RELATED_DIFFERS' };
  if (spec.selection) {
    const have = new Set(existing.selection_keys || []);
    const missing = spec.selection.map((s) => s.value).filter((v) => !have.has(v));
    if (missing.length) return { ok: false, reason: `SELECTION_MISSING ${missing.join('/')}` };
  }
  return { ok: true, reason: 'COMPATIBLE' };
}

const refsIn = (v) => [...JSON.stringify(v ?? '').matchAll(/\{\{ref:([a-z0-9_]+)\}\}|"ref":"([a-z0-9_]+)"/g)].map((m) => m[1] || m[2]);

export async function applyManifest(odoo, { apply = false, log = () => {} } = {}) {
  const plan = { mode: apply ? 'apply' : 'dry-run', create: [], update: [], adopt: [], reuse: [], blocked: [], warnings: [] };
  const ids = new Map(); // xmlid NS -> id
  const ours = new Set(); // `${model}:${id}`
  let fakeId = 0;

  // 1. dependencias
  const present = new Set((await odoo.searchRead('ir.model', [['model', 'in', [...REQUIRED_MODELS, ...MODELS.map((m) => m.model)]]], ['model'])).map((m) => m.model));
  for (const m of REQUIRED_MODELS) if (!present.has(m)) plan.blocked.push({ item: m, reason: 'REQUIRED_MODEL_MISSING' });
  const qFields = await odoo.searchRead('ir.model.fields', [['model', '=', 'survey.question'], ['name', 'in', ['triggering_answer_ids', 'is_page', 'constr_mandatory']]], ['name']);
  if (qFields.length < 3) plan.blocked.push({ item: 'survey.question', reason: 'SURVEY_CAPABILITY_MISSING' });

  // 2. inventario propio
  for (const d of await odoo.searchRead('ir.model.data', [['module', '=', NS]], ['name', 'model', 'res_id'])) { ids.set(d.name, d.res_id); ours.add(`${d.model}:${d.res_id}`); }

  // 3. modelos
  for (const m of MODELS) if (!ids.has(`model_${m.model}`) && present.has(m.model)) plan.blocked.push({ item: m.model, reason: 'MODEL_EXISTS_NOT_OURS' });

  // 4. campos: compatibilidad real
  const pairs = FIELDS.map(fieldSpec);
  const existing = await odoo.searchRead('ir.model.fields', [['model', 'in', [...new Set(pairs.map((f) => f.model))]], ['name', 'in', [...new Set(pairs.map((f) => f.name))]]], ['id', 'model', 'name', 'ttype', 'relation', 'related', 'state', 'selection_ids']);
  const selIds = existing.flatMap((f) => f.selection_ids || []);
  const selRows = selIds.length ? await odoo.searchRead('ir.model.fields.selection', [['id', 'in', selIds]], ['field_id', 'value']) : [];
  const byKey = new Map(existing.map((f) => [`${f.model}.${f.name}`, { ...f, selection_keys: selRows.filter((s) => (Array.isArray(s.field_id) ? s.field_id[0] : s.field_id) === f.id).map((s) => s.value) }]));
  const fieldPlan = [];
  for (const spec of pairs) {
    const ex = byKey.get(`${spec.model}.${spec.name}`);
    const xid = xmlidOfField(spec.model, spec.name);
    const comp = fieldCompatibility(spec, ex);
    if (!comp.ok) { plan.blocked.push({ item: `${spec.model}.${spec.name}`, reason: `FIELD_INCOMPATIBLE ${comp.reason}` }); continue; }
    if (!ex) fieldPlan.push({ spec, action: 'create' });
    else if (ids.has(xid)) fieldPlan.push({ spec, action: 'ok', id: ex.id });
    else if (ex.state === 'manual') fieldPlan.push({ spec, action: 'adopt', id: ex.id });
    else fieldPlan.push({ spec, action: 'reuse', id: ex.id });
  }
  if (plan.blocked.length) { log({ event: 'blocked', blocked: plan.blocked }); return plan; }

  // --- escritura acotada ---
  const guardModel = (model) => { if (!WRITABLE_MODELS.includes(model)) throw new ApplyError('MODEL_NOT_WRITABLE', model); };
  const create = async (model, vals, xmlid) => {
    guardModel(model);
    plan.create.push(xmlid ? `${model}:${xmlid}` : model);
    if (!apply) { fakeId -= 1; if (xmlid) ids.set(xmlid, fakeId); return fakeId; }
    const id = await odoo.create(model, vals);
    ours.add(`${model}:${id}`);
    if (xmlid) { await odoo.create('ir.model.data', { module: NS, name: xmlid, model, res_id: id, noupdate: true }); ids.set(xmlid, id); }
    log({ event: 'created', model, xmlid: xmlid || null, id });
    return id;
  };
  const write = async (model, id, vals, xmlid) => {
    guardModel(model);
    if (!ours.has(`${model}:${id}`)) throw new ApplyError('WRITE_NOT_OURS', `${model}:${id}`);
    plan.update.push(`${model}:${xmlid}`);
    if (apply) await odoo.write(model, [id], vals);
  };
  const adopt = async (model, id, xmlid) => {
    plan.adopt.push(`${model}:${xmlid}`);
    if (apply) await odoo.create('ir.model.data', { module: NS, name: xmlid, model, res_id: id, noupdate: true });
    ids.set(xmlid, id); ours.add(`${model}:${id}`);
  };
  const ext = new Map();
  const extRef = async (full) => {
    if (!ext.has(full)) { const [module, name] = full.split('.'); const r = await odoo.searchRead('ir.model.data', [['module', '=', module], ['name', '=', name]], ['res_id']); if (!r.length) throw new ApplyError('EXTERNAL_REF_MISSING', full); ext.set(full, r[0].res_id); }
    return ext.get(full);
  };
  const modelIds = new Map((await odoo.searchRead('ir.model', [['model', 'in', [...new Set([...pairs.map((f) => f.model), ...SERVER_ACTIONS.map((s) => s.model), ...VIEWS.map((v) => v.model), 'x_report_attempt', 'x_establishment'])]]], ['id', 'model'])).map((m) => [m.model, m.id]));
  const resolve = (s) => s.replace(/\{\{ref:([a-z0-9_]+)\}\}/g, (_, x) => { if (!ids.has(x)) throw new ApplyError('REF_UNRESOLVED', x); return String(ids.get(x)); });
  /** upsert por xmlid; si falta el xmlid adopta un unico registro por clave natural (recuperacion de ejecucion parcial). */
  const upsert = async (model, xmlid, vals, natural) => {
    if (ids.has(xmlid)) { await write(model, ids.get(xmlid), vals, xmlid); return ids.get(xmlid); }
    const found = natural ? await odoo.searchRead(model, natural, ['id']) : [];
    if (found.length > 1) throw new ApplyError('NATURAL_KEY_AMBIGUOUS', `${model}:${xmlid}`);
    if (found.length === 1) { await adopt(model, found[0].id, xmlid); await write(model, found[0].id, vals, xmlid); return found[0].id; }
    return create(model, vals, xmlid);
  };

  // modelos
  const createdModels = [];
  for (const m of MODELS) {
    const xid = `model_${m.model}`;
    if (!ids.has(xid)) { const id = await create('ir.model', { name: m.name, model: m.model, state: 'manual' }, xid); modelIds.set(m.model, id); createdModels.push(m.model); }
  }
  // Odoo crea x_name automaticamente en cada modelo nuevo: se adopta (si es compatible) en lugar de duplicarlo
  if (apply && createdModels.length) {
    const auto = await odoo.searchRead('ir.model.fields', [['model', 'in', createdModels]], ['id', 'model', 'name', 'ttype', 'relation', 'related', 'state']);
    for (const f of fieldPlan) {
      const ex = f.action === 'create' && auto.find((a) => a.model === f.spec.model && a.name === f.spec.name);
      if (!ex) continue;
      const comp = fieldCompatibility(f.spec, ex);
      if (!comp.ok) throw new ApplyError('AUTO_FIELD_INCOMPATIBLE', `${f.spec.model}.${f.spec.name} ${comp.reason}`);
      Object.assign(f, { action: 'adopt', id: ex.id });
    }
  }
  // campos
  for (const f of fieldPlan) {
    const xid = xmlidOfField(f.spec.model, f.spec.name);
    if (f.action === 'reuse') { plan.reuse.push(`${f.spec.model}.${f.spec.name}`); continue; }
    if (f.action === 'ok') continue;
    if (f.action === 'adopt') { await adopt('ir.model.fields', f.id, xid); await write('ir.model.fields', f.id, { field_description: f.spec.label, required: !!f.spec.required }, xid); continue; }
    const s = f.spec;
    const vals = { model_id: modelIds.get(s.model), name: s.name, ttype: s.ttype, field_description: s.label, state: 'manual' };
    for (const k of ['relation', 'relation_field', 'relation_table', 'column1', 'column2', 'related', 'compute', 'depends', 'on_delete']) if (s[k]) vals[k] = s[k];
    if (s.required) vals.required = true;
    if (s.readonly) vals.readonly = true;
    if (s.store !== undefined) vals.store = s.store;
    if (s.selection) vals.selection_ids = s.selection.map((x) => [0, 0, x]);
    await create('ir.model.fields', vals, xid);
  }
  // permisos
  for (const a of ACLS) {
    await upsert('ir.model.access', a.xmlid, { name: `ath_${a.xmlid}`, model_id: modelIds.get(a.model), group_id: await extRef(a.group), perm_read: !!a.perms[0], perm_write: !!a.perms[1], perm_create: !!a.perms[2], perm_unlink: !!a.perms[3] }, [['name', '=', `ath_${a.xmlid}`]]);
  }
  // encuesta: se crea antes de las acciones (sa_invite la busca por xmlid en tiempo de ejecucion)
  const surveyId = await upsert('survey.survey', SURVEY.xmlid, SURVEY.vals, [['title', '=', SURVEY.vals.title]]);
  const questions = surveyQuestions();
  const qIds = new Map();
  let seq = 0;
  for (const q of questions) {
    seq += 1;
    const xid = `q_${q.key}`;
    const base = { title: q.title, sequence: seq };
    if (q.page) Object.assign(base, { is_page: true });
    else Object.assign(base, { question_type: q.type, constr_mandatory: !!q.mandatory });
    if (ids.has(xid)) { await write('survey.question', ids.get(xid), base, xid); qIds.set(q.key, ids.get(xid)); continue; }
    const vals = { ...base, survey_id: surveyId };
    if (q.answers) vals.suggested_answer_ids = q.answers.map((v, i) => [0, 0, { value: v, sequence: i + 1 }]);
    qIds.set(q.key, await upsert('survey.question', xid, vals, apply && surveyId > 0 ? [['survey_id', '=', surveyId], ['title', '=', q.title]] : null));
  }
  // condiciones: acompanante k visible si "Numero de acompanantes" >= k
  if (apply) {
    const countAnswers = await odoo.searchRead('survey.question.answer', [['question_id', '=', qIds.get('p_companions')]], ['id', 'value']);
    const byMin = new Map();
    for (const q of questions.filter((x) => x.triggerKey)) {
      if (!byMin.has(q.triggerMin)) byMin.set(q.triggerMin, []);
      byMin.get(q.triggerMin).push(qIds.get(q.key));
    }
    for (const [min, qs] of byMin) {
      const trig = countAnswers.filter((a) => Number(a.value) >= min).map((a) => a.id);
      if (trig.length !== 22 - min) throw new ApplyError('TRIGGER_ANSWERS_UNEXPECTED', String(min));
      for (const id of qs) if (!ours.has(`survey.question:${id}`)) throw new ApplyError('WRITE_NOT_OURS', `survey.question:${id}`);
      plan.update.push(`survey.question:triggers>=${min}`);
      await odoo.write('survey.question', qs, { triggering_answer_ids: [[6, 0, trig]] });
    }
  } else plan.update.push('survey.question:triggers');

  // acciones de servidor
  for (const s of SERVER_ACTIONS) {
    const vals = { name: s.name, model_id: modelIds.get(s.model), state: 'code', code: s.code };
    if (s.bind) Object.assign(vals, { binding_model_id: modelIds.get(s.model), binding_type: 'action', binding_view_types: 'list,form' });
    await upsert('ir.actions.server', s.xmlid, vals, [['name', '=', s.name]]);
  }
  // automatizaciones
  for (const a of AUTOMATIONS) {
    const trig = a.triggerFields.length ? (await odoo.searchRead('ir.model.fields', [['model', '=', a.model], ['name', 'in', a.triggerFields]], ['id'])).map((f) => f.id) : [];
    const vals = { name: a.name, model_id: modelIds.get(a.model), trigger: a.trigger, trigger_field_ids: [[6, 0, trig]], filter_domain: a.domain || false, action_server_ids: [[6, 0, [ids.get(a.action)]]], active: true };
    await upsert('base.automation', a.xmlid, vals, [['name', '=', a.name]]);
  }
  // vistas, ventanas y menus con orden por dependencias
  const items = [
    ...VIEWS.map((v) => ({ xmlid: v.xmlid, deps: refsIn(v.arch), run: () => upsert('ir.ui.view', v.xmlid, { name: v.name, model: v.model, type: v.type, mode: 'primary', priority: v.priority, arch: resolve(v.arch) }, [['name', '=', v.name], ['model', '=', v.model]]) })),
    ...WINDOW_ACTIONS.map((w) => ({ xmlid: w.xmlid, deps: [...w.views, ...(w.search ? [w.search] : [])], run: () => upsert('ir.actions.act_window', w.xmlid, {
      name: w.name, res_model: w.model, view_mode: w.view_mode || 'list,form', target: w.target || 'current', domain: w.domain || false,
      search_view_id: w.search ? ids.get(w.search) : false,
      view_ids: [[5, 0, 0], ...w.views.map((v, i) => [0, 0, { sequence: i + 1, view_mode: VIEWS.find((x) => x.xmlid === v).type, view_id: ids.get(v) }])],
    }, [['name', '=', w.name], ['res_model', '=', w.model]]) })),
    ...MENUS.map((m) => ({ xmlid: m.xmlid, deps: [m.parent, m.action].filter(Boolean), run: async () => upsert('ir.ui.menu', m.xmlid, { name: m.name, sequence: m.sequence, parent_id: m.parent ? ids.get(m.parent) : false, action: m.action ? `ir.actions.act_window,${ids.get(m.action)}` : false }, [['name', '=', m.name], ['parent_id', '=', m.parent ? ids.get(m.parent) : false]]) })),
  ];
  let pending = items;
  while (pending.length) {
    const ready = pending.filter((it) => it.deps.every((d) => ids.has(d)));
    if (!ready.length) throw new ApplyError('DEPENDENCY_CYCLE', pending.map((p) => p.xmlid).join(','));
    for (const it of ready) await it.run();
    pending = pending.filter((it) => !ready.includes(it));
  }
  log({ event: 'done', mode: plan.mode, created: plan.create.length, updated: plan.update.length, adopted: plan.adopt.length, reused: plan.reuse.length });
  return plan;
}

/** Reversion: borra SOLO registros con xmlid NS, en orden inverso de dependencias. Pierde los datos de los campos creados. */
export async function rollbackManifest(odoo, { apply = false, log = () => {} } = {}) {
  const order = ['ir.ui.menu', 'ir.actions.act_window', 'ir.ui.view', 'base.automation', 'ir.actions.server', 'survey.question', 'survey.survey', 'ir.model.access', 'ir.model.fields', 'ir.model'];
  const data = await odoo.searchRead('ir.model.data', [['module', '=', NS]], ['id', 'name', 'model', 'res_id']);
  const out = [];
  for (const model of order) {
    const rows = data.filter((d) => d.model === model);
    if (!rows.length) continue;
    const live = (await odoo.searchRead(model, [['id', 'in', rows.map((r) => r.res_id)]], ['id'])).map((r) => r.id);
    out.push({ model, count: live.length });
    if (apply && live.length) { await odoo.unlink(model, live); log({ event: 'unlinked', model, count: live.length }); }
  }
  if (apply && data.length) await odoo.unlink('ir.model.data', data.map((d) => d.id));
  return { mode: apply ? 'rollback' : 'rollback-dry-run', remove: out };
}
