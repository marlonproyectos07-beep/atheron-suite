// ATH-STAGING-RECOVERY — conexión + "ensure" idempotente compartido. Nada se ejecuta al importar.
import { HttpOdooTransport } from '../src/odoo-transport.mjs';
import { loadRecoveryConfig, parseArgs, assertMayWrite, makeExecutor, makeLogger, differs, READ_CTX, WRITE_CTX } from './recovery-lib.mjs';

/** Abre sesión en el staging NUEVO. `write` solo es true con --apply + RECOVERY_CONFIRM. */
export async function connect(name, { allowDelete = false, argv = process.argv.slice(2) } = {}) {
  const args = parseArgs(argv);
  const cfg = loadRecoveryConfig();
  const write = assertMayWrite(args);
  const t = new HttpOdooTransport({ baseUrl: cfg.baseUrl });
  const uid = await t.call('common', 'login', [cfg.db, cfg.user, cfg.secret]);
  const version = await t.call('common', 'version', []).catch(() => null); // solo lectura
  const ex = makeExecutor(t, cfg, uid, { write, allowDelete });
  const log = makeLogger(name);
  return { args, cfg, write, ex, log, version };
}

/**
 * Buscar -> comparar -> (crear | omitir | informar diferencia). Nunca sobrescribe sin --force-diff.
 * `compareFields` limita qué campos se comparan (por defecto, todos los del payload).
 * Devuelve el id existente o creado; null en dry-run/ambiguo.
 */
export function makeEnsure({ ex, write, args, log }) {
  return async function ensure(model, domain, payload, label, { compareFields } = {}) {
    const keys = compareFields ?? Object.keys(payload);
    const found = await ex(model, 'search_read', [domain], { fields: keys, limit: 3, context: READ_CTX });
    if (found.length > 1) { log.add('AMBIGUO', model, label, { note: `${found.length} coincidencias; no se escribe` }); return null; }
    if (found.length === 0) {
      if (!write) { log.add('CREATE?', model, label); return null; }
      const id = await ex(model, 'create', [payload], { context: WRITE_CTX });
      log.add('CREATE', model, label, { id });
      return id;
    }
    const cur = found[0];
    const diff = keys.filter((k) => k in payload && differs(cur[k], payload[k]));
    if (diff.length === 0) { log.add('SKIP', model, label, { id: cur.id }); return cur.id; }
    if (write && args.forceDiff) {
      await ex(model, 'write', [[cur.id], Object.fromEntries(diff.map((k) => [k, payload[k]]))], { context: WRITE_CTX });
      log.add('UPDATE', model, label, { id: cur.id, fields: diff });
    } else log.add('DIFF', model, label, { id: cur.id, fields: diff });
    return cur.id;
  };
}

/** Un único id o null. Más de uno = ambiguo = null (el llamador lo reporta). */
export async function findOne(ex, model, domain) {
  const r = await ex(model, 'search', [domain], { limit: 2, context: READ_CTX });
  return r.length === 1 ? r[0] : null;
}
