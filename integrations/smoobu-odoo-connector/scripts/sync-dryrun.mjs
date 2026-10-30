#!/usr/bin/env node
// ATH-DEV-115: SIMULACION del plan de sincronizacion Smoobu -> Odoo contra datos reales. SOLO LECTURA.
// Ventana: RECONCILE_FROM/RECONCILE_TO o, si faltan, hoy (Bogota) + RECONCILE_DAYS noches (90 por defecto, maximo 120).
// Imprime la vista PUBLICA del plan (IDs enmascarados, nombres de campos, codigos de bloqueo). Nunca valores, importes ni nombres.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';
import { resolveWatchIds } from '../src/overbooking-watch.mjs';
import { dailyWindowEnv, DAILY_DEFAULT_DAYS } from '../src/daily-run.mjs';
import { runSyncDryRun } from '../src/sync-dryrun-run.mjs';
import { toPublicPlan } from '../src/sync-intent.mjs';
import { sensitiveValues, assertPublicSafe } from '../src/public-report.mjs';

const out = (o, code) => { console.log(JSON.stringify(o)); process.exit(code); };
const now = new Date();
let window; let watchIds; let sc; let oc;
try {
  const wEnv = process.env.RECONCILE_FROM || process.env.RECONCILE_TO ? process.env : dailyWindowEnv(now, process.env.RECONCILE_DAYS || DAILY_DEFAULT_DAYS);
  window = resolveWindow(wEnv); watchIds = resolveWatchIds(process.env);
  sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env);
} catch (e) { out({ result: 'FALLO', category: 'CONFIGURACION', code: e.code ?? 'CONFIG_ERROR', writes: 0 }, 2); }

const today = new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
try {
  const res = await runSyncDryRun({ smoobu: new SmoobuClient({ ...sc, pathPrefix: '/api' }), odoo: new OdooJson2Client(oc), window, today, watchIds });
  const pub = { at: now.toISOString(), result: 'PLAN_SIMULADO_SIN_ESCRITURAS', window: { from: window.from, to: window.to }, today, reads: res.reads, ...toPublicPlan(res.plan) };
  const text = JSON.stringify(pub);
  // ademas de los IDs, nada del payload (nombres, correos, telefonos) puede aparecer
  const piiValues = res.plan.ops.flatMap((o) => [o.payload?.partner?.guest?.name, o.payload?.partner?.guest?.email, o.payload?.partner?.guest?.phone]).filter((v) => typeof v === 'string' && v.length > 3);
  const guard = assertPublicSafe(text, { identifiers: [...sensitiveValues(res.report), ...piiValues], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey] });
  if (!guard.safe) out({ result: 'FALLO', category: 'PRIVACIDAD', code: 'PRIVACY_GUARD_TRIPPED', hits: guard.hits, totals: res.plan.totals, writes: 0 }, 3);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = pub.ops.filter((o) => o.op !== 'NOOP').map((o) => `| ${o.ref} | ${o.unit} | ${o.arrival} | ${o.departure} | ${o.op} | ${o.status} | ${o.guards.join(', ')} | ${o.changes.join(', ')} |`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## Plan de sincronizacion (simulado, sin escrituras) ${window.from} -> ${window.to}`, '',
      `Operaciones: ${JSON.stringify(pub.totals.byOp)} | Estados: ${JSON.stringify(pub.totals.byStatus)}`, '',
      '| Reserva | Hab. | Llegada | Salida | Operacion | Estado | Bloqueos | Campos |', '|---|---|---|---|---|---|---|---|', ...rows, '',
      `Seguridad: writesEnabled=${pub.safety.writesEnabled}, releaseUnlocked=${pub.safety.releaseUnlocked}, aplicadas=${pub.safety.applied}, escrituras en Odoo=${pub.reads.odoo.writes}.`, ''].join('\n'));
  }
} catch (e) {
  out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, writes: 0 }, 1);
}
