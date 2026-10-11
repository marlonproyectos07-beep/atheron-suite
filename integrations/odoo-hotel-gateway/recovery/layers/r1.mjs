// R1 — modelos x_hotel_* y campos manuales de planning.slot / sale.order. NO contiene definiciones: salen del extracto del dump.
import { loadExtract, BlockedError, READ_CTX, EXTRACT_DIR } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';
import { txt, fieldOrder, selectionCommands, FIELD_OPTIONAL } from '../pure.mjs';
import { OTA_MODELS, classifyOtaField } from '../scope.mjs';
import { knownFromRows, depIssues } from '../deps.mjs';
import { inspectFields, assertNoFieldConflict } from '../field-diff.mjs';

// Modelos propios admitidos: x_hotel_* y x_guests_line (modelo de Studio «Guests Line», usado por sale.order.x_guest_line_ids).
export const OWN_MODEL = /^(x_hotel_|x_guests_line$)/;

export const meta = { id: 'R1', title: 'Modelos x_hotel_* y campos de planning.slot', critical: true, needs: 'AI/recovery-extract/{models,fields,selections}.json' };

/**
 * Carga el extracto y APLICA EL ALCANCE BASE: se excluyen los modelos OTA (x_hotel_ota_feed, x_hotel_api_log), los campos de esos
 * modelos, los campos que apuntan a ellos y los de nombre NOBEDS/Beds24/iCal. Lo excluido se devuelve en `excluded` para registrarlo.
 * Los campos de sale.order los crea R2: R1 no los toca.
 */
const load = (ctx) => {
  const dir = ctx.extractDir ?? EXTRACT_DIR;
  const allModels = loadExtract('models.json', dir), everyField = loadExtract('fields.json', dir), allFields = everyField.filter((f) => f.model !== 'sale.order');
  const excluded = [];
  const models = allModels.filter((m) => { if (OTA_MODELS[m.model]) { excluded.push({ kind: 'modelo', key: m.model, reasons: [OTA_MODELS[m.model]] }); return false; } return true; });
  const fields = allFields.filter((f) => { const c = classifyOtaField(f); if (c.ota) { excluded.push({ kind: 'campo', key: `${f.model}.${f.name}`, reasons: c.reasons }); return false; } return true; });
  // `known`: todo lo que el paquete define (R1 + R2) para comprobar rutas related/compute sin pedirle al destino lo que se crea en esta misma corrida
  return { models, fields, excluded, selections: loadExtract('selections.json', dir), known: knownFromRows(everyField.filter((f) => !classifyOtaField(f).ota)), knownNames: new Set(everyField.map((f) => f.name)) };
};

/** Insumos locales: se validan ANTES de conectar a nada. */
export const inputs = (ctx) => { load(ctx); };

export async function run(ctx) {
  const { models, fields, selections, excluded, known, knownNames } = load(ctx);
  const { ex, ensure, log, write } = ctx;
  for (const e of excluded) log.add('EXCLUYE_OTA', 'ir.model' + (e.kind === 'campo' ? '.fields' : ''), e.key, { note: e.reasons.join('; ') });
  // Preflight de TODOS los campos existentes antes de la primera escritura de la capa.
  const classes = new Map();
  for (const model of new Set(fields.map((f) => f.model))) {
    const found = await inspectFields(ex, model, fields.filter((f) => f.model === model));
    for (const f of found) { classes.set(`${model}.${f.name}`, f); log.add(f.status, 'ir.model.fields', `${model}.${f.name}`, { note: f.differences.join(', ') }); }
    const conflict = assertNoFieldConflict(found, model);
    if (conflict) throw new BlockedError(conflict);
  }
  for (const m of models) {
    if (!OWN_MODEL.test(m.model)) throw new BlockedError(`models.json trae un modelo fuera de alcance: ${m.model}`);
    if (m.model === 'x_guests_line') {
      const existing = await ex('ir.model', 'search_read', [[['model', '=', m.model]]], { fields: ['model', 'state'], limit: 2, context: READ_CTX });
      if (existing.length !== 1) throw new BlockedError('x_guests_line debe existir exactamente una vez; R1 jamás recrea ese modelo');
      log.add('REUSE_EXISTING_MODEL', 'ir.model', m.model, { id: existing[0].id });
      continue;
    }
    await ensure('ir.model', [['model', '=', m.model]], { model: m.model, name: txt(m.name), state: 'manual' }, m.model, { compareFields: ['model'] });
  }
  const declared = new Set(models.map((m) => m.model));
  const ids = new Map();
  const modelId = async (model) => { if (!ids.has(model)) ids.set(model, await findOne(ex, 'ir.model', [['model', '=', model]])); return ids.get(model); };
  for (const f of fieldOrder(fields)) {
    const label = `${f.model}.${f.name}`;
    if (classes.get(label)?.status === 'REUSE_EXISTING') continue;
    const mid = await modelId(f.model);
    if (!mid) { log.add(write ? 'BLOQUEA' : 'FALTA', 'ir.model', f.model, { note: `modelo ausente para ${label}${declared.has(f.model) ? ' (se crea en el apply)' : ''}` }); continue; }
    if (f.relation && !declared.has(f.relation) && !(await modelId(f.relation))) { log.add('BLOQUEA', 'ir.model.fields', label, { note: `relación a ${f.relation} que no existe ni se crea` }); continue; }
    const missing = await depIssues(ex, f, known, knownNames);   // related / depends / compute: solo lectura; si la ruta no existe, el campo NO se crea
    if (missing.length) { log.add('DEP_FALTA', 'ir.model.fields', label, { note: `dependencias ausentes en el destino: ${missing.join(', ')} (no se inventan)` }); continue; }
    const payload = { name: f.name, model_id: mid, ttype: f.ttype, field_description: txt(f.field_description), state: 'manual' };
    if (f.relation) payload.relation = f.relation;
    for (const k of FIELD_OPTIONAL) if (f[k] !== undefined && f[k] !== null) payload[k] = f[k];
    if (f.ttype === 'selection' && !f.related) {   // un selection related hereda las opciones de su origen: 0 opciones propias es correcto (no se fabrican)
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
  for (const model of new Set(fields.map((f) => f.model)))
    for (const f of await inspectFields(ctx.ex, model, fields.filter((x) => x.model === model)))
      checks.push({ name: `campo ${model}.${f.name}`, ok: f.status === 'REUSE_EXISTING', detail: f.differences.join(', ') });
  return { ok: checks.every((c) => c.ok), checks };
}

/** Plan puro (sin red) para el análisis offline. */
export const plan = load;
