// ATH-STAGING-RECOVERY-013 — alcance BASE: exclusión OTA, ids duros, idempotencia y rollback con exclusiones. Sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { FakeOdoo } from './fake-odoo.mjs';
import { buildSyntheticExtract, seedProtectedRules } from './synthetic-extract.mjs';
import { TARGET_DB, loadRecoveryConfig, readBackup, m2oName } from '../recovery-lib.mjs';
import { makeCtx } from '../connect.mjs';
import { ORDER, executeLayer } from '../steps.mjs';
import { rollback } from '../engine.mjs';
import { classifyOta, classifyOtaField, hardcodedIds, OTA_MODELS } from '../scope.mjs';
import { plan as r5plan } from '../layers/r5.mjs';

const ENV = { RECOVERY_TARGET_DB: TARGET_DB, ODOO_BASE_URL: `https://${TARGET_DB}.odoo.com`, ODOO_TECHNICAL_USER: 'u', ODOO_TECHNICAL_SECRET: 's', RECOVERY_ANGELA_EMAIL: 'recepcion.prueba@example.invalid' };

function world(extractOpts = {}, rulesMode = 'same') {
  const dir = mkdtempSync(resolve(tmpdir(), 'ath-scope-'));
  const extractDir = resolve(dir, 'extract'); buildSyntheticExtract(extractDir, extractOpts);
  const fake = new FakeOdoo();
  seedProtectedRules(fake, rulesMode);
  const pv = (name) => fake.seed('ir.ui.view', { name, model: 'sale.order', mode: 'primary', priority: 16, arch: '<x/>', active: true });
  for (const [mod, xid, name] of [['sale', 'sale_order_view_kanban', 'sale.order.kanban'], ['sale', 'view_order_form', 'sale.order.form']]) fake.seed('ir.model.data', { module: mod, name: xid, model: 'ir.ui.view', res_id: pv(name) });
  pv('sale.order.search.inherit.quotation');
  for (const u of readBackup('master-data-x_hotel_unit.json').filter((x) => x.x_property_id?.[1] === 'HOTEL ATHERON SUITE')) {
    fake.seed('resource.resource', { name: m2oName(u.x_resource_id) }); fake.seed('planning.role', { name: m2oName(u.x_role_id) });
    const code = (m2oName(u.x_product_tmpl_id).match(/^\[([^\]]+)\]/) || [])[1]; fake.seed('product.template', { name: m2oName(u.x_product_tmpl_id), default_code: code });
  }
  const cfg = loadRecoveryConfig(ENV); const journalPath = resolve(dir, 'journal.jsonl');
  const mk = (layer, { write = true } = {}) => makeCtx({ transport: fake.transport(), cfg, layer, write, args: {}, allowDelete: layer === 'ROLLBACK', journalPath, extractDir, env: ENV });
  return { fake, mk, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
async function upTo(w, last) { const out = {}; for (const n of ORDER) { out[n] = await executeLayer(await w.mk(n), n); if (n === last || out[n].status !== 'OK') break; } return out; }

// ---------- ancla de regresión sobre el respaldo REAL del repo ----------
test('REGRESIÓN con el respaldo real: las automatizaciones OTA son exactamente 51, 164, 170 y 171', () => {
  const hits = readBackup('base-automation.json').filter((a) => classifyOta({ name: a.name }).ota).map((a) => a.id).sort((x, y) => x - y);
  assert.deepEqual(hits, [51, 164, 170, 171]);
});
test('REGRESIÓN con el respaldo real: por código solo la 1815 (NOBEDS) y la 1723 (llamada externa OSRM) se detectan', () => {
  const hits = readBackup('ir-actions-server-hotel.json').filter((a) => classifyOta({ name: a.name, code: a.code }).ota).map((a) => a.id).sort((x, y) => x - y);
  assert.deepEqual(hits, [1723, 1815]);
});
test('ninguna de las 24 acciones de reserva directa (R5) es OTA y, tras la adaptación, ninguna trae ids duros', () => {
  const p = r5plan(); assert.equal(p.length, 24);
  for (const a of p) { assert.equal(a.ota.ota, false, a.name); assert.deepEqual(a.hard_ids, [], a.name); }
});
test('R5 adapta EXACTAMENTE las 3 referencias por id (1914, 1921, 1897) a búsqueda por nombre+modelo', () => {
  const p = r5plan().filter((a) => a.adapted.length);
  assert.deepEqual(p.map((a) => a.name).sort(), ['HOTEL v1 — COTIZAR ALOJAMIENTO (disponibilidad + tarifa, 003)', 'HOTEL v1 — CREAR RESERVA DESDE COTIZACIÓN (004)']);
  const ad = Object.fromEntries(p.flatMap((a) => a.adapted.map((x) => [x.id, [x.name, x.model]])));
  assert.deepEqual(ad, { 1914: ['HOTEL v1 — CONSULTAR DISPONIBILIDAD (solo lectura, QA-002)', 'x_hotel_property'], 1921: ['HOTEL v1 — MOTOR TARIFARIO (solo lectura, 003)', 'x_hotel_rate'], 1897: ['HOTEL v1 — HOLD', 'sale.order'] });
  for (const a of p) { assert.ok(!/browse\(\s*\d+\s*\)/.test(a.code), a.name); assert.notEqual(a.sha, a.sha_original); assert.match(a.code, /\.search\(\[\('name', '=', '/); assert.match(a.code, /\.ensure_one\(\)/); }
  for (const a of r5plan().filter((x) => !x.adapted.length)) assert.equal(a.sha, a.sha_original, 'las demás 22 se copian sin tocar');
});
test('todo el código de R5 (original y adaptado) compila como Python', () => {
  const all = readBackup('ir-actions-server-hotel.json'); const orig = new Map(all.map((a) => [a.name, a.code]));
  for (const a of r5plan()) for (const [tag, code] of [['original', orig.get(a.name)], ['adaptado', a.code]]) {
    const r = spawnSync('python3', ['-I', '-c', 'import sys,ast; ast.parse(sys.stdin.read())'], { input: code, encoding: 'utf8' });
    assert.equal(r.status, 0, `${a.name} (${tag}): ${r.stderr.slice(-200)}`);
  }
});
test('adaptActionRefs: respeta lo que no conoce y escapa comillas en el nombre', async () => {
  const { adaptActionRefs: f } = await import('../scope.mjs');
  const r = f("A = env['ir.actions.server'].sudo().browse(5)\nB = env['ir.actions.server'].browse(6)\nC = env['x'].browse(7)", (id) => (id === 5 ? { name: "O'Brien", model: 'sale.order' } : null));
  assert.deepEqual(r.adapted.map((x) => x.id), [5]); assert.deepEqual(r.unresolved, [6]);
  assert.ok(r.code.includes("'O\\'Brien'")); assert.ok(r.code.includes('browse(6)') && r.code.includes("env['x'].browse(7)"));
});
test('«Booking Engine» (módulo nativo de Odoo) y x_booking_source (canal de la reserva) NO se confunden con OTA', () => {
  assert.equal(classifyOta({ name: 'Booking Engine: Mark Availabilities To Recompute: Slot Change' }).ota, false);
  assert.equal(classifyOta({ name: 'HOTEL v1 — CONFIRMAR', code: "order.write({'x_booking_source': 'direct'})" }).ota, false);
  assert.equal(classifyOta({ name: 'ATHERON - Refrescar iCal SOLO 301' }).ota, true);
  assert.equal(classifyOta({ name: 'x', model: 'x_hotel_ota_feed' }).ota, true);
  assert.equal(classifyOta({ name: 'x', code: "requests.post('https://hook')" }).ota, true);
});
test('hardcodedIds: detecta ids sueltos y listas, ignora cadenas, comentarios y fechas', () => {
  const code = readBackup('ir-actions-server-hotel.json').find((a) => a.id === 1815).code;
  const ids = hardcodedIds(code);
  assert.ok(ids.includes(57850) && ids.includes(57899) && ids.length > 30);
  assert.deepEqual(hardcodedIds("x = '2026-10-10 20:00:00'  # id 12345\nn = 3\nlimit = 50"), []);
  assert.deepEqual(hardcodedIds('a = 1234\nb = [5678, 9]'), [1234, 5678]);
});
test('campos OTA: por modelo, por relación a modelo OTA y por nombre NOBEDS/Beds24/iCal', () => {
  assert.equal(classifyOtaField({ model: 'x_hotel_ota_feed', name: 'x_source' }).ota, true);
  assert.equal(classifyOtaField({ model: 'x_hotel_unit', name: 'x_ota_feed_id', relation: 'x_hotel_ota_feed' }).ota, true);
  assert.equal(classifyOtaField({ model: 'planning.slot', name: 'x_nobeds_id' }).ota, true);
  assert.equal(classifyOtaField({ model: 'planning.slot', name: 'x_hotel_block_kind' }).ota, false);
  assert.equal(classifyOtaField({ model: 'planning.slot', name: 'x_bloqueo_ref' }).ota, false);
  assert.deepEqual(Object.keys(OTA_MODELS), ['x_hotel_ota_feed', 'x_hotel_api_log', 'x_hotel_api_lock', 'x_hotel_ext_conflict']);
  assert.equal(classifyOtaField({ model: 'x_hotel_quote', name: 'x_api_client_ref' }).ota, true);   // ATH-020: identidad del cliente API/Gateway
  assert.equal(classifyOtaField({ model: 'x_hotel_quote', name: 'x_api_user_id', relation: 'res.users' }).ota, true);
  assert.equal(classifyOtaField({ model: 'x_hotel_quote', name: 'x_channel' }).ota, false);
});

// ---------- R1 ----------
test('R1 no crea modelos ni campos OTA y verifica OK; lo interno sí se crea', async () => {
  const w = world({ ota: true });
  try {
    const r = await upTo(w, 'R1'); assert.equal(r.R1.status, 'OK', JSON.stringify(r.R1.blockers));
    for (const m of ['x_hotel_ota_feed', 'x_hotel_api_log']) assert.equal(w.fake.models.has(m), false, m);
    assert.equal(w.fake.models.get('x_hotel_unit').fields.has('x_ota_feed_id'), false);
    assert.equal(w.fake.models.get('planning.slot').fields.has('x_nobeds_id'), false);
    assert.ok(w.fake.models.has('x_hotel_unit') && w.fake.models.get('planning.slot').fields.has('x_hotel_block_kind'));
    const ex = r.R1.log.filter((e) => e.action === 'EXCLUYE_OTA').map((e) => e.key).sort();
    assert.deepEqual(ex, ['planning.slot.x_nobeds_id', 'x_hotel_api_log', 'x_hotel_ota_feed', 'x_hotel_ota_feed.x_source', 'x_hotel_api_log.x_operation', 'x_hotel_unit.x_ota_feed_id'].sort());
  } finally { w.cleanup(); }
});

// ---------- R4 ----------
test('R4 excluye acciones, automatizaciones y crons OTA; lo interno se crea INACTIVO; sin bloqueo', async () => {
  const w = world({ ota: true });
  try {
    const r = await upTo(w, 'R4'); assert.equal(r.R4.status, 'OK', JSON.stringify(r.R4.blockers));
    const names = (m) => w.fake.rows(m).map((x) => x.name ?? x.cron_name);
    assert.ok(!names('ir.actions.server').some((n) => /iCal|NOBEDS|llamada externa/.test(n)), 'no debe existir ninguna acción OTA/externa');
    assert.ok(!names('base.automation').some((n) => /NOBEDS|OTA/.test(n)));
    assert.ok(!names('ir.cron').some((n) => /iCal/.test(n)));
    assert.ok(names('ir.actions.server').includes('SYNTH guardia solapamiento') && names('ir.actions.server').includes('SYNTH accion reserva'));
    const PROT = /Casa Completa bloquea|Limpiar bloques|Habitacion bloquea/;
    assert.ok(w.fake.rows('base.automation').filter((a) => !PROT.test(a.name)).every((a) => a.active === false), 'las creadas por R4 son inactivas');
    assert.equal(w.fake.rows('base.automation').filter((a) => PROT.test(a.name)).length, 3, '167/168/169 preexistentes, sin duplicar');
    assert.ok(w.fake.rows('base.automation').filter((a) => PROT.test(a.name)).every((a) => a.active === true), '167/168/169 siguen como estaban');
    assert.ok(w.fake.rows('ir.cron').every((c) => c.active === false));
    const ex = r.R4.log.filter((e) => e.action === 'EXCLUYE_OTA').map((e) => e.key).sort();
    assert.deepEqual(ex, ['ATHERON - Anti-duplicado NOBEDS', 'ATHERON - Orden borrador desde reserva OTA', 'ATHERON - Refrescar iCal SOLO 302', 'ATHERON - Refrescar iCal SOLO 302', 'HOTEL v1 — SYNTH llamada externa', 'NOBEDS → Odoo — Recibir Reserva'].sort()); // la acción y su cron
  } finally { w.cleanup(); }
});
test('R4: una automatización INTERNA enlazada a una acción OTA no se crea a medias: OMITE y la capa se detiene', async () => {
  const w = world({ ota: true, coupled: true });
  try {
    const r = await upTo(w, 'R4'); assert.equal(r.R4.status, 'PARTIAL');
    assert.ok(r.R4.blockers.some((b) => b.action === 'OMITE' && /enlazada a canal externo/.test(b.key)));
    assert.ok(!w.fake.rows('base.automation').some((a) => /enlazada a canal externo/.test(a.name)));
  } finally { w.cleanup(); }
});
test('R4: código con ids numéricos duros (como la 1815 antigua) NO se crea y la capa se detiene (ID_DURO)', async () => {
  const w = world({ hardId: true });
  try {
    const r = await upTo(w, 'R4'); assert.equal(r.R4.status, 'PARTIAL');
    assert.ok(r.R4.blockers.some((b) => b.action === 'ID_DURO' && /legado con ids duros/.test(b.key)));
    assert.ok(!w.fake.rows('ir.actions.server').some((a) => /legado con ids duros/.test(a.name)));
    assert.ok(r.R4.verify.checks.some((c) => c.blocked && /ids numéricos duros/.test(c.name)));
  } finally { w.cleanup(); }
});

// ---------- idempotencia y rollback con exclusiones ----------
test('con exclusiones OTA: reaplicar no crea nada y el rollback solo toca lo creado (nunca aparece lo excluido)', async () => {
  const w = world({ ota: true });
  try {
    await upTo(w, 'R4');
    const count = () => w.fake.rows('ir.actions.server').length + w.fake.rows('base.automation').length + w.fake.rows('ir.cron').length + w.fake.rows('ir.model.fields').length;
    const n1 = count(); await upTo(w, 'R4'); assert.equal(count(), n1);
    const ctx = await w.mk('ROLLBACK');
    const r = await rollback({ ex: ctx.ex, write: true, journal: ctx.journal, log: ctx.log, layer: 'R4' });
    assert.equal(r.ERROR, 0); assert.equal(r.CONFLICT, 0);
    assert.equal(w.fake.rows('base.automation').length, 3, 'solo quedan 167/168/169 (preexistentes)'); assert.equal(w.fake.rows('ir.cron').length, 0);
    assert.ok(!w.fake.rows('ir.actions.server').some((a) => /SYNTH (guardia|accion)/.test(a.name)));
    assert.equal(w.fake.rows('ir.actions.server').filter((a) => /SYNTH regla/.test(a.name)).length, 3, 'las acciones de 167/168/169 preexistentes no se tocan');
    const again = await upTo(w, 'R4'); assert.equal(again.R4.status, 'OK');
  } finally { w.cleanup(); }
});

// ---------- la guardia no depende de ids de la base antigua ----------
test('guard.mjs, steps.mjs, engine.mjs y snapshot.mjs no contienen ids de la base antigua', () => {
  const OLD = [167, 168, 169, 189, 1855, 1899, 1909, 1967, 6832, 6833, 57850, 12135, 28, 29, 30, 31, 32, 79, 69];
  for (const f of ['guard.mjs', 'steps.mjs', 'engine.mjs', 'snapshot.mjs']) {
    const code = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
    for (const n of OLD) assert.ok(!new RegExp(`(?<![\\w.])${n}(?![\\w.])`).test(code), `${f} usa el número ${n}`);
  }
});
