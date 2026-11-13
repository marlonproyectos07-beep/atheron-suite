import { fromCents } from './money.mjs';

export function movementReference(movementId) {
  if (!/^B1-NOV-\d{3}$/.test(String(movementId))) throw new Error('MOVEMENT_ID_INVALID');
  return 'ATH-FIN-015|LOTE-A|' + movementId;
}

function positiveId(value, field) {
  if (!Number.isInteger(value) || value <= 0) throw new Error('ACCOUNT_MAPPING_INVALID:' + field);
  return value;
}

export function buildMoveDraft(movement, mapping) {
  const bankAccountId = positiveId(mapping.bankAccountId, 'bankAccountId');
  const journalId = positiveId(mapping.journalId, 'journalId');
  const gmfExpenseAccountId = positiveId(mapping.gmfExpenseAccountId, 'gmfExpenseAccountId');
  const bankFeeExpenseAccountId = positiveId(mapping.bankFeeExpenseAccountId, 'bankFeeExpenseAccountId');
  const interestIncomeAccountId = positiveId(mapping.interestIncomeAccountId, 'interestIncomeAccountId');

  const amount = Number(fromCents(movement.amount_cents));
  const bankDebit = movement.direction === 'credit' ? amount : 0;
  const bankCredit = movement.direction === 'debit' ? amount : 0;
  const offsetDebit = movement.direction === 'debit' ? amount : 0;
  const offsetCredit = movement.direction === 'credit' ? amount : 0;
  const offsetAccountId = movement.category === 'GMF'
    ? gmfExpenseAccountId
    : movement.category === 'BANK_FEE'
      ? bankFeeExpenseAccountId
      : movement.category === 'INTEREST'
        ? interestIncomeAccountId
        : null;
  if (!offsetAccountId) throw new Error('MOVEMENT_CATEGORY_NOT_ALLOWED');

  const name = movement.description + ' [' + movement.id + ']';
  const vals = {
    move_type: 'entry',
    date: movement.date,
    journal_id: journalId,
    ref: movementReference(movement.id),
    line_ids: [
      [0, 0, { name, account_id: offsetAccountId, debit: offsetDebit, credit: offsetCredit }],
      [0, 0, { name, account_id: bankAccountId, debit: bankDebit, credit: bankCredit }]
    ]
  };
  const debitCents = Math.round((offsetDebit + bankDebit) * 100);
  const creditCents = Math.round((offsetCredit + bankCredit) * 100);
  if (debitCents !== creditCents || debitCents !== movement.amount_cents) {
    throw new Error('MOVE_NOT_BALANCED');
  }
  return Object.freeze({ model: 'account.move', method: 'create', params: { vals_list: [vals] } });
}

export function classifyDuplicate({ exactReferenceMatches = [], possibleBankLineMatches = [] }) {
  if (exactReferenceMatches.length > 1) return 'DUPLICATE_REFERENCE_CONFLICT';
  if (exactReferenceMatches.length === 1) return 'EXACT_REFERENCE_EXISTS_REVIEW';
  if (possibleBankLineMatches.length > 0) return 'POSSIBLE_DUPLICATE_REVIEW';
  return 'NO_MATCH_FOUND';
}
