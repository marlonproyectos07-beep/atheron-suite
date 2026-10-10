// ATH-STAGING-RECOVERY-016 — COMPARADOR de las reglas protegidas 167, 168 y 169 (propagación Casa Completa ↔ habitaciones).
// Principio: estas reglas YA EXISTEN en el staging nuevo. Nunca se sobrescriben a ciegas. Antes de que R4 toque nada, se lee la
// versión ACTUAL real (disparador, domain, pre-domain, código) y se compara con la antigua del dump. Si no se puede comparar,
// se ABORTA antes de modificar. Se empareja por (nombre, modelo), jamás por id.
import { READ_CTX, sha256 } from './recovery-lib.mjs';
import { txt } from './pure.mjs';

/** Reglas protegidas. `expected_trigger` y `name` salen de AI/staging-backup/base-automation.json; `intent` de los scripts ATH-DISP-001. */
export const PROTECTED_RULES = Object.freeze([
  { key: '167', name: 'ATHERON - Casa Completa bloquea Habitaciones', model: 'planning.slot', expected_trigger: 'on_create_or_write',
    intent: 'Un bloque en Casa Completa genera bloques derivados (x_hotel_block_kind=derived, x_bloqueo_src_id) en las habitaciones LIBRES para el mismo tramo; no actúa si el bloque trae x_bloqueo_ref; localiza las habitaciones por planning.role (x_casa, x_is_a_room_offer).' },
  { key: '168', name: 'ATHERON - Limpiar bloques al borrar reserva (casa/hab)', model: 'planning.slot', expected_trigger: 'on_unlink',
    intent: 'Al borrar el bloque origen, eliminar los bloques derivados que dependen de él (x_bloqueo_src_id).' },
  { key: '169', name: 'ATHERON - Habitacion bloquea Casa Completa', model: 'planning.slot', expected_trigger: 'on_create_or_write',
    intent: 'Un bloque NO derivado en una habitación genera un bloque derivado en Casa Completa; no bloquea a las demás habitaciones.' },
]);

export const VERDICTS = Object.freeze(['REUSE_AS_IS', 'REUSE_WITH_ADAPTATION', 'REPLACE_REQUIRED', 'ABORT']);
const RANK = { REUSE_AS_IS: 0, REUSE_WITH_ADAPTATION: 1, REPLACE_REQUIRED: 2, ABORT: 3 };

// ---------- canonicalización ----------
/** Código Python sin comentarios, sin líneas vacías ni espacios finales; conserva la sangría (es significativa). */
export const canonCode = (c) => String(c ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '' && !l.trim().startsWith('#')).join('\n');
/** Domain/pre-domain: sin espacios, comillas simples, sin comas finales. `false`/null/'' son lo mismo (sin domain). */
export const canonDomain = (d) => { if (d === false || d == null) return ''; const t = String(d).replace(/\s+/g, '').replace(/"/g, "'").replace(/,([\]\)])/g, '$1'); return t === '[]' ? '' : t; };   // «[]» = sin domain (ATH-020: la lectura de Odoo 19 muestra «[]» donde el dump guarda null)
/** Esqueleto tolerante a adaptación: los ids numéricos duros y las referencias entre acciones (browse(N) / search(name…).ensure_one()) quedan neutros. */
export const skeleton = (c) => canonCode(c)
  .replace(/env\[(['"])ir\.actions\.server\1\](?:\.sudo\(\))?\.browse\(\s*\d+\s*\)/g, 'ACTREF')
  .replace(/env\[(['"])ir\.actions\.server\1\](?:\.sudo\(\))?\.search\(\[\('name'[^\n]*?\],\s*limit=1\)(?:\.ensure_one\(\))?/g, 'ACTREF')
  // solo ids (>=4 dígitos) FUERA de cadenas: un 16 o un 20 (horas, contadores) cambia el comportamiento y debe contar como diferencia
  .replace(/('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(?<![\w.])\d{4,}(?![\w.])/g, (m, str) => str ?? 'N');

/**
 * ATH-020 — ¿la ÚNICA diferencia de código es que `old` agrega claves x_* a un diccionario (p. ej. create({... 'x_bloqueo_src_id': …}))?
 * Se quitan de `old` solo esas claves y se exige igualdad exacta (canónica) con `current`. Devuelve {keys} o null. Conservador: ante cualquier otra diferencia, null.
 */
export function payloadExtension(oldCode, curCode) {
  const keysOf = (c) => new Set([...String(c).matchAll(/'(x_[a-z0-9_]+)'\s*:/g)].map((m) => m[1]));
  const have = keysOf(curCode); const extra = [...keysOf(oldCode)].filter((k) => !have.has(k));
  if (!extra.length) return null;
  let stripped = canonCode(oldCode);
  for (const k of extra) stripped = stripped.replace(new RegExp(`,\\s*'${k}'\\s*:\\s*[^,}]+(?=\\s*[,}])`, 'g'), '');
  return canonCode(stripped) === canonCode(curCode) ? { keys: extra.sort() } : null;
}

const hasContent = (r) => r && typeof r === 'object';
const missingAttrs = (r) => ['trigger', 'filter_domain', 'filter_pre_domain', 'code'].filter((k) => r[k] === undefined);

/**
 * Compara UNA regla. `old` = dump antiguo; `current` = estado real del destino.
 *   ABORT                 no hay forma de comparar (falta lo antiguo, falta lo actual o le faltan atributos): NO se muta nada.
 *   REPLACE_REQUIRED      el destino no la tiene, o difiere en disparador/domain/pre-domain/estructura del código.
 *   REUSE_WITH_ADAPTATION solo difieren enteros / referencias a otras acciones / comentarios: el destino ya está adaptado.
 *   REUSE_AS_IS           idéntica (salvo comentarios y espacios).
 */
export function compareRule(old, current) {
  const reasons = [];
  if (!hasContent(old)) return { verdict: 'ABORT', reasons: ['falta la definición ANTIGUA (dump) de la regla'] };
  const oldMiss = missingAttrs(old);
  if (oldMiss.length) return { verdict: 'ABORT', reasons: [`la definición antigua no trae: ${oldMiss.join(', ')}`] };
  if (!hasContent(current)) return { verdict: 'ABORT', reasons: ['falta la lectura ACTUAL del destino; no se puede comparar'] };
  if (current.exists === false) return { verdict: 'REPLACE_REQUIRED', reasons: ['ABSENT: la regla no existe en el destino (no hay versión adaptada que instalar)'] };
  const curMiss = missingAttrs(current);
  if (curMiss.length) return { verdict: 'ABORT', reasons: [`la lectura actual no trae: ${curMiss.join(', ')} (¿código/domain sin leer?)`] };

  if (old.trigger !== current.trigger) reasons.push(`disparador: antiguo «${old.trigger}» ≠ actual «${current.trigger}»`);
  if (canonDomain(old.filter_domain) !== canonDomain(current.filter_domain)) reasons.push('filter_domain distinto');
  if (canonDomain(old.filter_pre_domain) !== canonDomain(current.filter_pre_domain)) reasons.push('filter_pre_domain distinto');
  const exact = canonCode(old.code) === canonCode(current.code);
  let ext = null;
  if (!exact && skeleton(old.code) !== skeleton(current.code)) {
    ext = payloadExtension(old.code, current.code);
    if (!ext) reasons.push('el código difiere en su estructura (no solo ids o referencias)');
  }
  if (reasons.length) return { verdict: 'REPLACE_REQUIRED', reasons };
  if (ext) return { verdict: 'REUSE_WITH_ADAPTATION', write_required: true, reasons: [`el destino conserva trigger, domain y estructura; al payload de create() le faltan las claves ${ext.keys.join(', ')} que sí tiene el dump`],
    adaptation: { kind: 'PAYLOAD_EXTENSION', keys: ext.keys, target_code: old.code, target_sha256: sha256(old.code) } };
  return exact ? { verdict: 'REUSE_AS_IS', write_required: false, reasons: [] } : { verdict: 'REUSE_WITH_ADAPTATION', write_required: false, reasons: ['solo difieren enteros, referencias a acciones o comentarios'] };
}

/**
 * Compara las tres reglas protegidas. `mayMutate` es true SOLO si las tres se reutilizan. Con un ABORT, R4 no escribe nada.
 * El emparejamiento es por (nombre, modelo).
 */
export function compareAll(oldRows, currentRows) {
  const find = (rows, p) => (rows ?? []).filter((r) => txt(r.name) === p.name && (r.model === undefined || r.model === p.model));
  const results = PROTECTED_RULES.map((p) => {
    const o = find(oldRows, p), c = find(currentRows, p);
    if (o.length > 1 || c.length > 1) return { key: p.key, name: p.name, verdict: 'ABORT', reasons: [`ambigua: ${o.length} antigua(s) y ${c.length} actual(es) con ese nombre`] };
    return { key: p.key, name: p.name, intent: p.intent, ...compareRule(o[0], c[0]) };
  });
  const worst = results.reduce((a, r) => (RANK[r.verdict] > RANK[a] ? r.verdict : a), 'REUSE_AS_IS');
  return { results, overall: worst, mayMutate: RANK[worst] <= RANK.REUSE_WITH_ADAPTATION, mustAbort: worst === 'ABORT', writeRequired: results.filter((r) => r.write_required).map((r) => r.key) };
}

/**
 * Lectura REAL (solo lectura) de las reglas protegidas en el destino. No usa ids: busca por nombre y resuelve el modelo y el código
 * de la(s) acción(es) enlazada(s). Si una regla tiene varias acciones, el código se concatena en el orden de enlace.
 */
export async function readCurrentRules(ex) {
  const out = [];
  for (const p of PROTECTED_RULES) {
    const rows = await ex('base.automation', 'search_read', [[['name', '=', p.name]]], { fields: ['name', 'model_id', 'trigger', 'active', 'filter_domain', 'filter_pre_domain', 'action_server_ids'], limit: 3, context: READ_CTX });
    if (rows.length === 0) { out.push({ name: p.name, model: p.model, exists: false }); continue; }
    if (rows.length > 1) { out.push({ name: p.name, model: p.model, exists: true, ambiguous: true }); out.push({ name: p.name, model: p.model, exists: true, ambiguous: true }); continue; }
    const r = rows[0];
    const [m] = await ex('ir.model', 'read', [[Array.isArray(r.model_id) ? r.model_id[0] : r.model_id], ['model']], { context: READ_CTX });
    const acts = r.action_server_ids?.length ? await ex('ir.actions.server', 'read', [r.action_server_ids, ['name', 'code']], { context: READ_CTX }) : [];
    out.push({ name: p.name, model: m?.model, exists: true, active: r.active, trigger: r.trigger, filter_domain: r.filter_domain ?? false, filter_pre_domain: r.filter_pre_domain ?? false, ...(acts.length > 0 && acts.every((a) => typeof a.code === 'string' && a.code.trim() !== '') ? { code: acts.map((a) => a.code).join('\n') } : {}), action_names: acts.map((a) => a.name), action_ids: acts.map((a) => a.id) });
  }
  return out;
}
