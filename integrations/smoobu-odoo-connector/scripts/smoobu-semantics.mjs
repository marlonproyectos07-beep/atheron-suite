#!/usr/bin/env node
// ATH-DEV-029 fase 1: UNA lectura acotada para contrastar la semantica de from/to con ids y fechas ya conocidos.
// GET /api/reservations?from=2026-10-20&to=2026-10-20, solo pagina 1. Sin Odoo, sin escrituras, salida sin datos personales.
import { loadSmoobuConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { analyzeSemantics, PROBE_DAY, KNOWN_SPANNING_ID } from '../src/semantics-probe.mjs';

let cfg;
try { cfg = loadSmoobuConfig(process.env); } catch (e) { console.log(JSON.stringify({ result: 'CONFIG_ERROR', code: e.code, missing: e.missing, requests: 0 })); process.exit(2); }
const client = new SmoobuClient({ ...cfg, pathPrefix: '/api' });
let out;
try {
  const data = await client.listReservationsPage({ from: PROBE_DAY, to: PROBE_DAY, page: 1, pageSize: 100, includeCancelled: true });
  out = { requests: 1, endpoint: 'GET /api/reservations', httpStatus: 200, probe: { from: PROBE_DAY, to: PROBE_DAY }, ...analyzeSemantics(data) };
} catch (e) { out = { requests: 1, endpoint: 'GET /api/reservations', httpStatus: e.status ?? null, code: e.code ?? 'UNKNOWN', upstreamMessage: e.detail ?? null, semantics: 'NO_CONFIRMADA' }; }
console.log(JSON.stringify({ at: new Date().toISOString(), knownSpanningId: KNOWN_SPANNING_ID, ...out }));
process.exit(out.httpStatus === 200 ? 0 : 1);
