import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedWrite, assertApplyAllowed, assertIncrement1Target, checkTestEnvironment } from '../src/inc1-guard.mjs';
import { computePlan } from '../src/inc1-plan.mjs';
import { INC1_EXISTING_MODELS, INC1_FIELDS, INC1_NEW_MODELS } from '../src/inc1-spec.mjs';
import { runIncrement1 } from '../src/inc1-run.mjs';

const good = { ODOO_TEST_BASE_URL: 'https://atheron1-pruebas-20261110.odoo.com', ODOO_TEST_DATABASE: 'atheron1-pruebas-20261110', ODOO_TEST_API_KEY: 'k-test', ODOO_API_KEY: 'k-prod' };
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'NO_ERROR'; };

test('bloquea atheron1.odoo.com en cualquier forma', () => {
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_TEST_BASE_URL: 'https://atheron1.odoo.com', ODOO_TEST_DATABASE: 'atheron1' })), 'INC1_TARGET_IS_PRODUCTION');
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_TEST_BASE_URL: 'https://ATHERON1.odoo.com/' })), 'INC1_TARGET_IS_PRODUCTION');
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_TEST_DATABASE: 'atheron1' })), 'INC1_TARGET_IS_PRODUCTION');
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_BASE_URL: good.ODOO_TEST_BASE_URL })), 'INC1_TARGET_IS_PRODUCTION');
});
test('exige patron de nombre, https, host=base y credencial distinta', () => {
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_TEST_DATABASE: 'otra', ODOO_TEST_BASE_URL: 'https://otra.odoo.com' })), 'INC1_DATABASE_NAME_NOT_ALLOWED');
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_TEST_BASE_URL: 'http://atheron1-pruebas-20261110.odoo.com' })), 'INC1_BASE_URL_NOT_HTTPS');
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_TEST_BASE_URL: 'https://atheron1-pruebas-20261111.odoo.com' })), 'INC1_HOST_DATABASE_MISMATCH');
  assert.equal(code(() => assertIncrement1Target({ ...good, ODOO_TEST_API_KEY: 'k-prod' })), 'INC1_USES_PRODUCTION_CREDENTIAL');
  assert.equal(code(() => assertIncrement1Target({})), 'INC1_TARGET_INCOMPLETE');
  assert.equal(assertIncrement1Target(good).database, 'atheron1-pruebas-20261110');
});
test('apply exige interruptor explicito', () => {
  assert.equal(code(() => assertApplyAllowed({})), 'INC1_WRITES_NOT_ENABLED');
  assert.equal(code(() => assertApplyAllowed({ ODOO_TEST_WRITES: 'yes-test-copy' })), 'NO_ERROR');
});
test('lista blanca de escrituras', () => {
  assert.equal(code(() => assertAllowedWrite('res.partner', 'create', {})), 'INC1_WRITE_NOT_ALLOWED');
  assert.equal(code(() => assertAllowedWrite('ir.model.fields', 'unlink', {})), 'INC1_WRITE_NOT_ALLOWED');
  assert.equal(code(() => assertAllowedWrite('ir.model.fields', 'create', { model: 'sale.order', name: 'x_foo' })), 'INC1_FIELD_NOT_IN_SPEC');
  assert.equal(code(() => assertAllowedWrite('ir.model', 'create', { model: 'x_otro' })), 'INC1_MODEL_NOT_IN_SPEC');
  assert.equal(code(() => assertAllowedWrite('ir.model.fields', 'create', { model: 'x_guests_line', name: 'x_consent' })), 'NO_ERROR');
});
test('la especificacion no toca modelos ni campos ajenos, y todos los campos son x_', () => {
  for (const [m, n] of INC1_FIELDS) {
    assert.match(n, /^x_[a-z0-9_]+$/);
    assert.ok(INC1_NEW_MODELS.some((x) => x.model === m) || INC1_EXISTING_MODELS.includes(m), m);
  }
  assert.equal(new Set(INC1_FIELDS.map(([m, n]) => `${m}.${n}`)).size, INC1_FIELDS.length);
  const sire = INC1_FIELDS.find(([m, n]) => n === 'x_sire_company_code');
  assert.equal(sire[4].default, undefined);
});
test('plan idempotente: sin lo existente crea todo; con todo existente queda vacio', () => {
  const base = new Set(INC1_EXISTING_MODELS);
  const p1 = computePlan({ existingModels: base, existingFields: new Set() });
  assert.equal(p1.modelsToCreate.length, 1);
  assert.equal(p1.fieldsToCreate.length, INC1_FIELDS.length);
  assert.equal(p1.blocked.length, 0);
  const all = new Set([...base, 'x_establishment']);
  const p2 = computePlan({ existingModels: all, existingFields: new Set(INC1_FIELDS.map(([m, n]) => `${m}.${n}`)) });
  assert.deepEqual([p2.modelsToCreate.length, p2.fieldsToCreate.length, p2.blocked.length], [0, 0, 0]);
});
test('plan bloquea si falta un modelo base (x_guests_line)', () => {
  const base = new Set(INC1_EXISTING_MODELS); base.delete('x_guests_line');
  const p = computePlan({ existingModels: base, existingFields: new Set() });
  assert.ok(p.blocked.some((b) => b.model === 'x_guests_line' && b.reason === 'MODEL_MISSING'));
});

function fakeOdoo({ neutral = 'True', crons = 0, mail = 0, hooks = 0, pay = 0, models = INC1_EXISTING_MODELS, fields = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const [, , , , , model, method] = url.split('/');
    const body = JSON.parse(init.body); calls.push({ model, method });
    const ok = (v) => ({ ok: true, json: async () => v });
    if (method === 'create') return ok([999]);
    if (model === 'ir.config_parameter') return ok([{ key: 'database.is_neutralized', value: neutral }]);
    if (method === 'search_count') return ok({ 'ir.cron': crons, 'ir.mail_server': mail, 'base.automation': hooks, 'payment.provider': pay }[model]);
    if (model === 'ir.model') return ok(models.map((m, i) => ({ id: i + 1, model: m })));
    if (model === 'ir.model.fields') return ok(fields.map((f) => { const [m, n] = f.split('.'); return { model: m, name: n }; }));
    throw new Error('inesperado ' + model + body);
  };
  return { fetchImpl, calls };
}
test('simulacion por defecto: solo lecturas y sin secretos en el resultado', async () => {
  const f = fakeOdoo();
  const out = await runIncrement1({ env: good, fetchImpl: f.fetchImpl });
  assert.equal(out.mode, 'dry-run');
  assert.equal(out.counts.fields, INC1_FIELDS.length);
  assert.ok(!f.calls.some((c) => c.method === 'create'));
  assert.ok(!JSON.stringify(out).includes('k-test'));
});
test('entorno no aislado => STOP aunque se pida simular', async () => {
  for (const o of [{ neutral: 'False' }, { crons: 2 }, { mail: 1 }, { hooks: 1 }, { pay: 1 }]) {
    await assert.rejects(runIncrement1({ env: good, fetchImpl: fakeOdoo(o).fetchImpl }), (e) => e.code === 'INC1_ENVIRONMENT_NOT_ISOLATED');
  }
});
test('apply sin interruptor no escribe; con interruptor crea solo lo que falta', async () => {
  const f = fakeOdoo();
  await assert.rejects(runIncrement1({ env: good, apply: true, fetchImpl: f.fetchImpl }), (e) => e.code === 'INC1_WRITES_NOT_ENABLED');
  assert.equal(f.calls.length, 0);
  const g = fakeOdoo();
  const out = await runIncrement1({ env: { ...good, ODOO_TEST_WRITES: 'yes-test-copy' }, apply: true, fetchImpl: g.fetchImpl });
  assert.equal(out.created.models.length, 1);
  assert.equal(out.created.fields.length, INC1_FIELDS.length);
  const creates = g.calls.filter((c) => c.method === 'create');
  assert.ok(creates.every((c) => c.model === 'ir.model' || c.model === 'ir.model.fields'));
});
test('checkTestEnvironment separa controles de Odoo y adicionales', async () => {
  const f = fakeOdoo();
  const { OdooJson2Client } = await import('../src/odoo-json2-client.mjs');
  const r = await checkTestEnvironment(new OdooJson2Client({ baseUrl: 'https://x.odoo.com', database: 'd', apiKey: 'k', fetchImpl: f.fetchImpl }));
  assert.ok(r.checks.some((c) => c.group === 'odoo_automatico') && r.checks.some((c) => c.group === 'adicional_nuestro'));
});
