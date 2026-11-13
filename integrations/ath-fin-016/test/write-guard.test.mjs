import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_WRITE_LOCK, assertFinancialWriteGate, LockedFinancialWriter } from '../src/write-guard.mjs';
import { OdooReadonlyClient } from '../src/odoo-client.mjs';

test('source write lock is closed and rejects even a valid-looking release request', () => {
  assert.equal(CODE_WRITE_LOCK, false);
  assert.throws(() => assertFinancialWriteGate({
    batchId: 'ATH-FIN-015-LOTE-A',
    manifestDigest: 'd81a4126958d2f50e1c6b7784cddec94f54cd63fe20cb27c9cc4bcd978332297',
    releaseToken: 'x'.repeat(64)
  }), /ATH_FIN016_WRITE_LOCKED/);
});

test('locked writer cannot create or post anything', async () => {
  const writer = new LockedFinancialWriter();
  await assert.rejects(() => writer.createAndPost({}), /ATH_FIN016_WRITE_LOCKED/);
});

test('read-only client blocks create, write, unlink and action_post before network', async () => {
  let networkCalls = 0;
  const client = new OdooReadonlyClient({
    baseUrl: 'https://atheron1.odoo.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key',
    fetchImpl: async () => { networkCalls += 1; throw new Error('must not be called'); }
  });
  for (const method of ['create', 'write', 'unlink', 'action_post']) {
    await assert.rejects(() => client.call('account.move', method, {}), /ODOO_READ_ONLY_VIOLATION/);
  }
  assert.equal(networkCalls, 0);
});

test('read-only client rejects non-production hosts', () => {
  assert.throws(() => new OdooReadonlyClient({
    baseUrl: 'https://example.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key'
  }), /ODOO_TARGET_NOT_AUTHORIZED/);
});
