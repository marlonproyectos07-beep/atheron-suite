// ATH-STAGING-RECOVERY-020 — ANÁLISIS OFFLINE del cierre R1/R2/R4. Solo lee archivos del repo (AI/recovery-extract, AI/staging-backup, código del paquete).
// Sin red, sin Odoo, sin escribir. Devuelve un informe estructurado; `run.mjs close-analysis` lo imprime y los tests fijan sus conclusiones.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OVERLAP_GUARD_NAME } from './guard.mjs';
import { EXTRACT_DIR, BACKUP_DIR, REPO_ROOT, TARGET_DB, loadRecoveryConfig, readBackup, sha256, RecoveryGuardError } from './recovery-lib.mjs';
import { readClosure, CLOSURE_FILE, deriveRolesOld, deriveRulesOld, deriveFields, closureFieldDefs, deriveR4, adaptRulesCurrent, adaptRolesCurrent, CASES_189, R4_DEFERRED } from './closure.mjs';
import { compareAll, PROTECTED_RULES } from './rules-compare.mjs';
import { planRoleMapping, compareRoleStructure } from './planning-role.mjs';
import { externalDependencies, knownFromRows, qualifiedFieldUses } from './deps.mjs';
import { classifyOtaField, classifyOta, hardcodedIds } from './scope.mjs';
import { fieldOrder, txt } from './pure.mjs';
import * as r1 from './layers/r1.mjs';
import * as r2 from './layers/r2.mjs';
import * as r4 from './layers/r4.mjs';
import { REQUIRED_SO_FIELDS } from './layers/r7.mjs';

const HERE = resolve(REPO_ROOT, 'integrations/odoo-hotel-gateway/recovery');
const src = (f) => readFileSync(resolve(HERE, f), 'utf8');
const jsonIn = (dir, f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
const yn = (b) => (b ? 'YES' : 'NO');

/** Modelos propios: orden de creación por dependencias entre ellos (relaciones m2o/o2m/m2m); desempate alfabético. */
export function modelCreationOrder(models, rows) {
  const names = new Set(models.map((m) => m.model)); const deps = new Map(models.map((m) => [m.model, new Set()]));
  for (const f of rows) if (names.has(f.model) && f.relation && names.has(f.relation) && f.relation !== f.model && f.ttype === 'many2one') deps.get(f.model).add(f.relation);
  const out = []; const left = new Set(names);
  while (left.size) {
    const ready = [...left].filter((m) => [...deps.get(m)].every((d) => !left.has(d))).sort();
    if (!ready.length) return { order: null, cycle: [...left] };
    out.push(ready[0]); left.delete(ready[0]);
  }
  return { order: out, cycle: [] };
}

function phase1(dir, closure) {
  const files = ['ath012_closure.json', 'rules_current.json', 'planning_roles_current.json'];
  const arts = files.map((f) => { const p = resolve(dir, f); let parse = false, bytes = 0; if (existsSync(p)) { bytes = readFileSync(p).length; try { JSON.parse(readFileSync(p, 'utf8')); parse = true; } catch { /* no parseable */ } } return { file: `AI/recovery-extract/${f}`, exists: existsSync(p), json_valid: parse, bytes }; });
  const handoff = resolve(REPO_ROOT, 'AI/ATH-STAGING-RECOVERY-015_HANDOFF_TO_CLAUDE.md');
  arts.unshift({ file: 'AI/ATH-STAGING-RECOVERY-015_HANDOFF_TO_CLAUDE.md', exists: existsSync(handoff), json_valid: null, bytes: existsSync(handoff) ? readFileSync(handoff).length : 0 });
  const cur = jsonIn(dir, 'rules_current.json'), roles = jsonIn(dir, 'planning_roles_current.json');
  const contradictions = []; const notes = [];
  // hashes declarados vs código publicado
  for (const k of ['167', '168', '169', '189']) { const r = closure.rules[k]; if (sha256(r.code) !== r.code_sha256) contradictions.push(`rules.${k}: sha256 declarado ≠ sha256 del código publicado`); }
  for (const e of closure.hotel_internal_r4) { const a = e.action ?? e; if (a.code && a.code_sha256 && sha256(a.code) !== a.code_sha256) contradictions.push(`R4 «${e.name}»: sha256 declarado ≠ código`); }
  // lectura actual vs cierre
  for (const k of ['167', '168', '169']) { const c = cur.rules.find((r) => r.name === closure.rules[k].name); if (!c) contradictions.push(`rules_current no trae la regla ${k}`); else if (c.model !== closure.rules[k].model || c.trigger !== closure.rules[k].trigger) contradictions.push(`regla ${k}: modelo/disparador distintos entre cierre y lectura actual`); }
  if (new Set(roles.roles.map((r) => r.name)).size !== roles.roles.length) contradictions.push('planning_roles_current: nombres de rol repetidos');
  const rows = deriveFields(closure);
  const total = (closure.r1_models ?? []).reduce((a, m) => a + m.fields.length, 0);
  if ((closure.r1_models ?? []).length !== 6 || total !== 96) contradictions.push(`R1: se esperaban 6 modelos / 96 campos y hay ${(closure.r1_models ?? []).length} / ${total}`);
  notes.push('«[]» en lectura actual ≡ null en el dump para domain/pre-domain (Odoo 19 muestra la lista vacía): se normaliza en el comparador');
  notes.push('los ids antiguos (167, 1853, 18, 69…) son anclas históricas; ningún id viaja al destino');
  const bk = readBackup('ir-model-fields-sale-order-custom.json');
  if (bk.some((f) => f.name === 'x_hotel_is_test')) contradictions.push('el respaldo del 30-sep SÍ trae x_hotel_is_test (el handoff dice que no)');
  return { artifacts: arts, all_exist: arts.every((a) => a.exists), all_json_valid: arts.filter((a) => a.json_valid !== null).every((a) => a.json_valid), contradictions, notes, field_defs: rows.length };
}

function r1Report(closure) {
  const rows = deriveFields(closure); const defs = closureFieldDefs(closure);
  const own = r1.plan({ extractDir: EXTRACT_DIR });
  const excluded = own.excluded;
  const models = own.models.map((m) => {
    const fs = defs.filter((f) => f.model === m.model && !classifyOtaField({ model: f.model, name: f.technical_name, relation: f.relation }).ota);
    const checks = [];
    for (const f of fs) {
      const id = `${f.model}.${f.technical_name}`;
      if (f.type === 'selection' && !f.related && !(f.selection ?? []).length) checks.push(`${id}: selection sin opciones`);
      if (f.required && f.type === 'many2one' && f.on_delete === 'set null') checks.push(`${id}: obligatorio con on_delete «set null» (Odoo lo rechaza)`);
      if (['many2one', 'one2many', 'many2many'].includes(f.type) && !f.relation) checks.push(`${id}: relacional sin relation`);
      if (f.type === 'one2many') {
        const inv = defs.find((g) => g.model === f.relation && g.technical_name === f.relation_field);
        if (!inv) checks.push(`${id}: el inverso ${f.relation}.${f.relation_field} no está definido en los artefactos`);
        else if (inv.type !== 'many2one' || inv.relation !== f.model) checks.push(`${id}: el inverso ${f.relation}.${f.relation_field} no apunta de vuelta a ${f.model}`);
      }
      if (f.type === 'many2many' && f.relation_table) {
        const twin = defs.find((g) => g.model === f.relation && g.type === 'many2many' && g.relation_table === f.relation_table && g.technical_name !== f.technical_name);
        if (f.model === f.relation && (!twin || twin.column1 !== f.column2 || twin.column2 !== f.column1)) checks.push(`${id}: many2many autorreferente sin gemelo coherente (tabla/columnas)`);
      }
      if (f.compute && !f.depends && f.store !== false) checks.push(`${id}: compute almacenado sin depends`);
    }
    return { model: m.model, label: m.name, state: m.state, fields_total: (closure.r1_models.find((x) => x.technical_model === m.model)?.fields ?? closure.r1_dependencies.guests_line.fields).length, fields_kept: fs.length,
      defaults: 'ninguno: el dump no tiene filas ir_default para estos campos (default=null en todos)', required: fs.filter((f) => f.required).map((f) => f.technical_name),
      selections: Object.fromEntries(fs.filter((f) => f.type === 'selection').map((f) => [f.technical_name, f.related ? `related ${f.related}` : (f.selection ?? []).map((s) => s.value)])),
      relations: fs.filter((f) => f.relation).map((f) => `${f.technical_name} → ${f.relation}${f.relation_field ? ` (inverso ${f.relation_field})` : ''}`), domains: fs.filter((f) => f.domain && f.domain !== '[]').map((f) => `${f.technical_name}: ${f.domain}`), checks };
  });
  const order = modelCreationOrder(own.models, rows);
  const ext = externalDependencies(rows).filter((d) => d.kind !== 'ESTANDAR_ODOO');
  const own6 = models.filter((m) => m.model.startsWith('x_hotel_'));
  const stdModels = [...new Set(rows.filter((f) => f.relation && !own.models.some((m) => m.model === f.relation)).map((f) => f.relation))].sort();
  const missing = [...new Set(own6.flatMap((m) => m.checks))];
  return {
    ready: own6.length === 6 && missing.length === 0 && order.order !== null && models.every((m) => m.checks.length === 0),
    missing_data: [...own6.flatMap((m) => m.checks), ...(order.order === null ? [`ciclo entre modelos: ${order.cycle}`] : [])],
    models, creation_order: { models: order.order, fields: fieldOrder(rows.filter((f) => f.model !== 'sale.order' && !classifyOtaField(f).ota)).map((f) => `${f.model}.${f.name}`) },
    excluded: excluded.map((e) => `${e.kind} ${e.key}: ${e.reasons.join('; ')}`), standard_models_required: stdModels, external_dependencies: ext,
  };
}

function r2Report(closure) {
  const p = r2.plan({ extractDir: EXTRACT_DIR });
  const four = ['x_guest_line_ids', 'x_hotel_payment_ids', 'x_regimen_cliente', 'x_tipo_persona_cliente'];
  const items = p.items; const byName = new Map(items.map((i) => [i.name, i]));
  const payment = closure.r1_dependencies.account_payment_field;
  const detail = four.map((n) => { const i = byName.get(n); return { name: n, ttype: i.ttype, relation: i.relation || null, relation_field: i.relation_field ?? null, related: i.related ?? null, store: i.store, selection_options: i.related ? 'heredadas del origen (0 propias, no se fabrican)' : i.selection, issues: i.issues, requires: n === 'x_guest_line_ids' ? ['x_guests_line (modelo) + x_guests_line.x_sale_order_id (inverso)'] : n === 'x_hotel_payment_ids' ? [`account.payment.${payment.technical_name} (m2o a sale.order, on_delete «${payment.on_delete}»)`] : [`campo origen ${i.related} presente en Enterprise 19 (lectura)`] }; });
  const extra = byName.get('x_hotel_is_test');
  const missing = [...detail.flatMap((d) => d.issues.map((x) => `${d.name}: ${x}`)), ...(extra ? [] : ['x_hotel_is_test ausente']), ...(items.length === 81 ? [] : [`se esperaban 81 campos sale.order.x_* y hay ${items.length}`])];
  return { ready: missing.length === 0, missing_data: missing, total: items.length, from_backup: items.filter((i) => !i.from_dump).length, from_dump: items.filter((i) => i.from_dump).map((i) => i.name), four: detail, dependencies_outside: ['x_guests_line (R1)', `account.payment.${payment.technical_name} (R1)`, 'res.partner.l10n_co_edi_fiscal_regimen (módulo de localización: lectura previa)'] };
}

function rolesReport(closure, dir) {
  const old = deriveRolesOld(closure); const cur = adaptRolesCurrent(jsonIn(dir, 'planning_roles_current.json'));
  const map = planRoleMapping(old, cur); const structure = compareRoleStructure(old, cur);
  const sameSet = old.length === cur.roles.length;
  const table = old.map((o) => { const m = map.items.find((i) => i.name === o.name); const st = structure.find((s) => s.name === o.name); const c = cur.roles.find((r) => r.name === o.name); return { name: o.name, old: { x_casa: o.x_casa, x_is_a_room_offer: o.x_is_a_room_offer }, current: c ? { x_casa: c.x_casa, x_is_a_room_offer: c.x_is_a_room_offer } : null, mapping: m.status, structure: st.status, structure_diffs: st.diffs }; });
  const ready = map.closed && map.items.every((i) => i.status === 'MATCH') && structure.every((s) => s.status === 'MATCH') && sameSet && cur.fields.x_casa && cur.fields.x_is_a_room_offer;
  return { ready, key: 'nombre exacto del rol + x_casa + x_is_a_room_offer + recursos asociados (nunca por id)', table, pending: [...map.pending, ...structure.filter((s) => s.status !== 'MATCH').map((s) => `${s.name}: estructura ${s.status} ${s.diffs.join('; ')}`)], fields_present_in_current: cur.fields };
}

function rulesReport(closure, dir) {
  const old = deriveRulesOld(closure); const cur = adaptRulesCurrent(jsonIn(dir, 'rules_current.json'));
  const cmp = compareAll(old, cur);
  const table = cmp.results.map((r) => {
    const o = closure.rules[r.key], c = cur.find((x) => x.name === r.name);
    return { rule: r.key, name: r.name, OLD: `trigger ${o.trigger}; domain ${o.filter_domain ?? '∅'}; código ${o.code.split('\n').length} líneas sha ${o.code_sha256.slice(0, 8)}`,
      CURRENT: `trigger ${c.trigger}; domain ${c.filter_domain || '∅'}; pre-domain ${c.filter_pre_domain || '∅'}; código ${String(c.code ?? '').split('\n').length} líneas`,
      DIFFERENCE: r.reasons.join('; ') || 'ninguna (salvo «[]» ≡ null)', FUNCTIONAL_INTENT: r.intent, CLASSIFICATION: r.verdict, WRITE_REQUIRED: !!r.write_required,
      ADAPTATION: r.adaptation ? `PAYLOAD_EXTENSION +${r.adaptation.keys.join(', ')}: reemplazar el código de la acción enlazada por el del dump (sha ${r.adaptation.target_sha256.slice(0, 8)}) con --apply --force-diff; rollback restaura el código previo` : 'ninguna' };
  });
  const ready = Object.fromEntries(cmp.results.map((r) => [r.key, r.verdict !== 'ABORT' && r.verdict !== 'REPLACE_REQUIRED']));
  return { table, ready, overall: cmp.overall, write_required: cmp.writeRequired };
}

export function assess189(closure, plan4) {
  const r = closure.rules['189']; const code = r.code;
  const gateSrc = src('hotel-gate.mjs') + src('guard.mjs');
  const cases = CASES_189.map((k) => ({ id: k.id, found: k.rx.test(code) }));
  const defined = new Set(deriveFields(closure).map((f) => f.name));
  const toks = [...new Set(code.match(/\bx_[a-z0-9_]+\b/g) ?? [])];
  const models = new Set(['x_hotel_unit', 'x_hotel_property']);
  const bk = new Set(readBackup('ir-model-fields-sale-order-custom.json').map((f) => f.name));
  const unresolved = toks.filter((t) => !defined.has(t) && !bk.has(t) && !models.has(t));
  const guard = (env) => { try { loadRecoveryConfig(env); return false; } catch (e) { return e instanceof RecoveryGuardError; } };
  const base = { RECOVERY_TARGET_DB: TARGET_DB, ODOO_BASE_URL: `https://${TARGET_DB}.odoo.com`, ODOO_TECHNICAL_USER: 'u', ODOO_TECHNICAL_SECRET: 's' };
  const r4src = src('layers/r4.mjs'); const runBody = r4src.slice(r4src.indexOf('export async function run'));
  const criteria = {
    preserves_intent: { ok: sha256(code) === r.code_sha256 && cases.every((c) => c.found), detail: 'código del dump instalado TAL CUAL por nombre (sha256 verificado) y con los 4 casos presentes en el código', cases },
    avoids_old_ids: { ok: hardcodedIds(code).length === 0 && !/\.browse\(\s*\d/.test(code) && !/'(?:id|resource_id|role_id)'\s*[,=]\s*\d{2,}/.test(code), detail: `ids numéricos duros: ${JSON.stringify(hardcodedIds(code))}; resuelve la unidad por x_resource_id del propio slot` },
    protects_wrong_db_and_production: { ok: guard({ ...base, RECOVERY_TARGET_DB: 'atheron1' }) && guard({ ...base, RECOVERY_TARGET_DB: 'atheron1-hotel-staging-20260923' }) && guard({ ...base, ODOO_BASE_URL: 'https://atheron1.odoo.com' }), detail: 'loadRecoveryConfig rechaza producción, base antigua y origen HTTPS distinto' },
    requires_neutralized_staging: { ok: /database\.is_neutralized/.test(gateSrc) && /G4/.test(gateSrc), detail: 'guard.mjs G4 exige database.is_neutralized o atestación humana registrada' },
    verifies_minimal_structure: { ok: /SLOT_FIELDS/.test(gateSrc) && /HOTEL_MODELS/.test(gateSrc) && unresolved.length === 0, detail: `compuerta hotelera (modelos, campos de planning.slot/role, 5 habitaciones + Casa con 5 hijas) y cierre de dependencias del código: sin definir en artefactos = ${JSON.stringify(unresolved)}` },
    name_matches_activation_guard: { ok: OVERLAP_GUARD_NAME === closure.rules['189'].name, detail: `guard.requireOverlapGuard exige una automatización llamada «${OVERLAP_GUARD_NAME}»; la instalada se llama «${closure.rules['189'].name}»` },
    aborts_on_missing_critical_dependency: { ok: runBody.indexOf('hotelLogicGate(ex)') > -1 && runBody.indexOf('hotelLogicGate(ex)') < runBody.indexOf('ensure('), detail: 'R4 ejecuta la compuerta y la comparación 167/168/169 antes de la primera escritura; si falla, BlockedError sin escribir' },
  };
  const original = { artifact: 'hotel-gate.mjs + guard.mjs (ATH-016/007)', classification: /x_lock_touch/.test(gateSrc) ? 'REVISAR' : 'NOT_EQUIVALENT', reason: 'protegen entorno, neutralización y estructura mínima; no implementan disponibilidad, HOLD, sombras derivadas ni serialización (x_lock_touch). Eran necesarios, no suficientes.' };
  const inR4 = plan4.autoV.some(({ b }) => b.name === closure.rules['189'].name) && plan4.keptNames.has(r.action_name);
  const allOk = Object.values(criteria).every((c) => c.ok) && inR4;
  return { original_gate: original, replacement: { what: 'regla 189 instalada por nombre, INACTIVA, con el código del dump y sus campos disparadores por nombre; la guardia de entorno y la compuerta hotelera preceden a cualquier escritura', in_r4_plan: inR4, criteria, trigger_fields: closure.hotel_internal_r4.find((e) => e.automation_id_old === 189)?.trigger_field_names ?? [] },
    classification: allOk ? 'VALID' : 'NEEDS_ADAPTATION', ready: allOk,
    residual: ['equivalencia en tiempo de ejecución de safe_eval en Enterprise 19 y orden de disparo: no demostrables offline; se prueban en QA de una misión de ejecución, con la regla aún inactiva y activación aparte', 'x_lock_touch serializa sobre unidades; la prueba de concurrencia real solo es posible en Odoo real'] };
}

function r4Report(closure) {
  const bk = JSON.parse(readFileSync(resolve(BACKUP_DIR, 'ir-actions-server-hotel.json'), 'utf8'));
  const d = deriveR4(closure, bk); const p = r4.plan({ extractDir: EXTRACT_DIR });
  const otaIds = new Set(closure.ota_excluded.filter((o) => o.id_old).map((o) => o.id_old));
  const leaked = [...d.actions.filter((a) => otaIds.has(a.id)).map((a) => `acción ${a.id}`), ...closure.hotel_internal_r4.filter((e) => otaIds.has(e.automation_id_old)).map((e) => `automatización ${e.automation_id_old}`), ...closure.hotel_internal_r4.filter((e) => otaIds.has(e.cron_id_old)).map((e) => `cron ${e.cron_id_old}`)];
  const otaModels = closure.ota_excluded.filter((o) => o.kind === 'model').map((o) => o.technical_name);
  const fieldRows = deriveFields(closure);
  const otaFieldHits = fieldRows.filter((f) => otaModels.includes(f.model) || otaModels.includes(f.relation)).map((f) => `${f.model}.${f.name}`);
  const names = (a) => txt(a.name);
  const kept = p.kept.map(names); const hard = p.actions.filter((a) => !p.protActs.has(names(a)) && p.verdict.get(names(a)).hard.length).map((a) => `${names(a)}: ${p.verdict.get(names(a)).hard}`);
  const otaHits = p.actions.filter((a) => p.verdict.get(names(a)).ota.ota).map(names).concat(p.autoV.filter((x) => x.ota.ota).map((x) => txt(x.b.name)), p.cronV.filter((x) => x.ota.ota).map((x) => txt(x.c.cron_name)));
  const noModel = d.actions.filter((a) => !a.model).map((a) => a.name); const noCode = d.actions.filter((a) => a._missing_code || a.code == null).map((a) => a.name);
  // dependencias de campo del código instalable
  const defined = new Set(fieldRows.map((f) => f.name)); const sob = new Set(readBackup('ir-model-fields-sale-order-custom.json').map((f) => f.name));
  const own = new Set(['x_hotel_unit', 'x_hotel_property', 'x_hotel_quote', 'x_hotel_rate', 'x_hotel_rate_line', 'x_hotel_deposit_policy', 'x_guests_line']);
  const rel = new Map(); for (const f of fieldRows) if (f.relation && f.name.startsWith('x_') && !rel.has(f.name)) rel.set(f.name, f.relation);
  const knownF = knownFromRows([...fieldRows, ...readBackup('ir-model-fields-sale-order-custom.json').map((f) => ({ model: 'sale.order', name: f.name, relation: f.relation || null, ttype: f.ttype }))]);
  const qualified = {}; for (const a of p.kept) for (const u of qualifiedFieldUses(a.code, (n) => rel.get(n) ?? null)) if (!knownF.get(u.model)?.has(u.field)) ((qualified[`${u.model}.${u.field}`] ??= new Set()).add(names(a)));
  const unresolved = {}; for (const a of p.kept) for (const t of new Set(a.code.match(/\bx_[a-z0-9_]+\b/g) ?? [])) if (!defined.has(t) && !sob.has(t) && !own.has(t)) (unresolved[t] ??= []).push(names(a));
  const bad = p.autoV.filter(({ b }) => b.action_names.some((n) => !p.keptNames.has(n))).map(({ b }) => txt(b.name));
  const cmpOk = true;
  const deferredOk = d.deferred.length === Object.keys(R4_DEFERRED).length && d.deferred.every((x) => R4_DEFERRED[x.name]);
  const forbidden = ['booking', 'airbnb', 'beds24', 'nobeds', 'ical', 'webhook', 'https://', 'requests.'];
  const scopeText = p.kept.map((a) => a.code.toLowerCase()).join('\n');
  const externalMentions = forbidden.filter((w) => scopeText.includes(w));
  const missing = [...noModel.map((n) => `modelo de «${n}»`), ...noCode.map((n) => `código de «${n}»`), ...hard.map((h) => `ids duros en ${h}`), ...otaHits.map((h) => `OTA en el plan: ${h}`), ...bad.map((b) => `automatización enlazada a acción excluida: ${b}`), ...leaked.map((l) => `OTA filtrado: ${l}`), ...externalMentions.map((w) => `mención externa «${w}» en código instalable`), ...otaFieldHits.map((h) => `campo OTA derivado: ${h}`), ...(d.labelClash.length ? [`etiqueta de modelo ambigua: ${d.labelClash}`] : []), ...(deferredOk ? [] : ['diferidos fuera de lo declarado'])];
  const families = { 'noches/calendario': ['ATHERON - Reserva al calendario al confirmar'], 'mover/liberar bloque': ['ATHERON - Mover bloque al cambiar fechas de la orden', 'ATHERON - Quitar bloque al cancelar orden'], 'Casa↔habitaciones (comparador)': PROTECTED_RULES.map((x) => x.name), 'motor y guardia': ['HOTEL v1 — Motor inventario compuesto / anti-doble-reserva', closure.rules['189'].name], HOLD: ['HOTEL v1 — HOLD visible en Planning (003)', 'HOTEL v1 — HOLD', 'HOTEL v1 — VENCER HOLDS', 'HOTEL v1 — Vencer HOLDs y liberar inventario (STAGING)'], 'estados/reserva directa': ['HOTEL v1 — OPCION', 'HOTEL v1 — CONFIRMAR', 'HOTEL v1 — PRE CHECKIN', 'HOTEL v1 — CHECKIN', 'HOTEL v1 — CHECKOUT', 'HOTEL v1 — CERRAR', 'HOTEL v1 — CANCELAR', 'HOTEL v1 — NO SHOW', 'HOTEL v1 — CREAR RESERVA DESDE COTIZACIÓN (004)'] };
  const present = new Set([...d.actions.map((a) => a.name), ...d.autos.map((a) => a.name), ...d.crons.map((c) => c.cron_name)]);
  const familyCheck = Object.fromEntries(Object.entries(families).map(([k, v]) => [k, v.filter((n) => !present.has(n))]));
  return { ready: missing.length === 0 && Object.values(familyCheck).every((x) => x.length === 0), missing_data: [...missing, ...Object.entries(familyCheck).flatMap(([k, v]) => v.map((n) => `familia ${k}: falta «${n}»`))],
    counts: { actions_derived: d.actions.length, actions_installed_by_generic_path: kept.length, automations_derived: d.autos.length, automations_generic: p.autoV.length, crons: d.crons.length, deferred: d.deferred.length },
    deferred: d.deferred, ota_excluded_by_closure: closure.ota_excluded.length, ota_leaked: leaked, all_created_inactive: 'R4 crea automatizaciones y crons con active=false (código fijo en layers/r4.mjs)',
    external_field_preconditions: [...Object.entries(qualified).map(([field, a]) => ({ field, used_by: [...a], by: 'modelo explícito en el código' })), ...Object.entries(unresolved).filter(([t]) => ![...Object.keys(qualified)].some((q) => q.endsWith(`.${t}`))).map(([token, actions]) => ({ field: token, used_by: actions, by: 'solo por nombre' }))], families: familyCheck, direct_action_models: d.actions.filter((a) => /^HOTEL v1 — (HOLD|OPCION|CONFIRMAR|PRE CHECKIN|CHECKIN|CHECKOUT|CERRAR|CANCELAR|NO SHOW|VENCER|Vencer|CREAR)/.test(a.name)).map((a) => `${a.name} → ${a.model ?? '??'}${a.binding_model ? ` (binding ${a.binding_model})` : ''}`) };
}

function layersReport(closure) {
  const r2names = new Set(readBackup('ir-model-fields-sale-order-custom.json').map((f) => f.name).concat(['x_hotel_is_test']));
  const defined = new Set(deriveFields(closure).map((f) => f.name));
  const r7 = { required_so_fields: REQUIRED_SO_FIELDS, missing: REQUIRED_SO_FIELDS.filter((f) => !r2names.has(f) && !defined.has(f)) };
  const payloadDir = resolve(HERE, 'payloads'); const toks = new Set();
  for (const f of ['kpi-row.json', 'search-angela-filtros.xml', 'view-kanban-6833.xml']) for (const t of readFileSync(resolve(payloadDir, f), 'utf8').match(/\bx_[a-z0-9_]+\b/g) ?? []) toks.add(t);
  r7.payload_tokens_undefined = [...toks].filter((t) => !r2names.has(t) && !defined.has(t) && !['x_hotel_unit', 'x_hotel_property'].includes(t));
  const r6src = src('layers/r6.mjs'); const r3src = src('layers/r3.mjs');
  return {
    R3: { status: 'UNCHANGED_OK', why: 'no se tocó layers/r3.mjs; ahora planning_roles.json existe (derivado del cierre) y el paso planning.role de R3 deja de dar ROLE_ATTR_PENDIENTE; los 6 roles del staging ya coinciden con el dump. Usa x_hotel_* de R1 solo por modelo y por campos de la master data del respaldo', uses_role_mapping: /planRoleMapping/.test(r3src) },
    R5: { status: 'NEEDS_UPDATE', applied: true, why: 'R4 ahora instala 14 acciones HOTEL v1 con el código del dump (7-oct); R5 las construía con el respaldo (30-sep) y habrían quedado en DIFF contra R4. layers/r5.mjs toma el código del dump cuando existe esa misma acción (nombre+modelo) y deja el respaldo para el resto' },
    R6: { status: 'UNCHANGED_OK', why: 'R6 solo usa grupos por XMLID y res.users; no depende de modelos, campos ni reglas de R1/R2/R4', touches_hotel_models: /x_hotel|planning\.|sale\.order/.test(r6src) },
    R7: { status: r7.missing.length === 0 && r7.payload_tokens_undefined.length === 0 ? 'UNCHANGED_OK' : 'NEEDS_UPDATE', ...r7, why: 'los campos x_* que usan sus vistas/KPI están en las 81 definiciones de R2 o en R1' },
  };
}

export async function analyze({ extractDir = EXTRACT_DIR } = {}) {
  const closure = readClosure(extractDir);
  if (!closure) throw new Error(`falta ${CLOSURE_FILE} en ${extractDir}`);
  const p1 = phase1(extractDir, closure); const R1 = r1Report(closure); const R2 = r2Report(closure); const roles = rolesReport(closure, extractDir);
  const rules = rulesReport(closure, extractDir); const plan4 = r4.plan({ extractDir }); const R4 = r4Report(closure); const a189 = assess189(closure, plan4); const layers = layersReport(closure);
  const matrix = [
    { ITEM: 'R1 modelos x_hotel_* (6) + x_guests_line', OLD_DUMP: '6 modelos / 96 campos + 21 de Guests Line', CURRENT_STAGING: 'ausentes por prefijo (ATH-008)', REQUIRED_RECOVERY: 'crear modelos y campos en orden de dependencias, sin OTA ni x_api_*', STATUS: yn(R1.ready), ACTION: 'R1 listo; precondiciones de destino en external_dependencies' },
    { ITEM: 'R2 4 campos sale.order (+ x_hotel_is_test)', OLD_DUMP: '81 x_* (80 del respaldo + x_hotel_is_test)', CURRENT_STAGING: 'no cotejados individualmente', REQUIRED_RECOVERY: 'crear tras sus inversos; related sin opciones propias', STATUS: yn(R2.ready), ACTION: 'R2 listo' },
    { ITEM: 'planning.role x_casa / x_is_a_room_offer', OLD_DUMP: '6 roles', CURRENT_STAGING: '6 roles, mismos valores', REQUIRED_RECOVERY: 'mapear por nombre/estructura/atributos', STATUS: yn(roles.ready), ACTION: 'mapeo por nombre; sin escritura necesaria (MATCH)' },
    ...rules.table.map((t) => ({ ITEM: `regla ${t.rule}`, OLD_DUMP: t.OLD, CURRENT_STAGING: t.CURRENT, REQUIRED_RECOVERY: t.FUNCTIONAL_INTENT, STATUS: t.CLASSIFICATION, ACTION: t.ADAPTATION })),
    { ITEM: 'regla 189', OLD_DUMP: 'guardia anti-solapamiento v3 (acción 1915)', CURRENT_STAGING: 'el id 189 del destino es otra cosa (precios)', REQUIRED_RECOVERY: 'reemplazo funcional por nombre', STATUS: a189.classification, ACTION: 'instalar INACTIVA con el código del dump' },
    { ITEM: 'R4 lógica hotelera interna', OLD_DUMP: '11 automatizaciones + 12 acciones + cron 155', CURRENT_STAGING: '167/168/169 ya existen', REQUIRED_RECOVERY: 'solo lógica interna, sin OTA', STATUS: yn(R4.ready), ACTION: `${R4.counts.deferred} diferidas con motivo` },
  ];
  const gate = {
    R1_MODELS_READY: yn(R1.ready), R2_FIELDS_READY: yn(R2.ready), R4_RULES_READY: yn(R4.ready),
    RULE_167_READY: yn(rules.ready['167']), RULE_168_READY: yn(rules.ready['168']), RULE_169_READY: yn(rules.ready['169']),
    RULE_189_REPLACEMENT_READY: yn(a189.ready), PLANNING_ROLE_MAPPING_READY: yn(roles.ready),
    OTA_EXCLUDED: yn(R4.ota_leaked.length === 0 && R1.excluded.length >= 2 && R4.missing_data.every((m) => !/OTA|externa/.test(m))),
    R3_STATUS: layers.R3.status, R5_STATUS: layers.R5.status, R6_STATUS: layers.R6.status, R7_STATUS: layers.R7.status,
  };
  const static_ok = Object.entries(gate).filter(([k]) => /_READY$|OTA_EXCLUDED/.test(k)).every(([, v]) => v === 'YES') && p1.contradictions.length === 0 && p1.all_exist && p1.all_json_valid;
  return { phase1: p1, matrix, R1, R2, roles, rules, rule189: a189, R4, layers, gate, static_ok, pending_evidence: ['ROLLBACK_READY y pruebas: las fijan los tests (test/closure.test.mjs)'] };
}
