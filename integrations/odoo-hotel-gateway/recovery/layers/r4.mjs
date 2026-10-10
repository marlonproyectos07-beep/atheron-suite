// R4 — acciones de servidor, automatizaciones y crons de planning.slot / sale.order / x_hotel_*: reglas de disponibilidad,
// HOLD, exclusión Casa<->habitaciones y la guardia anti-solapamiento. NO contiene código de negocio: sale del extracto del
// dump. Todo se crea INACTIVO; activar es un paso manual aparte (runbook). El código se copia TAL CUAL (SHA-256 verificado).
import { loadExtract, BlockedError, findOldIdLiterals, fieldTokens, sha256, READ_CTX, EXTRACT_DIR } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';
import { txt } from '../pure.mjs';

export const meta = { id: 'R4', title: 'Reglas: acciones, automatizaciones (inactivas), crons (inactivos)', critical: true, needs: 'AI/recovery-extract/{server_actions,automations,crons}.json con campos derivados' };

const need = (rows, keys, file) => { for (const r of rows) for (const k of keys) if (!(k in r)) throw new BlockedError(`falta campo derivado "${k}" en ${file} (ver EXTRACT-CONTRACT.md)`); };
const load = (ctx) => {
  const dir = ctx.extractDir ?? EXTRACT_DIR;
  const actions = loadExtract('server_actions.json', dir), automations = loadExtract('automations.json', dir), crons = loadExtract('crons.json', dir);
  need(actions, ['name', 'model', 'state', 'code'], 'server_actions.json');
  need(automations, ['name', 'model', 'trigger', 'action_names'], 'automations.json');
  need(crons, ['action_name', 'interval_number', 'interval_type'], 'crons.json');
  return { actions, automations, crons };
};

export const inputs = (ctx) => { load(ctx); };

export async function run(ctx) {
  const { actions, automations, crons } = load(ctx);
  const { ex, ensure, log } = ctx;
  const modelId = async (m) => findOne(ex, 'ir.model', [['model', '=', m]]);
  const af = await ex('base.automation', 'fields_get', [], { attributes: ['type'] });
  for (const k of ['action_server_ids', 'trigger', 'filter_domain']) if (!(k in af)) throw new BlockedError(`base.automation no tiene el campo ${k} en esta versión`);
  const cf = await ex('ir.cron', 'fields_get', [], { attributes: ['type'] });
  const cronName = 'cron_name' in cf ? 'cron_name' : 'name' in cf ? 'name' : null;
  if (!cronName) throw new BlockedError('ir.cron sin campo de nombre reconocible');

  const tokens = [...new Set(actions.flatMap((a) => fieldTokens(a.code)))];
  const existing = new Set((await ex('ir.model.fields', 'search_read', [[['name', 'in', tokens]]], { fields: ['name'], context: READ_CTX })).map((r) => r.name));
  const missing = tokens.filter((t) => !existing.has(t));
  if (missing.length) log.add('DEP_FALTA', 'ir.model.fields', missing.join(','), { note: 'R1/R2 deben correr antes' });

  const actionIds = new Map();
  for (const a of actions) {
    const name = txt(a.name); const mid = await modelId(a.model);
    if (!mid) { log.add('FALTA', 'ir.model', a.model, { note: `para acción "${name}"` }); continue; }
    const old = findOldIdLiterals(a.code);
    if (old.length) log.add('REVISAR', 'ir.actions.server', name, { note: `números iguales a ids del staging viejo: ${old.join(',')}` });
    const payload = { name, model_id: mid, state: a.state, code: a.code };
    if (a.binding_type) payload.binding_type = a.binding_type;
    const id = await ensure('ir.actions.server', [['name', '=', name], ['model_id', '=', mid]], payload, `${name} [sha ${sha256(a.code).slice(0, 8)}]`, { compareFields: ['code', 'state'] });
    if (id) actionIds.set(`${a.model}::${name}`, id);
  }
  const byName = async (n) => [...actionIds].find(([k]) => k.endsWith(`::${n}`))?.[1] ?? findOne(ex, 'ir.actions.server', [['name', '=', n]]);
  for (const b of automations) {
    const name = txt(b.name); const mid = await modelId(b.model);
    if (!mid) { log.add('FALTA', 'ir.model', b.model, { note: `para automatización "${name}"` }); continue; }
    const ids = [];
    for (const an of b.action_names) { const i = await byName(an); if (i) ids.push(i); else log.add('FALTA', 'ir.actions.server', an, { note: `enlace de "${name}"` }); }
    if (ids.length !== b.action_names.length) { log.add('OMITE', 'base.automation', name, { note: 'acciones sin resolver; no se crea a medias' }); continue; }
    const payload = { name, model_id: mid, trigger: b.trigger, active: false, action_server_ids: [[6, 0, ids]] };
    if (b.filter_domain) payload.filter_domain = b.filter_domain;
    if (b.filter_pre_domain) payload.filter_pre_domain = b.filter_pre_domain;
    await ensure('base.automation', [['name', '=', name], ['model_id', '=', mid]], payload, `${name} (original active=${b.active})`, { compareFields: ['trigger', 'filter_domain'] });
  }
  for (const c of crons) {
    const aid = await byName(c.action_name);
    if (!aid) { log.add('FALTA', 'ir.actions.server', c.action_name, { note: 'para cron' }); continue; }
    const cname = txt(c.cron_name ?? c.name ?? c.action_name);
    await ensure('ir.cron', [[cronName, '=', cname]], { [cronName]: cname, ir_actions_server_id: aid, interval_number: c.interval_number, interval_type: c.interval_type, active: false }, `${cname} (original active=${c.active})`, { compareFields: ['interval_number', 'interval_type'] });
  }
}

export async function verify(ctx) {
  const { actions, automations } = load(ctx); const checks = [];
  for (const a of actions) {
    const r = await ctx.ex('ir.actions.server', 'search_read', [[['name', '=', txt(a.name)]]], { fields: ['code'], limit: 2, context: READ_CTX });
    checks.push({ name: `acción ${txt(a.name)}`, ok: r.length === 1 && sha256(r[0].code) === sha256(a.code) });
  }
  for (const b of automations) {
    const r = await ctx.ex('base.automation', 'search_read', [[['name', '=', txt(b.name)]]], { fields: ['active', 'action_server_ids'], limit: 2, context: READ_CTX });
    checks.push({ name: `automatización ${txt(b.name)} (inactiva y enlazada)`, ok: r.length === 1 && r[0].active === false && r[0].action_server_ids.length === b.action_names.length });
  }
  return { ok: checks.every((c) => c.ok), checks };
}
