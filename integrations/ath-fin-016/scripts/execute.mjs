
import { readFile } from 'node:fs/promises';
import { collectPreflight } from '../src/preflight.mjs';
import { validateManifest, EXPECTED_SCOPE } from '../src/manifest.mjs';
import { OdooReadonlyClient } from '../src/odoo-client.mjs';
import { APPROVED_PLANNER_MAPPING, APPROVED_ODOO_MAPPING } from '../src/accounting-map.mjs';
import { buildMoveDraft, movementReference } from '../src/planner.mjs';
import { GuardedFinancialWriter, RELEASE_TOKEN, assertFinancialWriteGate } from '../src/write-guard.mjs';

const RELEASE_MARKER_BASE = 'ATH-FIN-016-EXECUTE\\nbatch_id=' + EXPECTED_SCOPE.batchId +
  '\\nmanifest_sha256=' + EXPECTED_SCOPE.sha256 + '\\n';

function requireCheck(condition, code) {
  if (!condition) throw new Error(code);
}

function idOf(value) {
  return Array.isArray(value) ? value[0] : value;
}

function assertPreflight(report, manifest) {
  requireCheck(report.credential?.status === 'AUTHENTICATED', 'PREFLIGHT_ODOO_AUTH_FAILED');
  requireCheck(report.approved_mapping?.status === 'VERIFIED', 'PREFLIGHT_ACCOUNT_MAPPING_FAILED');
  requireCheck(report.manifest?.status === 'VALIDATED_EXACT_SCOPE', 'PREFLIGHT_MANIFEST_FAILED');
  requireCheck(report.duplicates?.status === 'COMPLETE_READ_ONLY', 'PREFLIGHT_DUPLICATE_SCAN_FAILED');
  requireCheck(report.duplicates.movements?.length === EXPECTED_SCOPE.movementCount, 'PREFLIGHT_DUPLICATE_COUNT_FAILED');
  requireCheck(report.duplicates.movements.every((row) =>
    ['NO_MATCH_FOUND', 'EXACT_REFERENCE_EXISTS_REVIEW'].includes(row.classification) &&
    row.possible_bank_line_count === 0 &&
    row.exact_reference_count <= 1
  ), 'PREFLIGHT_DUPLICATE_CONFLICT');
  requireCheck(report.existing_bank_data?.status === 'COMPLETE_READ_ONLY', 'PREFLIGHT_BANK_READ_FAILED');
  requireCheck(report.existing_bank_data.statementLineCount === 0, 'PREFLIGHT_STATEMENT_LINES_PRESENT');

  const profile = report.user?.company_profile ?? {};
  const allowedContextIds = Array.isArray(report.user?.allowed_company_ids) ? report.user.allowed_company_ids : [];
  const userCompanyIds = Array.isArray(profile.company_ids) ? profile.company_ids : [];
  const currentCompanyId = idOf(profile.company_id);
  requireCheck(
    allowedContextIds.includes(APPROVED_ODOO_MAPPING.companyId) ||
    userCompanyIds.includes(APPROVED_ODOO_MAPPING.companyId),
    'PREFLIGHT_COMPANY_NOT_ALLOWED'
  );
  requireCheck(currentCompanyId === APPROVED_ODOO_MAPPING.companyId, 'PREFLIGHT_USER_COMPANY_MISMATCH');

  const acl = report.acl ?? {};
  requireCheck(acl['account.move']?.read === true &&
    acl['account.move']?.create === true &&
    acl['account.move']?.write === true &&
    acl['account.move.line']?.read === true &&
    acl['account.move.line']?.create === true,
    'PREFLIGHT_WRITE_ACL_INSUFFICIENT');
  requireCheck(manifest.digest === EXPECTED_SCOPE.sha256, 'PREFLIGHT_DIGEST_MISMATCH');
  requireCheck(manifest.totals.GMF === 5013580 &&
    manifest.totals.BANK_FEE === 1805000 &&
    manifest.totals.INTEREST === 8076 &&
    manifest.totals.net === -6810504,
    'PREFLIGHT_BATCH_TOTALS_MISMATCH');
}

async function main() {
  requireCheck(process.env.GITHUB_REF === 'refs/heads/ath-fin-016-financial-executor', 'EXECUTION_BRANCH_BLOCKED');
  const marker = await readFile(new URL('../release/EXECUTE-LOTE-A', import.meta.url), 'utf8');
  const validMarker = marker === RELEASE_MARKER_BASE ||
    (marker.startsWith(RELEASE_MARKER_BASE) && /^attempt=[1-9][0-9]*\\n$/.test(marker.slice(RELEASE_MARKER_BASE.length)));
  requireCheck(validMarker, 'EXECUTION_RELEASE_MARKER_INVALID');

  const manifest = validateManifest(process.env.ATH_FIN016_MANIFEST_JSON);
  assertFinancialWriteGate({
    batchId: manifest.batch_id,
    manifestDigest: manifest.digest,
    releaseToken: RELEASE_TOKEN
  });

  const report = await collectPreflight(process.env);
  assertPreflight(report, manifest);

  const reader = new OdooReadonlyClient({
    baseUrl: process.env.ODOO_BASE_URL,
    database: process.env.ODOO_DATABASE,
    apiKey: process.env.ODOO_API_KEY
  });
  const writer = new GuardedFinancialWriter({
    baseUrl: process.env.ODOO_BASE_URL,
    database: process.env.ODOO_DATABASE,
    apiKey: process.env.ODOO_API_KEY
  });

  const results = [];
  for (const movement of manifest.movements) {
    const reference = movementReference(movement.id);
    const existing = await reader.searchRead(
      'account.move',
      [['ref', '=', reference]],
      ['id', 'name', 'date', 'journal_id', 'state', 'move_type', 'ref', 'company_id'],
      5
    );
    requireCheck(existing.length <= 1, 'EXECUTION_DUPLICATE_REFERENCE_CONFLICT');

    let duplicateState = 'NO_MATCH_FOUND';
    const existingMove = existing[0] ?? null;
    if (existingMove) {
      duplicateState = 'EXACT_REFERENCE_EXISTS_REVIEW';
    } else {
      const amount = Number((movement.amount_cents / 100).toFixed(2));
      const debit = movement.direction === 'credit' ? amount : 0;
      const credit = movement.direction === 'debit' ? amount : 0;
      const possible = await reader.searchRead(
        'account.move.line',
        [
          ['account_id', '=', APPROVED_ODOO_MAPPING.bankAccount.id],
          ['date', '=', movement.date],
          ['debit', '=', debit],
          ['credit', '=', credit],
          ['move_id.journal_id', '=', APPROVED_ODOO_MAPPING.bankJournal.id]
        ],
        ['id', 'move_id', 'account_id', 'debit', 'credit', 'date', 'name'],
        20
      );
      requireCheck(possible.length === 0, 'EXECUTION_POSSIBLE_DUPLICATE_BANK_LINE');
    }

    const draft = buildMoveDraft(movement, APPROVED_PLANNER_MAPPING);
    const result = await writer.createAndPost({
      draft,
      movement,
      batchId: manifest.batch_id,
      manifestDigest: manifest.digest,
      releaseToken: RELEASE_TOKEN,
      duplicateState,
      existingMove
    });
    results.push({ movementId: movement.id, ...result });
    console.log('Movement ' + movement.id + ': ' + result.action + ' (' + result.moveName + ')');
  }

  requireCheck(results.length === EXPECTED_SCOPE.movementCount, 'EXECUTION_BATCH_COUNT_MISMATCH');
  requireCheck(results.every((row) => row.state === 'posted'), 'EXECUTION_POSTED_STATE_MISMATCH');
  console.log('ATH-FIN-016 result: ' + results.length + '/' + EXPECTED_SCOPE.movementCount + ' movements verified POSTED.');
  console.log('Odoo target: atheron1.odoo.com / atheron1; company ID ' + APPROVED_ODOO_MAPPING.companyId + '.');
  console.log('Scope: ATH-FIN-015 Lote A only. No reconciliation or other movements performed.');
}

main().catch((error) => {
  console.error('ATH-FIN-016 execution stopped: ' + String(error?.message ?? 'UNKNOWN').slice(0, 100));
  process.exitCode = 1;
});
