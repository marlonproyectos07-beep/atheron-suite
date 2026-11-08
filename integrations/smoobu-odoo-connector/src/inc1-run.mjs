import { ConnectorError } from './errors.mjs';
import { OdooJson2Client } from './odoo-json2-client.mjs';
import { assertAllowedWrite, assertApplyAllowed, assertIncrement1Target, checkTestEnvironment } from './inc1-guard.mjs';
import { computePlan, fieldVals, modelVals, summarize } from './inc1-plan.mjs';
import { INC1_EXISTING_MODELS, INC1_FIELDS, INC1_NEW_MODELS } from './inc1-spec.mjs';

/** Cliente con escritura acotada: solo create en ir.model / ir.model.fields y solo lo declarado. */
export class Inc1WriteClient extends OdooJson2Client {
  async create(model, vals) {
    assertAllowedWrite(model, 'create', vals);
    return this._request(model, 'create', { vals_list: [vals] });
  }
}

async function readState(reader) {
  const names = [...new Set([...INC1_EXISTING_MODELS, ...INC1_NEW_MODELS.map((m) => m.model)])];
  const models = await reader.searchRead('ir.model', [['model', 'in', names]], ['id', 'model']);
  const fieldNames = INC1_FIELDS.map(([, n]) => n);
  const fields = await reader.searchRead('ir.model.fields', [['name', 'in', fieldNames], ['model', 'in', names]], ['model', 'name']);
  return {
    modelIds: new Map(models.map((m) => [m.model, m.id])),
    existingModels: new Set(models.map((m) => m.model)),
    existingFields: new Set(fields.map((f) => `${f.model}.${f.name}`)),
  };
}

/**
 * Por defecto SIMULA (solo lecturas). Con apply=true escribe, y solo si el destino es una copia de
 * pruebas aislada. Devuelve un resumen sin datos personales ni secretos.
 */
export async function runIncrement1({ env = process.env, apply = false, fetchImpl, log = () => {} } = {}) {
  const target = assertIncrement1Target(env);
  if (apply) assertApplyAllowed(env);
  const client = new Inc1WriteClient({ ...target, fetchImpl });
  const iso = await checkTestEnvironment(client);
  log({ event: 'isolation', isolated: iso.isolated, checks: iso.checks.map(({ id, group, ok }) => ({ id, group, ok })) });
  if (!iso.isolated) throw new ConnectorError('INC1_ENVIRONMENT_NOT_ISOLATED');
  const state = await readState(client);
  const plan = computePlan(state);
  const summary = summarize(plan, { mode: apply ? 'apply' : 'dry-run', database: target.database });
  summary.isolation = iso;
  if (!apply) return summary;
  if (plan.blocked.length) throw new ConnectorError('INC1_PLAN_BLOCKED');
  const created = { models: [], fields: [] };
  const ids = new Map(state.modelIds);
  for (const m of plan.modelsToCreate) {
    const [id] = await client.create('ir.model', modelVals(m));
    ids.set(m.model, id); created.models.push(m.model); log({ event: 'created_model', model: m.model });
  }
  for (const spec of plan.fieldsToCreate) {
    const [model, name] = spec;
    await client.create('ir.model.fields', fieldVals(spec, ids.get(model)));
    created.fields.push(`${model}.${name}`); log({ event: 'created_field', field: `${model}.${name}` });
  }
  summary.created = created;
  return summary;
}
