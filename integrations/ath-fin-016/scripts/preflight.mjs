
import { collectPreflight } from '../src/preflight.mjs';

const report = await collectPreflight(process.env);

const duplicateRows = report.duplicates?.movements ?? [];
const duplicateSummary = duplicateRows.reduce((summary, row) => {
  summary[row.classification] = (summary[row.classification] ?? 0) + 1;
  return summary;
}, {});
const profile = report.user?.company_profile ?? {};
const idOf = (value) => Array.isArray(value) ? value[0] : value;
const aclSummary = Object.fromEntries(Object.entries(report.acl ?? {}).map(([model, rights]) => [
  model,
  Object.fromEntries(Object.entries(rights).map(([operation, allowed]) => [operation, Boolean(allowed)]))
]));

console.log('ATH-FIN-016 read-only preflight completed.');
console.log('Odoo authentication: ' + (report.credential?.status ?? report.checks.credentials?.status ?? 'NOT_VERIFIED'));
console.log('Approved account map: ' + (report.approved_mapping?.status ?? 'NOT_VERIFIED'));
console.log('Private Lote A manifest: ' + (report.manifest?.status ?? 'NOT_CONFIGURED'));
console.log('Duplicate scan: ' + (report.duplicates?.status ?? 'NOT_RUN'));
if (duplicateRows.length) {
  console.log('Duplicate classifications (counts only): ' + JSON.stringify(duplicateSummary));
}
console.log('User company ID: ' + String(idOf(profile.company_id) ?? 'UNKNOWN'));
console.log('User company IDs: ' + JSON.stringify(profile.company_ids ?? []));
console.log('Allowed context company IDs: ' + JSON.stringify(report.user?.allowed_company_ids ?? []));
console.log('ACL summary: ' + JSON.stringify(aclSummary));
if (report.existing_bank_data?.status) {
  console.log('Existing bank window: ' + report.existing_bank_data.status);
  console.log('Existing bank ledger lines: ' + String(report.existing_bank_data.allBankMoveLineCount ?? 'UNKNOWN'));
  console.log('Bank statement lines: ' + String(report.existing_bank_data.statementLineCount ?? 'UNKNOWN'));
}
console.log('Write lock: ' + report.write_state);
console.log('Odoo writes performed: NO.');
