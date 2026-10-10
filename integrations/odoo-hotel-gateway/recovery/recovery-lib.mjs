// ATH-STAGING-RECOVERY — utilidades comunes. NO se ejecuta nada al importar.
// Guard propio: el staging NUEVO. Rechaza la base vieja y cualquier host de producción.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const TARGET_DB = 'atheron1-hotel-staging-20261009';
export const FORBIDDEN_DBS = Object.freeze(['atheron1-hotel-staging-20260923', 'atheron1']);
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..', '..');
export const BACKUP_DIR = resolve(REPO_ROOT, 'AI', 'staging-backup');
export const EXTRACT_DIR = resolve(REPO_ROOT, 'AI', 'recovery-extract');
export const PAYLOAD_DIR = resolve(HERE, 'payloads');
export const PLACEHOLDER = '__PLACEHOLDER_DUMP__';

export class RecoveryGuardError extends Error {}
export class BlockedError extends Error {}

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
  return { apply, dry: !apply, forceDiff: argv.includes('--force-diff'), plan: argv.includes('--plan') };
}

/** Escritura solo si --apply Y RECOVERY_CONFIRM == nombre exacto de la base nueva. */
export function assertMayWrite(args, env = process.env) {
  if (!args.apply) return false;
  if (env.RECOVERY_CONFIRM !== TARGET_DB) throw new RecoveryGuardError('--apply exige RECOVERY_CONFIRM=<base nueva exacta>');
  return true;
}

// ---- Odoo: ejecutor con lista blanca de métodos --------------------------------------------
const READ_METHODS = new Set(['search', 'search_read', 'search_count', 'read', 'fields_get', 'name_search', 'get_views']);
const WRITE_METHODS = new Set(['create', 'write']);
const DELETE_METHODS = new Set(['unlink']);

/**
 * Devuelve ex(model, method, args, kw). Los métodos de escritura solo se permiten si `write`;
 * unlink solo si `allowDelete` (únicamente los rollback). Cualquier otro método (p. ej. un
 * `action_*` o `button_*` que dispararía automatizaciones) se rechaza SIEMPRE.
 */
export function makeExecutor(transport, cfg, uid, { write = false, allowDelete = false } = {}) {
  return (model, method, args, kw = {}) => {
    const ok = READ_METHODS.has(method) || (write && WRITE_METHODS.has(method)) || (write && allowDelete && DELETE_METHODS.has(method));
    if (!ok) throw new RecoveryGuardError(`método no permitido en este modo: ${model}.${method}`);
    return transport.call('object', 'execute_kw', [cfg.db, uid, cfg.secret, model, method, args, kw]);
  };
}

/** Todas las escrituras corren con tracking/mail apagados para no disparar correos ni chatter. */
export const WRITE_CTX = Object.freeze({ tracking_disable: true, mail_notrack: true, mail_create_nolog: true, mail_create_nosubscribe: true, no_reset_password: true });
export const READ_CTX = Object.freeze({ active_test: false });

// ---- Respaldo JSON del repo y extracto del dump ----------------------------------------------
export const readBackup = (file) => JSON.parse(readFileSync(resolve(BACKUP_DIR, file), 'utf8'));

const hasPlaceholder = (v) => JSON.stringify(v).includes(PLACEHOLDER);

/** Carga AI/recovery-extract/<file>. Si falta o contiene el marcador, BLOQUEA sin inventar nada. */
export function loadExtract(file) {
  const p = resolve(EXTRACT_DIR, file);
  if (!existsSync(p)) throw new BlockedError(`FALTA ${p.replace(REPO_ROOT + '/', '')} (llega con el dump; ver recovery/EXTRACT-CONTRACT.md)`);
  const data = JSON.parse(readFileSync(p, 'utf8'));
  if (hasPlaceholder(data)) throw new BlockedError(`${file} contiene ${PLACEHOLDER}: metadata sin completar`);
  if (!Array.isArray(data)) throw new BlockedError(`${file} debe ser un arreglo JSON (ver contrato)`);
  return data;
}

export const sha256 = (s) => createHash('sha256').update(String(s ?? '')).digest('hex');

/** [id,nombre] -> nombre; false/null -> null; otro -> tal cual. */
export const m2oName = (v) => (Array.isArray(v) ? v[1] : v || null);

const SYSTEM_KEYS = new Set(['id', 'display_name', 'create_uid', 'create_date', 'write_uid', 'write_date', 'x_lock_touch']);

/** Separa una fila del respaldo en escalares y relaciones (las relaciones traen ids VIEJOS: no se usan). */
export function splitRow(row) {
  const scalars = {};
  const relations = {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM_KEYS.has(k)) continue;
    if (Array.isArray(v)) relations[k] = v;
    else scalars[k] = v;
  }
  return { scalars, relations };
}

/** Valor comparable: many2one [id,n] -> id; false/null/'' -> null; fechas/números tal cual. */
export const norm = (v) => (Array.isArray(v) ? (v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'string' ? v[0] : JSON.stringify(v)) : v === false || v === '' || v === undefined ? null : v);
export const differs = (cur, want) => norm(cur) !== norm(want);

// ---- Detección de IDs viejos dentro de código Python ---------------------------------------------
/**
 * Los ids de recurso/rol del staging viejo (28–32, 79, 69, 29, 19, 30, 37, 18…) pueden estar
 * escritos a mano dentro del código de acciones. Se detectan como números sueltos y se REPORTAN
 * para revisión humana; nunca se reescriben automáticamente.
 */
export function oldIdsFromBackup() {
  const ids = new Set();
  for (const u of readBackup('master-data-x_hotel_unit.json')) {
    for (const k of ['x_resource_id', 'x_role_id', 'x_product_tmpl_id', 'id']) if (Array.isArray(u[k]) ) ids.add(u[k][0]); else if (typeof u[k] === 'number' && k === 'id') ids.add(u[k]);
  }
  for (const p of readBackup('master-data-x_hotel_property.json')) ids.add(p.id);
  return ids;
}
export function findOldIdLiterals(code, oldIds = oldIdsFromBackup()) {
  const hits = new Set();
  for (const m of String(code ?? '').matchAll(/(?<![\w.])(\d{1,6})(?![\w.])/g)) {
    const n = Number(m[1]);
    if (n >= 10 && oldIds.has(n)) hits.add(n); // <10 genera demasiado ruido (índices, contadores)
  }
  return [...hits].sort((a, b) => a - b);
}
export const fieldTokens = (code) => [...new Set(String(code ?? '').match(/\bx_[a-z0-9_]+\b/g) ?? [])];

export function makeLogger(name) {
  const entries = [];
  return {
    add: (action, model, key, extra = {}) => { entries.push({ action, model, key, ...extra }); console.log(`${action.padEnd(8)} ${model} :: ${key}${extra.note ? '  [' + extra.note + ']' : ''}`); },
    flush(dir = resolve(HERE, 'out')) {
      mkdirSync(dir, { recursive: true });
      const f = resolve(dir, `${name}-${Date.now()}.json`);
      writeFileSync(f, JSON.stringify(entries, null, 2));
      return f;
    },
    entries,
  };
}

export function main(fn) {
  fn().catch((e) => {
    if (e instanceof BlockedError) { console.log(`BLOCKED: ${e.message}`); process.exit(3); }
    if (e instanceof RecoveryGuardError) { console.error(`GUARD: ${e.message}`); process.exit(2); }
    console.error(`ERROR: ${String(e?.diagnostic?.message || e?.message || e).slice(0, 400)}`); process.exit(1);
  });
}
