import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadGuardedConfig,
  buildLiveAdapter,
  runPriceTiers,
  runGate4,
  runInverseGate,
  runCreateHoldsForExpiration,
  runVerifyExpiration,
  summarize,
  GuardError,
  commercialExpectation,
  ALLOWED_DATABASE,
} from '../scripts/live-hotel-008a-runner.mjs';
import { FakeOdooTransport } from './fakes/odoo-transport.fake.mjs';

const BASE_ENV = {
  ODOO_DATABASE: ALLOWED_DATABASE,
  ODOO_ACTION_ID: '1967',
  ODOO_BASE_URL: 'https://atheron1-hotel-staging-20260923.odoo.com',
  ODOO_TECHNICAL_USER: 'test-user-not-real',
  ODOO_TECHNICAL_SECRET: 'test-secret-not-real',
};

test('commercialExpectation implementa MAX(500000, huespedes*50000)', () => {
  assert.equal(commercialExpectation(10), 500_000);
  assert.equal(commercialExpectation(11), 550_000);
  assert.equal(commercialExpectation(12), 600_000);
  assert.equal(commercialExpectation(22), 1_100_000);
});

test('guard: rechaza cualquier base distinta a la de staging autorizada', () => {
  assert.throws(
    () => loadGuardedConfig({ ...BASE_ENV, ODOO_DATABASE: 'produccion-real' }),
    (error) => error instanceof GuardError
  );
});

test('guard: exige ODOO_ACTION_ID explicito, nunca cae a 1967 en silencio', () => {
  const env = { ...BASE_ENV };
  delete env.ODOO_ACTION_ID;
  assert.throws(() => loadGuardedConfig(env), (error) => error instanceof GuardError);
});

test('guard: UNIT_ID_201 tiene default confirmado (1); los demas NO se inventan', () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', HOTEL008A_PROPERTY_ID: '1' });
  assert.equal(config.unitIds[201], '1');
  assert.equal(config.unitIds[202], null);
  assert.equal(loadGuardedConfig(BASE_ENV).unitIds.CASA_COMPLETA, null);
});

test('runPriceTiers: MATCH cuando Odoo devuelve exactamente la expectativa comercial', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', HOTEL008A_PROPERTY_ID: '1' });
  let call = 0;
  const precios = [500_000, 550_000, 600_000, 1_100_000];
  const transport = new FakeOdooTransport({
    results: precios.map((precio_total) => ({
      ok: true,
      data: { quote_id: 900 + call++, opciones: [{ unit_id: 8, property_id: 1, precio_total, tax_status: 'PENDING_TAX_DEFINITION' }] },
    })),
  });
  const adapter = buildLiveAdapter(config, { transport });

  const result = await runPriceTiers(adapter, config);
  assert.equal(result.overall, 'PASS');
  assert.deepEqual(
    result.results.map((r) => r.status),
    ['MATCH', 'MATCH', 'MATCH', 'MATCH']
  );
});

test('runPriceTiers: detecta MISMATCH sin nunca sustituir el valor real de Odoo', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', HOTEL008A_PROPERTY_ID: '1' });
  const transport = new FakeOdooTransport({ result: { ok: true, data: { quote_id: 1, opciones: [{ unit_id: 8, property_id: 1, precio_total: 999_999 }] } } });
  const adapter = buildLiveAdapter(config, { transport });

  const result = await runPriceTiers(adapter, config);
  assert.equal(result.overall, 'REVIEW_NEEDED');
  for (const r of result.results) {
    assert.equal(r.status, 'MISMATCH');
    assert.equal(r.precio_total_odoo, 999_999, 'el valor reportado debe ser el real de Odoo, no la expectativa');
  }
});

test('runPriceTiers: clasifica como GOVERNANCE_BLOCKED (no ERROR generico) cuando Odoo rechaza por gobernanza', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', HOTEL008A_PROPERTY_ID: '1' });
  const transport = new FakeOdooTransport({
    result: { ok: false, error_code: 'REQUIRES_MANUAL_CONFIRMATION', message: 'tarifa no aprobada' },
  });
  const adapter = buildLiveAdapter(config, { transport });

  const result = await runPriceTiers(adapter, config);
  assert.equal(result.overall, 'PENDING_APPROVAL');
  assert.ok(result.results.every((r) => r.status === 'GOVERNANCE_BLOCKED'));
});

test('runGate4: SKIPPED sin UNIT_ID_CASA_COMPLETA, nunca inventa un id', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', HOTEL008A_PROPERTY_ID: '1' });
  const adapter = buildLiveAdapter(config, { transport: new FakeOdooTransport() });
  const result = await runGate4(adapter, loadGuardedConfig(BASE_ENV));
  assert.equal(result.overall, 'SKIPPED');
});

test('runGate4: PASS cuando las 5 habitaciones quedan no_disponible tras el HOLD de Casa Completa', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', UNIT_ID_202: '2', UNIT_ID_203: '3', UNIT_ID_301: '4', UNIT_ID_302: '5' });
  const transport = new FakeOdooTransport({
    results: [
      { ok: true, data: { quote_id: 500 } }, // quote
      { ok: true, data: { hold_id: 5001 } }, // hold
      {
        ok: true,
        data: {
          units: [
            { unit_id: '1', name: '201', available: false },
            { unit_id: '2', name: '202', available: false },
            { unit_id: '3', name: '203', available: false },
            { unit_id: '4', name: '301', available: false },
            { unit_id: '5', name: '302', available: false },
          ],
        },
      }, // availability
    ],
  });
  const adapter = buildLiveAdapter(config, { transport });

  const result = await runGate4(adapter, config);
  assert.equal(result.overall, 'PASS');
});

test('runGate4: FAIL si alguna habitacion queda disponible (anti-overbooking roto)', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', UNIT_ID_202: '2', UNIT_ID_203: '3', UNIT_ID_301: '4', UNIT_ID_302: '5' });
  const transport = new FakeOdooTransport({
    results: [
      { ok: true, data: { quote_id: 500 } },
      { ok: true, data: { hold_id: 5001 } },
      {
        ok: true,
        data: {
          units: [
            { unit_id: '1', name: '201', available: false },
            { unit_id: '2', name: '202', available: true }, // deberia estar bloqueada y no lo esta
            { unit_id: '3', name: '203', available: false },
            { unit_id: '4', name: '301', available: false },
            { unit_id: '5', name: '302', available: false },
          ],
        },
      },
    ],
  });
  const adapter = buildLiveAdapter(config, { transport });

  const result = await runGate4(adapter, config);
  assert.equal(result.overall, 'FAIL');
});

test('runInverseGate: PASS cuando HOLD de 201 bloquea Casa Completa sin afectar otras habitaciones', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_CASA_COMPLETA: '8', UNIT_ID_202: '2', UNIT_ID_203: '3', UNIT_ID_301: '4', UNIT_ID_302: '5' });
  const transport = new FakeOdooTransport({
    results: [
      { ok: true, data: { quote_id: 600 } },
      { ok: true, data: { hold_id: 6001 } },
      {
        ok: true,
        data: {
          units: [
            { unit_id: '8', name: 'CASA COMPLETA', available: false },
            { unit_id: '1', name: '201', available: false },
            { unit_id: '2', name: '202', available: true },
            { unit_id: '3', name: '203', available: true },
            { unit_id: '4', name: '301', available: true },
            { unit_id: '5', name: '302', available: true },
          ],
        },
      },
    ],
  });
  const adapter = buildLiveAdapter(config, { transport });

  const result = await runInverseGate(adapter, config);
  assert.equal(result.overall, 'PASS');
  assert.equal(result.casa_completa_blocked, true);
});

test('runCreateHoldsForExpiration + runVerifyExpiration: detecta expiracion del sujeto sin afectar el control', async () => {
  const config = loadGuardedConfig({ ...BASE_ENV, UNIT_ID_302: '5' });

  const createTransport = new FakeOdooTransport({
    results: [
      { ok: true, data: { quote_id: 701 } },
      { ok: true, data: { hold_id: 7001 } },
      { ok: true, data: { quote_id: 702 } },
      { ok: true, data: { hold_id: 7002 } },
    ],
  });
  const createAdapter = buildLiveAdapter(config, { transport: createTransport });
  const created = await runCreateHoldsForExpiration(createAdapter, config);
  assert.equal(created.overall, 'CREATED');
  assert.equal(created.state.subject.hold_id, 7001);
  assert.equal(created.state.control.hold_id, 7002);

  const verifyTransport = new FakeOdooTransport({
    results: [
      { ok: true, data: { status: 'hold_expired' } }, // status del sujeto
      { ok: true, data: { status: 'hold_active' } }, // status del control (sigue activo)
      { ok: true, data: { units: [{ unit_id: '1', name: '201', available: true }] } }, // availability restaurada
    ],
  });
  const verifyAdapter = buildLiveAdapter(config, { transport: verifyTransport });
  const verified = await runVerifyExpiration(verifyAdapter, config, created.state);

  assert.equal(verified.overall, 'PASS');
  assert.equal(verified.subjectRestored, true);
});

test('summarize: PENDING_APPROVAL si alguna fase quedo bloqueada por gobernanza, PASS solo si todo paso', () => {
  assert.equal(summarize([{ overall: 'PASS' }, { overall: 'PENDING_APPROVAL' }]).overall, 'PENDING_APPROVAL');
  assert.equal(summarize([{ overall: 'PASS' }, { overall: 'SKIPPED' }]).overall, 'REVIEW_NEEDED');
  assert.equal(summarize([{ overall: 'PASS' }, { overall: 'FAIL' }]).overall, 'REVIEW_NEEDED');
});
