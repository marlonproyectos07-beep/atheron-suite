#!/usr/bin/env node
// ATH-DEV-120: MODO SEMIAUTOMATICO en SOMBRA contra datos reales. Sin escrituras: el escritor es RecordingWriter.
// Lee Smoobu y Odoo, arma el plan, lo reclasifica (solo borradores automaticos; lo demas con aprobacion por operacion),
// ejecuta con el escritor simulado y publica el TABLERO enmascarado. Bitacora en SYNC_JOURNAL_PATH (si se indica).
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';
import { resolveWatchIds } from '../src/overbooking-watch.mjs';
import { dailyWindowEnv, DAILY_DEFAULT_DAYS } from '../src/daily-run.mjs';
import { runSyncDryRun } from '../src/sync-dryrun-run.mjs';
import { runSemiauto } from '../src/sync-semiauto.mjs';
import { buildDashboard, renderDashboard, readPendingPayments } from '../src/sync-dashboard.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
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
  const smoobu = new SmoobuClient({ ...sc, pathPrefix: '/api' });
  const reader = new OdooJson2Client(oc);
  const { plan, report } = await runSyncDryRun({ smoobu, odoo: reader, window, today, watchIds });
  const pendingPayments = await readPendingPayments(reader, { today, sinceDays: 30 });
  const journal = process.env.SYNC_JOURNAL_PATH ? Journal.fromFile(process.env.SYNC_JOURNAL_PATH) : new Journal();
  // SOMBRA: se habilita el modo solo porque el escritor es simulado; el apagado SYNC_KILL sigue mandando
  const run = await runSemiauto({ plan, env: { ...process.env, SYNC_ENABLED: 'true' }, isKilled: () => process.env.SYNC_KILL === '1', reader, writer: new RecordingWriter(), smoobu, journal, lock: new MemoryLock(), today });
  const dash = buildDashboard({ report, plan: run.plan ?? plan, run, pendingPayments });
  const md = renderDashboard(dash, { title: `Tablero semiautomatico (SOMBRA, sin escrituras) ${window.from} -> ${window.to}` });
  const text = JSON.stringify({ at: now.toISOString(), result: 'SEMIAUTO_SOMBRA', limits: run.limits ?? null, dashboard: dash }) + md;
  const pii = plan.ops.flatMap((o) => [o.payload?.partner?.guest?.name, o.payload?.partner?.guest?.email, o.payload?.partner?.guest?.phone]).filter((v) => typeof v === 'string' && v.length > 3);
  const guard = assertPublicSafe(text, { identifiers: [...sensitiveValues(report), ...pii], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey] });
  if (!guard.safe) out({ result: 'FALLO', category: 'PRIVACIDAD', code: 'PRIVACY_GUARD_TRIPPED', hits: guard.hits, writes: 0 }, 3);
  console.log(JSON.stringify({ result: 'SEMIAUTO_SOMBRA', halted: run.halted ?? null, writesSentToOdoo: 0, recorded: run.writes ?? 0, received: dash.received, toCreate: dash.drafts.toCreate.length, approvals: dash.approvalsPending.length, conflicts: dash.conflicts.length, paymentsPending: dash.paymentsReportedNotConfirmed.length }));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\nSeguridad: escritor simulado, escrituras enviadas a Odoo = 0.\n`);
} catch (e) { out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, writes: 0 }, 1); }
