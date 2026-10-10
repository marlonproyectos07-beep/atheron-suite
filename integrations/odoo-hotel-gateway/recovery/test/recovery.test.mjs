import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as L from '../recovery-lib.mjs';
import { rewriteActionButtons, fieldOrder, selectionCommands, txt } from '../pure.mjs';

const ENV = { RECOVERY_TARGET_DB: L.TARGET_DB, ODOO_BASE_URL: `https://${L.TARGET_DB}.odoo.com`, ODOO_TECHNICAL_USER: 'u', ODOO_TECHNICAL_SECRET: 's' };

test('guard: solo el staging nuevo', () => {
  assert.ok(L.loadRecoveryConfig(ENV));
  for (const bad of ['atheron1-hotel-staging-20260923', 'atheron1', 'otra']) assert.throws(() => L.loadRecoveryConfig({ ...ENV, RECOVERY_TARGET_DB: bad }), L.RecoveryGuardError);
  assert.throws(() => L.loadRecoveryConfig({ ...ENV, ODOO_BASE_URL: 'https://atheron1.odoo.com' }), L.RecoveryGuardError);
  assert.throws(() => L.loadRecoveryConfig({ ...ENV, ODOO_TECHNICAL_SECRET: '' }), L.RecoveryGuardError);
});

test('escritura exige --apply y RECOVERY_CONFIRM exacto', () => {
  assert.equal(L.assertMayWrite({ apply: false }, {}), false);
  assert.throws(() => L.assertMayWrite({ apply: true }, {}), L.RecoveryGuardError);
  assert.throws(() => L.assertMayWrite({ apply: true }, { RECOVERY_CONFIRM: 'atheron1-hotel-staging-20260923' }), L.RecoveryGuardError);
  assert.equal(L.assertMayWrite({ apply: true }, { RECOVERY_CONFIRM: L.TARGET_DB }), true);
});

test('ejecutor: lectura siempre, escritura/borrado solo si se habilita; métodos de acción nunca', async () => {
  const calls = [];
  const t = { call: async (...a) => { calls.push(a[2][3] + '.' + a[2][4]); return []; } };
  const cfg = { db: L.TARGET_DB, secret: 's' };
  const ro = L.makeExecutor(t, cfg, 1, { write: false });
  await ro('x', 'search_read', [[]]);
  await assert.rejects(async () => ro('x', 'create', [{}]), L.RecoveryGuardError);
  await assert.rejects(async () => ro('x', 'unlink', [[1]]), L.RecoveryGuardError);
  const rw = L.makeExecutor(t, cfg, 1, { write: true });
  await rw('x', 'write', [[1], {}]);
  await assert.rejects(async () => rw('x', 'unlink', [[1]]), L.RecoveryGuardError);
  await assert.rejects(async () => rw('sale.order', 'action_confirm', [[1]]), L.RecoveryGuardError);
  await assert.rejects(async () => rw('x', 'button_immediate_install', [[1]]), L.RecoveryGuardError);
  const del = L.makeExecutor(t, cfg, 1, { write: true, allowDelete: true });
  await del('x', 'unlink', [[1]]);
  assert.deepEqual(calls, ['x.search_read', 'x.write', 'x.unlink']);
});

test('extracto: falta => BLOCKED; marcador => BLOCKED; no-arreglo => BLOCKED', () => {
  assert.throws(() => L.loadExtract('no-existe-xyz.json'), L.BlockedError);
  mkdirSync(L.EXTRACT_DIR, { recursive: true });
  const f = resolve(L.EXTRACT_DIR, '__test_tmp.json');
  try {
    writeFileSync(f, JSON.stringify([{ a: L.PLACEHOLDER }])); assert.throws(() => L.loadExtract('__test_tmp.json'), L.BlockedError);
    writeFileSync(f, JSON.stringify({ a: 1 })); assert.throws(() => L.loadExtract('__test_tmp.json'), L.BlockedError);
    writeFileSync(f, JSON.stringify([{ a: 1 }])); assert.deepEqual(L.loadExtract('__test_tmp.json'), [{ a: 1 }]);
  } finally { rmSync(f, { force: true }); }
});

test('comparación: many2one por id, vacíos equivalentes', () => {
  assert.equal(L.differs([5, 'x'], 5), false);
  assert.equal(L.differs(false, null), false);
  assert.equal(L.differs('', false), false);
  assert.equal(L.differs(2, 3), true);
});

test('ids viejos en código: detecta recurso/rol del respaldo, ignora números chicos', () => {
  assert.deepEqual(L.findOldIdLiterals('x = env["resource.resource"].browse(79)\ni = 3\nfoo(31)'), [31, 79]);
  assert.deepEqual(L.findOldIdLiterals('range(5)'), []);
  assert.deepEqual(L.fieldTokens("a['x_hotel_unit_id'] + x_checkin"), ['x_hotel_unit_id', 'x_checkin']);
});

test('vista piloto 6832: todos los botones por id se reescriben por nombre; sin mapeo => unresolved', () => {
  const views = JSON.parse(readFileSync(resolve(L.BACKUP_DIR, 'ir-ui-view-sale-order-inherited.json'), 'utf8'));
  const v = views.find((x) => x.id === 6832);
  const acts = JSON.parse(readFileSync(resolve(L.BACKUP_DIR, 'ir-actions-server-hotel.json'), 'utf8'));
  const oldIdToName = new Map(acts.map((a) => [a.id, a.name]));
  const ids = [...v.arch.matchAll(/<button\b[^>]*?\bname="(\d+)"[^>]*?\btype="action"/g)].map((m) => Number(m[1]));
  assert.ok(ids.length >= 8, 'se esperaban los botones HOTEL v1');
  for (const id of ids) assert.ok(oldIdToName.has(id), `id ${id} sin nombre en el respaldo`);
  const nameToNew = new Map([...oldIdToName.values()].map((n, i) => [n, 900000 + i]));
  const ok = rewriteActionButtons(v.arch, oldIdToName, nameToNew);
  assert.deepEqual(ok.unresolved, []);
  for (const id of ids) assert.ok(!ok.arch.includes(`name="${id}" type="action"`) || nameToNew.get(oldIdToName.get(id)) === id);
  const bad = rewriteActionButtons(v.arch, oldIdToName, new Map());
  assert.equal(bad.unresolved.length, ids.length);
  assert.equal(bad.arch, v.arch);
});

test('kanban 6833: el XML documentado coincide con el arch del respaldo', () => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const views = JSON.parse(readFileSync(resolve(L.BACKUP_DIR, 'ir-ui-view-sale-order-inherited.json'), 'utf8'));
  assert.equal(norm(readFileSync(resolve(L.PAYLOAD_DIR, 'view-kanban-6833.xml'), 'utf8')), norm(views.find((x) => x.id === 6833).arch));
});

test('filtros de Ángela: XML bien formado y solo campos reales', () => {
  const x = readFileSync(resolve(L.PAYLOAD_DIR, 'search-angela-filtros.xml'), 'utf8');
  execFileSync('python3', ['-I', '-c', 'import sys,xml.dom.minidom as m;m.parse(sys.argv[1])', resolve(L.PAYLOAD_DIR, 'search-angela-filtros.xml')]);
  const fields = new Set(JSON.parse(readFileSync(resolve(L.BACKUP_DIR, 'ir-model-fields-sale-order-custom.json'), 'utf8')).map((f) => f.name));
  for (const t of new Set(x.match(/'(x_[a-z_]+)'/g).map((s) => s.slice(1, -1)))) assert.ok(fields.has(t), `campo ${t} no existe en sale.order`);
  const statuses = ['draft', 'opcion', 'hold', 'confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed', 'cancelled', 'no_show'];
  for (const s of new Set([...x.matchAll(/'(confirmed|pre_checkin|checked_in|hold|cancelled|no_show|closed)'/g)].map((m) => m[1]))) assert.ok(statuses.includes(s));
});

test('R1: orden de campos y selection', () => {
  const o = fieldOrder([{ model: 'm', name: 'c', ttype: 'many2many' }, { model: 'm', name: 'b', ttype: 'one2many' }, { model: 'm', name: 'a', ttype: 'many2one' }, { model: 'm', name: 'z', ttype: 'char' }]);
  assert.deepEqual(o.map((f) => f.ttype), ['char', 'many2one', 'one2many', 'many2many']);
  assert.deepEqual(selectionCommands([{ value: 'b', name: { en_US: 'B' }, sequence: 2 }, { value: 'a', name: 'A', sequence: 1 }]).map((c) => c[2].value), ['a', 'b']);
  assert.equal(txt({ es_CO: 'x' }), 'x');
});

test('sin extracto ni cierre publicado, loadExtract termina en BLOCKED sin tocar red (ATH-020: con el cierre, R1/R4 se derivan de él)', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os');
  const d = mkdtempSync(resolve(tmpdir(), 'ath-empty-'));
  try { assert.throws(() => L.loadExtract('models.json', d), (e) => e instanceof L.BlockedError && /FALTA/.test(e.message)); } finally { rmSync(d, { recursive: true, force: true }); }
});

test('R3 --plan funciona sin red y trae 5 habitaciones + Casa', () => {
  const out = JSON.parse(execFileSync('node', [resolve(L.REPO_ROOT, 'integrations/odoo-hotel-gateway/recovery/r3-master-data.mjs'), '--plan'], { encoding: 'utf8' }));
  assert.deepEqual(out.rooms.map((r) => r.key), ['201', '202', '203', '301', '302']);
  assert.equal(out.casa.children.length, 5);
  assert.equal(out.deposit_policies.length, 2);
  assert.ok(!('x_company_id' in out.property.payload));
});
