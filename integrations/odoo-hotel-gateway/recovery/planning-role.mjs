// ATH-STAGING-RECOVERY-016 — MAPEO de planning.role (x_casa, x_is_a_room_offer). Mecanismo idempotente de lookup/comparación OLD vs NEW.
// La regla 167 localiza las habitaciones de La Magia con planning.role.x_casa = 'La Magia de Zipaquirá' y x_is_a_room_offer = True
// (scripts ATH-DISP-001). NINGÚN valor se inventa: los valores ANTIGUOS salen del dump (AI/recovery-extract/planning_roles.json) y los
// ACTUALES se leen del destino. El emparejamiento es por NOMBRE EXACTO del rol, jamás por id.
import { READ_CTX } from './recovery-lib.mjs';

/** Campos de planning.role que la recuperación gobierna. x_hotel_unit_ids es estructural (relación con las unidades) y se trata aparte. */
export const ROLE_FIELDS = Object.freeze(['x_casa', 'x_is_a_room_offer']);
export const ROLE_STATUS = Object.freeze({
  MATCH: 'valores iguales: no se escribe nada',
  FIELD_MISSING: 'el campo no existe en el destino: R1 debe crearlo (fields.json de planning.role) antes de poder escribir valores',
  ROLE_ABSENT: 'el rol no existe en el destino: prerrequisito externo (G8); esta capa no crea roles',
  VALUES_MISSING: 'el campo existe y el rol no tiene valor, pero el dump sí: se escribe el valor antiguo (idempotente, queda en la bitácora)',
  VALUES_DIFFER: 'el destino ya tiene un valor DISTINTO: CONFLICTO; no se sobrescribe sin --force-diff y sin decisión humana',
  AMBIGUO: 'hay más de un rol con ese nombre en el destino: no se escribe',
});

const isEmpty = (v) => v === false || v === null || v === undefined || v === '';
const same = (a, b) => (isEmpty(a) && isEmpty(b)) || a === b;

/**
 * Plan puro. old = [{name, x_casa, x_is_a_room_offer}] (dump); current = {fields: {x_casa:true|false, …}, roles: [{id,name,x_casa,…}]}.
 * Devuelve un item por (rol antiguo): status, y para VALUES_MISSING/VALUES_DIFFER los campos afectados.
 */
export function planRoleMapping(oldRoles, current) {
  const items = [];
  for (const o of oldRoles ?? []) {
    const matches = (current?.roles ?? []).filter((r) => r.name === o.name);
    if (matches.length > 1) { items.push({ name: o.name, status: 'AMBIGUO', fields: [] }); continue; }
    const wantFields = ROLE_FIELDS.filter((f) => !isEmpty(o[f]));
    const missingFields = wantFields.filter((f) => !current?.fields?.[f]);
    if (missingFields.length) { items.push({ name: o.name, status: 'FIELD_MISSING', fields: missingFields }); continue; }
    if (matches.length === 0) { items.push({ name: o.name, status: 'ROLE_ABSENT', fields: [] }); continue; }
    const r = matches[0];
    const diff = wantFields.filter((f) => !same(o[f], r[f]));
    const conflict = diff.filter((f) => !isEmpty(r[f]));
    const fill = diff.filter((f) => isEmpty(r[f]));
    if (conflict.length) items.push({ name: o.name, status: 'VALUES_DIFFER', fields: conflict, fill, id: r.id, old: Object.fromEntries(conflict.map((f) => [f, o[f]])), current: Object.fromEntries(conflict.map((f) => [f, r[f]])) });
    else if (fill.length) items.push({ name: o.name, status: 'VALUES_MISSING', fields: fill, id: r.id, set: Object.fromEntries(fill.map((f) => [f, o[f]])) });
    else items.push({ name: o.name, status: 'MATCH', fields: [], id: r.id });
  }
  const bad = items.filter((i) => !['MATCH', 'VALUES_MISSING'].includes(i.status));
  return { items, closed: bad.length === 0, pending: bad.length === 0 ? [] : bad.map((i) => `${i.name}: ${i.status}`) };
}

/** Lectura REAL, solo lectura, del destino: qué campos tiene planning.role y los valores de los roles pedidos (por nombre). */
export async function readCurrentRoles(ex, names) {
  const fg = await ex('planning.role', 'fields_get', [], { attributes: ['type'] });
  const fields = Object.fromEntries(ROLE_FIELDS.map((f) => [f, f in fg]));
  const read = ['name', ...ROLE_FIELDS.filter((f) => fields[f])];
  const roles = names.length ? await ex('planning.role', 'search_read', [[['name', 'in', names]]], { fields: read, context: READ_CTX }) : [];
  return { fields, roles };
}

/**
 * Consulta de solo lectura que Codex debe correr en el destino (se entrega en AI/ATH-STAGING-RECOVERY-016_READONLY_REQUEST.md).
 * Solo estructura y valores de configuración de roles; nada de huéspedes, partners, pagos ni OTA.
 */
export const READONLY_ROLE_QUERY = Object.freeze({
  fields_get: { model: 'planning.role', attributes: ['type', 'relation', 'required', 'selection', 'string'], only: [...ROLE_FIELDS, 'x_hotel_unit_ids'] },
  search_read: { model: 'planning.role', domain: [], fields: ['name', ...ROLE_FIELDS, 'x_hotel_unit_ids', 'resource_ids'], context: { active_test: false } },
});
