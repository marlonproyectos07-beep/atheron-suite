#!/usr/bin/env node
// ATH-STAGING-RECOVERY — R1 (ESQUELETO): modelos x_hotel_* y campos manuales de planning.slot / sale.order.
// NO contiene ninguna definición: todo sale de AI/recovery-extract/{models,fields,selections}.json.
// Si faltan o llevan __PLACEHOLDER_DUMP__ => BLOCKED. DRY-RUN por defecto.
//   RECOVERY_CONFIRM=atheron1-hotel-staging-20261009 node recovery/r1-models-fields.mjs --apply
// MECANISMO A VALIDAR en dry-run contra la versión real (R0 la registra): crear ir.model / ir.model.fields con
// state='manual' es la vía estándar de Odoo para modelos/campos "x_"; en Odoo.sh/Online con Studio puede exigir web_studio.
import { loadExtract, main, BlockedError, READ_CTX } from './recovery-lib.mjs';
import { connect, makeEnsure, findOne } from './connect.mjs';
import { txt, fieldOrder, selectionCommands, FIELD_OPTIONAL } from './pure.mjs';

main(async () => {
  const models = loadExtract('models.json');
  const fields = loadExtract('fields.json');
  const selections = loadExtract('selections.json');
  const { args, write, ex, log } = await connect('r1');
  const ensure = makeEnsure({ ex, write, args, log });

  // A) modelos (solo los x_hotel_*; planning.slot y sale.order ya existen en Odoo)
  for (const m of models) {
    if (!/^x_hotel_/.test(m.model)) throw new BlockedError(`models.json trae un modelo fuera de alcance: ${m.model}`);
    await ensure('ir.model', [['model', '=', m.model]], { model: m.model, name: txt(m.name), state: 'manual' }, m.model, { compareFields: ['model', 'name'] });
  }

  // B) campos: escalares -> many2one -> one2many -> many2many
  const modelIds = new Map();
  const modelId = async (model) => {
    if (!modelIds.has(model)) modelIds.set(model, await findOne(ex, 'ir.model', [['model', '=', model]]));
    return modelIds.get(model);
  };
  const declared = new Set(models.map((m) => m.model));
  for (const f of fieldOrder(fields)) {
    const label = `${f.model}.${f.name}`;
    const mid = await modelId(f.model);
    if (!mid) { log.add(write ? 'BLOQUEA' : 'FALTA', 'ir.model', f.model, { note: `modelo ausente para ${label}${declared.has(f.model) ? ' (se crea en el apply)' : ''}` }); continue; }
    if (f.relation && !declared.has(f.relation) && !(await modelId(f.relation))) {
      log.add('BLOQUEA', 'ir.model.fields', label, { note: `relación a ${f.relation} que no existe ni se crea` }); continue;
    }
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

  // C) verificación: cada campo declarado debe existir con el mismo ttype
  let ok = 0, bad = 0;
  if (write) for (const f of fields) {
    const r = await ex('ir.model.fields', 'search_read', [[['model', '=', f.model], ['name', '=', f.name]]], { fields: ['ttype'], limit: 1, context: READ_CTX });
    if (r[0]?.ttype === f.ttype) ok++; else bad++;
  }
  console.log(`VERIFY declarados=${fields.length} ok=${write ? ok : 'n/a (dry-run)'} mal=${write ? bad : 'n/a'}`);
  console.log(`Resumen: ${write ? 'APLICADO' : 'DRY-RUN'} | bitácora: ${log.flush()}`);
});
