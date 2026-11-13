import test from 'node:test';
import assert from 'node:assert/strict';
import { WRITE_ENABLED, RELEASE_TOKEN, assertFinancialWriteGate, GuardedFinancialWriter, validateDraft } from '../src/write-guard.mjs';
import { buildMoveDraft } from '../src/planner.mjs';
import { APPROVED_PLANNER_MAPPING, APPROVED_ODOO_MAPPING } from '../src/accounting-map.mjs';
import { EXPECTED_SCOPE } from '../src/manifest.mjs';

const movement = {
  amount_cents: 591610,
  category: 'GMF',
  date: '2026-11-11',
  description: 'IMPTO GOBIERNO 4X1000',
  direction: 'debit',
  id: 'B1-NOV-010',
  source_page: 1
};
const digest = EXPECTED_SCOPE.sha256;
const gate = {
  batchId: EXPECTED_SCOPE.batchId,
  manifestDigest: digest,
  releaseToken: RELEASE_TOKEN
};
const draft = buildMoveDraft(movement, APPROVED_PLANNER_MAPPING);

function response(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

test('write release is enabled only for the exact batch, digest and release marker', () => {
  assert.equal(WRITE_ENABLED, true);
  assert.equal(assertFinancialWriteGate(gate), true);
  assert.throws(() => assertFinancialWriteGate({ ...gate, batchId: 'OTHER' }), /BATCH_NOT_AUTHORIZED/);
  assert.throws(() => assertFinancialWriteGate({ ...gate, manifestDigest: '0'.repeat(64) }), /MANIFEST_NOT_AUTHORIZED/);
  assert.throws(() => assertFinancialWriteGate({ ...gate, releaseToken: 'wrong' }), /RELEASE_MARKER_REQUIRED/);
});

test('draft validator permits only the approved journal, accounts, movement, and balanced two-line entry', () => {
  assert.equal(validateDraft(draft, movement).ref, 'ATH-FIN-015|LOTE-A|B1-NOV-010');
  const wrong = structuredClone(draft);
  wrong.params.vals_list[0].journal_id = 66;
  assert.throws(() => validateDraft(wrong, movement), /MOVE_HEADER_INVALID/);
  const wrongAccount = structuredClone(draft);
  wrongAccount.params.vals_list[0].line_ids[0][2].account_id = 999;
  assert.throws(() => validateDraft(wrongAccount, movement), /ACCOUNT_SCOPE_INVALID/);
});

test('writer creates, verifies draft, posts, and verifies posted move through exact allowlisted JSON-2 calls', async () => {
  const calls = [];
  const expectedLines = draft.params.vals_list[0].line_ids.map((command, index) => ({
    id: 700 + index,
    name: command[2].name,
    account_id: [command[2].account_id, 'Account'],
    debit: command[2].debit,
    credit: command[2].credit,
    move_id: [9001, 'BC/2026/11/0001']
  }));
  let readCount = 0;
  const writer = new GuardedFinancialWriter({
    baseUrl: 'https://atheron1.odoo.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key',
    fetchImpl: async (url, options) => {
      const endpoint = url.split('/json/2/')[1];
      const body = JSON.parse(options.body);
      calls.push({ endpoint, body });
      if (endpoint === 'account.move/create') return response([9001]);
      if (endpoint === 'account.move/action_post') return response(true);
      if (endpoint === 'account.move/read') {
        readCount += 1;
        return response([{
          id: 9001,
          name: 'BC/2026/11/0001',
          state: readCount === 1 ? 'draft' : 'posted',
          date: movement.date,
          journal_id: [APPROVED_ODOO_MAPPING.bankJournal.id, 'BC'],
          ref: draft.params.vals_list[0].ref,
          line_ids: [700, 701],
          company_id: [APPROVED_ODOO_MAPPING.companyId, 'ATHERON S.A.S']
        }]);
      }
      if (endpoint === 'account.move.line/read') return response(expectedLines);
      throw new Error('unexpected endpoint ' + endpoint);
    }
  });

  const result = await writer.createAndPost({
    draft, movement, ...gate, duplicateState: 'NO_MATCH_FOUND'
  });
  assert.equal(result.moveId, 9001);
  assert.equal(result.state, 'posted');
  assert.equal(result.action, 'CREATED_AND_POSTED');
  assert.deepEqual(calls.map((call) => call.endpoint), [
    'account.move/create',
    'account.move/read',
    'account.move.line/read',
    'account.move/action_post',
    'account.move/read',
    'account.move.line/read'
  ]);
  assert.deepEqual(calls[0].body.context.allowed_company_ids, [APPROVED_ODOO_MAPPING.companyId]);
});

test('writer resumes an exact existing draft without creating a second move', async () => {
  const calls = [];
  const expectedLines = draft.params.vals_list[0].line_ids.map((command, index) => ({
    id: 710 + index,
    name: command[2].name,
    account_id: [command[2].account_id, 'Account'],
    debit: command[2].debit,
    credit: command[2].credit,
    move_id: [9002, 'BC/2026/11/0002']
  }));
  let readCount = 0;
  const writer = new GuardedFinancialWriter({
    baseUrl: 'https://atheron1.odoo.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key',
    fetchImpl: async (url) => {
      const endpoint = url.split('/json/2/')[1];
      calls.push(endpoint);
      if (endpoint === 'account.move/action_post') return response(true);
      if (endpoint === 'account.move/read') {
        readCount += 1;
        return response([{
          id: 9002, name: 'BC/2026/11/0002',
          state: readCount === 1 ? 'draft' : 'posted',
          date: movement.date,
          journal_id: [65, 'BC'],
          ref: draft.params.vals_list[0].ref,
          line_ids: [710, 711],
          company_id: [5, 'ATHERON S.A.S']
        }]);
      }
      if (endpoint === 'account.move.line/read') return response(expectedLines);
      throw new Error('unexpected endpoint ' + endpoint);
    }
  });
  const result = await writer.createAndPost({
    draft, movement, ...gate, duplicateState: 'EXACT_REFERENCE_EXISTS_REVIEW',
    existingMove: { id: 9002, ref: draft.params.vals_list[0].ref, state: 'draft' }
  });
  assert.equal(result.action, 'RESUMED_AND_POSTED');
  assert.equal(calls.includes('account.move/create'), false);
  assert.equal(calls.filter((x) => x === 'account.move/action_post').length, 1);
});

test('writer accepts an exact already-posted move without writing again', async () => {
  const calls = [];
  const expectedLines = draft.params.vals_list[0].line_ids.map((command, index) => ({
    id: 720 + index,
    name: command[2].name,
    account_id: [command[2].account_id, 'Account'],
    debit: command[2].debit,
    credit: command[2].credit,
    move_id: [9003, 'BC/2026/11/0003']
  }));
  const writer = new GuardedFinancialWriter({
    baseUrl: 'https://atheron1.odoo.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key',
    fetchImpl: async (url) => {
      const endpoint = url.split('/json/2/')[1];
      calls.push(endpoint);
      if (endpoint === 'account.move/read') return response([{
        id: 9003, name: 'BC/2026/11/0003', state: 'posted',
        date: movement.date, journal_id: [65, 'BC'],
        ref: draft.params.vals_list[0].ref, line_ids: [720, 721],
        company_id: [5, 'ATHERON S.A.S']
      }]);
      if (endpoint === 'account.move.line/read') return response(expectedLines);
      throw new Error('unexpected endpoint ' + endpoint);
    }
  });
  const result = await writer.createAndPost({
    draft, movement, ...gate, duplicateState: 'EXACT_REFERENCE_EXISTS_REVIEW',
    existingMove: { id: 9003, ref: draft.params.vals_list[0].ref, state: 'posted' }
  });
  assert.equal(result.action, 'ALREADY_POSTED');
  assert.equal(calls.includes('account.move/create'), false);
  assert.equal(calls.includes('account.move/action_post'), false);
});

test('writer blocks any possible duplicate before making a network request', async () => {
  let calls = 0;
  const writer = new GuardedFinancialWriter({
    baseUrl: 'https://atheron1.odoo.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key',
    fetchImpl: async () => { calls += 1; return response(true); }
  });
  await assert.rejects(() => writer.createAndPost({
    draft, movement, ...gate, duplicateState: 'POSSIBLE_DUPLICATE_REVIEW'
  }), /DUPLICATE_GATE_BLOCKED/);
  assert.equal(calls, 0);
});

test('writer rejects non-production targets before network', async () => {
  let calls = 0;
  const writer = new GuardedFinancialWriter({
    baseUrl: 'https://example.com',
    database: 'atheron1',
    apiKey: 'synthetic-test-key',
    fetchImpl: async () => { calls += 1; return response(true); }
  });
  await assert.rejects(() => writer.createAndPost({
    draft, movement, ...gate, duplicateState: 'NO_MATCH_FOUND'
  }), /WRITE_TARGET_BLOCKED/);
  assert.equal(calls, 0);
});
