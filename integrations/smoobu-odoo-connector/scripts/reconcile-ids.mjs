#!/usr/bin/env node
// ATH-DEV-041: conciliacion Smoobu -> Odoo por IDENTIFICADORES, EN MEMORIA y SOLO LECTURA.
// Ventana: RECONCILE_FROM / RECONCILE_TO (YYYY-MM-DD, noches inclusive, maximo 120). Sin ellas usa la ventana historica.
// Smoobu: solo GET /api/reservations (paginado, con tope). Odoo: solo fields_get y search_read.
// No ejecuta create/write/unlink, acciones de servidor ni crons. Salida: ids, fechas, codigos y conteos; sin nombres ni textos libres.
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';
import { runReconcileIds } from '../src/reconcile-ids-run.mjs';

let window;
try { window = resolveWindow(process.env); } catch (e) { console.log(JSON.stringify({ result: 'WINDOW_ERROR', code: e.code, smoobuRequests: 0, odooCalls: 0 })); process.exit(2); }

let sc; let oc;
try { sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env); } catch (e) { console.log(JSON.stringify({ result: 'CONFIG_ERROR', code: e.code, missing: e.missing, smoobuRequests: 0, odooCalls: 0 })); process.exit(2); }

try {
  const out = await runReconcileIds({ smoobu: new SmoobuClient({ ...sc, pathPrefix: '/api' }), odoo: new OdooJson2Client(oc), window });
  console.log(JSON.stringify({ at: new Date().toISOString(), result: 'CONCILIACION_POR_IDS_EN_MEMORIA', legacyWindow: window.legacy, ...out }));
} catch (e) {
  console.log(JSON.stringify({ result: 'CONCILIACION_NO_REALIZADA', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, writes: 0 }));
  process.exit(1);
}
