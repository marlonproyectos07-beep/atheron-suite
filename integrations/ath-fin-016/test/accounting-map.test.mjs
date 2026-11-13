import test from 'node:test';
import assert from 'node:assert/strict';
import { checkApprovedMapping, APPROVED_ODOO_MAPPING } from '../src/accounting-map.mjs';

const account = (code, id) => ({
  code, id, company_ids: [5], active: true
});

test('approved map binds GMF and bank fee to 530500 and interest to 421000', () => {
  assert.equal(APPROVED_ODOO_MAPPING.gmfExpense.code, '530500');
  assert.equal(APPROVED_ODOO_MAPPING.bankFeeExpense.code, '530500');
  assert.equal(APPROVED_ODOO_MAPPING.interestIncome.code, '421000');
  assert.equal(APPROVED_ODOO_MAPPING.gmfExpense.id, 31397);
  assert.equal(APPROVED_ODOO_MAPPING.interestIncome.id, 31346);
});

test('mapping verification requires exact IDs, company and active accounts', () => {
  const result = checkApprovedMapping({
    accounts: [
      account('111007', 31472),
      account('530500', 31397),
      account('421000', 31346)
    ],
    journals: [{ code: 'BC', id: 65, company_id: [5, 'Atheron S.A.S.'], active: true }]
  });
  assert.equal(result.status, 'VERIFIED');
  assert.ok(Object.values(result.checks).every((value) => value === 'VERIFIED'));
});

test('mapping verification fails closed on changed account ID or company', () => {
  const result = checkApprovedMapping({
    accounts: [
      account('111007', 31472),
      account('530500', 99999),
      { ...account('421000', 31346), company_ids: [7] }
    ],
    journals: [{ code: 'BC', id: 65, company_id: [5, 'Atheron S.A.S.'], active: true }]
  });
  assert.equal(result.status, 'BLOCKED');
});
