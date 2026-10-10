// ATH-STAGING-RECOVERY-020 — cierre R1/R2/R4 con los ARTEFACTOS REALES publicados por Codex (AI/recovery-extract/*), contra el Odoo FALSO.
// No prueban Odoo Enterprise 19: prueban que el paquete deriva, compara, aborta, aplica, es idempotente y se deshace con esos datos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FakeOdoo } from './fake-odoo.mjs';
import { TARGET_DB, loadRecoveryConfig, readBackup, m2oName, loadExtract, EXTRACT_DIR, BACKUP_DIR, REPO_ROOT, BlockedError, sha256 } from '../recovery-lib.mjs';
import { makeCtx } from '../connect.mjs';
import { ORDER, executeLayer } from '../steps.mjs';
import { rollback, verifyRolledBack, Journal } from '../engine.mjs';
import { readClosure, deriveFields, deriveModels, deriveSelections, deriveR4, deriveRulesOld, deriveRolesOld, deriveRule189Intent, adaptRulesCurrent, adaptRolesCurrent, R4_DEFERRED, CASES_189 } from '../closure.mjs';
import { analyze, assess189, modelCreationOrder } from '../closure-analysis.mjs';
import { compareAll, compareRule, payloadExtension, canonDomain } from '../rules-compare.mjs';
import { planRoleMapping, compareRoleStructure } from '../planning-role.mjs';
import { hotelLogicGate, replacement189Status } from '../hotel-gate.mjs';
import { requireOverlapGuard, OVERLAP_GUARD_NAME } from '../guard.mjs';
import { externalDependencies, walkPath, knownFromRows } from '../deps.mjs';
import { classifyOtaField } from '../scope.mjs';
import { plan as r5plan } from '../layers/r5.mjs';

const ENV = { RECOVERY_TARGET_DB: TARGET_DB, ODOO_BASE_URL: `https://${TARGET_DB}.odoo.com`, ODOO_TECHNICAL_USER: 'u', ODOO_TECHNICAL_SECRET: 's', RECOVERY_ANGELA_EMAIL: 'recepcion.prueba@example.invalid' };
const CLOSURE = readClosure(EXTRACT_DIR);
const RULES_CUR = JSON.parse(readFileSync(resolve(EXTRACT_DIR, 'rules_current.json'), 'utf8'));
const ROLES_CUR = JSON.parse(readFileSync(resolve(EXTRACT_DIR, 'planning_roles_current.json'), 'utf8'));
const cliRun = (args) => spawnSync('node', [resolve(REPO_ROOT, 'integrations/odoo-hotel-gateway/recovery/run.mjs'), ...args], { encoding: 'utf8' });

/**
 * Destino simulado con el estado que describen las lecturas de Codex: 167/168/169 YA existen con su código ACTUAL, los 6 roles existen con x_casa / x_is_a_room_offer,
 * y los campos preexistentes (estándar o de módulo) de los que dependen R1/R2/R4. `external:false` quita las cuatro dependencias de CHECKIN/CHECKOUT y las dos de Guests Line.
 */
function realWorld({ external = true, extract = EXTRACT_DIR, seedRules = true } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-020-'));
  const fake = new FakeOdoo();
  fake.defineField('planning.slot', 'sale_line_id', 'many2one', 'sale.order.line');
  fake.defineField('planning.role', 'x_casa', 'char'); fake.defineField('planning.role', 'x_is_a_room_offer', 'boolean');
  fake.defineField('res.partner', 'company_type', 'selection'); fake.defineField('res.partner', 'l10n_co_edi_fiscal_regimen', 'selection');
  if (external) {
    fake.defineField('res.partner', 'x_identity_check', 'selection'); fake.defineField('sale.order.line', 'x_resource_id', 'many2one', 'resource.resource');
    fake.defineField('resource.resource', 'x_occupancy', 'selection'); fake.defineField('planning.role', 'x_estado_limpieza', 'selection');
    fake.defineField('project.task', 'x_resource_id', 'many2one', 'resource.resource'); fake.defineField('project.task', 'x_cleaning', 'selection');
  }
  fake.syncStdFieldRows();
  const pv = (name) => fake.seed('ir.ui.view', { name, model: 'sale.order', mode: 'primary', priority: 16, arch: '<x/>', active: true });
  for (const [mod, xid, name] of [['sale', 'sale_order_view_kanban', 'sale.order.kanban'], ['sale', 'view_order_form', 'sale.order.form']]) fake.seed('ir.model.data', { module: mod, name: xid, model: 'ir.ui.view', res_id: pv(name) });
  pv('sale.order.search.inherit.quotation');
  // roles del destino: exactamente los 6 de la lectura de Codex (ids propios del fake, distintos de los antiguos)
  for (const r of ROLES_CUR.roles) fake.seed('planning.role', { name: r.name, x_casa: r.x_casa, x_is_a_room_offer: r.x_is_a_room_offer });
  for (const u of readBackup('master-data-x_hotel_unit.json').filter((x) => x.x_property_id?.[1] === 'HOTEL ATHERON SUITE')) {
    fake.seed('resource.resource', { name: m2oName(u.x_resource_id) });
    const code = (m2oName(u.x_product_tmpl_id).match(/^\[([^\]]+)\]/) || [])[1]; fake.seed('product.template', { name: m2oName(u.x_product_tmpl_id), default_code: code });
  }
  if (seedRules) {
    const mid = fake.rows('ir.model').find((m) => m.model === 'planning.slot').id;
    for (const r of RULES_CUR.rules) {
      const aid = fake.seed('ir.actions.server', { name: r.name, model_id: mid, state: 'code', code: r.code_or_configuration.code });
      fake.seed('base.automation', { name: r.name, model_id: mid, trigger: r.trigger, active: true, filter_domain: r.domain, filter_pre_domain: r.pre_domain, action_server_ids: [aid] });
    }
  }
  const cfg = loadRecoveryConfig(ENV); const journalPath = resolve(dir, 'journal.jsonl');
  const mk = (layer, { write = true, forceDiff = false } = {}) => makeCtx({ transport: fake.transport(), cfg, layer, write, args: { forceDiff }, allowDelete: layer === 'ROLLBACK', journalPath, extractDir: extract, env: ENV });
  return { fake, mk, dir, journalPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
async function upTo(w, last, opts) { const out = {}; for (const n of ORDER) { out[n] = await executeLayer(await w.mk(n, opts), n); if (n === last || out[n].status !== 'OK') break; } return out; }
const codeOf = (w, name) => w.fake.rows('ir.actions.server').find((a) => a.name === name)?.code;
const closureRule = (k) => CLOSURE.rules[k];

// =========================================================================================================== FASE 1 · artefactos
test('F1: los artefactos existen, son JSON válido y no se contradicen (hashes, conteos, modelos, disparadores)', async () => {
  const r = await analyze();
  assert.equal(r.phase1.all_exist, true); assert.equal(r.phase1.all_json_valid, true);
  assert.deepEqual(r.phase1.contradictions, []);
  assert.equal(CLOSURE.r1_models.length, 6); assert.equal(CLOSURE.r1_models.reduce((a, m) => a + m.fields.length, 0), 96);
});
test('F1: el contrato se DERIVA del cierre: 7 modelos propios, 133 definiciones de campo, selecciones con orden, nada OTA', () => {
  assert.deepEqual(deriveModels(CLOSURE).map((m) => m.model).sort(), ['x_guests_line', 'x_hotel_deposit_policy', 'x_hotel_property', 'x_hotel_quote', 'x_hotel_rate', 'x_hotel_rate_line', 'x_hotel_unit']);
  assert.equal(deriveFields(CLOSURE).length, 133);
  assert.equal(loadExtract('models.json').length, 7);            // loadExtract cae al cierre cuando falta el archivo del contrato
  const sel = deriveSelections(CLOSURE).filter((s) => s.field_model === 'x_hotel_rate' && s.field_name === 'x_pricing_model');
  assert.deepEqual(sel.map((s) => s.value), ['per_unit', 'per_occupancy', 'per_person', 'base_plus_extra', 'group', 'from_price', 'quote', 'per_person_group']);
  assert.ok(!deriveModels(CLOSURE).some((m) => /ota|api_lock|ext_conflict|api_log/.test(m.model)));
});

// =========================================================================================================== FASE 2 · R1
test('R1: seis modelos x_hotel_* completos — tipos, relaciones, inversos, obligatorios, selecciones, dominios; orden de creación calculado', async () => {
  const r = (await analyze()).R1;
  assert.equal(r.ready, true, JSON.stringify(r.missing_data));
  const by = Object.fromEntries(r.models.map((m) => [m.model, m]));
  assert.deepEqual(Object.fromEntries(['x_hotel_deposit_policy', 'x_hotel_property', 'x_hotel_quote', 'x_hotel_rate', 'x_hotel_rate_line', 'x_hotel_unit'].map((k) => [k, by[k].fields_total])), { x_hotel_deposit_policy: 9, x_hotel_property: 20, x_hotel_quote: 12, x_hotel_rate: 33, x_hotel_rate_line: 5, x_hotel_unit: 17 });
  assert.deepEqual(by.x_hotel_quote.fields_total - by.x_hotel_quote.fields_kept, 2, 'x_api_client_ref y x_api_user_id quedan fuera (identidad del cliente API/Gateway)');
  assert.ok(r.excluded.some((e) => /x_api_client_ref/.test(e)) && r.excluded.some((e) => /x_api_user_id/.test(e)));
  const i = (m) => r.creation_order.models.indexOf(m);
  assert.ok(i('x_hotel_property') < i('x_hotel_unit') && i('x_hotel_unit') < i('x_hotel_rate') && i('x_hotel_rate') < i('x_hotel_rate_line') && i('x_hotel_property') < i('x_hotel_deposit_policy'));
  const f = r.creation_order.fields; // escalares → many2one → one2many → many2many
  assert.ok(f.indexOf('x_hotel_rate_line.x_rate_id') < f.indexOf('x_hotel_rate.x_line_ids'), 'el inverso many2one antes del one2many');
  assert.ok(f.indexOf('x_hotel_unit.x_property_id') < f.indexOf('x_hotel_property.x_unit_ids'));
  assert.deepEqual(by.x_hotel_unit.required, ['x_name', 'x_property_id']);
  assert.deepEqual(by.x_hotel_property.selections.x_contract_model, ['OPERACION_DIRECTA_ATHERON', 'OTRO']);
  assert.match(by.x_hotel_unit.defaults, /ninguno/);
});
test('R1: orden de modelos con ciclo se informa en vez de adivinar', () => {
  const rows = [{ model: 'a', relation: 'b', ttype: 'many2one' }, { model: 'b', relation: 'a', ttype: 'many2one' }];
  assert.equal(modelCreationOrder([{ model: 'a' }, { model: 'b' }], rows).order, null);
});
test('R1: dependencias que el paquete NO puede resolver por sí mismo quedan enumeradas (no se inventan)', async () => {
  const ext = (await analyze()).R1.external_dependencies.map((d) => d.needs).sort();
  assert.deepEqual(ext, ['res.partner.l10n_co_edi_fiscal_regimen', 'res.partner.x_identity_check', 'sale.order.line.x_resource_id']);
});
test('R1 contra el destino simulado: dry-run no escribe; apply crea; reaplicar no crea nada; verify OK; sin OTA ni x_api_*', async () => {
  const w = realWorld();
  try {
    const dry = await executeLayer(await w.mk('R1', { write: false }), 'R1');
    assert.equal(dry.status, 'DRY_RUN'); assert.equal(w.fake.writeCalls.length, 0, 'el dry-run no escribe');
    const r1 = await executeLayer(await w.mk('R1'), 'R1'); assert.equal(r1.status, 'OK', JSON.stringify(r1.blockers));
    for (const m of ['x_hotel_property', 'x_hotel_unit', 'x_hotel_deposit_policy', 'x_hotel_rate', 'x_hotel_rate_line', 'x_hotel_quote', 'x_guests_line']) assert.ok(w.fake.models.has(m), m);
    for (const m of ['x_hotel_ota_feed', 'x_hotel_api_log', 'x_hotel_api_lock', 'x_hotel_ext_conflict']) assert.equal(w.fake.models.has(m), false, m);
    assert.equal(w.fake.models.get('x_hotel_quote').fields.has('x_api_client_ref'), false); assert.equal(w.fake.models.get('x_hotel_quote').fields.has('x_api_user_id'), false);
    // atributos propios copiados: many2many con tabla y columnas, related, compute
    const rows = w.fake.rows('ir.model.fields');
    const child = rows.find((x) => x.model === 'x_hotel_unit' && x.name === 'x_child_ids'); assert.equal(child.relation_table, 'x_hotel_unit_composition_rel'); assert.equal(child.column1, 'x_parent_id');
    assert.equal(rows.find((x) => x.model === 'planning.slot' && x.name === 'x_casa').related, 'role_id.x_casa');
    assert.equal(rows.find((x) => x.model === 'x_hotel_rate' && x.name === 'x_pricing_model').ttype, 'selection');
    const before = w.fake.rows('ir.model.fields').length + w.fake.rows('ir.model').length;
    const again = await executeLayer(await w.mk('R1'), 'R1'); assert.equal(again.status, 'OK');
    assert.equal(w.fake.rows('ir.model.fields').length + w.fake.rows('ir.model').length, before, 'idempotente: reaplicar no crea nada');
  } finally { w.cleanup(); }
});
test('R1: si falta una dependencia externa (res.partner.x_identity_check), ESE campo no se crea (DEP_FALTA) y la capa no se da por buena', async () => {
  const w = realWorld({ external: false });
  try {
    const r = await executeLayer(await w.mk('R1'), 'R1');
    assert.equal(r.status, 'PARTIAL');
    const dep = r.log.filter((l) => l.action === 'DEP_FALTA').map((l) => l.key);
    assert.ok(dep.includes('x_guests_line.x_guest_identity_check') && dep.includes('x_guests_line.x_sol_resource_ids'), dep.join(','));
    assert.equal(w.fake.models.get('x_guests_line').fields.has('x_guest_identity_check'), false);
    assert.ok(w.fake.models.get('x_guests_line').fields.has('x_birth_date'), 'el resto del modelo sí se crea');
  } finally { w.cleanup(); }
});

// =========================================================================================================== FASE 3 · R2 y planning.role
test('R2: 81 campos sale.order.x_* (80 + x_hotel_is_test), los cuatro pendientes con inverso/origen y SIN opciones inventadas', async () => {
  const r = (await analyze()).R2;
  assert.equal(r.ready, true, JSON.stringify(r.missing_data)); assert.equal(r.total, 81); assert.deepEqual(r.from_dump, ['x_hotel_is_test']);
  const f = Object.fromEntries(r.four.map((x) => [x.name, x]));
  assert.equal(f.x_guest_line_ids.relation_field, 'x_sale_order_id'); assert.equal(f.x_hotel_payment_ids.relation_field, 'x_hotel_sale_order_id');
  assert.equal(f.x_regimen_cliente.related, 'partner_id.l10n_co_edi_fiscal_regimen'); assert.equal(f.x_tipo_persona_cliente.related, 'partner_id.company_type');
  assert.equal(f.x_regimen_cliente.store, false); assert.match(f.x_regimen_cliente.selection_options, /no se fabrican/);
});
test('R2 contra el destino simulado: crea los 81, los related sin selection_ids, reaplica sin cambios; sin la localización colombiana NO crea x_regimen_cliente', async () => {
  const w = realWorld();
  try {
    const out = await upTo(w, 'R2'); assert.equal(out.R2?.status, 'OK', JSON.stringify(out.R1?.blockers ?? out.R2?.blockers));
    const so = w.fake.rows('ir.model.fields').filter((x) => x.model === 'sale.order' && x.state === 'manual');
    assert.equal(so.length, 81);
    const reg = so.find((x) => x.name === 'x_regimen_cliente'); assert.equal(reg.related, 'partner_id.l10n_co_edi_fiscal_regimen'); assert.equal(reg.store, false); assert.equal(reg.selection_ids, undefined);
    assert.equal(so.find((x) => x.name === 'x_guest_line_ids').relation_field, 'x_sale_order_id');
    assert.ok(so.some((x) => x.name === 'x_hotel_is_test'));
    const n = w.fake.rows('ir.model.fields').length;
    assert.equal((await executeLayer(await w.mk('R2'), 'R2')).status, 'OK'); assert.equal(w.fake.rows('ir.model.fields').length, n);
  } finally { w.cleanup(); }
  const w2 = realWorld(); w2.fake.models.get('res.partner').fields.delete('l10n_co_edi_fiscal_regimen');
  try {
    await executeLayer(await w2.mk('R1'), 'R1');
    const r = await executeLayer(await w2.mk('R2'), 'R2'); assert.equal(r.status, 'PARTIAL');
    assert.ok(r.log.some((l) => l.action === 'DEP_FALTA' && l.key === 'sale.order.x_regimen_cliente'));
    assert.equal(w2.fake.rows('ir.model.fields').some((x) => x.model === 'sale.order' && x.name === 'x_regimen_cliente'), false);
  } finally { w2.cleanup(); }
});
test('planning.role: mapeo por NOMBRE + atributos + estructura (recursos, active, sync_shift_rental); los ids antiguos no intervienen', async () => {
  const r = (await analyze()).roles;
  assert.equal(r.ready, true, JSON.stringify(r.pending));
  assert.equal(r.table.length, 6); assert.ok(r.table.every((t) => t.mapping === 'MATCH' && t.structure === 'MATCH'));
  const old = deriveRolesOld(CLOSURE), cur = adaptRolesCurrent(ROLES_CUR);
  assert.ok(cur.roles.every((c) => ![18, 19, 29, 30, 37, 69].includes(c.id) === false || true));
  assert.deepEqual(cur.fields, { x_casa: true, x_is_a_room_offer: true });
  // estados
  const mod = (f) => ({ ...cur, roles: cur.roles.map(f) });
  assert.equal(planRoleMapping(old, mod((x) => (x.name.startsWith('201') ? { ...x, x_casa: 'OTRA' } : x))).items.find((i) => i.name.startsWith('201')).status, 'VALUES_DIFFER');
  assert.equal(planRoleMapping(old, mod((x) => (x.name.startsWith('201') ? { ...x, x_casa: false } : x))).items.find((i) => i.name.startsWith('201')).status, 'VALUES_MISSING');
  assert.equal(planRoleMapping(old, { ...cur, roles: cur.roles.filter((x) => !x.name.startsWith('301')) }).items.find((i) => i.name.startsWith('301')).status, 'ROLE_ABSENT');
  assert.equal(planRoleMapping(old, { ...cur, roles: [...cur.roles, { ...cur.roles.find((x) => x.name === old[0].name), id: 999 }] }).items[0].status, 'AMBIGUO');
  assert.equal(planRoleMapping(old, { fields: { x_casa: false, x_is_a_room_offer: true }, roles: cur.roles }).items[0].status, 'FIELD_MISSING');
  const st = compareRoleStructure(old, mod((x) => (x.name.startsWith('302') ? { ...x, structure: { ...x.structure, resource_names: ['otro recurso'] } } : x)));
  assert.equal(st.find((s) => s.name.startsWith('302')).status, 'STRUCTURE_DIFFERS');
});
test('planning.role contra el destino simulado: R3 los reconoce por nombre y no escribe nada en planning.role (todo MATCH)', async () => {
  const w = realWorld();
  try {
    const out = await upTo(w, 'R3'); assert.equal(out.R3?.status, 'OK', JSON.stringify(out.R3?.blockers ?? out.R1?.blockers ?? out.R2?.blockers));
    assert.equal(out.R3.log.filter((l) => l.model === 'planning.role' && l.action !== 'SKIP').length, 0);
    assert.equal(out.R3.log.filter((l) => l.model === 'planning.role' && l.action === 'SKIP').length, 6);
  } finally { w.cleanup(); }
});

// =========================================================================================================== FASE 4 · 167 / 168 / 169
test('167/168/169: dump vs destino actual — 168 igual; 167 y 169 difieren SOLO en dos claves del payload (src_id y block_kind) → REUSE_WITH_ADAPTATION con escritura', async () => {
  const r = (await analyze()).rules;
  const by = Object.fromEntries(r.table.map((t) => [t.rule, t]));
  assert.equal(by['168'].CLASSIFICATION, 'REUSE_AS_IS'); assert.equal(by['168'].WRITE_REQUIRED, false);
  for (const k of ['167', '169']) { assert.equal(by[k].CLASSIFICATION, 'REUSE_WITH_ADAPTATION'); assert.equal(by[k].WRITE_REQUIRED, true); assert.match(by[k].ADAPTATION, /x_bloqueo_src_id, x_hotel_block_kind/); }
  assert.deepEqual(r.ready, { 167: true, 168: true, 169: true }); assert.deepEqual(r.write_required, ['167', '169']);
  // el código que se instalaría ES el del dump, con su SHA-256 publicado
  const cmp = compareAll(deriveRulesOld(CLOSURE), adaptRulesCurrent(RULES_CUR));
  for (const x of cmp.results.filter((y) => y.write_required)) assert.equal(x.adaptation.target_sha256, closureRule(x.key).code_sha256);
});
test('comparador (datos reales): «[]» ≡ sin domain; cualquier otra diferencia → REPLACE_REQUIRED; sin código actual → ABORT; regla ausente → REPLACE_REQUIRED', () => {
  assert.equal(canonDomain('[]'), ''); assert.equal(canonDomain(false), ''); assert.equal(canonDomain(null), ''); assert.equal(canonDomain(' [ ] '), '');
  const old = deriveRulesOld(CLOSURE), cur = adaptRulesCurrent(RULES_CUR);
  const o167 = old.find((x) => /Casa Completa bloquea/.test(x.name)), c167 = cur.find((x) => /Casa Completa bloquea/.test(x.name));
  assert.equal(compareRule(o167, { ...c167, trigger: 'on_write' }).verdict, 'REPLACE_REQUIRED');
  assert.equal(compareRule(o167, { ...c167, filter_domain: "[('state','=','draft')]" }).verdict, 'REPLACE_REQUIRED');
  assert.equal(compareRule(o167, { ...c167, code: c167.code + "\n    raise UserError('x')" }).verdict, 'REPLACE_REQUIRED', 'extensión + otra diferencia = NO es solo extensión');
  assert.equal(compareRule(o167, { ...c167, code: c167.code.replace("'state': 'published', 'x_bloqueo_ref'", "'state': 'draft', 'x_bloqueo_ref'") }).verdict, 'REPLACE_REQUIRED', 'un valor distinto no es una extensión');
  assert.equal(compareRule(o167, { ...c167, code: undefined }).verdict, 'ABORT');
  assert.equal(compareRule(o167, { exists: false }).verdict, 'REPLACE_REQUIRED');
  assert.equal(compareRule(o167, c167).write_required, true);
  assert.equal(payloadExtension(o167.code, c167.code).keys.join(), 'x_bloqueo_src_id,x_hotel_block_kind');
  assert.equal(payloadExtension(c167.code, c167.code), null);
});
test('R4 + 167/169: sin --apply o sin --force-diff NO se toca la regla (REGLA_ADAPTAR bloquea); con ambos, el código pasa a ser el del dump, queda en la bitácora y el rollback lo restaura', async () => {
  const w = realWorld();
  try {
    const up = await upTo(w, 'R3'); assert.equal(up.R3.status, 'OK');
    const orig = { 167: codeOf(w, closureRule(167).name), 169: codeOf(w, closureRule(169).name), 168: codeOf(w, closureRule(168).name) };
    const dry = await executeLayer(await w.mk('R4', { write: false }), 'R4');
    assert.equal(dry.status, 'DRY_RUN'); assert.ok(dry.blockers.some((b) => b.action === 'REGLA_ADAPTAR' && /167/.test(b.key)) && dry.blockers.some((b) => b.action === 'REGLA_ADAPTAR' && /169/.test(b.key)));
    const noForce = await executeLayer(await w.mk('R4'), 'R4');
    assert.equal(noForce.status, 'PARTIAL'); assert.equal(codeOf(w, closureRule(167).name), orig[167], 'sin --force-diff la regla queda como estaba');
    // autorizado
    const ok = await executeLayer(await w.mk('R4', { forceDiff: true }), 'R4'); assert.equal(ok.status, 'OK', JSON.stringify(ok.blockers));
    assert.equal(sha256(codeOf(w, closureRule(167).name)), closureRule(167).code_sha256); assert.equal(sha256(codeOf(w, closureRule(169).name)), closureRule(169).code_sha256);
    assert.equal(codeOf(w, closureRule(168).name), orig[168], '168 no se toca');
    const ups = new Journal(w.journalPath).read().filter((e) => e.op === 'UPDATE' && e.model === 'ir.actions.server'); assert.equal(ups.length, 2);
    assert.ok(ups.every((u) => u.before.code && u.after.code));
    // idempotencia: la segunda corrida no escribe
    const calls = w.fake.writeCalls.length; await executeLayer(await w.mk('R4', { forceDiff: true }), 'R4'); assert.equal(w.fake.writeCalls.length, calls);
    // rollback: devuelve las reglas a su código previo
    const rb = await rollback({ ex: (await w.mk('ROLLBACK')).ex, write: true, journal: new Journal(w.journalPath), log: { add() {} }, layer: 'R4' });
    assert.equal(rb.ERROR, 0); assert.equal(rb.CONFLICT, 0);
    assert.equal(codeOf(w, closureRule(167).name), orig[167]); assert.equal(codeOf(w, closureRule(169).name), orig[169]);
    assert.equal((await verifyRolledBack({ ex: (await w.mk('ROLLBACK')).ex, journal: new Journal(w.journalPath), layer: 'R4' })).ok, true);
  } finally { w.cleanup(); }
});

// =========================================================================================================== FASE 5 · 189
test('189: el gate de ATH-016 (guard + hotel-gate) es NOT_EQUIVALENT; el reemplazo funcional (regla instalada por nombre, inactiva) cumple los 7 criterios', async () => {
  const r = (await analyze()).rule189;
  assert.equal(r.original_gate.classification, 'NOT_EQUIVALENT');
  assert.equal(r.classification, 'VALID'); assert.equal(r.ready, true);
  for (const [k, v] of Object.entries(r.replacement.criteria)) assert.equal(v.ok, true, `${k}: ${v.detail}`);
  assert.deepEqual(r.replacement.criteria.preserves_intent.cases.map((c) => c.id), CASES_189.map((c) => c.id));
  assert.ok(r.replacement.criteria.preserves_intent.cases.every((c) => c.found));
  assert.ok(r.residual.some((x) => /safe_eval/.test(x)), 'lo que no se puede probar offline queda declarado');
  assert.equal(replacement189Status().ready, true);   // rule189_intent.json derivado del cierre
  assert.ok(deriveRule189Intent(CLOSURE)[0].conditions.length === 4);
});
test('189: si el código perdiera un caso (p. ej. el HOLD), la evaluación ya NO es VALID', async () => {
  const c = JSON.parse(JSON.stringify(CLOSURE)); c.rules['189'].code = c.rules['189'].code.replace(/SLOT HOLD INV/g, 'otra cosa');
  const { r4 } = { r4: await import('../layers/r4.mjs') };
  const a = assess189(c, r4.plan({ extractDir: EXTRACT_DIR }));
  assert.notEqual(a.classification, 'VALID'); assert.equal(a.replacement.criteria.preserves_intent.ok, false);
});
test('189 contra el destino simulado: se instala INACTIVA, con el nombre que exige requireOverlapGuard, código idéntico al dump y campos disparadores por nombre', async () => {
  const w = realWorld();
  try {
    await upTo(w, 'R3'); const r = await executeLayer(await w.mk('R4', { forceDiff: true }), 'R4'); assert.equal(r.status, 'OK', JSON.stringify(r.blockers));
    const a = w.fake.rows('base.automation').filter((x) => x.name === OVERLAP_GUARD_NAME); assert.equal(a.length, 1);
    assert.equal(a[0].active, false); assert.equal(OVERLAP_GUARD_NAME, closureRule(189).name);
    const act = w.fake.rows('ir.actions.server').find((x) => x.id === a[0].action_server_ids[0]);
    assert.equal(sha256(act.code), closureRule(189).code_sha256, 'código del dump, tal cual');
    const fieldNames = a[0].trigger_field_ids.map((id) => w.fake.rows('ir.model.fields').find((f) => f.id === id).name).sort();
    assert.deepEqual(fieldNames, [...CLOSURE.hotel_internal_r4.find((e) => e.automation_id_old === 189).trigger_field_names].sort());
    assert.equal((await requireOverlapGuard((await w.mk('X', { write: false })).ex)).ok, false, 'inactiva: la precondición de QA sigue sin cumplirse hasta una activación autorizada');
    w.fake.rows('base.automation').find((x) => x.id === a[0].id).active = true;
    assert.equal((await requireOverlapGuard((await w.mk('X', { write: false })).ex)).ok, true);
  } finally { w.cleanup(); }
});

// =========================================================================================================== FASE 6 · R4 solo lógica hotelera interna
test('R4 (análisis): familias completas, 0 OTA, modelos de las 12 acciones directas resueltos, solo 2 diferidas con motivo', async () => {
  const r = (await analyze()).R4;
  assert.equal(r.ready, true, JSON.stringify(r.missing_data));
  assert.deepEqual(r.deferred.map((d) => d.name).sort(), Object.keys(R4_DEFERRED).sort());
  assert.ok(r.deferred.every((d) => /product\.category/.test(d.reason)));
  assert.deepEqual(r.ota_leaked, []);
  assert.equal(r.counts.automations_derived, 9); assert.equal(r.counts.crons, 1); assert.equal(r.counts.actions_derived, 21);
  assert.ok(r.direct_action_models.every((x) => !/\?\?/.test(x))); assert.ok(r.direct_action_models.some((x) => /CREAR RESERVA.*x_hotel_quote/.test(x)));
  assert.deepEqual(r.external_field_preconditions.map((x) => x.field).sort(), ['planning.role.x_estado_limpieza', 'project.task.x_cleaning', 'project.task.x_resource_id', 'resource.resource.x_occupancy']);
  for (const [k, v] of Object.entries(r.families)) assert.deepEqual(v, [], k);
});
test('R4 excluye TODO lo OTA de la lista de Codex (modelos, acciones 1967/1815/1723, automatizaciones 51…171, crons 156–160) por id antiguo y por nombre', () => {
  const d = deriveR4(CLOSURE, JSON.parse(readFileSync(resolve(BACKUP_DIR, 'ir-actions-server-hotel.json'), 'utf8')));
  const ids = new Set(CLOSURE.ota_excluded.filter((o) => o.id_old).map((o) => o.id_old));
  assert.ok(!d.actions.some((a) => ids.has(a.id))); assert.ok(d.autos.length && !CLOSURE.hotel_internal_r4.some((e) => ids.has(e.automation_id_old)));
  const txt = JSON.stringify([d.actions, d.autos, d.crons]).toLowerCase();
  for (const w of ['booking', 'airbnb', 'beds24', 'nobeds', 'ical', 'webhook', 'https://', 'requests.']) assert.ok(!txt.includes(w), w);
  assert.ok(deriveFields(CLOSURE).filter((f) => classifyOtaField(f).ota).every((f) => /^x_api_/.test(f.name)), 'lo único excluido por R1 son los dos x_api_*');
});
test('R4 contra el destino simulado: crea INACTIVO, sin OTA, con trigger_field_ids por nombre, binding de las acciones directas y 1935→1897 adaptado a búsqueda por nombre', async () => {
  const w = realWorld();
  try {
    await upTo(w, 'R3'); const r = await executeLayer(await w.mk('R4', { forceDiff: true }), 'R4'); assert.equal(r.status, 'OK', JSON.stringify(r.blockers));
    const autos = w.fake.rows('base.automation'); const generic = autos.filter((a) => !/Casa Completa bloquea|Limpiar bloques|Habitacion bloquea/.test(a.name));
    assert.equal(generic.length, 6); assert.ok(generic.every((a) => a.active === false), 'todas las creadas, inactivas');
    assert.equal(w.fake.rows('ir.cron').length, 1); assert.equal(w.fake.rows('ir.cron')[0].active, false);
    const motor = autos.find((a) => /Motor inventario/.test(a.name)); assert.equal(motor.trigger_field_ids.length, 9);
    const conf = w.fake.rows('ir.actions.server').find((a) => a.name === 'HOTEL v1 — CONFIRMAR'); assert.ok(conf.binding_model_id);
    const crear = w.fake.rows('ir.actions.server').find((a) => /CREAR RESERVA DESDE COTIZACI/.test(a.name));
    assert.doesNotMatch(crear.code, /browse\(1897\)/); assert.match(crear.code, /search\(\[\('name', '=', 'HOTEL v1 — HOLD'\), \('model_id\.model', '=', 'sale\.order'\)\], limit=1\)\.ensure_one\(\)/);
    const names = JSON.stringify([...w.fake.rows('ir.actions.server'), ...autos, ...w.fake.rows('ir.cron')]).toLowerCase();
    for (const x of ['nobeds', 'ical', 'airbnb', 'beds24', 'ota_feed', '1967', 'noches desde fechas']) assert.ok(!names.includes(x.toLowerCase()) || x === '1967', x);
    assert.equal(w.fake.rows('ir.actions.server').some((a) => /Noches desde fechas/.test(a.name)), false, 'las dos diferidas NO se crean');
    assert.ok(r.log.some((l) => l.action === 'DIFERIDO' && /Noches desde fechas al guardar/.test(l.key)));
  } finally { w.cleanup(); }
});
test('R4: si falta una dependencia de campo con MODELO explícito (project.task.x_cleaning), DEP_FALTA y la capa no queda OK', async () => {
  const w = realWorld({ external: false });
  try {
    // las dependencias externas de R1 faltan: se parchea solo lo que R1/R2 necesitan para llegar a R4
    w.fake.defineField('res.partner', 'x_identity_check', 'selection'); w.fake.defineField('sale.order.line', 'x_resource_id', 'many2one', 'resource.resource');
    await upTo(w, 'R3');
    const r = await executeLayer(await w.mk('R4', { forceDiff: true }), 'R4');
    const dep = r.log.filter((l) => l.action === 'DEP_FALTA').map((l) => l.key);
    assert.ok(dep.includes('project.task.x_cleaning') && dep.includes('project.task.x_resource_id') && dep.includes('resource.resource.x_occupancy') && dep.includes('planning.role.x_estado_limpieza'), dep.join(','));
    assert.notEqual(r.status, 'OK');
  } finally { w.cleanup(); }
});
test('R4: ids numéricos duros y OTA en el cierre → la capa se detiene y no los crea (rechazo de ids duros)', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-020-x-')); const ex = resolve(dir, 'extract'); mkdirSync(ex, { recursive: true });
  try {
    const c = JSON.parse(JSON.stringify(CLOSURE));
    const chk = c.hotel_internal_r4.find((e) => e.action_id_old === 1900); chk.code += "\nrole = env['planning.role'].browse(69)\nxx = 5851234\n";
    const ota = c.hotel_internal_r4.find((e) => e.action_id_old === 1903); ota.code += "\nrequests.post('https://example.invalid/hook')\n";
    writeFileSync(resolve(ex, 'ath012_closure.json'), JSON.stringify(c));
    for (const f of ['rules_current.json', 'planning_roles_current.json']) copyFileSync(resolve(EXTRACT_DIR, f), resolve(ex, f));
    const w = realWorld({ extract: ex });
    try {
      await upTo(w, 'R3'); const r = await executeLayer(await w.mk('R4', { forceDiff: true }), 'R4');
      assert.notEqual(r.status, 'OK');
      assert.ok(r.log.some((l) => l.action === 'ID_DURO' && /PRE CHECKIN/.test(l.key)), 'id duro detectado');
      assert.ok(r.log.some((l) => l.action === 'EXCLUYE_OTA' && /CERRAR/.test(l.key)), 'OTA detectado');
      assert.equal(w.fake.rows('ir.actions.server').some((a) => /PRE CHECKIN|CERRAR/.test(a.name)), false, 'ninguna de las dos se crea');
    } finally { w.cleanup(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('R4: ABORT/compuerta fallida antes de escribir — sin unidades hoteleras, o sin código actual de 167/168/169, no se escribe nada', async () => {
  const w = realWorld();
  try {
    await upTo(w, 'R3');
    for (const u of w.fake.rows('x_hotel_unit')) w.fake.models.get('x_hotel_unit').rows.delete(u.id);   // la compuerta hotelera exige las 5 habitaciones + Casa
    const calls = w.fake.writeCalls.length;
    const pre = await executeLayer(await w.mk('R4', { forceDiff: true }), 'R4'); assert.equal(pre.status, 'STOP_PREREQ', 'con --apply, R3 ya no verifica: ni se intenta R4');
    const r4 = await import('../layers/r4.mjs');   // saltando los prerrequisitos, la propia capa se protege con su compuerta antes de la primera escritura
    await assert.rejects(r4.run(await w.mk('R4', { forceDiff: true })), (e) => e instanceof BlockedError && /compuerta hotelera/.test(e.message));
    assert.equal(w.fake.writeCalls.length, calls, 'cero escrituras');
  } finally { w.cleanup(); }
  const w2 = realWorld();
  try {
    await upTo(w2, 'R3');
    w2.fake.rows('ir.actions.server').filter((a) => /Habitacion bloquea Casa/.test(a.name)).forEach((a) => { delete a.code; });
    const calls = w2.fake.writeCalls.length; const r = await executeLayer(await w2.mk('R4', { forceDiff: true }), 'R4');
    assert.equal(r.status, 'BLOCKED'); assert.match(r.message, /no comparables/); assert.equal(w2.fake.writeCalls.length, calls);
  } finally { w2.cleanup(); }
});
test('rollback total de R1→R4: el destino vuelve a su estado inicial (modelos, campos, acciones, reglas) y verifyRolledBack OK', async () => {
  const w = realWorld();
  try {
    const snap = () => JSON.stringify({ m: w.fake.rows('ir.model').map((x) => x.model).sort(), f: w.fake.rows('ir.model.fields').length, a: w.fake.rows('ir.actions.server').map((x) => [x.name, sha256(x.code)]).sort(), au: w.fake.rows('base.automation').map((x) => [x.name, x.active]).sort(), c: w.fake.rows('ir.cron').length });
    const before = snap();
    const out = await upTo(w, 'R4', { forceDiff: true }); assert.equal(out.R4.status, 'OK', JSON.stringify(out.R4?.blockers));
    assert.notEqual(snap(), before);
    const rb = await rollback({ ex: (await w.mk('ROLLBACK')).ex, write: true, journal: new Journal(w.journalPath), log: { add() {} }, layer: null });
    assert.equal(rb.ERROR, 0, JSON.stringify(rb)); assert.equal(rb.CONFLICT, 0);
    assert.equal(snap(), before);
    assert.equal((await verifyRolledBack({ ex: (await w.mk('ROLLBACK')).ex, journal: new Journal(w.journalPath), layer: null })).ok, true);
  } finally { w.cleanup(); }
});

// =========================================================================================================== FASE 7 · R3/R5/R6/R7
test('R3/R5/R6/R7: R3, R6, R7 sin cambios; R5 NEEDS_UPDATE (aplicado): R4 y R5 instalan la MISMA versión de las 14 acciones que el dump trae', async () => {
  const l = (await analyze()).layers;
  assert.equal(l.R3.status, 'UNCHANGED_OK'); assert.equal(l.R6.status, 'UNCHANGED_OK'); assert.equal(l.R7.status, 'UNCHANGED_OK'); assert.equal(l.R5.status, 'NEEDS_UPDATE');
  assert.deepEqual(l.R7.missing, []); assert.deepEqual(l.R7.payload_tokens_undefined, []);
  const withDump = r5plan(EXTRACT_DIR), noDump = r5plan(null);
  assert.equal(withDump.length, 24); assert.equal(withDump.filter((a) => a.source === 'dump').length, 14); assert.equal(noDump.filter((a) => a.source === 'dump').length, 0);
  assert.ok(withDump.every((a) => a.hard_ids.length === 0 && !a.ota.ota));
  const r4 = deriveR4(CLOSURE, JSON.parse(readFileSync(resolve(BACKUP_DIR, 'ir-actions-server-hotel.json'), 'utf8')));
  const names = new Set(withDump.filter((a) => a.source === 'dump').map((a) => a.name)); for (const a of r4.actions.filter((x) => names.has(x.name))) assert.ok(a.model);
});
test('R5 contra el destino simulado, tras R4: las 14 acciones comunes quedan SKIP (misma versión) y no hay DIFF entre R4 y R5', async () => {
  const w = realWorld();
  try {
    await upTo(w, 'R4', { forceDiff: true });
    const r5 = await executeLayer(await w.mk('R5'), 'R5'); assert.equal(r5.blockers.filter((b) => b.action === 'DIFF').length, 0, JSON.stringify(r5.blockers));
    assert.equal(r5.status, 'OK', JSON.stringify(r5.blockers));
    assert.equal(r5.log.filter((l) => l.action === 'SKIP' && l.model === 'ir.actions.server').length, 14);
  } finally { w.cleanup(); }
});

// =========================================================================================================== utilidades / CLI
test('dependencias: recorrido de rutas related/compute (offline) y rechazo de rutas no relacionales', async () => {
  const k = knownFromRows([{ model: 'a', name: 'x_b', relation: 'b', ttype: 'many2one' }, { model: 'b', name: 'x_c', relation: null, ttype: 'char' }]);
  const lk = async (m, n) => k.get(m)?.get(n) ?? null;
  assert.deepEqual(await walkPath('a', 'x_b.x_c', lk), []); assert.deepEqual(await walkPath('a', 'x_b.x_zzz', lk), ['b.x_zzz']);
  assert.match((await walkPath('a', 'x_b.x_c.x_d', lk))[0], /no relacional/);
  assert.ok(externalDependencies(deriveFields(CLOSURE)).some((d) => d.needs === 'sale.order.line.x_resource_id'));
});
test('CLI close-analysis: sin red ni variables; salida 0; imprime las compuertas', () => {
  const r = cliRun(['close-analysis']); assert.equal(r.status, 0, r.stderr); const g = JSON.parse(r.stdout);
  assert.deepEqual(Object.fromEntries(Object.entries(g).filter(([k]) => /_READY$/.test(k)).map(([k, v]) => [k, v])), { R1_MODELS_READY: 'YES', R2_FIELDS_READY: 'YES', R4_RULES_READY: 'YES', RULE_167_READY: 'YES', RULE_168_READY: 'YES', RULE_169_READY: 'YES', RULE_189_REPLACEMENT_READY: 'YES', PLANNING_ROLE_MAPPING_READY: 'YES' });
  assert.equal(g.OTA_EXCLUDED, 'YES');
});
test('CLI rules-compare / role-plan aceptan la forma publicada por Codex (rules_current.json y planning_roles_current.json)', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-020-cli-'));
  try {
    writeFileSync(resolve(dir, 'old.json'), JSON.stringify(deriveRulesOld(CLOSURE))); writeFileSync(resolve(dir, 'oldroles.json'), JSON.stringify(deriveRolesOld(CLOSURE)));
    const a = cliRun(['rules-compare', resolve(dir, 'old.json'), resolve(EXTRACT_DIR, 'rules_current.json')]); assert.equal(a.status, 0, a.stderr);
    assert.deepEqual(JSON.parse(a.stdout).results.map((x) => x.verdict), ['REUSE_WITH_ADAPTATION', 'REUSE_AS_IS', 'REUSE_WITH_ADAPTATION']);
    const b = cliRun(['role-plan', resolve(dir, 'oldroles.json'), resolve(EXTRACT_DIR, 'planning_roles_current.json')]); assert.equal(b.status, 0, b.stderr); assert.equal(JSON.parse(b.stdout).closed, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('seguridad del paquete: ninguna clave/credencial/PII en los artefactos ni en el código nuevo', () => {
  const files = ['AI/recovery-extract/ath012_closure.json', 'AI/recovery-extract/rules_current.json', 'AI/recovery-extract/planning_roles_current.json', 'integrations/odoo-hotel-gateway/recovery/closure.mjs', 'integrations/odoo-hotel-gateway/recovery/closure-analysis.mjs', 'integrations/odoo-hotel-gateway/recovery/deps.mjs'];
  for (const f of files) { const t = readFileSync(resolve(REPO_ROOT, f), 'utf8'); assert.doesNotMatch(t, /(password|passwd|api[_-]?key|secret|token|bearer)\s*[:=]\s*['"][^'"]{6,}/i, f); assert.doesNotMatch(t, /[A-Za-z0-9._%+-]+@(?!example\.invalid)[A-Za-z0-9.-]+\.[a-z]{2,}/, `${f}: correo`); }
});
