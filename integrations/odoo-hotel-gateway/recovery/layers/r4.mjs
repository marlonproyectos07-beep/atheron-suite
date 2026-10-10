// R4 — acciones de servidor, automatizaciones y crons de planning.slot / sale.order / x_hotel_*: reglas de disponibilidad,
// HOLD, exclusión Casa<->habitaciones y la guardia anti-solapamiento. NO contiene código de negocio: sale del extracto del
// dump. Todo se crea INACTIVO; activar es un paso manual aparte (runbook). El código se copia TAL CUAL (SHA-256 verificado).
import { loadExtract, BlockedError, findOldIdLiterals, fieldTokens, sha256, READ_CTX, EXTRACT_DIR } from '../recovery-lib.mjs';
import { findOne } from '../connect.mjs';
import { txt } from '../pure.mjs';
import { classifyOta, hardcodedIds, adaptActionRefs } from '../scope.mjs';
import { PROTECTED_RULES, compareAll, readCurrentRules } from '../rules-compare.mjs';
import { hotelLogicGate } from '../hotel-gate.mjs';

export const meta = { id: 'R4', title: 'Reglas: acciones, automatizaciones (inactivas), crons (inactivos)', critical: true, needs: 'AI/recovery-extract/{server_actions,automations,crons}.json con campos derivados' };

const need = (rows, keys, file) => { for (const r of rows) for (const k of keys) if (!(k in r)) throw new BlockedError(`falta campo derivado "${k}" en ${file} (ver EXTRACT-CONTRACT.md)`); };
/**
 * Carga el extracto y APLICA EL ALCANCE BASE. Cada acción/automatización/cron recibe un veredicto:
 *   include   -> se crea (inactiva)
 *   OTA       -> EXCLUYE_OTA: nombre, modelo o código apuntan a Booking/Airbnb/Beds24/NOBEDS/iCal o a una llamada externa
 *   ID_DURO   -> el código trae ids numéricos de la base antigua escritos a mano: NO se crea y la capa se detiene (STOP)
 * Una automatización o cron enlazado a una acción excluida se omite (OMITE): no se crea a medias.
 */
const load = (ctx) => {
  const dir = ctx.extractDir ?? EXTRACT_DIR;
  const actions = loadExtract('server_actions.json', dir), automations = loadExtract('automations.json', dir), crons = loadExtract('crons.json', dir);
  need(actions, ['name', 'model', 'state', 'code'], 'server_actions.json');
  need(automations, ['name', 'model', 'trigger', 'action_names'], 'automations.json');
  need(crons, ['action_name', 'interval_number', 'interval_type'], 'crons.json');
  // referencias entre acciones por id numérico (`browse(1914)`): se adaptan a nombre+modelo SI el extracto trae esa acción (campo `id`)
  const byId = new Map(actions.filter((a) => a.id != null).map((a) => [Number(a.id), a]));
  for (const a of actions) a.code = adaptActionRefs(a.code, (id) => { const t = byId.get(id); return t ? { name: txt(t.name), model: t.model } : null; }).code;
  // Reglas protegidas (167/168/169): NUNCA se crean ni se sobrescriben por el camino genérico; las gobierna el comparador.
  const isProt = (b) => PROTECTED_RULES.some((p) => p.name === txt(b.name) && (b.model === undefined || b.model === p.model));
  const protAutos = automations.filter(isProt);
  const protActs = new Set(protAutos.flatMap((b) => b.action_names ?? []));
  const verdict = new Map();   // nombre de acción -> {ota, hard}
  for (const a of actions) verdict.set(txt(a.name), { ota: classifyOta({ name: txt(a.name), model: a.model, code: a.code }), hard: hardcodedIds(a.code) });
  const kept = actions.filter((a) => { const v = verdict.get(txt(a.name)); return !v.ota.ota && v.hard.length === 0 && !protActs.has(txt(a.name)); });
  const keptNames = new Set(kept.map((a) => txt(a.name)));
  const autoV = automations.filter((b) => !isProt(b)).map((b) => ({ b, ota: classifyOta({ name: txt(b.name), model: b.model, code: String(b.filter_domain ?? '') + String(b.filter_pre_domain ?? '') }) }));
  const cronV = crons.map((c) => ({ c, ota: classifyOta({ name: txt(c.cron_name ?? c.name ?? c.action_name), model: '', code: '' }) }));
  const oldRules = loadExtract('rules_old.json', dir);   // definición ANTIGUA de 167/168/169 (dump); sin ella no hay con qué comparar
  return { actions, automations, crons, verdict, kept, keptNames, autoV, cronV, oldRules, protActs };
};

export const inputs = (ctx) => { load(ctx); };   // incluye rules_old.json: sin la definición antigua de 167/168/169 no hay capa

export async function run(ctx) {
  const { actions, automations, crons, verdict, kept, keptNames, autoV, cronV, oldRules, protActs } = load(ctx);
  const { ex, ensure, log } = ctx;
  const modelId = async (m) => findOne(ex, 'ir.model', [['model', '=', m]]);

  // ---- 1) compuerta hotelera y reglas protegidas: TODO esto es lectura; si algo no cuadra, la capa se detiene ANTES de escribir
  const gate = await hotelLogicGate(ex);
  if (!gate.ok) throw new BlockedError(`compuerta hotelera: faltan dependencias (${gate.failed.map((c) => c.name).join(', ')}); no se muta lógica hotelera`);
  const cmp = compareAll(oldRules, await readCurrentRules(ex));
  for (const r of cmp.results) log.add(r.verdict === 'REPLACE_REQUIRED' ? 'REEMPLAZO_REQUERIDO' : r.verdict === 'ABORT' ? 'ABORT' : 'REUSA', 'base.automation', `${r.key} ${r.name}`, { note: `${r.verdict}${r.reasons.length ? ': ' + r.reasons.join('; ') : ''}` });
  if (cmp.mustAbort) throw new BlockedError(`regla(s) 167/168/169 no comparables (${cmp.results.filter((r) => r.verdict === 'ABORT').map((r) => r.key + ': ' + r.reasons.join(' / ')).join(' | ')}); no se modifica nada`);

  // ---- alcance: lo que NO entra, registrado con su motivo (no bloquea) o lo que obliga a parar (bloquea)
  for (const a of actions) {
    if (protActs.has(txt(a.name))) continue;   // acciones de 167/168/169: las gobierna el comparador, no el filtro de creación
    const v = verdict.get(txt(a.name));
    if (v.ota.ota) log.add('EXCLUYE_OTA', 'ir.actions.server', txt(a.name), { note: v.ota.reasons.join('; ') });
    else if (v.hard.length) log.add('ID_DURO', 'ir.actions.server', txt(a.name), { note: `ids numéricos escritos a mano (${v.hard.slice(0, 6).join(',')}${v.hard.length > 6 ? '…' : ''}); no valen en la base nueva` });
  }
  for (const { b, ota } of autoV) if (ota.ota) log.add('EXCLUYE_OTA', 'base.automation', txt(b.name), { note: ota.reasons.join('; ') });
  for (const { c, ota } of cronV) if (ota.ota) log.add('EXCLUYE_OTA', 'ir.cron', txt(c.cron_name ?? c.name ?? c.action_name), { note: ota.reasons.join('; ') });

  const af = await ex('base.automation', 'fields_get', [], { attributes: ['type'] });
  for (const k of ['action_server_ids', 'trigger', 'filter_domain']) if (!(k in af)) throw new BlockedError(`base.automation no tiene el campo ${k} en esta versión`);
  const cf = await ex('ir.cron', 'fields_get', [], { attributes: ['type'] });
  const cronName = 'cron_name' in cf ? 'cron_name' : 'name' in cf ? 'name' : null;
  if (!cronName) throw new BlockedError('ir.cron sin campo de nombre reconocible');

  const tokens = [...new Set(kept.flatMap((a) => fieldTokens(a.code)))];
  const existing = new Set((await ex('ir.model.fields', 'search_read', [[['name', 'in', tokens]]], { fields: ['name'], context: READ_CTX })).map((r) => r.name));
  const missing = tokens.filter((t) => !existing.has(t));
  if (missing.length) log.add('DEP_FALTA', 'ir.model.fields', missing.join(','), { note: 'R1/R2 deben correr antes' });

  const actionIds = new Map();
  for (const a of kept) {
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

  for (const { b, ota } of autoV) {
    if (ota.ota) continue;
    const name = txt(b.name);
    const lost = b.action_names.filter((an) => !keptNames.has(an));
    if (lost.length) { log.add('OMITE', 'base.automation', name, { note: `enlazada a acción excluida o detenida (${lost.join(' | ')}); no se crea a medias` }); continue; }
    const mid = await modelId(b.model);
    if (!mid) { log.add('FALTA', 'ir.model', b.model, { note: `para automatización "${name}"` }); continue; }
    const ids = [];
    for (const an of b.action_names) { const i = await byName(an); if (i) ids.push(i); else log.add('FALTA', 'ir.actions.server', an, { note: `enlace de "${name}"` }); }
    if (ids.length !== b.action_names.length) { log.add('OMITE', 'base.automation', name, { note: 'acciones sin resolver; no se crea a medias' }); continue; }
    const payload = { name, model_id: mid, trigger: b.trigger, active: false, action_server_ids: [[6, 0, ids]] };
    if (b.filter_domain) payload.filter_domain = b.filter_domain;
    if (b.filter_pre_domain) payload.filter_pre_domain = b.filter_pre_domain;
    await ensure('base.automation', [['name', '=', name], ['model_id', '=', mid]], payload, `${name} (original active=${b.active})`, { compareFields: ['trigger', 'filter_domain'] });
  }
  for (const { c, ota } of cronV) {
    if (ota.ota) continue;
    if (!keptNames.has(c.action_name)) { log.add('OMITE', 'ir.cron', txt(c.cron_name ?? c.name ?? c.action_name), { note: `acción «${c.action_name}» excluida o detenida` }); continue; }
    const aid = await byName(c.action_name);
    if (!aid) { log.add('FALTA', 'ir.actions.server', c.action_name, { note: 'para cron' }); continue; }
    const cname = txt(c.cron_name ?? c.name ?? c.action_name);
    await ensure('ir.cron', [[cronName, '=', cname]], { [cronName]: cname, ir_actions_server_id: aid, interval_number: c.interval_number, interval_type: c.interval_type, active: false }, `${cname} (original active=${c.active})`, { compareFields: ['interval_number', 'interval_type'] });
  }
}

export async function verify(ctx) {
  const { actions, automations, verdict, kept, keptNames, autoV, oldRules, protActs } = load(ctx); const checks = [];
  const cmp = compareAll(oldRules, await readCurrentRules(ctx.ex));
  for (const r of cmp.results) checks.push({ name: `regla ${r.key} ${r.name}: ${r.verdict}`, ok: r.verdict === 'REUSE_AS_IS' || r.verdict === 'REUSE_WITH_ADAPTATION' });
  for (const a of kept) {
    const r = await ctx.ex('ir.actions.server', 'search_read', [[['name', '=', txt(a.name)]]], { fields: ['code'], limit: 2, context: READ_CTX });
    checks.push({ name: `acción ${txt(a.name)}`, ok: r.length === 1 && sha256(r[0].code) === sha256(a.code) });
  }
  // lo que quedó detenido por ids duros nunca se creó: la capa no puede darse por buena
  for (const a of actions) { if (protActs.has(txt(a.name))) continue; const v = verdict.get(txt(a.name)); if (!v.ota.ota && v.hard.length) checks.push({ name: `acción ${txt(a.name)} (ids numéricos duros)`, ok: false, blocked: true }); }
  for (const { b, ota } of autoV) {
    if (ota.ota) continue;
    if (b.action_names.some((an) => !keptNames.has(an))) { checks.push({ name: `automatización ${txt(b.name)} (enlazada a acción excluida/detenida)`, ok: false, blocked: true }); continue; }
    const r = await ctx.ex('base.automation', 'search_read', [[['name', '=', txt(b.name)]]], { fields: ['active', 'action_server_ids'], limit: 2, context: READ_CTX });
    checks.push({ name: `automatización ${txt(b.name)} (inactiva y enlazada)`, ok: r.length === 1 && r[0].active === false && r[0].action_server_ids.length === b.action_names.length });
  }
  // garantía de alcance: la recuperación no creó nada de lo excluido por OTA
  const excludedKeys = [...actions.filter((a) => verdict.get(txt(a.name)).ota.ota).map((a) => txt(a.name)), ...autoV.filter((x) => x.ota.ota).map((x) => txt(x.b.name))];
  const createdKeys = ctx.journal.read().filter((e) => e.op === 'CREATE' && e.layer === 'R4').map((e) => e.key);
  checks.push({ name: 'ningún componente OTA fue creado por la recuperación', ok: !excludedKeys.some((n) => createdKeys.some((k) => k.startsWith(n))) });
  return { ok: checks.every((c) => c.ok), checks };
}
