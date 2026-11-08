import { INC1_FIELDS, INC1_NEW_MODELS } from './inc1-spec.mjs';

/**
 * Funcion pura: de lo que existe en la base (modelos y campos leidos) obtiene lo que FALTA.
 * existingModels: Set<string> con ir.model.model; existingFields: Set<"modelo.campo">.
 * Idempotente: una segunda pasada tras aplicar devuelve plan vacio. Nunca propone borrar ni modificar.
 */
export function computePlan({ existingModels, existingFields }) {
  const modelsToCreate = INC1_NEW_MODELS.filter((m) => !existingModels.has(m.model));
  const newModelNames = new Set(INC1_NEW_MODELS.map((m) => m.model));
  const blocked = [];
  const fieldsToCreate = [];
  for (const spec of INC1_FIELDS) {
    const [model, name, , , extra] = spec;
    const modelWillExist = existingModels.has(model) || (newModelNames.has(model) && modelsToCreate.some((m) => m.model === model));
    if (!modelWillExist) { blocked.push({ model, name, reason: 'MODEL_MISSING' }); continue; }
    if (extra.relation && !existingModels.has(extra.relation) && !newModelNames.has(extra.relation)) { blocked.push({ model, name, reason: 'RELATION_MISSING' }); continue; }
    if (existingFields.has(`${model}.${name}`)) continue;
    fieldsToCreate.push(spec);
  }
  return { modelsToCreate, fieldsToCreate, blocked };
}

/** Valores para ir.model.fields.create (el id del modelo lo resuelve el llamador). */
export function fieldVals(spec, modelId) {
  const [model, name, ttype, label, extra] = spec;
  const vals = { model_id: modelId, model, name, ttype, field_description: label, state: 'manual' };
  if (extra.required) vals.required = true;
  if (extra.relation) vals.relation = extra.relation;
  if (extra.relation_table) { vals.relation_table = extra.relation_table; vals.column1 = extra.column1; vals.column2 = extra.column2; }
  if (extra.selection) vals.selection_ids = extra.selection.map((s) => [0, 0, s]);
  return vals;
}

export function modelVals(m) { return { name: m.name, model: m.model, state: 'manual' }; }

/** Bitacora SIN datos personales ni secretos: solo nombres tecnicos y conteos. */
export function summarize(plan, { mode, database }) {
  return {
    mode, database,
    models_to_create: plan.modelsToCreate.map((m) => m.model),
    fields_to_create: plan.fieldsToCreate.map(([m, n, t]) => `${m}.${n}:${t}`),
    blocked: plan.blocked,
    counts: { models: plan.modelsToCreate.length, fields: plan.fieldsToCreate.length, blocked: plan.blocked.length },
  };
}
