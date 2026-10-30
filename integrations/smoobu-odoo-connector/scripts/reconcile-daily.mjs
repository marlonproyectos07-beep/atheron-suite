#!/usr/bin/env node
// ATH-DEV-108: conciliacion DIARIA Smoobu -> Odoo, SOLO LECTURA (ver src/daily-run.mjs).
// Ventana: hoy (Bogota) + RECONCILE_DAYS noches (por defecto 90, maximo 120), o RECONCILE_FROM/RECONCILE_TO si se dan.
// Salida PUBLICA: resumen enmascarado por stdout; markdown en GITHUB_STEP_SUMMARY; informe publico en REPORT_FILE.
// Codigos de salida: 0 OK (aunque haya reservas faltantes: el resumen dice ATENCION), 1 fallo de lectura
// (credenciales, API incompleta, red), 2 configuracion, 3 barrera de privacidad, 4 interruptor de escritura activo.
import { appendFileSync, writeFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWatchIds } from '../src/overbooking-watch.mjs';
import { runDaily, renderMarkdown, EXIT } from '../src/daily-run.mjs';

const at = new Date().toISOString();
const emit = (res) => {
  console.log(JSON.stringify(res.stdout));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, res.markdown);
  if (process.env.REPORT_FILE && res.report) writeFileSync(process.env.REPORT_FILE, JSON.stringify({ summary: res.stdout, report: res.report }));
  process.exit(res.exitCode);
};
const fail = (category, code, missing) => {
  const s = { at, result: 'FALLO', failure: { category, code, httpStatus: null }, ...(missing ? { missing } : {}), writes: 0 };
  emit({ exitCode: EXIT.CONFIG, stdout: s, markdown: renderMarkdown(s), report: null });
};

let watchIds; let sc; let oc;
try { watchIds = resolveWatchIds(process.env); } catch (e) { fail('CONFIGURACION', e.code ?? 'WATCH_ERROR'); }
try { sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env); } catch (e) { fail('CONFIGURACION', e.code ?? 'CONFIG_ERROR', e.missing); }

emit(await runDaily({
  smoobu: new SmoobuClient({ ...sc, pathPrefix: '/api' }),
  odoo: new OdooJson2Client(oc),
  env: process.env,
  watchIds,
  secrets: [sc.apiKey, sc.apiSecret, oc.apiKey],
}));
