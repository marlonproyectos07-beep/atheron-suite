/**
 * Approved, read-only accounting map for ATH-FIN-015 Lote A.
 * Values were inspected in Odoo and approved by the company owner.
 * This file is configuration only; it does not authorize or perform writes.
 */
export const APPROVED_ODOO_MAPPING = Object.freeze({
  companyId: 5,
  bankAccount: Object.freeze({ code: '111007', id: 31472 }),
  bankJournal: Object.freeze({ code: 'BC', id: 65 }),
  gmfExpense: Object.freeze({ code: '530500', id: 31397 }),
  bankFeeExpense: Object.freeze({ code: '530500', id: 31397 }),
  interestIncome: Object.freeze({ code: '421000', id: 31346 })
});

export const APPROVED_PLANNER_MAPPING = Object.freeze({
  bankAccountId: APPROVED_ODOO_MAPPING.bankAccount.id,
  journalId: APPROVED_ODOO_MAPPING.bankJournal.id,
  gmfExpenseAccountId: APPROVED_ODOO_MAPPING.gmfExpense.id,
  bankFeeExpenseAccountId: APPROVED_ODOO_MAPPING.bankFeeExpense.id,
  interestIncomeAccountId: APPROVED_ODOO_MAPPING.interestIncome.id
});

export function checkApprovedMapping({ accounts, journals }) {
  const findOne = (rows, code) => (rows ?? []).filter((row) => String(row.code) === code);
  const specs = [
    ['bankAccount', APPROVED_ODOO_MAPPING.bankAccount],
    ['gmfExpense', APPROVED_ODOO_MAPPING.gmfExpense],
    ['bankFeeExpense', APPROVED_ODOO_MAPPING.bankFeeExpense],
    ['interestIncome', APPROVED_ODOO_MAPPING.interestIncome]
  ];
  const checks = {};
  for (const [key, spec] of specs) {
    const rows = findOne(accounts, spec.code);
    checks[key] = rows.length === 1 &&
      rows[0].id === spec.id &&
      (rows[0].company_ids ?? []).includes(APPROVED_ODOO_MAPPING.companyId) &&
      rows[0].active !== false
      ? 'VERIFIED'
      : 'BLOCKED';
  }
  const journalRows = (journals ?? []).filter((row) => row.code === APPROVED_ODOO_MAPPING.bankJournal.code);
  checks.bankJournal = journalRows.length === 1 &&
    journalRows[0].id === APPROVED_ODOO_MAPPING.bankJournal.id &&
    journalRows[0].company_id?.[0] === APPROVED_ODOO_MAPPING.companyId &&
    journalRows[0].active !== false
    ? 'VERIFIED'
    : 'BLOCKED';
  return Object.freeze({
    status: Object.values(checks).every((value) => value === 'VERIFIED') ? 'VERIFIED' : 'BLOCKED',
    checks: Object.freeze(checks)
  });
}
