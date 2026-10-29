#!/usr/bin/env node
// ATH-DEV-052: UNA sola solicitud GET /api/reservations/{id}, solo para ids de la lista blanca (src/reservation-probe.mjs).
// Sin reintentos, sin Odoo, sin escrituras. Salida PUBLICA: nombres de campos, campos tecnicos y de estado; id y referencia
// OTA enmascarados; nunca datos del huesped. Antes de imprimir se verifica que no aparezca el id completo ni una credencial.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { parseAllowedId, summarizeReservation } from '../src/reservation-probe.mjs';
import { assertPublicSafe } from '../src/public-report.mjs';

const parsed = parseAllowedId(process.env.RESERVATION_ID);
if (!parsed.ok) { console.log(JSON.stringify({ result: 'ID_RECHAZADO', code: parsed.code, requests: 0 })); process.exit(2); }

let cfg;
try { cfg = loadSmoobuConfig(process.env); } catch (e) { console.log(JSON.stringify({ result: 'CONFIG_ERROR', code: e.code, missing: e.missing, requests: 0 })); process.exit(2); }

const client = new SmoobuClient({ ...cfg, pathPrefix: '/api' });
let report;
let raw = null;
try {
  raw = await client.getReservation(parsed.id);
  report = { at: new Date().toISOString(), requests: 1, endpoint: 'GET /api/reservations/{id}', httpStatus: 200, result: 'RESERVA_DEVUELTA_POR_API', ...summarizeReservation(raw) };
} catch (e) {
  report = { at: new Date().toISOString(), requests: 1, endpoint: 'GET /api/reservations/{id}', httpStatus: e.status ?? null, code: e.code ?? 'UNKNOWN', result: e.status === 404 ? 'API_NO_CONOCE_LA_RESERVA' : 'ERROR_DE_LECTURA' };
}
const text = JSON.stringify(report);
const identifiers = [String(parsed.id), raw?.['reference-id'] != null ? String(raw['reference-id']) : null].filter((v) => v && v.length > 3);
const guard = assertPublicSafe(text, { identifiers, secrets: [cfg.apiKey, cfg.apiSecret] });
console.log(guard.safe ? text : JSON.stringify({ result: 'DETALLE_RETENIDO', code: 'PRIVACY_GUARD_TRIPPED', hits: guard.hits, httpStatus: report.httpStatus, requests: 1 }));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Smoobu GET /api/reservations/{id}: HTTP ${report.httpStatus ?? 'sin respuesta'} (${report.result})\n`);
process.exit(report.httpStatus === 200 || report.httpStatus === 404 ? 0 : 1);
