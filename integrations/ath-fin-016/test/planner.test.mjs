import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoveDraft, movementReference, classifyDuplicate } from '../src/planner.mjs';
import { APPROVED_PLANNER_MAPPING } from '../src/accounting-map.mjs';

const mapping = {
  ...APPROVED_PLANNER_MAPPING
};

test('GMF builds balanced bank credit and expense debit in memory', () => {
  const draft = buildMoveDraft({
    id: 'B1-NOV-010', date: '2026-11-11', description: 'IMPTO GOBIERNO 4X1000',
    category: 'GMF', direction: 'debit', amount_cents: 591610
  }, mapping);
  const move = draft.params.vals_list[0];
  assert.equal(draft.model, 'account.move');
  assert.equal(draft.method, 'create');
  assert.equal(Object.hasOwn(move, 'move_type'), false);
  assert.equal(move.ref, 'ATH-FIN-015|LOTE-A|B1-NOV-010');
  assert.deepEqual(move.line_ids.map((line) => line[2].debit), [5916.10, 0]);
  assert.deepEqual(move.line_ids.map((line) => line[2].credit), [0, 5916.10]);
});

test('interest builds bank debit and financial income credit in memory', () => {
  const draft = buildMoveDraft({
    id: 'B1-NOV-009', date: '2026-11-11', description: 'ABONO INTERESES AHORROS',
    category: 'INTEREST', direction: 'credit', amount_cents: 1162
  }, mapping);
  const lines = draft.params.vals_list[0].line_ids.map((line) => line[2]);
  assert.deepEqual(lines.map((line) => line.debit), [0, 11.62]);
  assert.deepEqual(lines.map((line) => line.credit), [11.62, 0]);
});

test('fee uses separate bank-fee expense account', () => {
  const draft = buildMoveDraft({
    id: 'B1-NOV-001', date: '2026-11-12', description: 'CUOTA MANEJO TRJ DEB',
    category: 'BANK_FEE', direction: 'debit', amount_cents: 1805000
  }, mapping);
  assert.equal(draft.params.vals_list[0].line_ids[0][2].account_id, 31397);
});

test('references are stable and duplicate classifications fail closed', () => {
  assert.equal(movementReference('B1-NOV-001'), 'ATH-FIN-015|LOTE-A|B1-NOV-001');
  assert.equal(classifyDuplicate({ exactReferenceMatches: [{ id: 1 }] }), 'EXACT_REFERENCE_EXISTS_REVIEW');
  assert.equal(classifyDuplicate({ possibleBankLineMatches: [{ id: 2 }] }), 'POSSIBLE_DUPLICATE_REVIEW');
  assert.equal(classifyDuplicate({ exactReferenceMatches: [{ id: 1 }, { id: 2 }] }), 'DUPLICATE_REFERENCE_CONFLICT');
  assert.equal(classifyDuplicate({}), 'NO_MATCH_FOUND');
});

test('unbalanced or invalid account mappings are rejected', () => {
  assert.throws(() => buildMoveDraft({
    id: 'B1-NOV-010', date: '2026-11-11', description: 'IMPTO GOBIERNO 4X1000',
    category: 'GMF', direction: 'debit', amount_cents: 100
  }, { ...mapping, bankAccountId: 0 }), /ACCOUNT_MAPPING_INVALID/);
});
