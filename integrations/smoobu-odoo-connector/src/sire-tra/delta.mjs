import { FIELDS, NS, SERVER_ACTIONS, VIEWS } from './manifest.mjs';
import { xmlidOfField } from './applier.mjs';
import { DELTA_BASE } from './delta-base-2026-11-24.mjs';

/**
 * Despliegue MINIMO TRA Grupo 1 (2026-11-24, PR #124): solo los cinco objetos que cambian frente a produccion.
 *  - crear 2 campos: x_tra_amount.x_excludes_taxes y x_tra_amount.x_covers_all_guests (booleanos);
 *  - reescribir el codigo de la accion sa_amount_confirm;
 *  - reescribir la arquitectura de las vistas view_amount_form y view_amount_list.
 * No toca nada mas. El aplicador completo reescribe tambien las automatizaciones, y Odoo recalcula su cron al
 * escribirlas; este procedimiento lo evita.
 *
 * planDelta: solo lecturas. Bloquea si algun objeto no es el esperado (ni el contenido de main ni el de la rama):
 *   deriva = alguien lo cambio; no se escribe encima. Devuelve el respaldo exacto de lo que se va a reemplazar.
 * applyDelta: exige un plan limpio de la misma sesion. Orden: campos, accion, vistas (las vistas usan los campos).
 * revertDelta: devuelve accion y vistas al respaldo si siguen con el contenido de la rama. Los dos campos no se borran
 *   (quedan sin uso); borrarlos solo con orden expresa y sin importes registrados.
 */
export const DELTA_ID = 'tra-grupo1-2026-11-24';
export const DELTA = Object.freeze({
  model: 'x_tra_amount',
  fields: Object.freeze(['x_excludes_taxes', 'x_covers_all_guests']),
  serverActions: Object.freeze(['sa_amount_confirm']),
  views: Object.freeze(['view_amount_form', 'view_amount_list']),
});

export class DeltaError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }

const REF_RE = /\{\{ref:([a-z0-9_]+)\}\}/g;
const refsOf = (s) => [...s.matchAll(REF_RE)].map((m) => m[1]);
const targetAction = (x) => SERVER_ACTIONS.find((s) => s.xmlid === x).code;
const targetView = (x) => VIEWS.find((v) => v.xmlid === x).arch;

export async function planDelta(odoo) {
  const plan = { id: DELTA_ID, base: DELTA_BASE.commit, changes: [], done: [], blocked: [], backup: { delta: DELTA_ID, takenAt: new Date().toISOString(), actions: [], views: [], fieldsAbsent: [] } };
  const block = (item, reason) => plan.blocked.push({ item, reason });
  const viewRefs = DELTA.views.flatMap((v) => [...refsOf(targetView(v)), ...refsOf(DELTA_BASE.views[v])]);
  const names = [...new Set([`model_${DELTA.model}`, ...DELTA.fields.map((f) => xmlidOfField(DELTA.model, f)), ...DELTA.serverActions, ...DELTA.views, ...viewRefs])];
  const imd = await odoo.searchRead('ir.model.data', [['module', '=', NS], ['name', 'in', names]], ['name', 'model', 'res_id']);
  const ids = new Map(imd.map((d) => [d.name, d.res_id]));
  if (!ids.has(`model_${DELTA.model}`)) block(DELTA.model, 'MODEL_NOT_OURS');

  // 1. campos
  const existing = await odoo.searchRead('ir.model.fields', [['model', '=', DELTA.model], ['name', 'in', [...DELTA.fields]]], ['id', 'name', 'ttype']);
  for (const name of DELTA.fields) {
    const spec = FIELDS.find((f) => f[0] === DELTA.model && f[1] === name);
    if (!spec) { block(name, 'FIELD_NOT_IN_MANIFEST'); continue; }
    const ex = existing.find((f) => f.name === name);
    const xmlid = xmlidOfField(DELTA.model, name);
    if (!ex) { plan.changes.push({ kind: 'create_field', model: DELTA.model, name, ttype: spec[2], label: spec[3], xmlid }); plan.backup.fieldsAbsent.push(name); }
    else if (ids.get(xmlid) === ex.id && ex.ttype === spec[2]) plan.done.push(`field:${name}`);
    else block(`${DELTA.model}.${name}`, 'FIELD_EXISTS_NOT_OURS');
  }
  // 2. accion
  for (const xmlid of DELTA.serverActions) {
    if (!ids.has(xmlid)) { block(xmlid, 'NOT_INSTALLED'); continue; }
    const [rec] = await odoo.searchRead('ir.actions.server', [['id', '=', ids.get(xmlid)]], ['id', 'code']);
    if (!rec) block(xmlid, 'NOT_FOUND');
    else if (rec.code === targetAction(xmlid)) plan.done.push(`action:${xmlid}`);
    else if (rec.code === DELTA_BASE.serverActions[xmlid]) { plan.changes.push({ kind: 'write_action', xmlid, id: rec.id }); plan.backup.actions.push({ xmlid, id: rec.id, code: rec.code }); }
    else block(xmlid, 'DRIFT');
  }
  // 3. vistas (arch_db se guarda tal cual: se compara con la plantilla resuelta con los ids de produccion)
  const resolve = (s) => s.replace(REF_RE, (_, x) => { if (!ids.has(x)) throw new DeltaError('REF_MISSING', x); return String(ids.get(x)); });
  for (const xmlid of DELTA.views) {
    if (!ids.has(xmlid)) { block(xmlid, 'NOT_INSTALLED'); continue; }
    let base; let target;
    try { base = resolve(DELTA_BASE.views[xmlid]); target = resolve(targetView(xmlid)); } catch (e) { block(xmlid, `${e.code || 'REF'}:${e.detail || ''}`); continue; }
    const [rec] = await odoo.searchRead('ir.ui.view', [['id', '=', ids.get(xmlid)]], ['id', 'arch_db']);
    if (!rec) block(xmlid, 'NOT_FOUND');
    else if (rec.arch_db === target) plan.done.push(`view:${xmlid}`);
    else if (rec.arch_db === base) { plan.changes.push({ kind: 'write_view', xmlid, id: rec.id, arch: target }); plan.backup.views.push({ xmlid, id: rec.id, arch: rec.arch_db }); }
    else block(xmlid, 'DRIFT');
  }
  plan.modelId = ids.get(`model_${DELTA.model}`) || null;
  return plan;
}

export async function applyDelta(odoo, plan, { log = () => {} } = {}) {
  if (!plan || plan.id !== DELTA_ID) throw new DeltaError('PLAN_REQUIRED');
  if (plan.blocked.length) throw new DeltaError('PLAN_BLOCKED', plan.blocked);
  const order = { create_field: 0, write_action: 1, write_view: 2 };
  const applied = [];
  for (const c of [...plan.changes].sort((a, b) => order[a.kind] - order[b.kind])) {
    if (c.kind === 'create_field') {
      const id = await odoo.create('ir.model.fields', { model_id: plan.modelId, name: c.name, ttype: c.ttype, field_description: c.label, state: 'manual' });
      await odoo.create('ir.model.data', { module: NS, name: c.xmlid, model: 'ir.model.fields', res_id: id, noupdate: true });
      applied.push(`field:${c.name}:${id}`);
    } else if (c.kind === 'write_action') {
      await odoo.write('ir.actions.server', [c.id], { code: targetAction(c.xmlid) });
      applied.push(`action:${c.xmlid}:${c.id}`);
    } else if (c.kind === 'write_view') {
      await odoo.write('ir.ui.view', [c.id], { arch: c.arch });
      applied.push(`view:${c.xmlid}:${c.id}`);
    }
    log({ event: 'delta_applied', item: applied[applied.length - 1] });
  }
  return { id: DELTA_ID, applied };
}

/** Comprobacion posterior: nada pendiente ni bloqueado. */
export async function verifyDelta(odoo) {
  const plan = await planDelta(odoo);
  return { ok: plan.changes.length === 0 && plan.blocked.length === 0, done: plan.done, changes: plan.changes.map((c) => `${c.kind}:${c.kind === 'create_field' ? c.name : c.xmlid}`), blocked: plan.blocked };
}

/** Reversion: solo si cada objeto sigue con el contenido de la rama (si no, se detiene sin escribir nada). */
export async function revertDelta(odoo, backup) {
  if (!backup || backup.delta !== DELTA_ID) throw new DeltaError('BACKUP_REQUIRED');
  const current = await planDelta(odoo);
  if (current.blocked.length) throw new DeltaError('REVERT_BLOCKED', current.blocked);
  const expected = [...backup.actions.map((a) => `action:${a.xmlid}`), ...backup.views.map((v) => `view:${v.xmlid}`)];
  const notTarget = expected.filter((x) => !current.done.includes(x));
  if (notTarget.length) throw new DeltaError('REVERT_NOT_AT_TARGET', notTarget);
  const reverted = [];
  for (const v of backup.views) { await odoo.write('ir.ui.view', [v.id], { arch: v.arch }); reverted.push(`view:${v.xmlid}`); }
  for (const a of backup.actions) { await odoo.write('ir.actions.server', [a.id], { code: a.code }); reverted.push(`action:${a.xmlid}`); }
  return { id: DELTA_ID, reverted, fieldsKept: backup.fieldsAbsent };
}
