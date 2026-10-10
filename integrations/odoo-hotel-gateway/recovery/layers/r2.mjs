// R2 — campos x_* de sale.order. Definiciones del respaldo del repo (ir-model-fields-sale-order-custom.json).
// Del archivo de 97 campos, 17 NO son propios (los crean módulos estándar) y se EXCLUYEN: solo se crean los 80 x_*.
// Lo que el respaldo no define (relation_field de one2many, compute/store) NO se inventa: ese campo se marca BLOQUEA
// salvo que el extracto del dump (opcional) lo aporte.
import { readBackup, tryExtract, EXTRACT_DIR, READ_CTX } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';
import { txt, parseSelection, selectionCommands, fieldOrder } from '../pure.mjs';

export const meta = { id: 'R2', title: 'Campos x_* de sale.order', critical: true, needs: 'R1 aplicado (relaciones a x_hotel_*) y módulos l10n/hr de los many2one' };

export function plan(ctx = {}) {
  const base = readBackup('ir-model-fields-sale-order-custom.json');
  const custom = base.filter((f) => f.name.startsWith('x_'));
  const enrich = tryExtract('fields.json', ctx.extractDir ?? EXTRACT_DIR)?.filter((f) => f.model === 'sale.order') ?? [];
  const byName = new Map(enrich.map((f) => [f.name, f]));
  const sels = (tryExtract('selections.json', ctx.extractDir ?? EXTRACT_DIR) ?? []).filter((x) => x.field_model === 'sale.order');
  const items = custom.map((f) => {
    const e = byName.get(f.name) ?? {};
    const issues = [];
    let selection = null;
    if (f.ttype === 'selection') {
      selection = parseSelection(f.selection);
      const extra = sels.filter((x) => x.field_name === f.name);
      if (!selection && extra.length) selection = extra.map((x) => ({ value: x.value, name: txt(x.name), sequence: x.sequence ?? 0 }));
      if (!selection) issues.push(f.selection === '[]' ? 'selection vacía en el respaldo (solo el dump tiene las opciones)' : 'selection no interpretable');
    }
    if (f.ttype === 'one2many' && !e.relation_field) issues.push('one2many sin relation_field (solo el dump lo define)');
    return { ...f, relation_field: e.relation_field, compute: e.compute, store: e.store, selection, issues, enriched: byName.has(f.name) };
  });
  return { standard_excluded: base.filter((f) => !f.name.startsWith('x_')).map((f) => f.name), items };
}

export const inputs = (ctx) => { plan(ctx); };

export async function run(ctx) {
  const { ex, ensure, log } = ctx;
  const { items, standard_excluded } = plan(ctx);
  log.add('NOTA', 'sale.order', `${standard_excluded.length} campos estándar excluidos`, { note: 'los crean módulos, no esta capa' });
  const soId = await findOne(ex, 'ir.model', [['model', '=', 'sale.order']]);
  if (!soId) { log.add('BLOQUEA', 'ir.model', 'sale.order', { note: 'sale.order no existe' }); return; }
  const modelCache = new Map();
  const hasModel = async (m) => { if (!modelCache.has(m)) modelCache.set(m, !!(await findOne(ex, 'ir.model', [['model', '=', m]]))); return modelCache.get(m); };
  for (const f of fieldOrder(items.map((i) => ({ ...i, model: 'sale.order' })))) {
    const label = `sale.order.${f.name}`;
    if (f.issues.length) { log.add('BLOQUEA', 'ir.model.fields', label, { note: f.issues.join('; ') }); continue; }
    if (f.relation && !(await hasModel(f.relation))) { log.add('BLOQUEA', 'ir.model.fields', label, { note: `modelo ${f.relation} ausente (¿R1 o módulo?)` }); continue; }
    const payload = { name: f.name, model_id: soId, ttype: f.ttype, field_description: f.field_description, state: 'manual' };
    if (f.required) payload.required = true;
    if (typeof f.help === 'string' && f.help) payload.help = f.help;
    if (f.relation) payload.relation = f.relation;
    if (f.relation_field) payload.relation_field = f.relation_field;
    if (f.compute) payload.compute = f.compute;
    if (f.selection) payload.selection_ids = selectionCommands(f.selection);
    await ensure('ir.model.fields', [['model_id', '=', soId], ['name', '=', f.name]], payload, label, { compareFields: ['ttype', 'relation', 'required'] });
  }
}

export async function verify(ctx) {
  const { items } = plan(ctx);
  const checks = [];
  for (const f of items) {
    if (f.issues.length) { checks.push({ name: `sale.order.${f.name}`, ok: false, blocked: true, detail: f.issues.join('; ') }); continue; }
    const r = await ctx.ex('ir.model.fields', 'search_read', [[['model', '=', 'sale.order'], ['name', '=', f.name]]], { fields: ['ttype', 'relation'], limit: 2, context: READ_CTX });
    checks.push({ name: `sale.order.${f.name}`, ok: r.length === 1 && r[0].ttype === f.ttype && (!f.relation || r[0].relation === f.relation) });
  }
  return { ok: checks.every((c) => c.ok), checks, blocked: checks.filter((c) => c.blocked).map((c) => c.name) };
}
