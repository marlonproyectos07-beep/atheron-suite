#!/usr/bin/env node
// ATH-DEV-021: UNA sola solicitud autenticada GET /api/apartments. Sin reintentos, sin sondeo de prefijos, sin Odoo,
// sin reservas. Registra codigo HTTP, estado de autenticacion y los ids tecnicos; nunca nombres ni secretos.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';

let cfg;
try { cfg = loadSmoobuConfig(process.env); } catch (e) {
  console.log(JSON.stringify({ result: 'CONFIG_ERROR', code: e.code, missing: e.missing, requests: 0 }));
  process.exit(2);
}
const client = new SmoobuClient({ ...cfg, pathPrefix: '/api' });
const swapped = process.env.SMOOBU_ASSIGNMENT === 'swapped'; // el cruce lo hace SOLO el workflow en su modo nuevo; aqui solo se etiqueta
let report;
try {
  const aps = await client.listProperties();
  report = { at: new Date().toISOString(), assignment: swapped ? 'swapped' : 'original', requests: 1, endpoint: 'GET /api/apartments', httpStatus: 200, authenticated: true, apartments: aps.length, apartmentIds: aps.map((a) => Number(a.id)).sort((a, b) => a - b), result: swapped ? 'API_OPERATIVA_EN_LECTURA_CON_ASIGNACION_INVERTIDA' : 'API_OPERATIVA_EN_LECTURA' };
} catch (e) {
  const auth = e.status === 401 || e.status === 403;
  report = { at: new Date().toISOString(), assignment: swapped ? 'swapped' : 'original', requests: 1, endpoint: 'GET /api/apartments', httpStatus: e.status ?? null, authenticated: auth ? false : null, code: e.code ?? 'UNKNOWN', upstreamMessage: e.detail ?? null, result: auth ? 'ACCESO_RECHAZADO' : 'ERROR_NO_AUTENTICACION' };
}
console.log(JSON.stringify(report));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Smoobu GET /api/apartments: HTTP ${report.httpStatus ?? 'sin respuesta'} (${report.result})\n`);
process.exit(report.httpStatus === 200 ? 0 : 1);
