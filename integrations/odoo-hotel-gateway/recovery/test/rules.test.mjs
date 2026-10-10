// ATH-STAGING-RECOVERY-016 — reglas protegidas 167/168/169, planning.role y compuerta/reemplazo de la 189. Sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { FakeOdoo } from './fake-odoo.mjs';
import { buildSyntheticExtract, seedProtectedRules, RULES_OLD } from './synthetic-extract.mjs';
import { TARGET_DB, loadRecoveryConfig, readBackup, m2oName } from '../recovery-lib.mjs';
import { makeCtx } from '../connect.mjs';
import { ORDER, executeLayer } from '../steps.mjs';
import { rollback, Journal } from '../engine.mjs';
import { PROTECTED_RULES, compareRule, compareAll, canonCode, canonDomain, skeleton } from '../rules-compare.mjs';
import { planRoleMapping, readCurrentRoles, ROLE_FIELDS, READONLY_ROLE_QUERY } from '../planning-role.mjs';
import { hotelLogicGate, replacement189Status } from '../hotel-gate.mjs';

const ENV = { RECOVERY_TARGET_DB: TARGET_DB, ODOO_BASE_URL: `https://${TARGET_DB}.odoo.com`, ODOO_TECHNICAL_USER: 'u', ODOO_TECHNICAL_SECRET: 's', RECOVERY_ANGELA_EMAIL: 'recepcion.prueba@example.invalid' };
function world({ rulesMode = 'same', skipRoles = false } = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-rules-'));
  const extractDir = resolve(dir, 'extract'); buildSyntheticExtract(extractDir);
  if (skipRoles) rmSync(resolve(extractDir, 'planning_roles.json'));
  const fake = new FakeOdoo(); seedProtectedRules(fake, rulesMode);
  const pv = (name) => fake.seed('ir.ui.view', { name, model: 'sale.order', mode: 'primary', priority: 16, arch: '<x/>', active: true });
  for (const [mod, xid, name] of [['sale', 'sale_order_view_kanban', 'sale.order.kanban'], ['sale', 'view_order_form', 'sale.order.form']]) fake.seed('ir.model.data', { module: mod, name: xid, model: 'ir.ui.view', res_id: pv(name) });
  pv('sale.order.search.inherit.quotation');
  for (const u of readBackup('master-data-x_hotel_unit.json').filter((x) => x.x_property_id?.[1] === 'HOTEL ATHERON SUITE')) {
    fake.seed('resource.resource', { name: m2oName(u.x_resource_id) }); fake.seed('planning.role', { name: m2oName(u.x_role_id) });
    const code = (m2oName(u.x_product_tmpl_id).match(/^\[([^\]]+)\]/) || [])[1]; fake.seed('product.template', { name: m2oName(u.x_product_tmpl_id), default_code: code });
  }
  const cfg = loadRecoveryConfig(ENV); const journalPath = resolve(dir, 'journal.jsonl');
  const mk = (layer, { write = true, forceDiff = false } = {}) => makeCtx({ transport: fake.transport(), cfg, layer, write, args: { forceDiff }, allowDelete: layer === 'ROLLBACK', journalPath, extractDir, env: ENV });
  return { fake, mk, dir, extractDir, journalPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
async function upTo(w, last, opts) { const out = {}; for (const n of ORDER) { out[n] = await executeLayer(await w.mk(n, opts), n); if (n === last || out[n].status !== 'OK') break; } return out; }
const protRows = (w) => JSON.stringify([...w.fake.rows('base.automation'), ...w.fake.rows('ir.actions.server').filter((a) => /SYNTH regla/.test(a.name))].filter((r) => /Casa Completa bloquea|Limpiar bloques|Habitacion bloquea|SYNTH regla/.test(r.name)));

// ---------------- comparador ----------------
const OLD = RULES_OLD[0];
const cur = (o = {}) => ({ name: OLD.name, model: 'planning.slot', exists: true, trigger: OLD.trigger, filter_domain: OLD.filter_domain, filter_pre_domain: false, code: OLD.code, ...o });
test('comparador: REUSE_AS_IS ignora comentarios, líneas vacías, espacios finales y estilo de comillas del domain', () => {
  assert.equal(compareRule(OLD, cur()).verdict, 'REUSE_AS_IS');
  assert.equal(compareRule(OLD, cur({ code: '\n# otro comentario\n' + OLD.code.replace('# SINTETICO', '# nuevo texto') + '   \n', filter_domain: `[ ("x_bloqueo_ref", "=", False), ]` })).verdict, 'REUSE_AS_IS');
});
test('comparador: REUSE_WITH_ADAPTATION cuando solo cambian ids duros o referencias entre acciones', () => {
  assert.equal(compareRule(OLD, cur({ code: OLD.code.replace('browse(48211)', 'browse(77777)') })).verdict, 'REUSE_WITH_ADAPTATION');
  const a = { ...OLD, code: "r = env['ir.actions.server'].sudo().browse(1914)\n" };
  const b = cur({ code: "r = env['ir.actions.server'].sudo().search([('name', '=', 'X'), ('model_id.model', '=', 'm')], limit=1).ensure_one()\n" });
  assert.equal(compareRule(a, b).verdict, 'REUSE_WITH_ADAPTATION');
});
test('comparador: REPLACE_REQUIRED si cambia el disparador, el domain, el pre-domain o la estructura del código', () => {
  assert.equal(compareRule(OLD, cur({ trigger: 'on_write' })).verdict, 'REPLACE_REQUIRED');
  assert.equal(compareRule(OLD, cur({ filter_domain: "[('x_bloqueo_ref','!=',False)]" })).verdict, 'REPLACE_REQUIRED');
  assert.equal(compareRule(OLD, cur({ filter_pre_domain: "[('state','=','draft')]" })).verdict, 'REPLACE_REQUIRED');
  assert.equal(compareRule(OLD, cur({ code: OLD.code + "    raise ValueError('x')\n" })).verdict, 'REPLACE_REQUIRED');
});
test('comparador: un id de 2-3 dígitos (p. ej. browse(69) → browse(412)) NO se neutraliza: se pide revisión (conservador)', () => {
  const o = { ...OLD, code: "r = env['planning.role'].browse(69)\n" };
  assert.equal(compareRule(o, cur({ code: "r = env['planning.role'].browse(412)\n" })).verdict, 'REPLACE_REQUIRED');
});
test('comparador: un número pequeño (hora, contador) que cambia NO se trata como adaptación', () => {
  assert.equal(compareRule(OLD, cur({ code: OLD.code.replace('limit = 16', 'limit = 18') })).verdict, 'REPLACE_REQUIRED');
  const h = { ...OLD, code: "t = ' 20:00:00'\n" };
  assert.equal(compareRule(h, cur({ code: "t = ' 16:00:00'\n" })).verdict, 'REPLACE_REQUIRED');
});
test('comparador: regla ausente en el destino => REPLACE_REQUIRED (no hay versión adaptada que instalar)', () => {
  const r = compareRule(OLD, { name: OLD.name, model: 'planning.slot', exists: false });
  assert.equal(r.verdict, 'REPLACE_REQUIRED'); assert.match(r.reasons[0], /ABSENT/);
});
test('comparador: ABORT si falta lo antiguo, lo actual, o a lo actual le falta código/domain/disparador', () => {
  assert.equal(compareRule(undefined, cur()).verdict, 'ABORT');
  assert.equal(compareRule(OLD, undefined).verdict, 'ABORT');
  for (const k of ['trigger', 'filter_domain', 'filter_pre_domain', 'code']) { const c = cur(); delete c[k]; assert.equal(compareRule(OLD, c).verdict, 'ABORT', k); }
  const o = { ...OLD }; delete o.code; assert.equal(compareRule(o, cur()).verdict, 'ABORT');
});
test('compareAll: empareja por (nombre, modelo); mayMutate solo si las tres se reutilizan; ambigüedad => ABORT', () => {
  const curAll = RULES_OLD.map((r) => ({ ...r, exists: true }));
  const ok = compareAll(RULES_OLD, curAll); assert.equal(ok.overall, 'REUSE_AS_IS'); assert.equal(ok.mayMutate, true); assert.equal(ok.results.length, 3);
  assert.deepEqual(PROTECTED_RULES.map((p) => p.key), ['167', '168', '169']);
  const mixed = compareAll(RULES_OLD, curAll.map((r, i) => (i === 1 ? { ...r, trigger: 'on_write' } : r))); assert.equal(mixed.overall, 'REPLACE_REQUIRED'); assert.equal(mixed.mayMutate, false);
  const dup = compareAll(RULES_OLD, [...curAll, curAll[0]]); assert.equal(dup.mustAbort, true);
  const none = compareAll(RULES_OLD, undefined); assert.equal(none.mustAbort, true);
  assert.equal(canonDomain(false), ''); assert.equal(canonCode('# c\n\nx = 1  \n'), 'x = 1'); assert.equal(skeleton("a=12345"), 'a=N');
});

// ---------------- R4 con el comparador (Odoo falso) ----------------
test('R4: con 167/168/169 idénticas (o ya adaptadas) las REUTILIZA y no las toca; la capa queda OK', async () => {
  for (const mode of ['same', 'adapted']) {
    const w = world({ rulesMode: mode });
    try {
      const before = protRows(w);
      const r = await upTo(w, 'R4'); assert.equal(r.R4.status, 'OK', `${mode}: ${JSON.stringify(r.R4.blockers)}`);
      assert.equal(protRows(w), before, `${mode}: R4 no debe modificar 167/168/169`);
      assert.equal(r.R4.log.filter((e) => e.action === 'REUSA').length, 3);
      assert.ok(r.R4.log.some((e) => /REUSE_WITH_ADAPTATION|REUSE_AS_IS/.test(e.note ?? '')));
    } finally { w.cleanup(); }
  }
});
test('R4: si el destino difiere (código, disparador o domain) se detiene con REEMPLAZO_REQUERIDO y NO sobrescribe nada', async () => {
  for (const mode of ['different', 'trigger', 'domain']) {
    const w = world({ rulesMode: mode });
    try {
      const before = protRows(w);
      const r = await upTo(w, 'R4'); assert.equal(r.R4.status, 'PARTIAL', mode);
      assert.ok(r.R4.blockers.some((b) => b.action === 'REEMPLAZO_REQUERIDO'), mode);
      assert.equal(protRows(w), before, `${mode}: no se sobrescribe`);
      assert.ok(r.R4.verify.checks.some((c) => !c.ok && /REPLACE_REQUIRED/.test(c.name)));
    } finally { w.cleanup(); }
  }
});
test('R4: con las reglas AUSENTES en el destino no crea versiones antiguas: REEMPLAZO_REQUERIDO (ABSENT)', async () => {
  const w = world({ rulesMode: 'absent' });
  try {
    const r = await upTo(w, 'R4'); assert.equal(r.R4.status, 'PARTIAL');
    assert.equal(r.R4.blockers.filter((b) => b.action === 'REEMPLAZO_REQUERIDO').length, 3);
    assert.ok(!w.fake.rows('base.automation').some((a) => /Casa Completa bloquea|Limpiar bloques|Habitacion bloquea/.test(a.name)), 'no se instala la versión antigua');
  } finally { w.cleanup(); }
});
test('R4: si no puede comparar (regla duplicada en el destino) ABORTA ANTES de escribir nada', async () => {
  const w = world({ rulesMode: 'same' });
  try {
    await upTo(w, 'R3');
    const dup = w.fake.rows('base.automation').find((a) => /Casa Completa bloquea/.test(a.name)); w.fake.seed('base.automation', { ...dup, id: undefined });
    const writesBefore = w.fake.writeCalls.length;
    const r = await executeLayer(await w.mk('R4'), 'R4');
    assert.equal(r.status, 'BLOCKED'); assert.match(r.message, /no comparables/);
    assert.equal(w.fake.writeCalls.length, writesBefore, 'cero escrituras');
  } finally { w.cleanup(); }
});
test('R4 sin rules_old.json (definición antigua) no arranca: BLOCKED por insumo local, sin abrir conexión', async () => {
  const w = world();
  try {
    await upTo(w, 'R3');
    rmSync(resolve(w.extractDir, 'rules_old.json'));
    const before = w.fake.writeCalls.length;
    const r = await executeLayer(await w.mk('R4'), 'R4'); assert.equal(r.status, 'BLOCKED'); assert.match(r.message, /rules_old\.json/);
    assert.equal(w.fake.writeCalls.length, before);
    const { LAYERS } = await import('../steps.mjs');
    assert.throws(() => LAYERS.R4.inputs({ extractDir: w.extractDir }), /rules_old\.json/);   // y es un insumo LOCAL: la CLI sale antes de conectar
  } finally { w.cleanup(); }
});

// ---------------- compuerta hotelera y reemplazo de la 189 ----------------
test('compuerta hotelera: pasa con la base hotelera completa y falla —sin escribir— si falta un campo de planning.role', async () => {
  const w = world();
  try {
    await upTo(w, 'R3');
    const g = await hotelLogicGate((await w.mk('G', { write: false })).ex); assert.equal(g.ok, true, JSON.stringify(g.failed));
    w.fake.models.get('planning.role').fields.delete('x_casa');
    const fields = w.fake.rows('ir.model.fields').find((f) => f.model === 'planning.role' && f.name === 'x_casa'); w.fake.models.get('ir.model.fields').rows.delete(fields.id);
    const before = w.fake.writeCalls.length;
    const g2 = await hotelLogicGate((await w.mk('G', { write: false })).ex); assert.equal(g2.ok, false); assert.ok(g2.failed.some((c) => c.id === 'H3:x_casa'));
    const r = await executeLayer(await w.mk('R4'), 'R4', { skipGuard: true });
    assert.notEqual(r.status, 'OK'); assert.equal(w.fake.writeCalls.length, before);
  } finally { w.cleanup(); }
});
test('reemplazo de la 189: SIN el archivo de intención de Codex ready=false; incompleto => false; completo => true', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-189-'));
  try {
    assert.equal(replacement189Status(dir).ready, false);
    assert.match(replacement189Status(dir).missing[0], /rule189_intent\.json/);
    writeFileSync(resolve(dir, 'rule189_intent.json'), JSON.stringify([{ intent: 'x' }]));
    const s = replacement189Status(dir); assert.equal(s.ready, false); assert.ok(s.missing.some((m) => /conditions/.test(m)) && s.missing.some((m) => /source/.test(m)));
    writeFileSync(resolve(dir, 'rule189_intent.json'), JSON.stringify([{ intent: 'x', conditions: ['a'], source: 'ATH-012' }]));
    assert.equal(replacement189Status(dir).ready, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------- planning.role ----------------
const OLDROLES = [{ name: 'R1', x_casa: 'La Magia de Zipaquirá', x_is_a_room_offer: true }, { name: 'R2', x_casa: 'La Magia de Zipaquirá', x_is_a_room_offer: true }];
test('planning.role: plan puro con los seis estados', () => {
  const f = { x_casa: true, x_is_a_room_offer: true };
  const st = (cur, old = OLDROLES) => planRoleMapping(old, cur).items.map((i) => i.status);
  assert.deepEqual(st({ fields: f, roles: [{ id: 5, name: 'R1', x_casa: 'La Magia de Zipaquirá', x_is_a_room_offer: true }, { id: 6, name: 'R2', x_casa: 'La Magia de Zipaquirá', x_is_a_room_offer: true }] }), ['MATCH', 'MATCH']);
  assert.deepEqual(st({ fields: f, roles: [{ id: 5, name: 'R1', x_casa: false, x_is_a_room_offer: false }, { id: 6, name: 'R2' }] }), ['VALUES_MISSING', 'VALUES_MISSING']);
  assert.deepEqual(st({ fields: f, roles: [{ id: 5, name: 'R1', x_casa: 'OTRA', x_is_a_room_offer: true }, { id: 6, name: 'R2', x_casa: 'La Magia de Zipaquirá', x_is_a_room_offer: false }] }), ['VALUES_DIFFER', 'VALUES_MISSING']);
  assert.deepEqual(st({ fields: { x_casa: false, x_is_a_room_offer: true }, roles: [] }), ['FIELD_MISSING', 'FIELD_MISSING']);
  assert.deepEqual(st({ fields: f, roles: [{ id: 5, name: 'R1' }] }), ['VALUES_MISSING', 'ROLE_ABSENT']);
  assert.deepEqual(st({ fields: f, roles: [{ id: 5, name: 'R1' }, { id: 7, name: 'R1' }, { id: 6, name: 'R2' }] }), ['AMBIGUO', 'VALUES_MISSING']);
  assert.equal(planRoleMapping(OLDROLES, { fields: f, roles: [{ id: 5, name: 'R1' }, { id: 6, name: 'R2' }] }).closed, true, 'VALUES_MISSING se resuelve escribiendo: no bloquea');
  assert.equal(planRoleMapping(OLDROLES, { fields: f, roles: [] }).closed, false);
  assert.deepEqual(ROLE_FIELDS, ['x_casa', 'x_is_a_room_offer']);
  assert.deepEqual(READONLY_ROLE_QUERY.search_read.fields.slice(0, 3), ['name', 'x_casa', 'x_is_a_room_offer']);
});
test('planning.role: el emparejamiento es por NOMBRE; los ids no influyen', async () => {
  const w = world();
  try {
    await upTo(w, 'R2');
    const rows = w.fake.rows('planning.role'); const names = rows.map((r) => r.name);
    w.fake.models.get('planning.role').rows.clear();                     // se recrean en ORDEN INVERSO: ids totalmente distintos
    for (const n of [...names].reverse()) w.fake.seed('planning.role', { name: n });
    const cur2 = await readCurrentRoles((await w.mk('G', { write: false })).ex, names);
    assert.deepEqual(cur2.fields, { x_casa: true, x_is_a_room_offer: true });
    const plan = planRoleMapping(JSON.parse(JSON.stringify(readBackupRoles(w))), cur2);
    assert.ok(plan.items.every((i) => i.status === 'VALUES_MISSING'));
  } finally { w.cleanup(); }
});
function readBackupRoles(w) { return JSON.parse(require_('fs').readFileSync(resolve(w.extractDir, 'planning_roles.json'), 'utf8')); }
import { readFileSync } from 'node:fs';
const require_ = (m) => ({ fs: { readFileSync } })[m];

test('R3: sin valores antiguos de planning.role (planning_roles.json) queda PARTIAL con ROLE_ATTR_PENDIENTE y no inventa nada', async () => {
  const w = world({ skipRoles: true });
  try {
    const r = await upTo(w, 'R3'); assert.equal(r.R3.status, 'PARTIAL');
    assert.ok(r.R3.blockers.some((b) => b.action === 'ROLE_ATTR_PENDIENTE'));
    assert.ok(w.fake.rows('planning.role').every((x) => !x.x_casa && !x.x_is_a_room_offer));
  } finally { w.cleanup(); }
});
test('R3: escribe los valores que faltan, es idempotente, no pisa un valor distinto y se deshace', async () => {
  const w = world();
  try {
    const r = await upTo(w, 'R3'); assert.equal(r.R3.status, 'OK', JSON.stringify(r.R3.blockers));
    const rooms = w.fake.rows('planning.role').filter((x) => x.x_is_a_room_offer === true); assert.equal(rooms.length, 5);
    assert.ok(w.fake.rows('planning.role').every((x) => x.x_casa === 'La Magia de Zipaquirá'));
    const w1 = w.fake.writeCalls.length; const again = await executeLayer(await w.mk('R3'), 'R3'); assert.equal(again.status, 'OK'); assert.equal(w.fake.writeCalls.length, w1, 'segunda pasada sin escrituras');
    // un valor distinto en el destino = CONFLICTO, no se pisa
    w.fake.rows('planning.role')[0].x_casa = 'Otra casa';
    const c = await executeLayer(await w.mk('R3'), 'R3'); assert.equal(c.status, 'PARTIAL'); assert.ok(c.blockers.some((b) => b.action === 'ROLE_CONFLICTO'));
    assert.equal(w.fake.rows('planning.role')[0].x_casa, 'Otra casa');
    // con --force-diff se aplica y queda en la bitácora para poder restaurar
    const f = await executeLayer(await w.mk('R3', { forceDiff: true }), 'R3'); assert.equal(f.status, 'OK');
    assert.equal(w.fake.rows('planning.role')[0].x_casa, 'La Magia de Zipaquirá');
    const ctx = await w.mk('ROLLBACK'); const rb = await rollback({ ex: ctx.ex, write: true, journal: ctx.journal, log: ctx.log, layer: 'R3' });
    assert.equal(rb.ERROR, 0, JSON.stringify(ctx.log.entries.filter((e) => e.action === 'ERROR')));
    // el valor de ese rol lo cambió una persona DESPUÉS de que R3 lo escribiera: el rollback no lo pisa y lo reporta como conflicto
    assert.equal(rb.CONFLICT, 1);
    // la actualización forzada sí se deshace (vuelve a «Otra casa»), pero la primera escritura de R3 queda como CONFLICT: no se pisa
    assert.equal(w.fake.rows('planning.role')[0].x_casa, 'Otra casa');
    assert.ok(w.fake.rows('planning.role').slice(1).every((x) => !x.x_is_a_room_offer && !x.x_casa), 'el resto de valores escritos por R3 se restauran');
  } finally { w.cleanup(); }
});
test('R3: rol ausente o campo ausente => ROLE_AUSENTE / ROLE_CAMPO_FALTA (bloquea, no crea roles)', async () => {
  const w = world();
  try {
    await upTo(w, 'R2');
    w.fake.models.get('planning.role').rows.delete(w.fake.rows('planning.role')[0].id);
    const r = await executeLayer(await w.mk('R3'), 'R3'); assert.equal(r.status, 'PARTIAL');
    assert.ok(r.blockers.some((b) => b.action === 'ROLE_AUSENTE'));
  } finally { w.cleanup(); }
});

// ---------------- CLI offline ----------------
const RUN = resolve(new URL('../run.mjs', import.meta.url).pathname);
test('CLI rules-compare (offline): 0 reutilizable, 4 reemplazo, 3 abort', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-cli-'));
  try {
    const w = (n, d) => { const p = resolve(dir, n); writeFileSync(p, JSON.stringify(d)); return p; };
    const cur0 = RULES_OLD.map((r) => ({ ...r, exists: true }));
    const run = (c) => spawnSync('node', [RUN, 'rules-compare', w('old.json', RULES_OLD), w('cur.json', c)], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
    assert.equal(run(cur0).status, 0);
    assert.equal(run(cur0.map((r, i) => (i ? r : { ...r, trigger: 'on_write' }))).status, 4);
    assert.equal(run(cur0.map((r) => ({ name: r.name, model: r.model, exists: false }))).status, 4);   // ausentes explícitas => REPLACE_REQUIRED
    assert.equal(run([]).status, 3);                                   // lectura vacía = no se leyó nada => ABORT
    assert.equal(run([...cur0, cur0[0]]).status, 3);                   // ambigua => ABORT
    const rp = spawnSync('node', [RUN, 'role-plan', w('o.json', OLDROLES), w('c.json', { fields: { x_casa: true, x_is_a_room_offer: true }, roles: [] })], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
    assert.equal(rp.status, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
