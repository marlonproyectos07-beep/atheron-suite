// ATH-STAGING-RECOVERY-007 — GUARDIA PREVIA (precheck). Recrea la INTENCIÓN de la guardia 189 del staging viejo, no su código:
// "no se escribe nada si el entorno no es el esperado ni está sano". Falla CERRADO: cualquier condición BLOCK que no pase aborta.
// Solo lectura. Lo que depende de Odoo Enterprise 19 real queda marcado REMOTE (se verifica la primera vez que corre contra él).
import { TARGET_DB, FORBIDDEN_DBS, READ_CTX, readBackup } from './recovery-lib.mjs';

export class GuardAbort extends Error { constructor(result) { super(`GUARDIA: ${result.failed.map((c) => c.id).join(', ')}`); this.result = result; } }

export const PRODUCTION_MARKERS = Object.freeze(['atheron1.odoo.com', 'hotelesatheron.com', 'atheron1-hotel-staging-20260923']);
export const REQUIRED_MODULES = Object.freeze(['sale_management', 'planning', 'base_automation']);
export const OPTIONAL_MODULES = Object.freeze(['web_studio', 'sale_renting']); // WARN si faltan: R1 puede necesitar web_studio
export const REQUIRED_MODELS = Object.freeze(['ir.model', 'ir.model.fields', 'ir.actions.server', 'base.automation', 'ir.cron', 'ir.ui.view', 'ir.ui.menu', 'ir.filters', 'ir.actions.act_window', 'ir.model.data', 'sale.order', 'planning.slot', 'planning.role', 'resource.resource', 'product.template', 'res.users', 'res.groups', 'account.payment']);

/**
 * Contrato mínimo de campos por modelo. Cada nombre sale de un uso real en el repo (respaldo JSON o scripts ya ejecutados),
 * no de memoria. `anyOf` = alternativas por renombres entre versiones de Odoo.
 */
export const CONTRACTS = Object.freeze({
  'ir.model': { all: ['model', 'name', 'state'] },
  'ir.model.fields': { all: ['name', 'model_id', 'ttype', 'field_description', 'relation', 'relation_field', 'state', 'selection_ids', 'required'] },
  'ir.actions.server': { all: ['name', 'model_id', 'state', 'code'] },
  'base.automation': { all: ['name', 'model_id', 'trigger', 'active', 'action_server_ids', 'filter_domain'] },
  'ir.cron': { all: ['ir_actions_server_id', 'interval_number', 'interval_type', 'active'], anyOf: [['cron_name', 'name']] },
  'ir.ui.view': { all: ['name', 'model', 'inherit_id', 'mode', 'priority', 'arch', 'active'] },
  'ir.ui.menu': { all: ['name', 'parent_id', 'sequence', 'action'] },
  'ir.filters': { all: ['name', 'model_id', 'domain', 'context', 'is_default', 'user_ids', 'action_id'] },
  'ir.actions.act_window': { all: ['name', 'res_model', 'domain', 'context', 'view_mode'] },
  'planning.slot': { all: ['resource_id', 'role_id', 'start_datetime', 'end_datetime', 'state'] },
  'sale.order': { all: ['name', 'partner_id', 'state', 'order_line'] },
  'res.users': { all: ['name', 'login', 'email', 'active'], anyOf: [['groups_id', 'group_ids']] }, // Odoo 19 puede haberlo renombrado
});

const trim = (e) => String(e?.diagnostic?.message || e?.message || e).slice(0, 160);

/** Ejecuta todas las comprobaciones. No lanza: devuelve el resultado; `assertGuard` lanza si algo BLOCK falla. */
export async function runGuard({ ex, cfg, env = process.env, journal = null }) {
  const checks = [];
  const add = (id, name, ok, { severity = 'BLOCK', detail = '', remote = false } = {}) => checks.push({ id, name, ok: !!ok, severity, detail, remote });
  const param = async (key) => {
    try { const r = await ex('ir.config_parameter', 'search_read', [[['key', '=', key]]], { fields: ['value'], limit: 1, context: READ_CTX }); return { ok: true, value: r[0]?.value ?? null }; }
    catch (e) { return { ok: false, error: trim(e) }; }
  };

  // G1 base y URL configuradas
  add('G1', 'base destino exacta y no prohibida', cfg.db === TARGET_DB && !FORBIDDEN_DBS.includes(cfg.db), { detail: cfg.db });
  add('G1b', 'URL del servidor es la del staging nuevo', cfg.baseUrl === `https://${TARGET_DB}.odoo.com`, { detail: cfg.baseUrl });

  // G2/G3 el servidor confirma que no es producción
  const base = await param('web.base.url');
  if (!base.ok) add('G3', 'web.base.url legible (para descartar producción)', false, { detail: base.error, remote: true });
  else {
    const url = String(base.value ?? '');
    add('G3', 'web.base.url no es producción ni el staging viejo', url !== '' && !PRODUCTION_MARKERS.some((m) => url.includes(m)), { detail: url === '' ? 'vacío' : url.replace(/^https?:\/\//, ''), remote: true });
    add('G3b', 'web.base.url coincide con la base destino', url === '' || url.includes(TARGET_DB), { severity: 'WARN', detail: url, remote: true });
  }

  // G4 entorno neutralizado / de pruebas: marca de Odoo, o atestación humana explícita (más débil, queda registrada)
  const neut = await param('database.is_neutralized');
  const attested = env.RECOVERY_TEST_ENV_ATTESTATION === TARGET_DB;
  add('G4', 'entorno neutralizado (database.is_neutralized) o atestación humana de entorno de pruebas', (neut.ok && String(neut.value).toLowerCase() === 'true') || attested,
    { detail: neut.ok ? (neut.value === null ? 'parámetro ausente' : `is_neutralized=${neut.value}`) : neut.error, remote: true });
  if (attested && !(neut.ok && String(neut.value).toLowerCase() === 'true')) add('G4b', 'se aceptó ATESTACIÓN humana en vez de la marca de Odoo', true, { severity: 'WARN', detail: 'RECOVERY_TEST_ENV_ATTESTATION', remote: true });

  // G5 estructura mínima: módulos y modelos
  try {
    const mods = await ex('ir.module.module', 'search_read', [[['name', 'in', [...REQUIRED_MODULES, ...OPTIONAL_MODULES]]]], { fields: ['name', 'state'], context: READ_CTX });
    const inst = new Set(mods.filter((m) => m.state === 'installed').map((m) => m.name));
    for (const m of REQUIRED_MODULES) add(`G5:${m}`, `módulo ${m} instalado`, inst.has(m), { remote: true });
    for (const m of OPTIONAL_MODULES) add(`G5:${m}`, `módulo ${m} instalado`, inst.has(m), { severity: 'WARN', detail: m === 'web_studio' ? 'R1 puede requerirlo' : '', remote: true });
  } catch (e) { add('G5', 'módulos legibles', false, { detail: trim(e), remote: true }); }
  const have = new Set((await ex('ir.model', 'search_read', [[['model', 'in', [...REQUIRED_MODELS]]]], { fields: ['model'], context: READ_CTX })).map((m) => m.model));
  for (const m of REQUIRED_MODELS) add(`G5:${m}`, `modelo ${m}`, have.has(m), { remote: true });

  // G6 compatibilidad de campos (contratos)
  for (const [model, c] of Object.entries(CONTRACTS)) {
    if (!have.has(model)) continue; // ya reportado arriba
    let f; try { f = await ex(model, 'fields_get', [], { attributes: ['type'] }); } catch (e) { add(`G6:${model}`, `fields_get ${model}`, false, { detail: trim(e), remote: true }); continue; }
    const missing = c.all.filter((n) => !(n in f));
    const badAny = (c.anyOf ?? []).filter((alts) => !alts.some((n) => n in f));
    add(`G6:${model}`, `contrato de campos de ${model}`, !missing.length && !badAny.length, { detail: [...missing, ...badAny.map((a) => a.join('|'))].join(', '), remote: true });
  }

  // G8 prerrequisito EXTERNO de R3 (ninguna capa lo crea): recursos, roles y productos de Planning de La Magia, por nombre.
  try {
    const want = readBackup('master-data-x_hotel_unit.json').filter((u) => u.x_property_id?.[1] === 'HOTEL ATHERON SUITE');
    const miss = [];
    const has = async (model, domain) => (await ex(model, 'search', [domain], { limit: 1, context: READ_CTX })).length > 0;
    for (const u of want) {
      if (u.x_resource_id && !(await has('resource.resource', [['name', '=', u.x_resource_id[1]]]))) miss.push(`recurso ${u.x_name}`);
      if (u.x_role_id && !(await has('planning.role', [['name', '=', u.x_role_id[1]]]))) miss.push(`rol ${u.x_name}`);
      const code = (String(u.x_product_tmpl_id?.[1] ?? '').match(/^\[([^\]]+)\]/) || [])[1];
      if (code && !(await has('product.template', [['default_code', '=', code]]))) miss.push(`producto ${code}`);
    }
    add('G8', 'recursos, roles y productos de Planning de La Magia ya existen (los necesita R3)', miss.length === 0, { severity: 'WARN', detail: miss.length ? `faltan: ${miss.join(', ')}` : '', remote: true });
  } catch (e) { add('G8', 'recursos/roles/productos legibles', false, { severity: 'WARN', detail: trim(e), remote: true }); }

  // G7 estado de la bitácora (informativo): si hay entradas pendientes de una corrida anterior, se avisa
  if (journal) { const p = journal.pending(); add('G7', 'bitácora sin entradas pendientes de otra corrida', p.length === 0, { severity: 'WARN', detail: `${p.length} pendientes` }); }

  const failed = checks.filter((c) => !c.ok && c.severity === 'BLOCK');
  return { ok: failed.length === 0, failed, warnings: checks.filter((c) => !c.ok && c.severity === 'WARN'), checks };
}

export async function assertGuard(opts) { const r = await runGuard(opts); if (!r.ok) throw new GuardAbort(r); return r; }

/**
 * Precondición funcional de la guardia 189: ninguna reserva ni QA se crea si la automatización anti-solapamiento no está
 * ACTIVA y enlazada. Se busca por el nombre que dejó el respaldo; el CÓDIGO de la guardia lo trae R4 desde el dump.
 */
export const OVERLAP_GUARD_NAME = readBackup('base-automation.json').find((a) => /anti-solapamiento/i.test(a.name))?.name ?? null;
export async function requireOverlapGuard(ex) {
  if (!OVERLAP_GUARD_NAME) return { ok: false, detail: 'el respaldo no nombra la guardia anti-solapamiento' };
  const r = await ex('base.automation', 'search_read', [[['name', '=', OVERLAP_GUARD_NAME]]], { fields: ['active', 'action_server_ids'], limit: 2, context: READ_CTX });
  const ok = r.length === 1 && r[0].active === true && (r[0].action_server_ids ?? []).length >= 1;
  return { ok, detail: r.length === 0 ? 'no existe' : r.length > 1 ? 'duplicada' : `active=${r[0].active}, acciones=${(r[0].action_server_ids ?? []).length}` };
}

export function renderGuard(r) {
  return r.checks.map((c) => `${c.ok ? 'OK   ' : c.severity === 'WARN' ? 'WARN ' : 'FALLA'} ${c.id.padEnd(22)} ${c.name}${c.detail ? ` [${c.detail}]` : ''}${c.remote ? ' (REMOTE)' : ''}`).join('\n');
}
