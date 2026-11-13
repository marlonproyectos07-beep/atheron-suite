import { validateManifest, EXPECTED_SCOPE } from '../src/manifest.mjs';
import { OdooReadonlyClient } from '../src/odoo-client.mjs';
import { APPROVED_ODOO_MAPPING } from '../src/accounting-map.mjs';
import { movementReference } from '../src/planner.mjs';

const EXPECTED_PREVIOUS_BANK_BALANCE_CENTS = 1266823774;
const EXPECTED_LOTE_A_NET_CENTS = -6810504;
const EXPECTED_FINAL_BANK_BALANCE_CENTS = EXPECTED_PREVIOUS_BANK_BALANCE_CENTS + EXPECTED_LOTE_A_NET_CENTS;

function requireCheck(condition, code) {
  if (!condition) throw new Error(code);
}

async function main() {
  requireCheck(process.env.GITHUB_REF === 'refs/heads/ath-fin-016-financial-executor', 'VERIFY_BRANCH_BLOCKED');
  const manifest = validateManifest(process.env.ATH_FIN016_MANIFEST_JSON);
  const client = new OdooReadonlyClient({
    baseUrl: process.env.ODOO_BASE_URL,
    database: process.env.ODOO_DATABASE,
    apiKey: process.env.ODOO_API_KEY
  });

  const verified = [];
  for (const movement of manifest.movements) {
    const reference = movementReference(movement.id);
    const rows = await client.searchRead(
      'account.move',
      [['ref', '=', reference]],
      ['id', 'name', 'date', 'journal_id', 'state', 'ref', 'company_id', 'line_ids'],
      3
    );
    requireCheck(rows.length === 1, 'VERIFY_REFERENCE_COUNT_MISMATCH');
    const move = rows[0];
    requireCheck(move.state === 'posted', 'VERIFY_MOVE_NOT_POSTED');
    requireCheck(move.date === movement.date && move.ref === reference, 'VERIFY_MOVE_HEADER_MISMATCH');
    requireCheck(Array.isArray(move.journal_id) && move.journal_id[0] === APPROVED_ODOO_MAPPING.bankJournal.id, 'VERIFY_MOVE_JOURNAL_MISMATCH');
    requireCheck(Array.isArray(move.company_id) && move.company_id[0] === APPROVED_ODOO_MAPPING.companyId, 'VERIFY_MOVE_COMPANY_MISMATCH');
    requireCheck(Array.isArray(move.line_ids) && move.line_ids.length === 2, 'VERIFY_MOVE_LINES_MISMATCH');
    verified.push({ id: movement.id, name: move.name, moveId: move.id });
  }

  const bankAccountId = APPROVED_ODOO_MAPPING.bankAccount.id;
  const bankDomain = [['account_id', '=', bankAccountId], ['parent_state', '=', 'posted']];
  const lineCount = await client.searchCount('account.move.line', bankDomain);
  requireCheck(Number.isInteger(lineCount) && lineCount <= 5000, 'VERIFY_BANK_LEDGER_TOO_LARGE');
  const bankLines = await client.searchRead(
    'account.move.line',
    bankDomain,
    ['id', 'debit', 'credit'],
    5000
  );
  requireCheck(bankLines.length === lineCount, 'VERIFY_BANK_LEDGER_TRUNCATED');
  const actualBankBalanceCents = bankLines.reduce((sum, line) =>
    sum + Math.round(Number(line.debit ?? 0) * 100) - Math.round(Number(line.credit ?? 0) * 100), 0);
  requireCheck(
    actualBankBalanceCents === EXPECTED_FINAL_BANK_BALANCE_CENTS,
    'VERIFY_BANK_BALANCE_DIFFERS_FROM_EXPECTED'
  );

  const refs = verified.map((row) => row.name);
  console.log('ATH-FIN-016 independent post-verification: ' + verified.length + '/' + EXPECTED_SCOPE.movementCount + ' exact references posted.');
  console.log('Odoo 111007 ledger balance: MATCH_EXPECTED_PREVIOUS_BALANCE_PLUS_LOTE_A.');
  console.log('Odoo bank account posted ledger lines: ' + lineCount + '.');
  console.log('Document range: ' + refs[0] + ' through ' + refs[refs.length - 1] + '.');
  console.log('No bank statement lines were reconciled; this is an Odoo ledger verification only.');
}

main().catch((error) => {
  console.error('ATH-FIN-016 post-verification stopped: ' + String(error?.message ?? 'UNKNOWN').slice(0, 100));
  process.exitCode = 1;
});
