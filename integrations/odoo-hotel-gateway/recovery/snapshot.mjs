// ATH-STAGING-RECOVERY-007 — SNAPSHOT previo (solo lectura) de la configuración que la recuperación va a tocar.
// Sirve para: comparación PRE/POST, comprobar que un rollback dejó el estado como estaba, y auditoría.
// SIN secretos ni PII: no lee partners, usuarios, reservas, pagos ni adjuntos (de esos solo cuenta filas). El código de
// acciones y la arquitectura de vistas se guardan como SHA-256 + longitud, no en claro (el contenido que se restaura vive en la
// bitácora `before` solo cuando algo se modifica). Se marcan las acciones cuyo código parece contener una credencial.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { READ_CTX } from './recovery-lib.mjs';

const OR = (...ds) => ds.reduce((acc, d, i) => (i === 0 ? [d] : ['|', ...acc, d]), []);
const NAME_LIKE = (...ns) => OR(...ns.map((n) => ['name', 'like', n]));

/** Qué se lee de cada modelo. `hash` = campos que se guardan solo como huella. `key` = clave natural para comparar. */
export const SPEC = Object.freeze([
  { model: 'ir.model', domain: ['|', ['model', 'like', 'x_hotel_'], ['model', '=', 'x_guests_line']], fields: ['model', 'name', 'state'], key: ['model'] },
  { model: 'ir.model.fields', domain: ['|', '|', ['model', 'like', 'x_hotel_'], ['model', '=', 'x_guests_line'], '&', ['model', 'in', ['sale.order', 'planning.slot', 'account.payment']], ['name', 'like', 'x_']], fields: ['model', 'name', 'ttype', 'relation', 'relation_field', 'required', 'state'], key: ['model', 'name'] },
  { model: 'ir.actions.server', domain: NAME_LIKE('HOTEL v1', 'ATHERON'), fields: ['name', 'state', 'model_id'], hash: ['code'], key: ['name', 'model_id'] },
  { model: 'base.automation', domain: NAME_LIKE('HOTEL v1', 'ATHERON'), fields: ['name', 'model_id', 'trigger', 'active', 'filter_domain', 'action_server_ids'], key: ['name', 'model_id'] },
  { model: 'ir.cron', domain: [], fields: ['interval_number', 'interval_type', 'active', 'ir_actions_server_id'], cronName: true, filterName: /HOTEL|ATHERON/i, key: ['@name'] },
  { model: 'ir.ui.view', domain: OR(['name', 'like', 'HOTEL v1'], ['name', 'like', 'Odoo Studio: sale.order.kanban']), fields: ['name', 'model', 'inherit_id', 'mode', 'priority', 'active'], hash: ['arch'], key: ['name', 'model'] },
  { model: 'ir.ui.menu', domain: OR(['name', 'like', 'Hotel'], ['name', 'like', 'Reservas hotel']), fields: ['name', 'parent_id', 'sequence', 'action'], key: ['name', 'parent_id'] },
  { model: 'ir.filters', domain: ['|', ['model_id', '=', 'sale.order'], ['name', 'like', 'Operaci']], fields: ['name', 'model_id', 'domain', 'is_default', 'action_id'], key: ['name', 'model_id'] },
  { model: 'ir.actions.act_window', domain: [['name', 'like', 'Hotel v1']], fields: ['name', 'res_model', 'domain', 'context', 'view_mode'], key: ['name', 'res_model'] },
  // datos maestros del hotel (sin PII): todo campo escalar
  ...['x_hotel_property', 'x_hotel_unit', 'x_hotel_rate', 'x_hotel_rate_line', 'x_hotel_deposit_policy'].map((model) => ({ model, domain: [], allScalar: true, key: ['x_name'] })),
]);
export const COUNT_ONLY = Object.freeze(['sale.order', 'planning.slot', 'res.partner', 'account.payment', 'res.users', 'x_hotel_quote', 'x_hotel_ota_feed', 'x_hotel_api_log']);

const SECRET_RX = [/(api[_-]?key|secret|token|passw(or)?d|bearer)\s*[:=]\s*['"][^'"\s]{8,}/i, /['"][A-Za-z0-9+/_=-]{40,}['"]/];
export const looksSecret = (text) => SECRET_RX.some((r) => r.test(String(text ?? '')));
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const keyVal = (v) => (Array.isArray(v) ? v[1] : v);

export function keyOf(spec, row) { return spec.key.map((k) => keyVal(row[k])).join('|') || `id:${row.id}`; }

async function readSpec(ex, spec) {
  const exists = (await ex('ir.model', 'search', [[['model', '=', spec.model]]], { limit: 1, context: READ_CTX })).length > 0;
  if (!exists) return { skipped: 'el modelo no existe' };
  let fields = spec.fields;
  if (spec.allScalar) {
    const fg = await ex(spec.model, 'fields_get', [], { attributes: ['type'] });
    fields = Object.entries(fg).filter(([n, d]) => !['binary', 'one2many', 'many2many'].includes(d.type) && !/^(create|write)_(uid|date)$/.test(n) && n !== 'display_name' && n !== 'id').map(([n]) => n);
  }
  let readFields = [...fields, ...(spec.hash ?? [])];
  if (spec.cronName) { const fg = await ex(spec.model, 'fields_get', [], { attributes: ['type'] }); readFields = [('cron_name' in fg ? 'cron_name' : 'name'), ...readFields]; }
  const rows = await ex(spec.model, 'search_read', [spec.domain], { fields: readFields, context: READ_CTX });
  const out = []; const secretLike = [];
  for (let r of rows) {
    const o = { id: r.id };
    for (const f of fields) o[f] = r[f];
    if (spec.cronName) { o['@name'] = r.cron_name ?? r.name; if (spec.filterName && !spec.filterName.test(o['@name'] ?? '')) continue; }
    for (const h of spec.hash ?? []) { o[`${h}_sha256`] = sha(r[h] ?? ''); o[`${h}_len`] = String(r[h] ?? '').length; if (looksSecret(r[h])) { o.secret_like = true; secretLike.push(o.name ?? o.id); } }
    out.push(o);
  }
  out.sort((a, b) => String(keyOf(spec, a)).localeCompare(String(keyOf(spec, b))));
  return { rows: out, secretLike };
}

/** Toma el snapshot y lo escribe en `dir`. Devuelve el manifiesto. Solo lectura. */
export async function takeSnapshot({ ex, cfg, dir, tag = 'pre', now = new Date() }) {
  mkdirSync(dir, { recursive: true });
  const manifest = { tag, db: cfg.db, taken_at: now.toISOString(), note: 'sin secretos ni PII; código y arquitecturas solo como SHA-256', models: {}, counts: {}, secret_like: [] };
  for (const spec of SPEC) {
    const r = await readSpec(ex, spec);
    if (r.skipped) { manifest.models[spec.model] = { skipped: r.skipped }; continue; }
    const file = `${spec.model.replace(/\./g, '_')}.json`;
    writeFileSync(resolve(dir, file), JSON.stringify(r.rows, null, 2) + '\n');
    manifest.models[spec.model] = { file, count: r.rows.length, sha256: sha(r.rows) };
    manifest.secret_like.push(...r.secretLike.map((n) => `${spec.model}:${n}`));
  }
  for (const m of COUNT_ONLY) {
    try { manifest.counts[m] = await ex(m, 'search_count', [[]], { context: READ_CTX }); } catch { manifest.counts[m] = null; }
  }
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

const readRows = (dir, model) => { const f = resolve(dir, `${model.replace(/\./g, '_')}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };

/**
 * Compara dos snapshots por CLAVE NATURAL (los ids pueden cambiar tras borrar y recrear). Devuelve por modelo
 * {added, removed, changed:[{key, fields}]}. `identical` es true solo si no hay ninguna diferencia.
 */
export function diffSnapshots(preDir, postDir) {
  const out = { models: {}, identical: true };
  for (const spec of SPEC) {
    const a = readRows(preDir, spec.model), b = readRows(postDir, spec.model);
    if (a === null && b === null) continue;
    const A = new Map((a ?? []).map((r) => [keyOf(spec, r), r])), B = new Map((b ?? []).map((r) => [keyOf(spec, r), r]));
    const added = [...B.keys()].filter((k) => !A.has(k)), removed = [...A.keys()].filter((k) => !B.has(k));
    const changed = [];
    for (const [k, ra] of A) {
      const rb = B.get(k); if (!rb) continue;
      const fields = Object.keys({ ...ra, ...rb }).filter((f) => f !== 'id' && JSON.stringify(normRel(ra[f])) !== JSON.stringify(normRel(rb[f])));
      if (fields.length) changed.push({ key: k, fields });
    }
    out.models[spec.model] = { added, removed, changed };
    if (added.length || removed.length || changed.length) out.identical = false;
  }
  return out;
}
// Las relaciones se comparan por NOMBRE (el id puede cambiar si el destino se recreó); las listas de ids se comparan solo por longitud.
function normRel(v) { return Array.isArray(v) ? (v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'string' ? v[1] : `[lista:${v.length}]`) : v; }
