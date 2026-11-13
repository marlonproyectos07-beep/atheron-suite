import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { collectPreflight, encryptReport } from '../src/preflight.mjs';

const report = await collectPreflight(process.env);
const encrypted = encryptReport(report);
const outputPath = process.env.ATH_FIN016_REPORT_PATH ||
  join(process.env.RUNNER_TEMP || process.cwd(), 'ath-fin-016-preflight.enc');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, encrypted, { mode: 0o600 });

const auth = report.credential?.status ?? report.checks.credentials?.status ?? 'NOT_VERIFIED';
const manifest = report.manifest?.status ?? 'NOT_CONFIGURED';
console.log('ATH-FIN-016 preflight completed.');
console.log('Odoo authentication status: ' + auth);
console.log('Private manifest status: ' + manifest);
console.log('Report: encrypted artifact only.');
console.log('Odoo writes performed: NO.');
