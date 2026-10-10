// ATH-STAGING-RECOVERY-CLAUDE-001 — utilidades comunes. NO se ejecuta nada al importar.
// Guard propio: el staging NUEVO. Rechaza la base vieja y cualquier host de producción.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET_DB = 'atheron1-hotel-staging-20261009';
export const FORBIDDEN_DBS = Object.freeze(['atheron1-hotel-staging-20260923', 'atheron1']);
const HERE = dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = resolve(HERE, '..', '..', '..', 'AI', 'staging-backup');

export class RecoveryGuardError extends Error {}

export function loadRecoveryConfig(env = process.env) {
  for (const k of ['RECOVERY_TARGET_DB', 'ODOO_BASE_URL', 'ODOO_TECHNICAL_USER', 'ODOO_TECHNICAL_SECRET']) {
    if (!env[k] || !env[k].trim()) throw new RecoveryGuardError(`falta la variable ${k}`);
  }
  const db = env.RECOVERY_TARGET_DB;
  if (FORBIDDEN_DBS.includes(db)) throw new RecoveryGuardError('base prohibida (vieja o producción)');
  if (db !== TARGET_DB) throw new RecoveryGuardError(`RECOVERY_TARGET_DB debe ser exactamente ${TARGET_DB}`);
  if (env.ODOO_BASE_URL !== `https://${TARGET_DB}.odoo.com`) {
    throw new RecoveryGuardError('ODOO_BASE_URL debe ser el origen HTTPS exacto del staging nuevo');
  }
  return Object.freeze({ db, baseUrl: env.ODOO_BASE_URL, user: env.ODOO_TECHNICAL_USER, secret: env.ODOO_TECHNICAL_SECRET });
}

export function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const forceDiff = argv.includes('--force-diff');
  return { apply, forceDiff, dry: !apply };
}

/** Escritura solo si --apply Y RECOVERY_CONFIRM == nombre exacto de la base nueva. */
export function assertMayWrite(args, env = process.env) {
  if (!args.apply) return false;
  if (env.RECOVERY_CONFIRM !== TARGET_DB) throw new RecoveryGuardError('--apply exige RECOVERY_CONFIRM=<base nueva exacta>');
  return true;
}

export const readBackup = (file) => JSON.parse(readFileSync(resolve(BACKUP_DIR, file), 'utf8'));

/** Normaliza un many2one leído [id, nombre] -> nombre; false -> null. */
export const m2oName = (v) => (Array.isArray(v) ? v[1] : v || null);

const SYSTEM_KEYS = new Set(['id', 'display_name', 'create_uid', 'create_date', 'write_uid', 'write_date', 'x_lock_touch']);

/**
 * Convierte una fila del respaldo en payload ESCALAR reutilizable: quita campos de sistema y
 * TODA relación (many2one/one2many/many2many), que se resuelve por nombre aparte.
 * Devuelve { scalars, relations } para que el llamador resuelva las relaciones en el staging nuevo.
 */
export function splitRow(row) {
  const scalars = {};
  const relations = {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM_KEYS.has(k)) continue;
    if (Array.isArray(v)) relations[k] = v; // [id,nombre] o lista de ids: id viejo, NO se usa
    else scalars[k] = v;
  }
  return { scalars, relations };
}

export function makeLogger(name) {
  const entries = [];
  return {
    add: (action, model, key, extra = {}) => { entries.push({ action, model, key, ...extra }); console.log(`${action.padEnd(7)} ${model} :: ${key}`); },
    flush(dir = resolve(HERE, 'out')) {
      mkdirSync(dir, { recursive: true });
      const f = resolve(dir, `${name}-${Date.now()}.json`);
      writeFileSync(f, JSON.stringify(entries, null, 2));
      return f;
    },
    entries,
  };
}
