// R2 — campos x_* de sale.order. Definiciones del respaldo del repo (ir-model-fields-sale-order-custom.json).
// Del archivo de 97 campos, 17 NO son propios (los crean módulos estándar) y se EXCLUYEN: solo se crean los 80 x_*.
// Lo que el respaldo no define (relation_field de one2many, compute/store) NO se inventa: ese campo se marca BLOQUEA
// salvo que el extracto del dump (opcional) lo aporte.
import { readBackup, tryExtract, EXTRACT_DIR } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';
import { txt, parseSelection, selectionCommands, fieldOrder } from '../pure.mjs';
import { knownFromRows, depIssues } from '../deps.mjs';
import { classifyOtaField } from '../scope.mjs';
import { inspectFields, assertNoFieldConflict } from '../field-diff.mjs';
import { BlockedError } from '../recovery-lib.mjs';

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
      // selection related (p. ej. x_regimen_cliente → partner_id.l10n_co_edi_fiscal_regimen): hereda las opciones de su origen; no se fabrican
      if (!selection && !e.related) issues.push(f.selection === '[]' ? 'selection vacía en el respaldo (solo el dump tiene las opciones)' : 'selection no interpretable');
    }
    if (f.ttype === 'one2many' && !e.relation_field) issues.push('one2many sin relation_field (solo el dump lo define)');
    return { ...f, relation_field: e.relation_field, compute: e.compute, depends: e.depends, store: e.store, related: e.related, readonly: f.readonly ?? e.readonly, selection, issues, enriched: byName.has(f.name) };
  });
  // campos del dump que el respaldo del 30-sep NO trae (x_hotel_is_test): se agregan con la definición del dump; nada se inventa
  const inBackup = new Set(custom.map((f) => f.name));
  for (const e of enrich.filter((x) => x.name.startsWith('x_') && !inBackup.has(x.name))) {
    const issues = [];
    if (e.ttype === 'selection' && !e.related && !sels.some((x) => x.field_name === e.name)) issues.push('selection sin opciones en selections.json');
    if (e.ttype === 'one2many' && !e.relation_field) issues.push('one2many sin relation_field');
    items.push({ name: e.name, ttype: e.ttype, field_description: txt(e.field_description), relation: e.relation ?? undefined, required: e.required, help: e.help ?? undefined,
      relation_field: e.relation_field ?? undefined, compute: e.compute ?? undefined, depends: e.depends ?? undefined, store: e.store, related: e.related ?? undefined, readonly: e.readonly,
      selection: e.ttype === 'selection' ? sels.filter((x) => x.field_name === e.name).map((x) => ({ value: x.value, name: txt(x.name), sequence: x.sequence ?? 0 })) : null, issues, enriched: true, from_dump: true });
  }
  const excluded_external_fields = items.filter((f) => classifyOtaField({ ...f, model: 'sale.order' }).ota)
    .map((f) => ({ name: f.name, reasons: classifyOtaField({ ...f, model: 'sale.order' }).reasons }));
  const excludedNames = new Set(excluded_external_fields.map((f) => f.name));
  const hotel_fields = items.filter((f) => !excludedNames.has(f.name));
  return { standard_excluded: base.filter((f) => !f.name.startsWith('x_')).map((f) => f.name),
    expected_total: items.length, items: hotel_fields, R2_HOTEL_FIELDS: hotel_fields.map((f) => f.name),
    R2_EXCLUDED_EXTERNAL_FIELDS: excluded_external_fields, enrichRows: enrich };
}

export const inputs = (ctx) => { plan(ctx); };

export async function run(ctx) {
  const { ex, ensure, log } = ctx;
  const { items, standard_excluded, R2_EXCLUDED_EXTERNAL_FIELDS } = plan(ctx);
  const known = knownFromRows(items.map((i) => ({ ...i, model: 'sale.order' }))); const knownNames = new Set(items.map((i) => i.name));
  log.add('NOTA', 'sale.order', `${standard_excluded.length} campos estándar excluidos`, { note: 'los crean módulos, no esta capa' });
  for (const f of R2_EXCLUDED_EXTERNAL_FIELDS) log.add('EXCLUYE_OTA', 'ir.model.fields', `sale.order.${f.name}`, { note: f.reasons.join('; ') });
  const classified = await inspectFields(ex, 'sale.order', items);
  for (const f of classified) log.add(f.status === 'CREATE_MISSING' ? 'MISSING' : f.status === 'REUSE_EXISTING' ? 'EXISTS_COMPATIBLE' : 'EXISTS_DIFFERENT',
    'ir.model.fields', `sale.order.${f.name}`, { note: f.differences.join(', ') });
  const conflict = assertNoFieldConflict(classified, 'sale.order');
  if (conflict) throw new BlockedError(conflict);
  const status = new Map(classified.map((f) => [f.name, f.status]));
  const soId = await findOne(ex, 'ir.model', [['model', '=', 'sale.order']]);
  if (!soId) { log.add('BLOQUEA', 'ir.model', 'sale.order', { note: 'sale.order no existe' }); return; }
  const modelCache = new Map();
  const hasModel = async (m) => { if (!modelCache.has(m)) modelCache.set(m, !!(await findOne(ex, 'ir.model', [['model', '=', m]]))); return modelCache.get(m); };
  for (const f of fieldOrder(items.map((i) => ({ ...i, model: 'sale.order' })))) {
    const label = `sale.order.${f.name}`;
    if (status.get(f.name) === 'REUSE_EXISTING') continue;
    if (f.issues.length) { log.add('BLOQUEA', 'ir.model.fields', label, { note: f.issues.join('; ') }); continue; }
    if (f.relation && !(await hasModel(f.relation))) { log.add('BLOQUEA', 'ir.model.fields', label, { note: `modelo ${f.relation} ausente (¿R1 o módulo?)` }); continue; }
    const missing = await depIssues(ex, { model: 'sale.order', name: f.name, related: f.related, depends: f.depends, compute: f.compute }, known, knownNames);
    if (missing.length) { log.add('DEP_FALTA', 'ir.model.fields', label, { note: `dependencias ausentes en el destino: ${missing.join(', ')} (módulo/localización o campo x_ no definido; no se inventan)` }); continue; }
    const payload = { name: f.name, model_id: soId, ttype: f.ttype, field_description: f.field_description, state: 'manual' };
    if (f.related) payload.related = f.related;
    if (f.store === false) payload.store = false;
    if (f.depends && f.compute) payload.depends = f.depends;
    if (f.readonly) payload.readonly = true;
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
  const inspected = await inspectFields(ctx.ex, 'sale.order', items);
  for (const [i, f] of items.entries()) checks.push({ name: `sale.order.${f.name}`,
    ok: !f.issues.length && inspected[i].status === 'REUSE_EXISTING',
    blocked: !!f.issues.length, detail: f.issues.length ? f.issues.join('; ') : inspected[i].differences.join(', ') });
  return { ok: checks.every((c) => c.ok), checks, blocked: checks.filter((c) => c.blocked).map((c) => c.name) };
}
