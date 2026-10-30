#!/usr/bin/env node
// ATH-DEV-116: ejecucion EN SOMBRA del ejecutor de sincronizacion contra datos reales. SIN ESCRITURAS.
//  - Plan: el mismo de sync-dryrun (lecturas reales).
//  - Prevalidacion: lecturas reales y frescas de Smoobu (GET de cada reserva) y Odoo (search_read/search_count).
//  - Escritura: RecordingWriter (misma lista blanca y tope que el cliente real, pero no envia nada; ids ficticios negativos).
//  - En sombra se dan por "aprobadas" las operaciones que lo requieren, solo para ejercitar su prevalidacion. Nada se aplica.
// Salida PUBLICA: IDs enmascarados, operacion, resultado, codigo y nombres de pasos. Nunca valores, importes ni nombres.
import { appendFileSync } from 'node:fs';
import { loadSmoobuConfig, loadOdooConfig } from '../src/config.mjs';
import { SmoobuClient } from '../src/smoobu-client.mjs';
import { OdooJson2Client } from '../src/odoo-json2-client.mjs';
import { resolveWindow } from '../src/window.mjs';
import { resolveWatchIds } from '../src/overbooking-watch.mjs';
import { dailyWindowEnv, DAILY_DEFAULT_DAYS } from '../src/daily-run.mjs';
import { runSyncDryRun } from '../src/sync-dryrun-run.mjs';
import { applyPlan } from '../src/sync-apply.mjs';
import { RecordingWriter } from '../src/sync-write-client.mjs';
import { Journal, MemoryLock } from '../src/sync-journal.mjs';
import { STATUS } from '../src/sync-intent.mjs';
import { maskSmoobu, sensitiveValues, assertPublicSafe } from '../src/public-report.mjs';

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
  const { plan, report, reads } = await runSyncDryRun({ smoobu, odoo: reader, window, today, watchIds });
  const writer = new RecordingWriter({ maxWrites: 200 });
  const approvals = new Set(plan.ops.filter((o) => o.status === STATUS.REQUIERE_APROBACION).map((o) => o.key));
  const res = await applyPlan({ plan, reader, writer, smoobu, journal: new Journal(), lock: new MemoryLock(), approvals, maxOps: 50, today });
  const pub = {
    at: now.toISOString(), result: 'SOMBRA_SIN_ESCRITURAS', window: { from: window.from, to: window.to }, today, reads, mode: res.mode, halted: res.halted,
    approvalsSimulated: approvals.size,
    results: res.results.map((r) => ({ ref: maskSmoobu(r.smoobuId), unit: r.unit, arrival: r.arrival, departure: r.departure, op: r.op, planStatus: r.status, result: r.result, code: r.code ?? null, steps: r.steps ?? [] })),
    recordedWrites: writer.log.map((w) => `${w.model}.${w.method}(${w.fields.join(',')})`),
    totals: plan.totals,
    safety: { ...plan.safety, writerSimulated: true, odooWritesSent: 0 },
  };
  const text = JSON.stringify(pub);
  const pii = plan.ops.flatMap((o) => [o.payload?.partner?.guest?.name, o.payload?.partner?.guest?.email, o.payload?.partner?.guest?.phone]).filter((v) => typeof v === 'string' && v.length > 3);
  const guard = assertPublicSafe(text, { identifiers: [...sensitiveValues(report), ...pii], secrets: [sc.apiKey, sc.apiSecret, oc.apiKey] });
  if (!guard.safe) out({ result: 'FALLO', category: 'PRIVACIDAD', code: 'PRIVACY_GUARD_TRIPPED', hits: guard.hits, writes: 0 }, 3);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## Ejecutor en sombra (sin escrituras) ${window.from} -> ${window.to}`, '', `Parada: ${pub.halted ?? 'ninguna'} | Aprobaciones simuladas: ${pub.approvalsSimulated}`, '',
      '| Reserva | Hab. | Llegada | Operacion | Estado del plan | Resultado | Codigo | Pasos |', '|---|---|---|---|---|---|---|---|',
      ...pub.results.map((r) => `| ${r.ref} | ${r.unit} | ${r.arrival} | ${r.op} | ${r.planStatus} | ${r.result} | ${r.code ?? ''} | ${r.steps.join(', ')} |`), '',
      `Escrituras registradas (no enviadas): ${pub.recordedWrites.length ? pub.recordedWrites.join(' ; ') : 'ninguna'}`, '',
      `Seguridad: writesEnabled=${pub.safety.writesEnabled}, releaseUnlocked=${pub.safety.releaseUnlocked}, escritor simulado=${pub.safety.writerSimulated}, escrituras enviadas a Odoo=0.`, ''].join('\n'));
  }
} catch (e) {
  out({ result: 'FALLO', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null, writes: 0 }, 1);
}
