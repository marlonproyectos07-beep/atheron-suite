// ATH-STAGING-RECOVERY-016 — COMPUERTA DE LÓGICA HOTELERA (reemplazo funcional de la guardia 189, parte comprobable sin más datos).
// Antes de MUTAR lógica hotelera (R4: reglas, disponibilidad, HOLD, liberación) se exige, además de la guardia de entorno (precheck):
//   • los modelos hoteleros base existen; • los campos de planning.slot y planning.role de los que dependen 167/168/169 existen;
//   • las 5 habitaciones y la Casa Completa de La Magia existen y la Casa tiene sus 5 hijas.
// Nada depende de ids. Si falta algo, la capa se detiene ANTES de escribir.
// IMPORTANTE: esto NO decide qué hacía exactamente la 189. Para declarar un reemplazo «equivalente» hace falta la INTENCIÓN real que
// Codex extrajo (AI/recovery-extract/rule189_intent.json). Sin ese archivo, replacement.ready = false.
import { READ_CTX, tryExtract, EXTRACT_DIR } from './recovery-lib.mjs';

export const HOTEL_MODELS = Object.freeze(['x_hotel_property', 'x_hotel_unit', 'x_hotel_deposit_policy', 'x_hotel_rate', 'x_hotel_quote']);
export const SLOT_FIELDS = Object.freeze(['x_hotel_block_kind', 'x_bloqueo_ref', 'x_bloqueo_src_id']);
export const ROLE_FIELDS_REQUIRED = Object.freeze(['x_casa', 'x_is_a_room_offer']);
export const ROOMS = Object.freeze(['201', '202', '203', '301', '302']);

export async function hotelLogicGate(ex) {
  const checks = []; const add = (id, name, ok, detail = '') => checks.push({ id, name, ok: !!ok, detail });
  const have = new Set((await ex('ir.model', 'search_read', [[['model', 'in', [...HOTEL_MODELS]]]], { fields: ['model'], context: READ_CTX })).map((m) => m.model));
  for (const m of HOTEL_MODELS) add(`H1:${m}`, `modelo ${m}`, have.has(m));
  const fieldsOf = async (model, names) => new Set((await ex('ir.model.fields', 'search_read', [[['model', '=', model], ['name', 'in', [...names]]]], { fields: ['name'], context: READ_CTX })).map((f) => f.name));
  const slot = await fieldsOf('planning.slot', SLOT_FIELDS); for (const f of SLOT_FIELDS) add(`H2:${f}`, `planning.slot.${f}`, slot.has(f));
  const role = await fieldsOf('planning.role', ROLE_FIELDS_REQUIRED); for (const f of ROLE_FIELDS_REQUIRED) add(`H3:${f}`, `planning.role.${f}`, role.has(f));
  if (have.has('x_hotel_unit')) {
    const units = await ex('x_hotel_unit', 'search_read', [[['x_name', 'in', [...ROOMS, 'CASA COMPLETA']]]], { fields: ['x_name', 'x_unit_type', 'x_child_ids'], context: READ_CTX });
    for (const r of ROOMS) add(`H4:${r}`, `habitación ${r}`, units.filter((u) => u.x_name === r).length === 1);
    const casa = units.filter((u) => u.x_name === 'CASA COMPLETA' && u.x_unit_type === 'compuesta');
    add('H4:casa', 'Casa Completa (compuesta) única con sus 5 hijas', casa.length === 1 && (casa[0].x_child_ids ?? []).length === 5);
  } else add('H4', 'unidades hoteleras', false, 'falta x_hotel_unit');
  return { ok: checks.every((c) => c.ok), failed: checks.filter((c) => !c.ok), checks };
}

/**
 * ¿Hay evidencia suficiente para declarar un reemplazo funcional de la 189? Exige el archivo de intención que extrae Codex, con la
 * forma mínima {intent, conditions[], source}. Sin él, o incompleto, ready = false y se dice qué falta. No se inventa.
 */
export function replacement189Status(extractDir = EXTRACT_DIR) {
  const rows = tryExtract('rule189_intent.json', extractDir);
  if (rows === null) return { ready: false, missing: ['AI/recovery-extract/rule189_intent.json (intención real de la 189 según el cotejo de Codex)'] };
  const r = rows[0];
  const miss = ['intent', 'conditions', 'source'].filter((k) => !r || r[k] === undefined || (Array.isArray(r[k]) && r[k].length === 0));
  return miss.length ? { ready: false, missing: miss.map((k) => `rule189_intent.json: falta «${k}»`) } : { ready: true, missing: [], intent: r.intent, conditions: r.conditions };
}
