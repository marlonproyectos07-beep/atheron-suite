#!/usr/bin/env node
// ATH-DEV-121: PILOTO de UNA reserva (Airbnb 302, 14/01/2027): contacto + pedido en BORRADOR. Nada mas.
// Por defecto es SIMULACION (PILOT_DRY distinto de '0'): lecturas reales, escritor RecordingWriter, 0 escrituras.
//   Publica los dos tokens que gerencia debe dar para el piloto real (sin IDs ni datos personales) y simula el piloto
//   completo con esos tokens para comprobar que pasaria todas las validaciones con los datos de hoy.
// Modo real (PILOT_DRY=0): exige PILOT_APPROVAL y, si la clave es de administrador, PILOT_ADMIN_APPROVAL; usa SyncWriteClient,
//   que con WRITES_ENABLED/RELEASE_UNLOCKED en false NO PUEDE escribir (SYNC_WRITES_DISABLED). No hay workflow para este modo.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';
import { resolveWatchIds } from '../src/overbooking-watch.mjs';
import { dailyWindowEnv, DAILY_DEFAULT_DAYS } from '../src/daily-run.mjs';
import { runSyncDryRun } from '../src/sync-dryrun-run.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { PilotWriteClient } from '../src/sync-pilot-client.mjs';
import { Journal, MemoryLock, FileLock } from '../src/sync-journal.mjs';
import { findPilotTarget, runPilot, isAdminKey, pilotApprovalToken, adminApprovalToken, stateFingerprint, pilotPreflight, PILOT_TARGET } from '../src/sync-pilot.mjs';
import { maskSmoobu, sensitiveValues, assertPublicSafe } from '../src/public-report.mjs';

const out = (o, code) => { console.log(JSON.stringify(o)); process.exit(code); };
const now = new Date();
const dry = process.env.PILOT_DRY !== '0';
let window; let watchIds; let sc; let oc;
try {
  window = resolveWindow(process.env.RECONCILE_FROM ? process.env : dailyWindowEnv(now, process.env.RECONCILE_DAYS || DAILY_DEFAULT_DAYS));
  watchIds = resolveWatchIds(process.env); sc = loadSmoobuConfig(process.env); oc = loadOdooConfig(process.env);
} catch (e) { out({ result: 'FALLO', category: 'CONFIGURACION', code: e.code ?? 'CONFIG_ERROR', writes: 0 }, 2); }
const today = new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
try {
  const smoobu = new SmoobuClient({ ...sc, pathPrefix: '/api' });
  const reader = new OdooJson2Client(oc);
  const { plan, report } = await runSyncDryRun({ smoobu, odoo: reader, window, today, watchIds });
  const op = findPilotTarget(plan, PILOT_TARGET);
  const who = await isAdminKey(reader); const admin = who === true || who.admin;
  const fresh = await smoobu.getReservation(op.smoobuId);
  const fp = stateFingerprint(fresh);
  const tokens = { approval: pilotApprovalToken(op, fp), admin: admin ? adminApprovalToken(op, fp) : null };
  // lista de verificacion previa (solo lecturas); en simulacion con los tokens vigentes, en real con los recibidos
  const preflight = await pilotPreflight({ op, fresh, fp, approval: dry ? tokens.approval : (process.env.PILOT_APPROVAL ?? null), adminApproval: dry ? tokens.admin : (process.env.PILOT_ADMIN_APPROVAL ?? null), admin, reader, writer: { maxWrites: 3, writes: 0 } });
  let res;
  if (dry) {
    res = await runPilot({ plan, smoobuId: op.smoobuId, approval: tokens.approval, adminApproval: tokens.admin, reader, writer: new RecordingWriter({ maxWrites: 3 }), smoobu, journal: new Journal(), lock: new MemoryLock(), today });
  } else {
    // REAL: cliente exclusivo del piloto, atado a esta operacion; hoy desarmado (PILOT_ARMED=false)
    res = await runPilot({ plan, smoobuId: op.smoobuId, approval: process.env.PILOT_APPROVAL ?? null, adminApproval: process.env.PILOT_ADMIN_APPROVAL ?? null, reader,
      writer: new PilotWriteClient({ ...oc, op, arm: process.env.PILOT_ARM ?? null }), smoobu,
      journal: Journal.fromFile(process.env.SYNC_JOURNAL_PATH ?? 'sync-journal.jsonl'), lock: new FileLock(process.env.SYNC_LOCK_PATH ?? 'sync.lock'), today });
  }
  const pub = { at: now.toISOString(), result: dry ? 'PILOTO_SIMULADO' : 'PILOTO_REAL', target: { ref: maskSmoobu(op.smoobuId), unit: op.unit, arrival: op.arrival, departure: op.departure, op: op.op, status: op.status, guards: op.guards },
    keyIsAdmin: admin, ...(dry ? { tokensRequired: tokens } : { tokensRequired: 'NO_SE_PUBLICAN_EN_MODO_REAL' }), preflight: preflight.checks.map((c) => `${c.name}:${c.ok ? 'OK' : c.code}`), halted: res.halted ?? null, results: (res.results ?? []).map((r) => ({ result: r.result, code: r.code ?? null, steps: r.steps ?? [] })), writesSentToOdoo: dry ? 0 : (res.writes ?? 0) };
  const text = JSON.stringify(pub);
  const pii = [op.payload?.partner?.guest?.name, op.payload?.partner?.guest?.email, op.payload?.partner?.guest?.phone].filter((v) => typeof v === 'string' && v.length > 3);
  const tokenValues = dry ? [] : [tokens.approval, tokens.admin, process.env.PILOT_APPROVAL, process.env.PILOT_ADMIN_APPROVAL, process.env.PILOT_ARM].filter((v) => typeof v === 'string' && v.length > 3);
  const guard = assertPublicSafe(text, { identifiers: [...sensitiveValues(report), ...pii], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey, ...tokenValues] });
  if (!guard.safe) out({ result: 'DETALLE_RETENIDO', category: 'PRIVACIDAD', code: 'PRIVACY_GUARD_TRIPPED', hits: guard.hits, halted: pub.halted, results: pub.results.map((r) => r.result), writesSentToOdoo: pub.writesSentToOdoo }, 3);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## Piloto de una reserva (${dry ? 'SIMULADO, sin escrituras' : 'REAL'})`, '',
    `Reserva: ${pub.target.ref} | ${op.unit} | ${op.arrival} -> ${op.departure} | ${op.op} ${op.status} ${op.guards.join(',')}`,
    `Clave de administrador: ${admin ? 'SI (exige doble aprobacion)' : 'no'}`, `Verificacion previa: ${pub.preflight.join(' | ')}`,
    ...(dry ? [`Token de aprobacion: \`${tokens.approval}\``, tokens.admin ? `Token de administrador: \`${tokens.admin}\`` : ''] : ['Tokens: no se publican en modo real']),
    `Resultado: ${pub.results.map((r) => `${r.result} ${r.code ?? ''} [${r.steps.join(', ')}]`).join('; ') || pub.halted}`, `Escrituras enviadas a Odoo: ${pub.writesSentToOdoo}`, ''].join('\n'));
} catch (e) { out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, writes: 0 }, 1); }
