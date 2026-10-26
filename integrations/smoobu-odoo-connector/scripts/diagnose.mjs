#!/usr/bin/env node
// Diagnostico de solo lectura Smoobu + Odoo. Credenciales solo desde variables de entorno.
import { appendFileSync } from 'node:fs';
import { runDiagnosis } from '../src/diagnose.mjs';

const report = await runDiagnosis();
console.log(JSON.stringify(report, null, 2));

const LABEL = {
  COMPLETE: 'Prueba completa: Smoobu y Odoo leidos',
  ENV_MISSING: 'Faltan variables o secretos',
  SMOOBU_AUTH_401: 'Smoobu rechazo la autenticacion (401/403) sin indicar firma',
  SMOOBU_SIGNATURE_ERROR: 'Smoobu indica error de firma/marca de tiempo/nonce',
  SMOOBU_ENDPOINT_ERROR: 'Ruta de Smoobu no encontrada (404)',
  SMOOBU_OTHER_ERROR: 'Otro fallo de Smoobu (red, 5xx, formato)',
  ODOO_FAILURE: 'Fallo en Odoo (Smoobu respondio)',
};
const lines = [`## Diagnostico Smoobu-Odoo: ${report.classification}`, LABEL[report.classification] ?? '', '',
  '| Paso | Estado | Detalle |', '|---|---|---|',
  ...report.steps.map((s) => `| ${s.name} | ${s.status} | ${s.httpStatus ?? s.code ?? s.why ?? ''} |`)];
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=classification::${report.classification}`);
process.exit(report.overall === 'OK' ? 0 : report.overall === 'BLOCKED' ? 2 : 1);
