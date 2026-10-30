import { analyzeActionCode, redactAuditCode } from './audit.mjs';
import { ODOO_FACTS } from './odoo-facts.mjs';

/**
 * ATH-DEV-019 — SOLO LECTURA. (1) cierre de la recuperacion del piloto P0, (2) permisos efectivos del usuario del
 * conector y opciones de usuario tecnico, (3) atribucion por metadatos de los registros nuevos. Nada se escribe,
 * ninguna accion ni cron se ejecuta. Sin datos personales: ids, estados, fechas, conteos y formas.
 */
export const GONE_IDS = [39686, 39687];
export const OFFER_301 = 12136;
export const NIGHT = '2026-10-15';
export const MODELS_NEEDED_READ = ['planning.slot', 'planning.role', 'resource.resource'];
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const shape = (v) => String(v ?? '').replace(/[A-Za-z]+/g, 'a').replace(/\d+/g, '9').slice(0, 24);

async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) { return { name, status: 'FAIL', code: e.code ?? e.message ?? 'UNKNOWN', httpStatus: e.status ?? null }; }
}
async function have(odoo, model, wanted) {
  const f = await odoo.fieldsGet(model, ['type']);
  return { f, fields: wanted.filter((k) => f[k]) };
}

export async function runRecoveryCheck({ odoo, uid = 2, createdSince = '2026-10-26 22:00:00' }) {
  const steps = [];

  // ---------- FASE 1: recuperacion ----------
  steps.push(await step('recovery.records-absent', async () => {
    const rows = await odoo.searchRead('planning.slot', [['id', 'in', GONE_IDS]], ['id']);
    const mirrors = await odoo.searchCount('planning.slot', [['x_bloqueo_ref', '=', '39686']]);
    return { stillPresent: rows.map((r) => r.id), mirrorsReferencing39686: mirrors, absent: rows.length === 0 && mirrors === 0 };
  }));
  steps.push(await step('recovery.availability-offer-12136', async () => {
    const rows = await odoo.searchRead('x_availability', [['x_stay_offer_id', '=', OFFER_301], ['x_date', '>=', NIGHT], ['x_date', '<=', '2026-10-16']], ['id', 'x_date', 'x_booked', 'x_total_units', 'x_to_recompute'], { order: 'x_date' });
    const pendingTotal = await odoo.searchCount('x_availability', [['x_to_recompute', '=', true]]);
    const all = await odoo.searchRead('x_availability', [['x_to_recompute', '=', true]], ['id', 'x_date', 'x_stay_offer_id'], { limit: 50 });
    const n15 = rows.find((r) => r.x_date === NIGHT);
    return { rows: rows.map((r) => ({ id: r.id, date: r.x_date, booked: r.x_booked, total: r.x_total_units, pending: Boolean(r.x_to_recompute) })), pendingTotal,
      pendingRows: all.map((r) => ({ id: r.id, date: r.x_date, offer: idOf(r.x_stay_offer_id) })),
      bookedOnNight: n15?.x_booked ?? null, recoveredToZero: n15?.x_booked === 0 && pendingTotal === 0 };
  }));
  steps.push(await step('recovery.ical-marker', async () => {
    const hits = await odoo.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role'], ['index_content', 'ilike', 'ATH-DEV-018 PRUEBA P0']], ['id', 'res_id', 'write_date']);
    const feeds = await odoo.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role'], ['res_id', 'in', [37, 69]]], ['id', 'res_id', 'file_size', 'write_date']);
    return { feedsContainingMarker: hits.map((h) => h.res_id), feeds301AndCasa: feeds.map((f) => ({ role: f.res_id, size: f.file_size, written: f.write_date })), markerAbsent: hits.length === 0 };
  }));
  steps.push(await step('recovery.recompute-process', async () => {
    const cf = await have(odoo, 'ir.cron', ['id', 'cron_name', 'active', 'nextcall', 'lastcall', 'interval_number', 'interval_type', 'ir_actions_server_id', 'user_id']);
    const crons = await odoo.searchRead('ir.cron', [['cron_name', 'ilike', 'booking engine']], cf.fields);
    const cronIds = crons.map((c) => c.id);
    let triggers = [];
    try { triggers = await odoo.searchRead('ir.cron.trigger', cronIds.length ? [['cron_id', 'in', cronIds]] : [['id', '=', 0]], ['id', 'cron_id', 'call_at', 'create_date']); } catch { triggers = 'NO_LEGIBLE'; }
    const xml = await odoo.searchRead('ir.model.data', [['module', '=', 'booking_engine'], ['model', 'in', ['ir.cron', 'ir.actions.server', 'base.automation']]], ['name', 'model', 'res_id'], { limit: 80 });
    const actionIds = [...new Set([...crons.map((c) => idOf(c.ir_actions_server_id)).filter(Boolean), 1493, 1495, 1496, 1500])];
    const acts = await odoo.searchRead('ir.actions.server', [['id', 'in', actionIds]], ['id', 'name', 'state', 'code']);
    return {
      crons: crons.map((c) => ({ id: c.id, name: c.cron_name, active: c.active, nextcall: c.nextcall, lastcall: c.lastcall, every: `${c.interval_number} ${c.interval_type}`, serverActionId: idOf(c.ir_actions_server_id), runsAsUser: idOf(c.user_id) })),
      pendingTriggers: Array.isArray(triggers) ? triggers.map((t) => ({ id: t.id, cron: idOf(t.cron_id), callAt: t.call_at, created: t.create_date })) : triggers,
      bookingEngineXmlIds: xml.map((x) => ({ xmlid: `booking_engine.${x.name}`, model: x.model, resId: x.res_id })),
      actions: acts.map((a) => ({ id: a.id, name: a.name, state: a.state, analysis: (({ models, http, mail, saleOrder, create, write, unlink, cronOrQueue }) => ({ models, http, mail, saleOrder, create, write, unlink, cronOrQueue }))(analyzeActionCode(a.code)), code: redactAuditCode(a.code, 3500) })),
    };
  }));

  // ---------- FASE 2: permisos del usuario del conector ----------
  let groupIds = [];
  steps.push(await step('security.user-uid2', async () => {
    const f = await odoo.fieldsGet('res.users', ['type', 'relation']);
    const gf = f.group_ids ? 'group_ids' : (f.groups_id ? 'groups_id' : null);
    const u = (await odoo.searchRead('res.users', [['id', '=', uid]], ['id', 'active', 'share', 'login', 'create_date', ...(gf ? [gf] : []), ...(f.company_ids ? ['company_ids'] : [])]))[0] ?? {};
    groupIds = gf ? (u[gf] ?? []) : [];
    const groups = groupIds.length ? await odoo.searchRead('res.groups', [['id', 'in', groupIds]], ['id', 'full_name']) : [];
    const names = groups.map((g) => g.full_name);
    const isSys = names.some((n) => /Administration\s*\/\s*Settings|Settings/i.test(n) && /Administration|Ajustes/i.test(n));
    const internal = await odoo.searchCount('res.users', [['share', '=', false], ['active', '=', true]]);
    return { groupField: gf, active: u.active, internalUser: !u.share, loginShape: shape(u.login), created: u.create_date, companies: (u.company_ids ?? []).length, groupCount: groupIds.length,
      groups: groups.map((g) => ({ id: g.id, name: g.full_name })).sort((a, b) => a.id - b.id), looksLikeSystemAdministrator: isSys, activeInternalUsersInDatabase: internal };
  }));
  steps.push(await step('security.api-keys-metadata', async () => {
    const f = await have(odoo, 'res.users.apikeys', ['id', 'name', 'user_id', 'scope', 'create_date', 'expiration_date', 'last_used']);
    const rows = await odoo.searchRead('res.users.apikeys', [['user_id', '=', uid]], f.fields, { limit: 50 });
    return { keysOfUser: rows.length, keys: rows.map((k) => ({ id: k.id, nameShape: shape(k.name), scope: k.scope ?? null, created: k.create_date, expires: k.expiration_date ?? null, lastUsed: k.last_used ?? null })), fieldsAvailable: f.fields };
  }));
  steps.push(await step('security.minimum-access-for-read', async () => {
    const acc = await odoo.searchRead('ir.model.access', [['model_id.model', 'in', MODELS_NEEDED_READ], ['active', '=', true]], ['id', 'model_id', 'group_id', 'perm_read', 'perm_write', 'perm_create', 'perm_unlink'], { limit: 200 });
    const byModel = {};
    for (const a of acc) {
      const m = idOf(a.model_id) !== null && Array.isArray(a.model_id) ? a.model_id[1] : String(a.model_id);
      (byModel[m] ??= []).push({ group: Array.isArray(a.group_id) ? a.group_id[1] : '(todos los usuarios)', read: a.perm_read, write: a.perm_write, create: a.perm_create, unlink: a.perm_unlink });
    }
    const rules = await odoo.searchRead('ir.rule', [['model_id.model', '=', 'planning.slot'], ['active', '=', true]], ['id', 'name', 'domain_force', 'groups', 'global', 'perm_read', 'perm_write'], { limit: 50 });
    const rgroups = [...new Set(rules.flatMap((r) => r.groups ?? []))];
    const gn = rgroups.length ? await odoo.searchRead('res.groups', [['id', 'in', rgroups]], ['id', 'full_name']) : [];
    return { accessByModel: byModel, slotRecordRules: rules.map((r) => ({ id: r.id, name: r.name, domain: String(r.domain_force ?? '').slice(0, 160), global: r.global, groups: (r.groups ?? []).map((g) => gn.find((x) => x.id === g)?.full_name ?? g) })) };
  }));

  // ---------- FASE 3: auditoria de registros nuevos (solo metadatos) ----------
  steps.push(await step('audit.new-records-metadata', async () => {
    const so = await have(odoo, 'sale.order', ['id', 'create_date', 'create_uid', 'state', 'origin', 'website_id', 'x_checkin', 'x_checkout', 'x_channel']);
    const orders = await odoo.searchRead('sale.order', [['create_date', '>=', createdSince]], so.fields, { limit: 20, order: 'id' });
    const lines = orders.length ? await odoo.searchRead('sale.order.line', [['order_id', 'in', orders.map((o) => o.id)]], ['id', 'order_id', 'planning_slot_ids'], { limit: 50 }) : [];
    const pf = await have(odoo, 'res.partner', ['id', 'create_date', 'create_uid', 'is_company', 'customer_rank', 'type', 'active']);
    const partners = await odoo.searchRead('res.partner', [['create_date', '>=', createdSince]], pf.fields, { limit: 20, order: 'id' });
    const mf = await have(odoo, 'mail.mail', ['id', 'create_date', 'create_uid', 'state', 'model', 'res_id', 'message_type', 'failure_type', 'mail_server_id']);
    const mails = await odoo.searchRead('mail.mail', [['create_date', '>=', createdSince]], mf.fields, { limit: 20, order: 'id' });
    return {
      since: createdSince,
      saleOrders: orders.map((o) => ({ id: o.id, created: o.create_date, createdByUid: idOf(o.create_uid), state: o.state, originShape: shape(o.origin), website: Boolean(idOf(o.website_id)), checkin: o.x_checkin ?? null, checkout: o.x_checkout ?? null, channel: o.x_channel || null,
        lineCount: lines.filter((l) => idOf(l.order_id) === o.id).length, linkedSlotIds: lines.filter((l) => idOf(l.order_id) === o.id).flatMap((l) => l.planning_slot_ids ?? []) })),
      partners: partners.map((p) => ({ id: p.id, created: p.create_date, createdByUid: idOf(p.create_uid), isCompany: Boolean(p.is_company), customerRank: p.customer_rank ?? null, type: p.type ?? null })),
      mailMail: mails.map((m) => ({ id: m.id, created: m.create_date, createdByUid: idOf(m.create_uid), state: m.state, relatesToModel: m.model || null, relatesToResId: m.res_id || null, type: m.message_type || null, failureType: m.failure_type || null, hasServer: Boolean(idOf(m.mail_server_id)) })),
      relatedToP0: { p0Ids: GONE_IDS },
    };
  }));
  return { overall: steps.every((s) => s.status === 'OK') ? 'OK' : 'PARTIAL', steps };
}
