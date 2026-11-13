import { collectPreflight } from '../src/preflight.mjs';

const report = await collectPreflight(process.env);

const duplicateRows = report.duplicates?.movements ?? [];
const duplicateSummary = duplicateRows.reduce((summary, row) => {
  summary[row.classification] = (summary[row.classification] ?? 0) + 1;
  return summary;
}, {});

console.log('ATH-FIN-016 read-only preflight completed.');
console.log('Odoo authentication: ' + (report.credential?.status ?? report.checks.credentials?.status ?? 'NOT_VERIFIED'));
console.log('Approved account map: ' + (report.approved_mapping?.status ?? 'NOT_VERIFIED'));
console.log('Private Lote A manifest: ' + (report.manifest?.status ?? 'NOT_CONFIGURED'));
console.log('Duplicate scan: ' + (report.duplicates?.status ?? 'NOT_RUN'));
if (duplicateRows.length) {
  console.log('Duplicate classifications (counts only): ' + JSON.stringify(duplicateSummary));
}
if (report.existing_bank_data?.status) {
  console.log('Existing bank window: ' + report.existing_bank_data.status);
  console.log('Existing bank ledger lines: ' + String(report.existing_bank_data.allBankMoveLineCount ?? 'UNKNOWN'));
  console.log('Bank statement lines: ' + String(report.existing_bank_data.statementLineCount ?? 'UNKNOWN'));
}
console.log('Write lock: ' + report.write_state);
console.log('Odoo writes performed: NO.');
