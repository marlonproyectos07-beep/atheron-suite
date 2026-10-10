// ATH-STAGING-RECOVERY-007 — pruebas LOCALES de la mecánica del paquete (Odoo falso, extracto sintético). No prueban Odoo Enterprise 19.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { FakeOdoo } from './fake-odoo.mjs';
import { buildSyntheticExtract, seedProtectedRules } from './synthetic-extract.mjs';
import { TARGET_DB, loadRecoveryConfig, readBackup, m2oName } from '../recovery-lib.mjs';
import { makeCtx } from '../connect.mjs';
import { LAYERS, ORDER, executeLayer, verifyLayer } from '../steps.mjs';
import { rollback, verifyRolledBack, verifyApplied, Journal } from '../engine.mjs';
import { runGuard, assertGuard, GuardAbort, requireOverlapGuard, OVERLAP_GUARD_NAME } from '../guard.mjs';
import { takeSnapshot, diffSnapshots, looksSecret } from '../snapshot.mjs';
import { runQA, cleanupQA } from '../qa.mjs';

const ENV = { RECOVERY_TARGET_DB: TARGET_DB, ODOO_BASE_URL: `https://${TARGET_DB}.odoo.com`, ODOO_TECHNICAL_USER: 'u', ODOO_TECHNICAL_SECRET: 's', RECOVERY_ANGELA_EMAIL: 'recepcion.prueba@example.invalid' };

function world(fakeOpts = {}, extractOpts = {}, rulesMode = 'same') {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-rec-'));
  const extractDir = resolve(dir, 'extract'); buildSyntheticExtract(extractDir, extractOpts);
  const fake = new FakeOdoo(fakeOpts);
  seedProtectedRules(fake, rulesMode);
  // semillas del entorno nuevo que NO crea la recuperación: vistas padre, recursos/roles/producto de Planning
  const pv = (name) => fake.seed('ir.ui.view', { name, model: 'sale.order', mode: 'primary', priority: 16, arch: '<x/>', active: true });
  for (const [mod, xid, name] of [['sale', 'sale_order_view_kanban', 'sale.order.kanban'], ['sale', 'view_order_form', 'sale.order.form']]) fake.seed('ir.model.data', { module: mod, name: xid, model: 'ir.ui.view', res_id: pv(name) });
  pv('sale.order.search.inherit.quotation');
  for (const u of readBackup('master-data-x_hotel_unit.json').filter((x) => x.x_property_id?.[1] === 'HOTEL ATHERON SUITE')) {
    fake.seed('resource.resource', { name: m2oName(u.x_resource_id) }); fake.seed('planning.role', { name: m2oName(u.x_role_id) });
    const code = (m2oName(u.x_product_tmpl_id).match(/^\[([^\]]+)\]/) || [])[1]; fake.seed('product.template', { name: m2oName(u.x_product_tmpl_id), default_code: code });
  }
  const cfg = loadRecoveryConfig(ENV);
  const journalPath = resolve(dir, 'journal.jsonl');
  const mk = (layer, { write = true, forceDiff = false, env = ENV } = {}) => makeCtx({ transport: fake.transport(), cfg, layer, write, args: { forceDiff }, allowDelete: layer === 'ROLLBACK', journalPath, extractDir, env });
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return { fake, mk, dir, journalPath, cleanup, cfg };
}
async function applyAll(w, { upto = 'R7' } = {}) {
  const res = {};
  for (const n of ORDER) { const ctx = await w.mk(n); res[n] = await executeLayer(ctx, n); if (res[n].status !== 'OK') break; if (n === upto) break; }
  return res;
}
const verifyAll = async (w) => { const ctx = await w.mk('V', { write: false }); const out = {}; for (const n of ORDER) out[n] = (await verifyLayer(ctx, n)).ok; return out; };
const rb = async (w, layer = null, write = true) => { const ctx = await w.mk('ROLLBACK', { write }); return rollback({ ex: ctx.ex, write, journal: ctx.journal, log: ctx.log, layer }); };

test('R1–R7 se aplican en orden, cada una con su verify en OK', async () => {
  const w = world();
  try {
    const res = await applyAll(w);
    for (const n of ORDER) assert.equal(res[n]?.status, 'OK', `${n}: ${JSON.stringify(res[n]?.blockers?.slice(0, 3) ?? res[n])}`);
    assert.deepEqual(Object.values(await verifyAll(w)), ORDER.map(() => true));
  } finally { w.cleanup(); }
});

test('DRY-RUN no escribe nada, ni siquiera con todo aplicado', async () => {
  const w = world();
  try {
    await applyAll(w);
    const before = w.fake.writeCalls.length;
    for (const n of ORDER) { const r = await executeLayer(await w.mk(n, { write: false }), n); assert.equal(r.status, 'DRY_RUN'); }
    assert.equal(w.fake.writeCalls.length, before);
  } finally { w.cleanup(); }
});

test('IDEMPOTENCIA: reaplicar no crea nada nuevo', async () => {
  const w = world();
  try {
    await applyAll(w);
    const creates = () => new Journal(w.journalPath).read().filter((e) => e.op === 'CREATE').length;
    const n1 = creates(), rows1 = w.fake.rows('ir.model.fields').length + w.fake.rows('x_hotel_unit').length + w.fake.rows('ir.actions.server').length;
    const res = await applyAll(w);
    assert.equal(res.R7.status, 'OK');
    assert.equal(creates(), n1);
    assert.equal(w.fake.rows('ir.model.fields').length + w.fake.rows('x_hotel_unit').length + w.fake.rows('ir.actions.server').length, rows1);
  } finally { w.cleanup(); }
});

test('SECUENCIA PEDIDA: apply -> verify -> rollback -> verify rollback -> re-apply -> verify, y el estado PRE se recupera exacto', async () => {
  const w = world();
  try {
    const readCtx = await w.mk('S', { write: false });
    const pre = resolve(w.dir, 'snap-pre'); await takeSnapshot({ ex: readCtx.ex, cfg: w.cfg, dir: pre, tag: 'pre' });
    // 1 apply
    const r1 = await applyAll(w); assert.equal(r1.R7.status, 'OK');
    // 2 verify
    assert.ok(Object.values(await verifyAll(w)).every(Boolean));
    const mid = resolve(w.dir, 'snap-mid'); await takeSnapshot({ ex: readCtx.ex, cfg: w.cfg, dir: mid, tag: 'post' });
    assert.equal(diffSnapshots(pre, mid).identical, false);
    // 3 rollback (todo)
    const rbRes = await rb(w);
    assert.equal(rbRes.ERROR, 0, JSON.stringify(rbRes)); assert.equal(rbRes.CONFLICT, 0);
    // 4 verify rollback
    const rctx = await w.mk('ROLLBACK', { write: false });
    const vr = await verifyRolledBack({ ex: rctx.ex, journal: rctx.journal });
    assert.ok(vr.ok, JSON.stringify(vr.checks.filter((c) => !c.ok).slice(0, 5)));
    const post = resolve(w.dir, 'snap-after-rb'); await takeSnapshot({ ex: readCtx.ex, cfg: w.cfg, dir: post, tag: 'post' });
    const d = diffSnapshots(pre, post);
    assert.equal(d.identical, true, JSON.stringify(Object.fromEntries(Object.entries(d.models).filter(([, v]) => v.added.length || v.removed.length || v.changed.length))));
    assert.equal(w.fake.rows('x_hotel_unit').length, 0);
    assert.equal(w.fake.models.has('x_hotel_unit'), false);
    // 5 re-apply  6 verify
    const r2 = await applyAll(w); assert.equal(r2.R7.status, 'OK');
    assert.ok(Object.values(await verifyAll(w)).every(Boolean));
  } finally { w.cleanup(); }
});

test('ROLLBACK idempotente: una segunda ejecución no hace nada y no falla', async () => {
  const w = world();
  try {
    await applyAll(w); await rb(w);
    const again = await rb(w);
    assert.deepEqual([again.DELETED, again.RESTORED, again.ERROR, again.CONFLICT], [0, 0, 0, 0]);
  } finally { w.cleanup(); }
});

test('ROLLBACK por capa: deshacer R7 deja R1–R6 intactos', async () => {
  const w = world();
  try {
    await applyAll(w);
    const r = await rb(w, 'R7'); assert.ok(r.DELETED > 0);
    const v = await verifyAll(w);
    assert.equal(v.R7, false);
    for (const n of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']) assert.equal(v[n], true, n);
  } finally { w.cleanup(); }
});

test('FALLO A MITAD DE CAPA: queda rastro exacto, se deshace y se puede reanudar', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R2' });
    let n = 0; w.fake.hooks.create = (model) => { if (model === 'x_hotel_unit' && ++n === 3) throw new Error('fallo inyectado'); };
    const ctx = await w.mk('R3');
    await assert.rejects(() => executeLayer(ctx, 'R3'), /fallo inyectado/);
    assert.equal(w.fake.rows('x_hotel_unit').length, 2);
    const pend = new Journal(w.journalPath).pending({ layer: 'R3' });
    assert.ok(pend.some((e) => e.op === 'INTENT' && e.model === 'x_hotel_unit'), 'el INTENT sin CREATE debe quedar en la bitácora');
    // rollback de la capa parcial
    const r = await rb(w, 'R3'); assert.equal(r.ERROR, 0); assert.equal(w.fake.rows('x_hotel_unit').length, 0);
    // reanudar
    w.fake.hooks.create = null;
    const again = await executeLayer(await w.mk('R3'), 'R3'); assert.equal(again.status, 'OK');
  } finally { w.cleanup(); }
});

test('FALLO A MITAD + REANUDAR SIN ROLLBACK: lo ya creado se omite, no se duplica', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R2' });
    let n = 0; w.fake.hooks.create = (model) => { if (model === 'x_hotel_unit' && ++n === 3) throw new Error('fallo inyectado'); };
    await assert.rejects(() => executeLayer(await_ctx(w, 'R3'), 'R3'));
    w.fake.hooks.create = null;
    const again = await executeLayer(await w.mk('R3'), 'R3'); assert.equal(again.status, 'OK');
    assert.equal(w.fake.rows('x_hotel_unit').length, 6);
  } finally { w.cleanup(); }
});
function await_ctx(w, layer) { return { then: undefined, ...{} } && (async () => w.mk(layer))(); }

test('LO PREEXISTENTE se respeta: no se sobrescribe y el rollback jamás lo borra', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R2' });
    const propId = w.fake.seed('x_hotel_property', { x_name: 'HOTEL ATHERON SUITE', x_city: 'Preexistente' });
    const r = await executeLayer(await w.mk('R3'), 'R3');
    assert.equal(r.status, 'PARTIAL'); // x_city difiere: se informa DIFF, no se pisa
    assert.equal(w.fake.rows('x_hotel_property')[0].x_city, 'Preexistente');
    assert.ok(r.log.some((e) => e.action === 'DIFF' && e.model === 'x_hotel_property'));
    await rb(w, 'R3');
    assert.ok(w.fake.rows('x_hotel_property').some((x) => x.id === propId), 'la propiedad preexistente debe seguir ahí');
    assert.equal(w.fake.rows('x_hotel_unit').length, 0);
  } finally { w.cleanup(); }
});

test('UPDATE con --force-diff se restaura; si alguien cambió el valor después, CONFLICT y no se pisa', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R2' });
    const propId = w.fake.seed('x_hotel_property', { x_name: 'HOTEL ATHERON SUITE', x_city: 'Preexistente' });
    await executeLayer(await w.mk('R3', { forceDiff: true }), 'R3');
    assert.notEqual(w.fake.rows('x_hotel_property').find((x) => x.id === propId).x_city, 'Preexistente');
    // cambio manual posterior
    w.fake.rows('x_hotel_property').find((x) => x.id === propId).x_city = 'Cambio manual';
    const r = await rb(w, 'R3');
    assert.ok(r.CONFLICT >= 1);
    assert.equal(w.fake.rows('x_hotel_property').find((x) => x.id === propId).x_city, 'Cambio manual');
  } finally { w.cleanup(); }
});

test('UPDATE sin cambio posterior se restaura al valor previo exacto (incluye many2many como comandos)', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R2' });
    const propId = w.fake.seed('x_hotel_property', { x_name: 'HOTEL ATHERON SUITE', x_city: 'Preexistente' });
    await executeLayer(await w.mk('R3', { forceDiff: true }), 'R3');
    const r = await rb(w, 'R3'); assert.equal(r.ERROR, 0); assert.equal(r.CONFLICT, 0);
    assert.equal(w.fake.rows('x_hotel_property').find((x) => x.id === propId).x_city, 'Preexistente');
  } finally { w.cleanup(); }
});

test('STOP: no se avanza si una capa previa no verifica', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R3' });
    w.fake.rows('x_hotel_unit').find((u) => u.x_name === '301').x_name = 'roto'; // rompe el verify de R3
    const r = await executeLayer(await w.mk('R4'), 'R4');
    assert.equal(r.status, 'STOP_PREREQ'); assert.equal(r.layer, 'R3');
  } finally { w.cleanup(); }
});

test('sin extracto del dump: R1 y R4 quedan BLOCKED y no escriben', async () => {
  const w = world();
  try {
    const ctx = await w.mk('R1'); ctx.extractDir = resolve(w.dir, 'no-existe');
    const r = await executeLayer(ctx, 'R1'); assert.equal(r.status, 'BLOCKED'); assert.match(r.message, /FALTA AI\/recovery-extract|recovery-extract|no-existe/);
    assert.equal(w.fake.writeCalls.length, 0);
  } finally { w.cleanup(); }
});

test('R2 sin enriquecimiento del dump: exactamente 4 campos BLOQUEA (nada se inventa)', async () => {
  const { plan } = await import('../layers/r2.mjs');
  const p = plan({ extractDir: '/ruta/que/no/existe' });
  assert.equal(p.items.length, 80); assert.equal(p.standard_excluded.length, 17);
  assert.deepEqual(p.items.filter((i) => i.issues.length).map((i) => i.name).sort(), ['x_guest_line_ids', 'x_hotel_payment_ids', 'x_regimen_cliente', 'x_tipo_persona_cliente']);
});

test('R2: la selección del respaldo se interpreta bien en los 5 campos con opciones', async () => {
  const { plan } = await import('../layers/r2.mjs');
  const p = plan({ extractDir: '/ruta/que/no/existe' });
  const status = p.items.find((i) => i.name === 'x_reservation_status');
  assert.deepEqual(status.selection.map((s) => s.value), ['draft', 'opcion', 'hold', 'confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed', 'cancelled', 'no_show']);
  for (const i of p.items.filter((x) => x.ttype === 'selection' && !x.issues.length)) assert.ok(i.selection.length >= 2, i.name);
});

test('R5: 24 acciones, código idéntico al respaldo, sin ids viejos', async () => {
  const { plan, MODEL_BY_DISPLAY } = await import('../layers/r5.mjs');
  const p = plan();
  assert.equal(p.length, 24);
  assert.ok(p.every((a) => a.model && a.old_ids.length === 0));
  assert.ok(p.every((a) => Object.values(MODEL_BY_DISPLAY).includes(a.model)));
  assert.ok(!p.some((a) => a.name.startsWith('ROLLBACK COPY')));
});

test('R6: grupos por XMLID, nunca admin/técnico; sin correo => BLOCKED; el correo no sale en la bitácora', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R5' });
    const noMail = { ...ENV }; delete noMail.RECOVERY_ANGELA_EMAIL;
    const b = await executeLayer(await w.mk('R6', { env: noMail }), 'R6'); assert.equal(b.status, 'BLOCKED');
    const ok = await executeLayer(await w.mk('R6'), 'R6'); assert.equal(ok.status, 'OK');
    const u = w.fake.rows('res.users')[0];
    const names = new Map(w.fake.rows('res.groups').map((g) => [g.id, g.name]));
    assert.deepEqual(u.groups_id.map((g) => names.get(g)).sort(), ['Internal User', 'User: All Documents']);
    assert.ok(!readFileSync(w.journalPath, 'utf8').includes('example.invalid'), 'el correo no debe quedar en la bitácora');
  } finally { w.cleanup(); }
});

test('R6 en Odoo con res.users.group_ids (renombrado): se detecta, no se supone', async () => {
  const w = world({ groupsField: 'group_ids' });
  try {
    await applyAll(w, { upto: 'R5' });
    const r = await executeLayer(await w.mk('R6'), 'R6'); assert.equal(r.status, 'OK');
    assert.ok(w.fake.rows('res.users')[0].group_ids.length === 2);
  } finally { w.cleanup(); }
});

test('R7: si falta una acción de R5, la vista del formulario NO se crea (BLOQUEA)', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R6' });
    const act = w.fake.rows('ir.actions.server').find((a) => a.name === 'HOTEL v1 — CONFIRMAR');
    w.fake.models.get('ir.actions.server').rows.delete(act.id);
    const r = await executeLayer(await w.mk('R7'), 'R7', { skipGuard: true });
    assert.notEqual(r.status, 'OK');
  } finally { w.cleanup(); }
});

// ---------------- guardia ----------------
test('GUARDIA OK en un entorno sano y neutralizado', async () => {
  const w = world();
  try { const g = await runGuard({ ex: (await w.mk('G', { write: false })).ex, cfg: w.cfg, env: ENV }); assert.equal(g.ok, true, JSON.stringify(g.failed)); } finally { w.cleanup(); }
});
test('GUARDIA avisa (G8) cuando faltan recursos/roles/productos de Planning que R3 necesita', async () => {
  const w = world();
  try {
    await applyAll(w, { upto: 'R2' });
    w.fake.models.get('planning.role').rows.clear();
    const g = await runGuard({ ex: (await w.mk('G', { write: false })).ex, cfg: w.cfg, env: ENV });
    assert.ok(g.warnings.some((c) => c.id === 'G8' && /rol 201/.test(c.detail)));
    const r3 = await executeLayer(await w.mk('R3'), 'R3', { skipGuard: true });
    assert.equal(r3.status, 'PARTIAL'); // FALTA rol -> STOP, no se declara OK
    assert.ok(r3.blockers.some((b) => b.action === 'FALTA' && b.model === 'planning.role'));
  } finally { w.cleanup(); }
});
test('GUARDIA aborta si el servidor parece producción', async () => {
  const w = world({ baseUrl: 'https://atheron1.odoo.com' });
  try { const g = await runGuard({ ex: (await w.mk('G', { write: false })).ex, cfg: w.cfg, env: ENV }); assert.equal(g.ok, false); assert.ok(g.failed.some((c) => c.id === 'G3')); } finally { w.cleanup(); }
});
test('GUARDIA aborta si el entorno no está neutralizado, salvo atestación humana explícita (que deja ADVERTENCIA)', async () => {
  const w = world({ neutralized: false });
  try {
    const ex = (await w.mk('G', { write: false })).ex;
    const g = await runGuard({ ex, cfg: w.cfg, env: ENV }); assert.equal(g.ok, false); assert.ok(g.failed.some((c) => c.id === 'G4'));
    const g2 = await runGuard({ ex, cfg: w.cfg, env: { ...ENV, RECOVERY_TEST_ENV_ATTESTATION: TARGET_DB } }); assert.equal(g2.ok, true); assert.ok(g2.checks.some((c) => c.id === 'G4b'));
    const g3 = await runGuard({ ex, cfg: w.cfg, env: { ...ENV, RECOVERY_TEST_ENV_ATTESTATION: 'otra-base' } }); assert.equal(g3.ok, false);
    await assert.rejects(() => assertGuard({ ex, cfg: w.cfg, env: ENV }), GuardAbort);
  } finally { w.cleanup(); }
});
test('GUARDIA aborta si falta un módulo o un campo del contrato', async () => {
  const w = world({ modules: ['sale_management', 'base_automation'] }); // sin planning
  try { const g = await runGuard({ ex: (await w.mk('G', { write: false })).ex, cfg: w.cfg, env: ENV }); assert.ok(g.failed.some((c) => c.id === 'G5:planning')); } finally { w.cleanup(); }
  const w2 = world();
  try { w2.fake.models.get('base.automation').fields.delete('action_server_ids'); const g = await runGuard({ ex: (await w2.mk('G', { write: false })).ex, cfg: w2.cfg, env: ENV }); assert.ok(g.failed.some((c) => c.id === 'G6:base.automation')); } finally { w2.cleanup(); }
});
test('GUARDIA falla cerrado si el parámetro del servidor no se puede leer', async () => {
  const w = world();
  try {
    const ex = (await w.mk('G', { write: false })).ex;
    const failing = (model, method, a, kw) => (model === 'ir.config_parameter' ? Promise.reject(new Error('AccessError')) : ex(model, method, a, kw));
    const g = await runGuard({ ex: failing, cfg: w.cfg, env: ENV }); assert.equal(g.ok, false);
    assert.ok(g.failed.some((c) => c.id === 'G3') && g.failed.some((c) => c.id === 'G4'));
  } finally { w.cleanup(); }
});
test('la guardia rechaza una base distinta o producción en la configuración, antes de cualquier red', () => {
  assert.throws(() => loadRecoveryConfig({ ...ENV, RECOVERY_TARGET_DB: 'atheron1' }));
  assert.throws(() => loadRecoveryConfig({ ...ENV, ODOO_BASE_URL: 'https://atheron1.odoo.com' }));
});

test('executeLayer se detiene en STOP_GUARD si la guardia falla (no corre la capa)', async () => {
  const w = world({ neutralized: false });
  try { const r = await executeLayer(await w.mk('R1'), 'R1'); assert.equal(r.status, 'STOP_GUARD'); assert.equal(w.fake.writeCalls.length, 0); } finally { w.cleanup(); }
});

// ---------------- snapshot ----------------
test('SNAPSHOT: sin PII ni código en claro; detecta credenciales; manifiesto con huellas', async () => {
  const w = world();
  try {
    await applyAll(w);
    w.fake.seed('ir.actions.server', { name: 'HOTEL v1 — con secreto', model_id: w.fake.rows('ir.model').find((m) => m.model === 'sale.order').id, state: 'code', code: "TOKEN = 'abcd1234efgh5678ijkl9012mnop3456qrst'" });
    const dir = resolve(w.dir, 's'); const m = await takeSnapshot({ ex: (await w.mk('S', { write: false })).ex, cfg: w.cfg, dir });
    assert.ok(m.secret_like.some((s) => s.includes('con secreto')));
    const all = readdirAll(dir);
    assert.ok(!all.includes('abcd1234efgh5678'), 'la credencial no debe aparecer en el snapshot');
    assert.ok(!all.includes('example.invalid'), 'ningún correo en el snapshot');
    assert.ok(!existsSync(resolve(dir, 'res_users.json')) && !existsSync(resolve(dir, 'res_partner.json')) && !existsSync(resolve(dir, 'sale_order.json')));
    assert.ok(m.counts['res.users'] >= 1);
    for (const f of ['ir_model.json', 'ir_model_fields.json', 'ir_actions_server.json', 'base_automation.json', 'ir_ui_view.json', 'ir_ui_menu.json', 'ir_filters.json', 'ir_actions_act_window.json', 'x_hotel_unit.json']) assert.ok(existsSync(resolve(dir, f)), f);
    const acts = JSON.parse(readFileSync(resolve(dir, 'ir_actions_server.json'), 'utf8'));
    assert.ok(acts.every((a) => a.code_sha256 && !('code' in a)));
  } finally { w.cleanup(); }
});
function readdirAll(dir) { return readFileSyncAll(dir); }
import { readdirSync } from 'node:fs';
function readFileSyncAll(dir) { return readdirSync(dir).map((f) => readFileSync(resolve(dir, f), 'utf8')).join('\n'); }

test('SNAPSHOT: dos snapshots iguales => diff idéntico; un cambio => aparece', async () => {
  const w = world();
  try {
    await applyAll(w);
    const ex = (await w.mk('S', { write: false })).ex;
    const a = resolve(w.dir, 'a'), b = resolve(w.dir, 'b'), c = resolve(w.dir, 'c');
    await takeSnapshot({ ex, cfg: w.cfg, dir: a }); await takeSnapshot({ ex, cfg: w.cfg, dir: b });
    assert.equal(diffSnapshots(a, b).identical, true);
    w.fake.rows('x_hotel_unit').find((u) => u.x_name === '201').x_cap_base = 99;
    await takeSnapshot({ ex, cfg: w.cfg, dir: c });
    const d = diffSnapshots(a, c); assert.equal(d.identical, false);
    assert.deepEqual(d.models.x_hotel_unit.changed, [{ key: '201', fields: ['x_cap_base'] }]);
  } finally { w.cleanup(); }
});
test('looksSecret', () => { assert.equal(looksSecret("api_key = 'abcdefghijkl'"), true); assert.equal(looksSecret('x = 1'), false); });

// ---------------- QA ----------------
test('QA exige la guardia anti-solapamiento ACTIVA; con ella corre los escenarios y se limpia sola', async () => {
  const w = world();
  try {
    await applyAll(w);
    // R4 deja la automatización inactiva: QA debe negarse
    const ctx = await w.mk('QA');
    await assert.rejects(() => runQA(ctx, { date: '2027-03-01' }), /guardia anti-solapamiento no está activa/);
    assert.equal(w.fake.rows('sale.order').length, 0);
    // activación manual (paso aparte y autorizado)
    w.fake.rows('base.automation').find((a) => a.name === OVERLAP_GUARD_NAME).active = true;
    assert.equal((await requireOverlapGuard(ctx.ex)).ok, true);
    // regla mínima de prueba que EMULA lo que haría la automatización real (en Odoo real lo hace R4)
    const taken = new Set();
    w.fake.hooks.create = (model, vals) => { if (model !== 'sale.order') return; const unit = w.fake.rows('x_hotel_unit').find((u) => u.id === vals.x_hotel_unit_id); const rooms = unit.x_name === 'CASA COMPLETA' ? ['201', '202', '203', '301', '302'] : [unit.x_name]; if (rooms.some((r) => taken.has(r + vals.x_checkin)) ) throw new Error('solapamiento'); if (unit.x_name === '301' || unit.x_name === '201') taken.add(unit.x_name + vals.x_checkin); };
    const qa = await runQA(await w.mk('QA'), { date: '2027-03-01' });
    assert.equal(qa.ok, true, JSON.stringify(qa.results));
    assert.deepEqual(qa.results.map((r) => `${r.id}:${r.got}`), ['Q1:ok', 'Q2:fail', 'Q3:fail', 'Q4:ok']);
    assert.equal(w.fake.rows('sale.order').length, 2);
    const cl = await cleanupQA(await w.mk('ROLLBACK'), rollback);
    assert.equal(cl.ERROR, 0); assert.deepEqual(cl.residue, []);
    assert.equal(w.fake.rows('sale.order').length, 0); assert.equal(w.fake.rows('res.partner').length, 0);
  } finally { w.cleanup(); }
});
test('QA limpieza: si Odoo no deja borrar, la reserva queda cancelada y reportada como residuo', async () => {
  const w = world();
  try {
    await applyAll(w);
    w.fake.rows('base.automation').find((a) => a.name === OVERLAP_GUARD_NAME).active = true;
    await runQA(await w.mk('QA'), { date: '2027-03-01' });
    w.fake.hooks.unlink = (model) => { if (model === 'sale.order') throw new Error('no se puede borrar una orden confirmada'); };
    const cl = await cleanupQA(await w.mk('ROLLBACK'), rollback);
    assert.ok(cl.ERROR >= 1); assert.ok(cl.residue.length >= 1);
    assert.ok(w.fake.rows('sale.order').every((o) => o.x_reservation_status === 'cancelled'));
  } finally { w.cleanup(); }
});
test('QA en dry-run no crea nada', async () => {
  const w = world();
  try {
    await applyAll(w);
    w.fake.rows('base.automation').find((a) => a.name === OVERLAP_GUARD_NAME).active = true;
    const before = w.fake.writeCalls.length;
    const r = await runQA(await w.mk('QA', { write: false }), { date: '2027-03-01' });
    assert.equal(r.ok, null); assert.equal(w.fake.writeCalls.length, before);
  } finally { w.cleanup(); }
});

// ---------------- CLI (sin red): rechazos y códigos de salida ----------------
import { spawnSync } from 'node:child_process';
const RUN = resolve(new URL('../run.mjs', import.meta.url).pathname);
const cli = (args, env = {}) => spawnSync('node', [RUN, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

test('CLI: sin variables => exit 2 (guardia) y sin tocar la red', () => { const r = cli(['precheck']); assert.equal(r.status, 2); assert.match(r.stderr, /falta la variable/); });
test('CLI: base vieja o producción => exit 2', () => {
  for (const db of ['atheron1-hotel-staging-20260923', 'atheron1']) assert.equal(cli(['precheck'], { ...ENV, RECOVERY_TARGET_DB: db }).status, 2, db);
});
test('CLI: --apply sin RECOVERY_CONFIRM exacto => exit 2', () => {
  assert.equal(cli(['layer', 'R3', '--apply'], ENV).status, 2);
  assert.equal(cli(['layer', 'R3', '--apply'], { ...ENV, RECOVERY_CONFIRM: 'atheron1-hotel-staging-20260923' }).status, 2);
});
test('CLI: comando o capa desconocidos => exit 1, antes de abrir conexión', () => { assert.equal(cli(['nada'], ENV).status, 1); assert.equal(cli(['layer', 'R9'], ENV).status, 1); });
test('CLI: faltan insumos locales (extracto / correo) => exit 3 BLOCKED, antes de abrir conexión', () => {
  // ATH-020: R1/R2/R4 ya se alimentan del cierre publicado (ath012_closure.json); sin cierre ni archivos, loadExtract sigue bloqueando (ver closure.test.mjs)
  const noMail = { ...ENV }; delete noMail.RECOVERY_ANGELA_EMAIL;
  const b = cli(['layer', 'R6'], noMail); assert.equal(b.status, 3); assert.match(b.stdout, /RECOVERY_ANGELA_EMAIL/);
});
test('CLI diff: snapshots iguales => 0, distintos => 4', async () => {
  const w = world();
  try {
    await applyAll(w);
    const ex = (await w.mk('S', { write: false })).ex;
    const a = resolve(w.dir, 'a'), b = resolve(w.dir, 'b'), c = resolve(w.dir, 'c');
    await takeSnapshot({ ex, cfg: w.cfg, dir: a }); await takeSnapshot({ ex, cfg: w.cfg, dir: b });
    assert.equal(cli(['diff', a, b]).status, 0);
    w.fake.rows('x_hotel_unit')[0].x_cap_base = 77; await takeSnapshot({ ex, cfg: w.cfg, dir: c });
    assert.equal(cli(['diff', a, c]).status, 4);
  } finally { w.cleanup(); }
});
