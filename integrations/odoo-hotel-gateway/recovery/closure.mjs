// ATH-STAGING-RECOVERY-020 — DERIVACIÓN pura (sin red, sin Odoo) del cierre ATH-012/015 al contrato de AI/recovery-extract/.
// Fuente única: AI/recovery-extract/ath012_closure.json (volcado antiguo, solo lectura) + AI/staging-backup/ir-actions-server-hotel.json
// (SOLO para el modelo y el binding de las acciones directas, que el cierre no trae; se empareja por id antiguo Y nombre, y el id
// antiguo nunca llega al destino). Nada se inventa: si un dato no está, la clave se omite y la capa correspondiente se detiene.
// No importa recovery-lib (lo importa a él): así no hay ciclos.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { txt } from './pure.mjs';

export const CLOSURE_FILE = 'ath012_closure.json';
export const sha = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');

/** Componentes hoteleros internos que NO entran en el R4 núcleo, con motivo y dato exacto que falta. NO se ocultan: se informan. */
export const R4_DEFERRED = Object.freeze({
  'ATHERON - Noches desde fechas en vivo': 'ayudante de cantidad (x_noches) fuera de disponibilidad/HOLD/Casa↔habitaciones/liberación; su código usa ids de product.category escritos a mano (6,1247,1242,1296) y los artefactos no traen los nombres de esas categorías',
  'ATHERON - Noches desde fechas al guardar': 'ídem (misma dependencia de ids de product.category y de sale.order.line.x_noches, que no está definido en los artefactos)',
});

export const readClosure = (dir) => { const p = resolve(dir, CLOSURE_FILE); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

// ---------------------------------------------------------------- R1 / R2: modelos, campos, selecciones
/** Todas las definiciones de campo del cierre, con su procedencia. */
export function closureFieldDefs(c) {
  const out = [];
  for (const m of c.r1_models ?? []) for (const f of m.fields ?? []) out.push({ ...f, _src: 'r1_models' });
  for (const f of c.r1_dependencies?.guests_line?.fields ?? []) out.push({ ...f, _src: 'guests_line' });
  for (const f of c.r1_dependencies?.planning_slot_fields ?? []) out.push({ ...f, _src: 'planning_slot' });
  for (const f of c.r1_dependencies?.planning_role_fields ?? []) out.push({ ...f, _src: 'planning_role' });
  if (c.r1_dependencies?.account_payment_field) out.push({ ...c.r1_dependencies.account_payment_field, _src: 'account_payment' });
  for (const f of c.r2_fields ?? []) out.push({ ...f, _src: 'r2' });
  if (c.r2_additional_gap) out.push({ ...c.r2_additional_gap, _src: 'r2_gap' });
  return out;
}

/** Definición del cierre → fila del contrato fields.json (nombres reales de ir.model.fields). */
export const toFieldRow = (f) => ({
  model: f.model, name: f.technical_name, field_description: f.label, ttype: f.type, relation: f.relation ?? null, relation_field: f.relation_field ?? null,
  required: !!f.required, readonly: !!f.readonly, store: f.store !== false, copied: f.copied !== false, index: f.indexed ? 'btree' : null,
  translate: f.translate ?? null, size: f.size ?? null, compute: f.compute ?? null, depends: f.depends ?? null, related: f.related ?? null,
  domain: f.domain ?? null, on_delete: f.on_delete ?? null, relation_table: f.relation_table ?? null, column1: f.column1 ?? null, column2: f.column2 ?? null,
  currency_field: f.currency_field ?? null, state: 'manual',
});

export function deriveModels(c) {
  const rows = (c.r1_models ?? []).map((m) => ({ model: m.technical_model, name: m.label, state: m.state ?? 'manual', transient: !!m.transient }));
  const g = c.r1_dependencies?.guests_line;
  if (g) rows.push({ model: g.technical_model, name: g.label, state: g.state ?? 'manual', transient: false });
  return rows;
}
export const deriveFields = (c) => closureFieldDefs(c).map(toFieldRow);
export const deriveSelections = (c) => closureFieldDefs(c).flatMap((f) => (f.selection ?? []).map((s) => ({ field_model: f.model, field_name: f.technical_name, value: s.value, name: s.label, sequence: s.sequence ?? 0 })));

// ---------------------------------------------------------------- R4: acciones, automatizaciones, crons
/** Etiqueta del modelo (Studio) → modelo técnico. Se APRENDE de los propios datos: etiquetas de r1_models y acciones enlazadas a una automatización con modelo técnico conocido. */
export function modelLabelMap(c, backupActions = []) {
  const map = new Map(); const clash = [];
  const put = (label, model) => { if (!label || !model) return; if (map.has(label) && map.get(label) !== model) clash.push(label); else map.set(label, model); };
  for (const m of c.r1_models ?? []) put(m.label, m.technical_model);
  const byId = new Map(backupActions.map((a) => [a.id, a]));
  for (const e of c.hotel_internal_r4 ?? []) if (e.kind === 'automation') for (const id of e.action_ids_old ?? []) put(byId.get(id)?.model_id?.[1], e.model);
  return { map, clash };
}

const ruleByActionId = (c, id) => Object.values(c.rules ?? {}).find((r) => r.action_id_old === id);
const entryCode = (c, e) => e.action?.code ?? e.code ?? ruleByActionId(c, e.action?.action_id_old ?? e.action_id_old)?.code ?? null;

/** Una fila por acción de servidor. `id` es el id ANTIGUO: solo sirve para adaptar `browse(N)` entre acciones; no se escribe en el destino. */
export function deriveR4(c, backupActions = []) {
  const { map: labelMap, clash } = modelLabelMap(c, backupActions);
  const bk = new Map(backupActions.map((a) => [a.id, a]));
  const deferred = []; const actions = []; const autos = []; const crons = [];
  const isDeferred = (name) => Object.prototype.hasOwnProperty.call(R4_DEFERRED, name);
  const actionName = new Map();
  for (const e of c.hotel_internal_r4 ?? []) {
    if (e.kind === 'automation') {
      if (isDeferred(e.name)) { deferred.push({ name: e.name, reason: R4_DEFERRED[e.name] }); continue; }
      const id = e.action?.action_id_old ?? e.action_ids_old?.[0];
      const code = entryCode(c, e);
      actions.push({ id, name: e.action?.name ?? e.action_names?.[0], model: e.model, state: 'code', code, ...(code == null ? { _missing_code: true } : {}) });
      actionName.set(id, e.action?.name ?? e.action_names?.[0]);
      autos.push({ name: e.name, model: e.model, trigger: e.trigger, active: !!e.active_old, filter_domain: e.filter_domain ?? null, filter_pre_domain: e.filter_pre_domain ?? null,
        trigger_field_names: e.trigger_field_names ?? [], on_change_field_names: e.on_change_field_names ?? [], action_names: e.action_names ?? [] });
    } else if (e.kind === 'server_action_direct_or_hold') {
      const b = bk.get(e.action_id_old);
      const sameAction = b && b.name === e.name;                       // id antiguo Y nombre deben coincidir
      const model = sameAction ? labelMap.get(b.model_id?.[1]) : undefined;
      const bindingModel = sameAction && b.binding_model_id ? labelMap.get(b.binding_model_id[1]) : undefined;
      actions.push({ id: e.action_id_old, name: e.name, ...(model ? { model } : {}), state: 'code', code: e.code,
        ...(sameAction && b.binding_type ? { binding_type: b.binding_type } : {}), ...(bindingModel ? { binding_model: bindingModel } : {}) });
      actionName.set(e.action_id_old, e.name);
    }
  }
  for (const e of c.hotel_internal_r4 ?? []) if (e.kind === 'cron') {
    crons.push({ cron_name: e.name, action_name: actionName.get(e.action_id_old), interval_number: e.interval_number, interval_type: e.interval_type, active: !!e.active_old });
  }
  return { actions, autos, crons, deferred, labelClash: clash };
}

// ---------------------------------------------------------------- 167 / 168 / 169 / 189 y planning.role
export const deriveRulesOld = (c) => ['167', '168', '169'].map((k) => {
  const r = c.rules?.[k]; return r && { name: r.name, model: r.model, trigger: r.trigger, filter_domain: r.filter_domain ?? null, filter_pre_domain: r.filter_pre_domain ?? null, action_name: r.action_name, code: r.code };
}).filter(Boolean);

export const deriveRolesOld = (c) => (c.planning_roles ?? []).map((r) => ({
  name: r.role_name, x_casa: r.x_casa, x_is_a_room_offer: r.x_is_a_room_offer,
  active: r.other_relevant_fields?.active, sync_shift_rental: r.other_relevant_fields?.sync_shift_rental, resource_names: (r.other_relevant_fields?.resources ?? []).map((x) => x.name),
}));

/** Los cuatro casos de la 189 se detectan EN EL CÓDIGO ANTIGUO (no se afirman): un caso sin marcador no entra en `conditions`. */
export const CASES_189 = Object.freeze([
  { id: 'SOMBRA_DERIVADA', rx: /x_hotel_block_kind == 'derived'[\s\S]*?x_bloqueo_src_id[\s\S]*?BLOQUEO DERIVADO INV/, text: 'sombra derivada válida solo con x_bloqueo_src_id explícito y coherente con x_bloqueo_ref, de una unidad relacionada' },
  { id: 'HOLD_VISIBLE', rx: /x_hotel_block_kind == 'hold'[\s\S]*?SLOT HOLD INV/, text: 'slot HOLD vinculado a una reserva en HOLD de la misma unidad' },
  { id: 'RESERVA_VALIDADA', rx: /BLOCKING\s*=\s*\([^)]*\)[\s\S]*?x_reservation_status in BLOCKING/, text: 'reserva en estado bloqueante ya validada por el motor de inventario' },
  { id: 'OCUPACION_PRIMARIA', rx: /x_lock_touch[\s\S]*?NO DISPONIBLE \(Planning\)[\s\S]*?NO DISPONIBLE \(Planning\)/, text: 'ocupación primaria: serializa con x_lock_touch y rechaza solapes con Planning y con sale.order (horario y zona de la propiedad), semiabierto' },
]);
export function deriveRule189Intent(c) {
  const r = c.rules?.['189']; if (!r) return [];
  const conditions = CASES_189.filter((k) => k.rx.test(r.code)).map((k) => `${k.id}: ${k.text}`);
  return [{ intent: r.intent, conditions, source: `${CLOSURE_FILE}#rules.189 (action ${r.action_id_old}, sha256 ${r.code_sha256})` }];
}

// ---------------------------------------------------------------- adaptadores de las lecturas ACTUALES de Codex (forma de ATH-019 → contrato)
/** rules_current.json de ATH-019 `{rules:[{domain, pre_domain, code_or_configuration:{code}}]}` → contrato `[{filter_domain, filter_pre_domain, code, exists}]`. */
export function adaptRulesCurrent(rc) {
  if (Array.isArray(rc)) return rc;
  return (rc?.rules ?? []).map((r) => ({ name: r.name, model: r.model, exists: true, active: r.active, trigger: r.trigger,
    filter_domain: r.domain ?? false, filter_pre_domain: r.pre_domain ?? false,
    ...(r.code_or_configuration?.action_type === 'execute_code' || typeof r.code_or_configuration?.code === 'string' ? { code: r.code_or_configuration.code } : {}),
    action_names: [r.name] }));
}
/** planning_roles_current.json de ATH-019 `{roles:[…]}` → contrato `{fields:{…}, roles:[…]}`. `fields` es true solo si TODOS los roles exportados traen la clave. */
export function adaptRolesCurrent(rc) {
  if (rc?.fields && rc?.roles) return rc;
  const roles = (rc?.roles ?? []).map((r) => ({ id: r.id, name: r.name, x_casa: r.x_casa, x_is_a_room_offer: r.x_is_a_room_offer, structure: r.relevant_structural_fields ?? {} }));
  const has = (k) => roles.length > 0 && roles.every((r) => k in r && r[k] !== undefined);
  return { fields: { x_casa: has('x_casa'), x_is_a_room_offer: has('x_is_a_room_offer') }, roles };
}

// ---------------------------------------------------------------- fallback de loadExtract
export const DERIVABLE = Object.freeze(['models.json', 'fields.json', 'selections.json', 'server_actions.json', 'automations.json', 'crons.json', 'rules_old.json', 'planning_roles.json', 'rule189_intent.json']);

/** Devuelve el arreglo del contrato derivado del cierre, o null si el archivo no es derivable / no hay cierre. */
export function deriveExtractFile(file, dir, { backupDir } = {}) {
  if (!DERIVABLE.includes(file)) return null;
  const c = readClosure(dir); if (!c) return null;
  const bkFile = backupDir && resolve(backupDir, 'ir-actions-server-hotel.json');
  const bk = bkFile && existsSync(bkFile) ? JSON.parse(readFileSync(bkFile, 'utf8')) : [];
  switch (file) {
    case 'models.json': return deriveModels(c);
    case 'fields.json': return deriveFields(c);
    case 'selections.json': return deriveSelections(c);
    case 'server_actions.json': return deriveR4(c, bk).actions;
    case 'automations.json': return deriveR4(c, bk).autos;
    case 'crons.json': return deriveR4(c, bk).crons;
    case 'rules_old.json': return deriveRulesOld(c);
    case 'planning_roles.json': return deriveRolesOld(c);
    case 'rule189_intent.json': return deriveRule189Intent(c);
    default: return null;
  }
}
export { txt };
