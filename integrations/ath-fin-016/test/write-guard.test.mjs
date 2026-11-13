import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_WRITE_LOCK, assertFinancialWriteGate, LockedFinancialWriter, GuardedFinancialWriter } from '../src/write-guard.mjs';
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

test('guarded writer rejects before network even with complete-looking request', async () => {
  let calls = 0;
  const writer = new GuardedFinancialWriter({
    baseUrl: 'https://atheron1.odoo.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key',
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); }
  });
  const draft = {
    model: 'account.move',
    method: 'create',
    params: { vals_list: [{
      date: '2026-11-11',
      journal_id: 22,
      ref: 'ATH-FIN-015|LOTE-A|B1-NOV-010',
      line_ids: [
        [0, 0, { name: 'GMF [B1-NOV-010]', account_id: 201, debit: 10, credit: 0 }],
        [0, 0, { name: 'GMF [B1-NOV-010]', account_id: 101, debit: 0, credit: 10 }]
      ]
    }] }
  };
  await assert.rejects(() => writer.createAndPost({
    draft,
    batchId: 'ATH-FIN-015-LOTE-A',
    manifestDigest: 'd81a4126958d2f50e1c6b7784cddec94f54cd63fe20cb27c9cc4bcd978332297',
    releaseToken: 'x'.repeat(64),
    duplicateState: 'NO_MATCH_FOUND'
  }), /ATH_FIN016_WRITE_LOCKED/);
  assert.equal(calls, 0);
});
