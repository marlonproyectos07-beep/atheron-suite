#!/usr/bin/env node
/**
 * HOTEL-017 — alta de salida iCal por habitacion (accion + envoltorio + cron + feed booking).
 *
 * DRY-RUN por defecto (solo lectura):
 *   .\scripts\secure-store\load-odoo-secrets.ps1 -Command "node scripts/hotel017-room-setup.mjs --unit 203"
 *
 * Escritura: exige --apply, --confirm-staging y --model-id (modelo de las acciones, p. ej. 657 "Planning Shift").
 *   ... -Command "node scripts/hotel017-room-setup.mjs --unit 203 --apply --confirm-staging --model-id 657"
 *
 * Rechaza Production: solo opera sobre la base y URL de STAGING (cargador seguro + assertStagingOnly).
 * No imprime URLs, tokens ni contenido de adjuntos.
 */
import { pathToFileURL } from 'node:url';
import { loadGuardedConfig } from './live-hotel-008a-runner.mjs';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { assertStagingOnly, redact } from '../src/hotel017-tooling.mjs';
import { planOutbound, readOutboundState, assessOutboundSetup, applyOutboundSetup, ensureBookingFeed } from '../src/hotel017-ops.mjs';

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

export async function runRoomSetup(argv = process.argv.slice(2), env = process.env) {
  const unit = argValue(argv, '--unit');
  if (!unit) throw new Error('UNIT_REQUIRED');
  const apply = argv.includes('--apply');
  if (apply && !argv.includes('--confirm-staging')) throw new Error('APPLY_REQUIRES_CONFIRM_STAGING');
  const modelId = Number(argValue(argv, '--model-id'));
  const plan = planOutbound(unit);
  const cfg = loadGuardedConfig(env);
  assertStagingOnly({ database: cfg.database, baseUrl: cfg.baseUrl });
  const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  const uid = await transport.call('common', 'login', [cfg.database, cfg.technicalUser, cfg.technicalSecret]);
  if (!uid) throw new Error('LOGIN_FAILED');
  const ex = (model, method, args, kwargs = {}) => transport.call('object', 'execute_kw', [cfg.database, uid, cfg.technicalSecret, model, method, args, kwargs]);

  const state = await readOutboundState(ex, plan);
  const verdict = assessOutboundSetup(plan, state);
  if (!apply) return { ...verdict, feedBooking: state.feedIds.length ? 'exists' : 'missing' };
  const created = await applyOutboundSetup(ex, plan, { apply: true, modelId });
  const feed = await ensureBookingFeed(ex, plan, { apply: true });
  // Un unico refresco del adjunto de la habitacion (escribe SOLO su adjunto).
  await ex('ir.actions.server', 'run', [[created.refreshId]], {});
  return { mode: 'WRITE', room: plan.room, refreshAction: created.refreshId, wrapperAction: created.wrapperId, cron: created.cronId, cronWired: created.wired, feed: feed.created ? 'created' : feed.id ?? null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRoomSetup().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    const msg = redact(error?.message ?? 'SETUP_FAILED');
    console.error(/^[A-Z][A-Z0-9_:,]{2,120}$/.test(msg) ? msg : 'SETUP_FAILED');
    process.exitCode = 2;
  });
}
