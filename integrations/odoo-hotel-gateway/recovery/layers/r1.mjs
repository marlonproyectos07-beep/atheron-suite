// R1 — modelos x_hotel_* y campos manuales de planning.slot / sale.order. NO contiene definiciones: salen del extracto del dump.
import { loadExtract, BlockedError, READ_CTX, EXTRACT_DIR } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';
import { txt, fieldOrder, selectionCommands, FIELD_OPTIONAL } from '../pure.mjs';

// Modelos propios admitidos: x_hotel_* y x_guests_line (modelo de Studio «Guests Line», usado por sale.order.x_guest_line_ids).
export const OWN_MODEL = /^(x_hotel_|x_guests_line$)/;

export const meta = { id: 'R1', title: 'Modelos x_hotel_* y campos de planning.slot', critical: true, needs: 'AI/recovery-extract/{models,fields,selections}.json' };

const load = (ctx) => {
  const dir = ctx.extractDir ?? EXTRACT_DIR;
  // Los campos de sale.order los crea R2 (con las definiciones del respaldo + este extracto como enriquecimiento): R1 no los toca.
  return { models: loadExtract('models.json', dir), fields: loadExtract('fields.json', dir).filter((f) => f.model !== 'sale.order'), selections: loadExtract('selections.json', dir) };
};

/** Insumos locales: se validan ANTES de conectar a nada. */
export const inputs = (ctx) => { load(ctx); };

export async function run(ctx) {
  const { models, fields, selections } = load(ctx);
  const { ex, ensure, log, write } = ctx;
  for (const m of models) {
    if (!OWN_MODEL.test(m.model)) throw new BlockedError(`models.json trae un modelo fuera de alcance: ${m.model}`);
    await ensure('ir.model', [['model', '=', m.model]], { model: m.model, name: txt(m.name), state: 'manual' }, m.model, { compareFields: ['model', 'name'] });
  }
  const declared = new Set(models.map((m) => m.model));
  const ids = new Map();
  const modelId = async (model) => { if (!ids.has(model)) ids.set(model, await findOne(ex, 'ir.model', [['model', '=', model]])); return ids.get(model); };
  for (const f of fieldOrder(fields)) {
    const label = `${f.model}.${f.name}`;
    const mid = await modelId(f.model);
    if (!mid) { log.add(write ? 'BLOQUEA' : 'FALTA', 'ir.model', f.model, { note: `modelo ausente para ${label}${declared.has(f.model) ? ' (se crea en el apply)' : ''}` }); continue; }
    if (f.relation && !declared.has(f.relation) && !(await modelId(f.relation))) { log.add('BLOQUEA', 'ir.model.fields', label, { note: `relación a ${f.relation} que no existe ni se crea` }); continue; }
    const payload = { name: f.name, model_id: mid, ttype: f.ttype, field_description: txt(f.field_description), state: 'manual' };
    if (f.relation) payload.relation = f.relation;
    for (const k of FIELD_OPTIONAL) if (f[k] !== undefined && f[k] !== null) payload[k] = f[k];
    if (f.ttype === 'selection') {
      const sel = selections.filter((s) => s.field_model === f.model && s.field_name === f.name);
      if (!sel.length) { log.add('BLOQUEA', 'ir.model.fields', label, { note: 'selection sin opciones en selections.json' }); continue; }
      payload.selection_ids = selectionCommands(sel);
    }
    await ensure('ir.model.fields', [['model_id', '=', mid], ['name', '=', f.name]], payload, label, { compareFields: ['ttype', 'relation', 'required'] });
  }
}

export async function verify(ctx) {
  const { models, fields } = load(ctx);
  const checks = [];
  for (const m of models) checks.push({ name: `modelo ${m.model}`, ok: (await ctx.ex('ir.model', 'search', [[['model', '=', m.model]]], { context: READ_CTX })).length === 1 });
  for (const f of fields) {
    const r = await ctx.ex('ir.model.fields', 'search_read', [[['model', '=', f.model], ['name', '=', f.name]]], { fields: ['ttype', 'relation'], limit: 2, context: READ_CTX });
    checks.push({ name: `campo ${f.model}.${f.name}`, ok: r.length === 1 && r[0].ttype === f.ttype && (!f.relation || r[0].relation === f.relation) });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
