#!/usr/bin/env node
// ATH-DEV-028: UNA sola solicitud GET /api/reservations con ventana acotada, solo pagina 1, sin reintentos.
// Sin escrituras, sin Odoo. Salida saneada: ids, fechas, tipo, apartamento, canal y paginacion; nunca datos de huespedes.
import { loadSmoobuConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { summarizeReservationsPage, WINDOW } from '../src/reservations-probe.mjs';

let cfg;
try { cfg = loadSmoobuConfig(process.env); } catch (e) { console.log(JSON.stringify({ result: 'CONFIG_ERROR', code: e.code, missing: e.missing, requests: 0 })); process.exit(2); }
const client = new SmoobuClient({ ...cfg, pathPrefix: '/api' });
let report;
try {
  const data = await client.listReservationsPage({ from: WINDOW.from, to: WINDOW.to, page: 1, pageSize: 100, includeCancelled: true });
  report = { requests: 1, endpoint: 'GET /api/reservations', httpStatus: 200, window: WINDOW, ...summarizeReservationsPage(data) };
} catch (e) {
  report = { requests: 1, endpoint: 'GET /api/reservations', httpStatus: e.status ?? null, code: e.code ?? 'UNKNOWN', upstreamMessage: e.detail ?? null, result: 'ERROR' };
}
console.log(JSON.stringify({ at: new Date().toISOString(), ...report }));
process.exit(report.httpStatus === 200 ? 0 : 1);
