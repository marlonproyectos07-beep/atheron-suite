// ATH-STAGING-RECOVERY-007 — contexto de ejecución de una capa. Nada se ejecuta al importar.
import { resolve } from 'node:path';
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { loadRecoveryConfig, parseArgs, assertMayWrite, makeExecutor, makeLogger, READ_CTX, TARGET_DB, REPO_ROOT } from './recovery-lib.mjs';
import { Journal, makeEnsure } from './engine.mjs';

export const JOURNAL_PATH = resolve(REPO_ROOT, 'integrations/odoo-hotel-gateway/recovery/out', `journal-${TARGET_DB}.jsonl`);

/** Arma el contexto a partir de un transporte ya creado (real o falso en pruebas). */
export async function makeCtx({ transport, cfg, layer, write = false, args = {}, allowDelete = false, journalPath = JOURNAL_PATH, extractDir = null, env = process.env }) {
  const uid = await transport.call('common', 'login', [cfg.db, cfg.user, cfg.secret]);
  const ex = makeExecutor(transport, cfg, uid, { write, allowDelete });
  const log = makeLogger(layer);
  const journal = new Journal(journalPath);
  const ctx = { cfg, ex, write, args, log, journal, layer, extractDir, env, transport };
  ctx.ensure = makeEnsure({ ex, write, args, log, journal, layer });
  return ctx;
}

/** Sesión real contra el staging NUEVO (guard de base y de URL incluido). */
export async function connect(layer, { allowDelete = false, argv = process.argv.slice(2), env = process.env } = {}) {
  const args = parseArgs(argv);
  const cfg = loadRecoveryConfig(env);
  const write = assertMayWrite(args, env);
  const transport = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  return makeCtx({ transport, cfg, layer, write, args, allowDelete, env });
}

export async function findOne(ex, model, domain) {
  const r = await ex(model, 'search', [domain], { limit: 2, context: READ_CTX });
  return r.length === 1 ? r[0] : null;
}
export { makeEnsure };
