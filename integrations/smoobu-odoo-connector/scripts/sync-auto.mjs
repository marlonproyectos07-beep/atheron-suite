#!/usr/bin/env node
// ATH-DEV-125: SINCRONIZACION PROGRAMADA Smoobu -> Odoo (solo contactos + pedidos en BORRADOR), ver src/sync-auto.mjs.
// Escritor real SOLO si WRITES_ENABLED y RELEASE_UNLOCKED son true en el codigo y SYNC_ARM trae la frase de armado; en
// cualquier otro caso (hoy) corre EN SOMBRA con RecordingWriter: lecturas reales, 0 escrituras.
// Salida PUBLICA enmascarada: tablero de ocupacion, tablero de aprobaciones/conflictos, alertas y bitacora (sin datos personales).
// Codigo de salida 1 si una parada exige atencion (GitHub avisa por correo en ejecuciones programadas fallidas).
// ATH-DEV-130: cualquier salida distinta de 0 hace que el job `apagado` abra una incidencia BLOQUEO-ESCRITURA-SYNC: desde
// entonces la escritura queda BLOQUEADA (siempre en sombra) hasta que gerencia fije SYNC_DESBLOQUEO. El workflow sigue activo.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';
import { resolveWatchIds } from '../src/overbooking-watch.mjs';
import { dailyWindowEnv, DAILY_DEFAULT_DAYS } from '../src/daily-run.mjs';
import { runSyncDryRun } from '../src/sync-dryrun-run.mjs';
import { runAuto, alertsFrom, buildOccupancyBoard, renderOccupancyBoard, shutdownReason, readTotalCreates } from '../src/sync-auto.mjs';
import { buildDashboard, renderDashboard, readPendingPayments } from '../src/sync-dashboard.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { AutoWriteClient, autoArmedBy, AUTO_ARMED } from '../src/sync-auto-client.mjs';
import { Journal, FileLock, MemoryLock } from '../src/sync-journal.mjs';
import { readWriteLatch } from '../src/sync-latch.mjs';
import { sensitiveValues, assertPublicSafe } from '../src/public-report.mjs';

const out = (o, code) => { console.log(JSON.stringify(o)); process.exit(code); };
const now = new Date();
let window; let watchIds; let sc; let oc;
try {
  window = resolveWindow(process.env.RECONCILE_FROM ? process.env : dailyWindowEnv(now, process.env.RECONCILE_DAYS || DAILY_DEFAULT_DAYS));
  watchIds = resolveWatchIds(process.env); sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env);
} catch (e) { out({ result: 'FALLO', category: 'CONFIGURACION', code: e.code ?? 'CONFIG_ERROR', writes: 0 }, 2); }
const today = new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
// interruptor PROPIO (AUTO_ARMED + frase SYNC_ARM); los globales de escritura siguen en false
const armed = process.env.SYNC_SHADOW !== '1' && autoArmedBy({ armed: AUTO_ARMED, arm: process.env.SYNC_ARM ?? null });
// ATH-DEV-130: pestillo persistente (incidencias del bot vs SYNC_DESBLOQUEO); si no se puede comprobar, BLOQUEADO
const latch = await readWriteLatch({ repo: process.env.SYNC_LATCH_REPO, token: process.env.GH_TOKEN, ack: process.env.SYNC_DESBLOQUEO });
const real = armed && !latch.latched;
try {
  const smoobu = new SmoobuClient({ ...sc, pathPrefix: '/api' });
  const reader = new OdooJson2Client(oc);
  const { plan, report } = await runSyncDryRun({ smoobu, odoo: reader, window, today, watchIds });
  const writer = real ? new AutoWriteClient({ ...oc, arm: process.env.SYNC_ARM, maxWrites: 30 }) : new RecordingWriter({ maxWrites: 30 });
  const journal = process.env.SYNC_JOURNAL_PATH ? Journal.fromFile(process.env.SYNC_JOURNAL_PATH) : new Journal();
  const lock = process.env.SYNC_LOCK_PATH ? new FileLock(process.env.SYNC_LOCK_PATH) : new MemoryLock();
  const env = real ? process.env : { ...process.env, SYNC_ENABLED: process.env.SYNC_SHADOW === '1' ? 'true' : process.env.SYNC_ENABLED };
  const run = await runAuto({ plan, report, env, isKilled: () => process.env.SYNC_KILL === '1', reader, writer, smoobu, journal, lock, today });
  const pending = await readPendingPayments(reader, { today, sinceDays: 30 });
  const dash = buildDashboard({ report, plan: run.plan, run, pendingPayments: pending });
  const board = buildOccupancyBoard({ report, plan: run.plan, from: today, nights: 14 });
  const alerts = alertsFrom({ run, report });
  const stop = shutdownReason({ run, report });
  if (stop) alerts.push({ level: 'error', text: `APAGADO AUTOMATICO: ${stop}` });
  const historic = await readTotalCreates(reader);
  const cupo = run.daily ? `${run.daily.used}/${run.daily.max} hoy` : '-';
  const md = [renderDashboard(dash, { title: `Sincronizacion ${real ? 'REAL' : 'EN SOMBRA (sin escrituras)'} ${window.from} -> ${window.to}` }), renderOccupancyBoard(board),
    `Seguridad: modo ${real ? 'REAL' : 'SOMBRA'}; escrituras enviadas a Odoo = ${real ? run.writes : 0}; lote maximo = ${run.maxOps ?? '-'}; bloqueo de escritura = ${latch.latched ? `SI (${latch.reason}${latch.pending.length ? ` #${latch.pending.join(',#')}` : ''})` : 'no'}; auditoria Odoo = ${run.audit && !run.audit.ok ? run.audit.problems.map((p) => p.code).join(',') : 'ok'}; cupo diario = ${cupo} (pedidos de la sincronizacion en total: ${historic}); apagado automatico = ${stop ?? 'no'}; confirmar, cancelar, pagos y facturas bloqueados.`, ''].join('\n');
  const summary = { at: now.toISOString(), mode: real ? 'REAL' : 'SOMBRA', halted: run.halted ?? null, results: (run.results ?? []).map((r) => ({ op: r.op, result: r.result, code: r.code ?? null })), writesSentToOdoo: real ? run.writes : 0, latch: { latched: latch.latched, reason: latch.reason, pending: latch.pending.length }, audit: run.audit?.ok === false ? run.audit.problems.map((p) => p.code) : 'ok', daily: run.daily ?? null, historicCreates: historic, shutdown: stop, alerts: alerts.length };
  const text = JSON.stringify(summary) + md + JSON.stringify(alerts);
  const pii = plan.ops.flatMap((o) => [o.payload?.partner?.guest?.name, o.payload?.partner?.guest?.email, o.payload?.partner?.guest?.phone]).filter((v) => typeof v === 'string' && v.length > 3);
  const guard = assertPublicSafe(text, { identifiers: [...sensitiveValues(report), ...pii], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey, process.env.SYNC_ARM, process.env.GH_TOKEN].filter(Boolean) });
  if (!guard.safe) out({ result: 'DETALLE_RETENIDO', code: 'PRIVACY_GUARD_TRIPPED', hits: guard.hits, halted: summary.halted, writesSentToOdoo: summary.writesSentToOdoo }, 3);
  console.log(JSON.stringify(summary));
  for (const a of alerts) console.log(`::${a.level}::${a.text.replace(/[\r\n%]/g, ' ')}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (stop) process.exit(1);
} catch (e) { out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, mode: real ? 'REAL' : 'SOMBRA' }, 1); }
