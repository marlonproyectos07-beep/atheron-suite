import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStagingEnv,
  describeStagingConfigSafely,
  ALLOWED_DATABASE,
  REQUIRED_VARS,
  StagingGuardError,
} from '../src/config/odoo-staging-guard.mjs';

const VALID_ENV = Object.freeze({
  ODOO_BASE_URL: 'https://staging.example.invalid',
  ODOO_DATABASE: ALLOWED_DATABASE,
  ODOO_TECHNICAL_USER: 'sofia.api.staging',
  ODOO_TECHNICAL_SECRET: 'no-es-un-secreto-real-solo-de-prueba',
  ODOO_ACTION_ID: '1967',
});

test('ALLOWED_DATABASE es exactamente la base de staging autorizada', () => {
  assert.equal(ALLOWED_DATABASE, 'atheron1-hotel-staging-20260923');
});

test('con las 5 variables validas, devuelve un config congelado', () => {
  const config = assertStagingEnv(VALID_ENV);
  assert.equal(config.database, ALLOWED_DATABASE);
  assert.equal(config.actionId, 1967);
  assert.throws(() => {
    config.database = 'otra';
  }, TypeError);
});

for (const key of REQUIRED_VARS) {
  test(`falla cerrado si falta ${key}`, () => {
    const env = { ...VALID_ENV, [key]: undefined };
    delete env[key];
    assert.throws(() => assertStagingEnv(env), (err) => err instanceof StagingGuardError && err.code === 'MISSING_VAR');
  });

  test(`falla cerrado si ${key} esta vacio o solo espacios`, () => {
    const env = { ...VALID_ENV, [key]: '   ' };
    assert.throws(() => assertStagingEnv(env), (err) => err instanceof StagingGuardError && err.code === 'MISSING_VAR');
  });
}

test('falla cerrado si ODOO_DATABASE es produccion', () => {
  const env = { ...VALID_ENV, ODOO_DATABASE: 'atheron1-produccion' };
  assert.throws(() => assertStagingEnv(env), (err) => err instanceof StagingGuardError && err.code === 'DATABASE_NOT_ALLOWED');
});

test('falla cerrado si ODOO_DATABASE difiere solo en mayusculas/espacios (igualdad estricta, sin normalizar)', () => {
  for (const bad of ['ATHERON1-HOTEL-STAGING-20260923', ' atheron1-hotel-staging-20260923', 'atheron1-hotel-staging-20260923 ']) {
    const env = { ...VALID_ENV, ODOO_DATABASE: bad };
    assert.throws(() => assertStagingEnv(env), (err) => err instanceof StagingGuardError && err.code === 'DATABASE_NOT_ALLOWED');
  }
});

test('nunca hay fallback: ODOO_DATABASE ausente tambien falla, nunca asume la base autorizada por defecto', () => {
  const env = { ...VALID_ENV };
  delete env.ODOO_DATABASE;
  assert.throws(() => assertStagingEnv(env), (err) => err instanceof StagingGuardError && err.code === 'MISSING_VAR');
});

test('assertStagingEnv nunca muta el env que recibe', () => {
  const env = { ...VALID_ENV };
  const snapshot = { ...env };
  assertStagingEnv(env);
  assert.deepEqual(env, snapshot);
});

test('describeStagingConfigSafely nunca incluye technicalSecret', () => {
  const config = assertStagingEnv(VALID_ENV);
  const safe = describeStagingConfigSafely(config);
  const serialized = JSON.stringify(safe);
  assert.ok(!serialized.includes(VALID_ENV.ODOO_TECHNICAL_SECRET));
  assert.equal(safe.technical_secret, 'presente (oculto)');
  assert.equal(safe.database, ALLOWED_DATABASE);
});

test('describeStagingConfigSafely enmascara el usuario tecnico', () => {
  const config = assertStagingEnv(VALID_ENV);
  const safe = describeStagingConfigSafely(config);
  assert.notEqual(safe.technical_user_masked, VALID_ENV.ODOO_TECHNICAL_USER);
  assert.ok(safe.technical_user_masked.includes('*'));
});
