import test from 'node:test';
import assert from 'node:assert/strict';
import { runCalibration3, analyzeBlockFields } from '../src/calibrate3.mjs';
import { assertStagingWriteTarget, STAGING_DATABASE } from '../src/staging-guard.mjs';
import { runIsolationCheck } from '../src/isolation-check.mjs';
import { probeDatabase } from '../src/staging-probe.mjs';

const OK = { ODOO_STAGING_DATABASE: STAGING_DATABASE, ODOO_STAGING_BASE_URL: 'https://s.test', ODOO_STAGING_API_KEY: 'STG-KEY', ODOO_API_KEY: 'PROD-KEY', ODOO_DATABASE: 'atheron1', ODOO_STAGING_WRITES: 'yes-staging' };

test('guardia de staging: falla cerrado ante cada condicion insegura', () => {
  assert.equal(assertStagingWriteTarget(OK).database, STAGING_DATABASE);
  const bad = (patch, code) => assert.throws(() => assertStagingWriteTarget({ ...OK, ...patch }), { code });
  bad({ ODOO_STAGING_DATABASE: undefined }, 'STAGING_DATABASE_NOT_AUTHORIZED');
  bad({ ODOO_STAGING_DATABASE: 'atheron1' }, 'STAGING_DATABASE_NOT_AUTHORIZED');
  bad({ ODOO_STAGING_BASE_URL: '' }, 'STAGING_BASE_URL_MISSING');
  bad({ ODOO_STAGING_API_KEY: '' }, 'STAGING_CREDENTIAL_MISSING');
  bad({ ODOO_STAGING_API_KEY: 'PROD-KEY' }, 'STAGING_USES_PRODUCTION_CREDENTIAL');
  bad({ ODOO_STAGING_WRITES: 'si' }, 'STAGING_WRITES_NOT_ENABLED');
  assert.throws(() => assertStagingWriteTarget({}), { code: 'STAGING_DATABASE_NOT_AUTHORIZED' });
});

test('aislamiento: aprobado solo si todo es seguro; ilegible o inseguro => detener', async () => {
  const mk = (over = {}) => ({ searchRead: async (m) => (over[m] ?? []) });
  const good = await runIsolationCheck({ odoo: mk(), database: STAGING_DATABASE, expectedDatabase: STAGING_DATABASE });
  assert.equal(good.passed, true); assert.equal(good.verdict, 'STAGING_AISLADO');
  for (const [model, rows] of [['ir.mail_server', [{ id: 1 }]], ['ir.cron', [{ id: 2, cron_name: 'Sync Booking' }]], ['ir.actions.server', [{ id: 3, name: 'x' }]],
    ['base.automation', [{ id: 4, name: 'NOBEDS import' }]], ['payment.provider', [{ id: 5, state: 'enabled' }]]]) {
    const r = await runIsolationCheck({ odoo: mk({ [model]: rows }), database: STAGING_DATABASE, expectedDatabase: STAGING_DATABASE });
    assert.equal(r.passed, false, model); assert.match(r.verdict, /DETENER/);
  }
  const unreadable = await runIsolationCheck({ odoo: { searchRead: async () => { const e = new Error('x'); e.code = 'ODOO_AUTH_REJECTED'; e.status = 403; throw e; } }, database: STAGING_DATABASE, expectedDatabase: STAGING_DATABASE });
  assert.equal(unreadable.passed, false); assert.ok(unreadable.checks.some((c) => c.reason === 'NOT_READABLE'));
  assert.equal((await runIsolationCheck({ odoo: mk(), database: 'atheron1', expectedDatabase: STAGING_DATABASE })).passed, false);
});

test('sondeo de base: no envia Authorization y devuelve solo codigos', async () => {
  let sent;
  const r = await probeDatabase({ baseUrl: 'https://o.test/', database: 'x', fetchImpl: async (u, i) => { sent = i; return { status: 401, text: async () => 'Unauthorized https://secret.example/x' }; } });
  assert.equal(sent.headers.authorization, undefined); assert.equal(sent.headers['x-odoo-database'], 'x');
  assert.deepEqual([r.httpStatus, r.message.includes('https://')], [401, false]);
  assert.equal((await probeDatabase({ baseUrl: 'https://o.test', database: 'x', fetchImpl: async () => { throw Object.assign(new TypeError('f'), { cause: { code: 'ENOTFOUND' } }); } })).error, 'ENOTFOUND');
});

test('analisis de campos de bloqueo: perfiles, referencias numericas y anonimato', () => {
  const rows = [
    { id: 1, role_id: [29, 'x'], x_hotel_block_kind: 'reservation', x_channel: 'airbnb', x_bloqueo_ref: false, x_bloqueo_src_id: false, x_checkin_state: 'confirmed' },
    { id: 2, role_id: [69, 'x'], x_hotel_block_kind: 'derived', x_channel: false, x_bloqueo_ref: '1', x_bloqueo_src_id: [1, 'x'], x_checkin_state: 'pending' },
    { id: 3, role_id: [69, 'x'], x_hotel_block_kind: false, x_channel: false, x_bloqueo_ref: 'OTA-123', x_bloqueo_src_id: false },
  ];
  const a = analyzeBlockFields(rows);
  assert.deepEqual(a.kinds, { reservation: 1, derived: 1, '(vacio)': 1 });
  assert.deepEqual([a.refs.withRef, a.refs.numeric, a.refs.targetInSample, a.refs.srcEqualsRef], [2, 1, 1, 1]);
  assert.deepEqual(a.refs.shapes, { 9: 1, 'a-9': 1 });
  assert.ok(!JSON.stringify(a).includes('OTA-123'));
});

test('lectura 3 con cliente simulado: solo lecturas y codigo de accion redactado', async () => {
  const calls = [];
  const odoo = {
    fieldsGet: async (m) => { calls.push(['fields_get', m]); return { x_hotel_block_kind: { type: 'selection', selection: [['external', 'E'], ['derived', 'D']], string: 'Tipo' }, x_channel: { type: 'selection', selection: [['booking', 'B']] }, x_bloqueo_ref: { type: 'char' } }; },
    searchRead: async (m) => { calls.push(['search_read', m]); if (m === 'ir.actions.server') return [{ id: 1914, name: 'Motor', state: 'code', model_id: [1, 'M'], code: "token='abcdefghijklmnopqrstuvwxyz012345'\nx.search([])" }]; return []; },
  };
  const r = await runCalibration3({ odoo });
  const by = Object.fromEntries(r.steps.map((s) => [s.name, s]));
  assert.equal(by['fields_get.block-fields'].fields.x_bloqueo_src_id, null);
  assert.deepEqual(by['fields_get.block-fields'].fields.x_hotel_block_kind.selection, ['external', 'derived']);
  assert.ok(!by['action.1914'].code.includes('abcdefghijklmnopqrstuvwxyz'));
  assert.ok(calls.every(([op]) => op === 'fields_get' || op === 'search_read'));
});
