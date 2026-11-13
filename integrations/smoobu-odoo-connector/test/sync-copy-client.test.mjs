import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CopyWriteClient, COPY_ARM_PHRASE, assertCopyTarget } from '../src/sync-copy-client.mjs';
import { SyncWriteClient, EXPECTED_TARGET } from '../src/sync-write-client.mjs';
import { WRITES_ENABLED } from '../src/live-reconcile.mjs';
import { RELEASE_UNLOCKED } from '../src/odoo-facts.mjs';
import { FakeOdoo } from './helpers/fake-odoo.mjs';

const DB = 'atheron1-pruebas-20261108';
const ok = { baseUrl: `https://${DB}.odoo.com`, database: DB, apiKey: 'CLAVE-COPIA' };
const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
const PAYLOAD = { vals_list: [{ name: 'Ana Sintetica Ficticia', ref: 'SMOOBU-170400999' }] };

test('el destino de copia: solo atheron1-pruebas-AAAAMMDD en su propio host; produccion, mezclas y credencial de produccion se niegan', () => {
  assert.deepEqual(assertCopyTarget(ok), { baseUrl: ok.baseUrl, database: DB });
  assert.equal(code(() => assertCopyTarget({ ...ok, baseUrl: 'https://atheron1.odoo.com', database: 'atheron1' })), 'COPY_TARGET_IS_PRODUCTION');
  assert.equal(code(() => assertCopyTarget({ ...ok, baseUrl: 'https://atheron1.odoo.com' })), 'COPY_TARGET_IS_PRODUCTION', 'host de produccion con base de copia');
  assert.equal(code(() => assertCopyTarget({ ...ok, database: 'atheron1' })), 'COPY_TARGET_IS_PRODUCTION', 'base de produccion con host de copia');
  assert.equal(code(() => assertCopyTarget({ ...ok, baseUrl: 'https://atheron1.odoo.com.evil.test' })), 'COPY_HOST_DATABASE_MISMATCH');
  assert.equal(code(() => assertCopyTarget({ ...ok, database: 'atheron1-staging' })), 'COPY_DATABASE_NOT_ALLOWED');
  assert.equal(code(() => assertCopyTarget({ ...ok, baseUrl: 'https://otra-pruebas-20261108.odoo.com' })), 'COPY_HOST_DATABASE_MISMATCH');
  assert.equal(code(() => assertCopyTarget({ ...ok, baseUrl: `http://${DB}.odoo.com` })), 'COPY_TARGET_NOT_BARE_ORIGIN');
  assert.equal(code(() => assertCopyTarget({ ...ok, baseUrl: `https://${DB}.odoo.com/web` })), 'COPY_TARGET_NOT_BARE_ORIGIN');
  assert.equal(code(() => assertCopyTarget({ ...ok, apiKey: '' })), 'COPY_CREDENTIAL_MISSING');
  assert.equal(code(() => assertCopyTarget({ ...ok, productionApiKey: 'CLAVE-COPIA' })), 'COPY_USES_PRODUCTION_CREDENTIAL');
  assert.equal(code(() => assertCopyTarget({ ...ok, baseUrl: 'no es url' })), 'COPY_TARGET_INVALID');
});

test('sin la frase de armado de copia no se envia nada; con ella solo viaja a la copia, por la lista blanca y con tope', async () => {
  const odoo = new FakeOdoo();
  const urls = [];
  const fetchImpl = async (u, o) => { urls.push(u); return odoo.handle(u, o); };
  const off = new CopyWriteClient({ ...ok, fetchImpl });
  await assert.rejects(off.execute('res.partner', 'create', PAYLOAD), { code: 'COPY_WRITES_DISABLED' });
  assert.deepEqual(urls, []);
  const wrong = new CopyWriteClient({ ...ok, fetchImpl, arm: 'ARMAR SINCRONIZACION SMOOBU ODOO CON AUTORIZACION DE GERENCIA' });
  await assert.rejects(wrong.execute('res.partner', 'create', PAYLOAD), { code: 'COPY_WRITES_DISABLED' }, 'la frase de produccion no arma la copia');
  const on = new CopyWriteClient({ ...ok, fetchImpl, arm: COPY_ARM_PHRASE, maxWrites: 1 });
  await on.execute('res.partner', 'create', PAYLOAD);
  assert.deepEqual(urls, [`https://${DB}.odoo.com/json/2/res.partner/create`]);
  assert.equal(on.writes, 1);
  await assert.rejects(on.execute('res.partner', 'create', PAYLOAD), { code: 'SYNC_WRITE_BUDGET_EXHAUSTED' });
  await assert.rejects(on.execute('sale.order', 'unlink', { ids: [1] }), (e) => Boolean(e.code), 'metodo fuera de la lista blanca');
  await assert.rejects(on.execute('res.users', 'write', { ids: [1], vals: { x: 1 } }), (e) => Boolean(e.code), 'modelo fuera de la lista blanca');
  assert.equal(urls.length, 1);
});

test('mutar el cliente hacia produccion no sirve: el destino se vuelve a verificar en cada escritura', async () => {
  const urls = [];
  const c = new CopyWriteClient({ ...ok, fetchImpl: async (u) => { urls.push(u); return { ok: true, json: async () => [1] }; }, arm: COPY_ARM_PHRASE });
  c.baseUrl = 'https://atheron1.odoo.com';
  await assert.rejects(c.execute('res.partner', 'create', PAYLOAD), { code: 'COPY_TARGET_IS_PRODUCTION' });
  c.baseUrl = ok.baseUrl; c.database = 'atheron1';
  await assert.rejects(c.execute('res.partner', 'create', PAYLOAD), { code: 'COPY_TARGET_IS_PRODUCTION' });
  assert.deepEqual(urls, []);
});

test('el cliente de produccion no cambia: sigue fijado a atheron1 y desarmado, y el modo copia no depende de sus interruptores', async () => {
  assert.deepEqual(EXPECTED_TARGET, { host: 'atheron1.odoo.com', database: 'atheron1' });
  assert.equal(WRITES_ENABLED, false);
  assert.equal(RELEASE_UNLOCKED, false);
  const prod = new SyncWriteClient({ baseUrl: 'https://atheron1.odoo.com', database: 'atheron1', apiKey: 'k', fetchImpl: async () => { throw new Error('no debe haber red'); }, arm: COPY_ARM_PHRASE });
  await assert.rejects(prod.execute('res.partner', 'create', PAYLOAD), { code: 'SYNC_WRITES_DISABLED' }, 'la frase de copia no arma produccion');
  assert.equal(new SyncWriteClient({ baseUrl: ok.baseUrl, database: DB, apiKey: 'k', arm: null }).targetOk, false, 'el cliente de produccion tampoco acepta la copia');
});

// ---- el script: caminos de rechazo (sin red)
const dir = mkdtempSync(join(tmpdir(), 'sync-copy-'));
const syn = (over = {}) => ({ apartments: { 201: 1 }, reservations: [{ id: 170400999, unit: '201', arrival: '2026-11-20', departure: '2026-11-22', price: 100000, name: 'Ana Sintetica Ficticia', email: 'ana@example.invalid', ...over }] });
const runScript = (input, env, args = []) => {
  const f = join(dir, `in-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(process.execPath, ['scripts/sync-copy.mjs', f, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  return JSON.parse(r.stdout.trim().split('\n').pop());
};
const E = { ODOO_TEST_BASE_URL: ok.baseUrl, ODOO_TEST_DATABASE: DB, ODOO_TEST_API_KEY: 'CLAVE-COPIA' };

test('script sync-copy: rechaza produccion, credencial de produccion, entrada no sintetica y --apply sin frase; todo antes de cualquier red', () => {
  assert.equal(runScript(syn(), {}).code, 'TARGET_INCOMPLETE');
  assert.equal(runScript(syn(), { ...E, ODOO_TEST_BASE_URL: 'https://atheron1.odoo.com', ODOO_TEST_DATABASE: 'atheron1' }).code, 'TARGET_IS_PRODUCTION');
  assert.equal(runScript(syn(), { ...E, ODOO_API_KEY: 'CLAVE-COPIA' }).code, 'TARGET_USES_PRODUCTION_CREDENTIAL');
  assert.equal(runScript(syn({ name: 'Maria Lopez' }), E).code, 'ENTRADA_NO_SINTETICA');
  assert.equal(runScript(syn({ email: 'maria@gmail.com' }), E).code, 'ENTRADA_NO_SINTETICA');
  assert.equal(runScript(syn({ id: 12345 }), E).code, 'ENTRADA_NO_SINTETICA');
  const noArm = runScript(syn(), E, ['--apply']);
  assert.equal(noArm.code, 'COPY_WRITES_DISABLED');
  assert.equal(noArm.writes, 0);
});
