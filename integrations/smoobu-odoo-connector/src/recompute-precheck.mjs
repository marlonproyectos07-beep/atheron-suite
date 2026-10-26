import { analyzeActionCode, redactAuditCode } from './audit.mjs';
import { GONE_IDS, OFFER_301, NIGHT } from './recovery-check.mjs';

/**
 * ATH-DEV-020 — FASE 1 y 2, SOLO LECTURA. Identifica el cron real que llama la accion 1496, lee el codigo real de las
 * acciones 1493/1495/1496 y del cron, cuenta las filas x_to_recompute en toda la base y evalua las puertas de
 * seguridad. NO ejecuta nada: devuelve `gates` y `allGatesProven`. La ejecucion (si procede) es otro paso.
 */
export const EXPECTED_PENDING_IDS = [1171, 1172];
export const RECOMPUTE_ACTIONS = [1493, 1495, 1496, 1500];
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const xmlidsIn = (code) => [...new Set([...String(code ?? '').matchAll(/env\.ref\(\s*['"]([\w.]+)['"]/g)].map((m) => m[1]))];

async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) { return { name, status: 'FAIL', code: e.code ?? e.message ?? 'UNKNOWN', httpStatus: e.status ?? null }; }
}
const fieldsOf = async (odoo, model, wanted) => { const f = await odoo.fieldsGet(model, ['type']); return wanted.filter((k) => f[k]); };

export async function runRecomputePrecheck({ odoo }) {
  const steps = [];
  const ctx = {};

  steps.push(await step('db.model', async () => {
    const f = await odoo.fieldsGet('x_availability', ['type', 'string', 'relation']);
    ctx.availFields = Object.keys(f);
    return { model: 'x_availability', fields: Object.keys(f).filter((k) => /^x_|^id$/.test(k)).sort() };
  }));

  steps.push(await step('slots.absent', async () => {
    const rows = await odoo.searchRead('planning.slot', [['id', 'in', GONE_IDS]], ['id']);
    const mirrors = await odoo.searchCount('planning.slot', [['x_bloqueo_ref', 'in', GONE_IDS.map(String)]]);
    // turnos reales que solapan la noche 15->16 en 301 (37) y Casa (69): determinan si booked=0 es el valor correcto
    const overlap = await odoo.searchRead('planning.slot', [['role_id', 'in', [37, 69]], ['start_datetime', '<', '2026-10-16 16:00:00'], ['end_datetime', '>', '2026-10-15 20:00:00']], ['id', 'role_id', 'state', 'x_channel'], { limit: 20 });
    ctx.slotsAbsent = rows.length === 0 && mirrors === 0;
    ctx.realOverlaps = overlap.length;
    return { stillPresent: rows.map((r) => r.id), mirrorsReferencing: mirrors, absent: ctx.slotsAbsent, slotsOverlappingNight301OrCasa: overlap.map((s) => ({ id: s.id, role: idOf(s.role_id), state: s.state, channel: s.x_channel || null })) };
  }));

  steps.push(await step('ical.marker', async () => {
    const hits = await odoo.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role'], ['index_content', 'ilike', 'ATH-DEV-018 PRUEBA P0']], ['id', 'res_id']);
    ctx.icalClean = hits.length === 0;
    return { feedsWithMarker: hits.map((h) => h.res_id), clean: ctx.icalClean };
  }));

  steps.push(await step('rows.pending', async () => {
    const f = await fieldsOf(odoo, 'x_availability', ['id', 'x_date', 'x_booked', 'x_total_units', 'x_to_recompute', 'x_stay_offer_id', 'write_date']);
    const target = await odoo.searchRead('x_availability', [['id', 'in', EXPECTED_PENDING_IDS]], f, { order: 'id' });
    const pending = await odoo.searchRead('x_availability', [['x_to_recompute', '=', true]], ['id', 'x_date', 'x_stay_offer_id'], { limit: 200 });
    const pendingCount = await odoo.searchCount('x_availability', [['x_to_recompute', '=', true]]);
    const same = (await odoo.searchRead('x_availability', [['x_stay_offer_id', '=', OFFER_301], ['x_date', '>=', '2026-10-14'], ['x_date', '<=', '2026-10-17']], f, { order: 'x_date' }));
    ctx.pendingIds = pending.map((p) => p.id).sort((a, b) => a - b);
    ctx.pendingOnlyExpected = pendingCount === 2 && ctx.pendingIds.join() === EXPECTED_PENDING_IDS.join();
    const night = target.find((r) => r.x_date === NIGHT);
    ctx.nightBooked = night?.x_booked ?? null;
    ctx.targetRowsOfOffer = target.length === 2 && target.every((r) => idOf(r.x_stay_offer_id) === OFFER_301);
    return {
      pendingCountAll: pendingCount, pendingRows: pending.map((p) => ({ id: p.id, date: p.x_date, offer: idOf(p.x_stay_offer_id) })),
      targetRows: target.map((r) => ({ id: r.id, date: r.x_date, booked: r.x_booked, total: r.x_total_units, pending: Boolean(r.x_to_recompute), offer: idOf(r.x_stay_offer_id), written: r.write_date })),
      neighbourhood: same.map((r) => ({ id: r.id, date: r.x_date, booked: r.x_booked, pending: Boolean(r.x_to_recompute) })),
      pendingOnlyExpected: ctx.pendingOnlyExpected, targetRowsBelongToOffer12136: ctx.targetRowsOfOffer,
    };
  }));

  steps.push(await step('actions.code', async () => {
    const acts = await odoo.searchRead('ir.actions.server', [['id', 'in', RECOMPUTE_ACTIONS]], ['id', 'name', 'state', 'code', 'model_id', 'xml_id']);
    ctx.actions = acts;
    const out = [];
    for (const a of acts) {
      const an = analyzeActionCode(a.code);
      out.push({
        id: a.id, name: a.name, state: a.state, model: Array.isArray(a.model_id) ? a.model_id[1] : a.model_id,
        envRefXmlIds: xmlidsIn(a.code), analysis: { models: an.models, create: an.create, write: an.write, unlink: an.unlink, http: an.http, mail: an.mail, saleOrder: an.saleOrder, cronOrQueue: an.cronOrQueue, ical: an.ical, webhook: an.webhook },
        codeRedacted: redactAuditCode(a.code, 9000),
      });
    }
    return { actions: out };
  }));

  steps.push(await step('cron.identify', async () => {
    const a1496 = ctx.actions?.find((a) => a.id === 1496);
    const refs = xmlidsIn(a1496?.code);
    ctx.refs = refs;
    const resolved = [];
    for (const full of refs) {
      const [module, ...rest] = full.split('.');
      const name = rest.join('.');
      const md = await odoo.searchRead('ir.model.data', [['module', '=', module], ['name', '=', name]], ['id', 'model', 'res_id', 'module', 'name']);
      resolved.push({ xmlid: full, rows: md.map((m) => ({ model: m.model, resId: m.res_id })) });
    }
    const cronRef = resolved.flatMap((r) => r.rows.filter((m) => m.model === 'ir.cron').map((m) => ({ xmlid: r.xmlid, cronId: m.resId })))[0];
    ctx.cron = null;
    if (cronRef) {
      const f = await fieldsOf(odoo, 'ir.cron', ['id', 'cron_name', 'active', 'nextcall', 'lastcall', 'interval_number', 'interval_type', 'ir_actions_server_id', 'user_id', 'priority', 'model_id', 'numbercall']);
      const [c] = await odoo.searchRead('ir.cron', [['id', '=', cronRef.cronId], ['active', 'in', [true, false]]], f);
      const srvId = idOf(c?.ir_actions_server_id);
      const [srv] = srvId ? await odoo.searchRead('ir.actions.server', [['id', '=', srvId]], ['id', 'name', 'state', 'code', 'model_id']) : [];
      const trig = await odoo.searchRead('ir.cron.trigger', [['cron_id', '=', cronRef.cronId]], ['id', 'call_at', 'create_date'], { limit: 20 });
      ctx.cron = { c, srv, trig, xmlid: cronRef.xmlid };
    }
    const unresolved = resolved.filter((r) => r.rows.length === 0).map((r) => r.xmlid);
    const an = ctx.cron?.srv ? analyzeActionCode(ctx.cron.srv.code) : null;
    return {
      envRefsInAction1496: refs, resolved, unresolved,
      cron: ctx.cron ? {
        xmlid: ctx.cron.xmlid, id: ctx.cron.c?.id, name: ctx.cron.c?.cron_name, active: ctx.cron.c?.active, nextcall: ctx.cron.c?.nextcall, lastcall: ctx.cron.c?.lastcall,
        every: `${ctx.cron.c?.interval_number} ${ctx.cron.c?.interval_type}`, runsAsUser: idOf(ctx.cron.c?.user_id), serverActionId: ctx.cron.srv?.id ?? null,
        serverActionState: ctx.cron.srv?.state ?? null, serverActionModel: Array.isArray(ctx.cron.srv?.model_id) ? ctx.cron.srv.model_id[1] : null,
        analysis: an && { models: an.models, create: an.create, write: an.write, unlink: an.unlink, http: an.http, mail: an.mail, saleOrder: an.saleOrder, cronOrQueue: an.cronOrQueue, ical: an.ical, webhook: an.webhook },
        envRefsInCronCode: xmlidsIn(ctx.cron.srv?.code), codeRedacted: redactAuditCode(ctx.cron.srv?.code, 9000),
        pendingTriggers: ctx.cron.trig.map((t) => ({ id: t.id, callAt: t.call_at, created: t.create_date })),
      } : null,
    };
  }));

  steps.push(await step('cascade.flag-users', async () => {
    // quien lee o escribe x_to_recompute / x_booked: acciones de servidor y automatizaciones
    const acts = await odoo.searchRead('ir.actions.server', [['code', 'ilike', 'x_to_recompute']], ['id', 'name', 'state', 'code'], { limit: 50 });
    const bookedActs = await odoo.searchRead('ir.actions.server', [['code', 'ilike', 'x_booked']], ['id', 'name'], { limit: 50 });
    const f = await fieldsOf(odoo, 'base.automation', ['id', 'name', 'active', 'trigger', 'model_id', 'action_server_ids', 'trigger_field_ids', 'filter_domain']);
    const ids = [...new Set([...acts, ...bookedActs].map((a) => a.id))];
    const autos = ids.length ? await odoo.searchRead('base.automation', [['action_server_ids', 'in', ids]], f, { limit: 50 }) : [];
    const autosOnAvail = await odoo.searchRead('base.automation', [['model_id.model', '=', 'x_availability']], f, { limit: 50 });
    const crons = await odoo.searchRead('ir.cron', [['ir_actions_server_id', 'in', ids]], ['id', 'cron_name', 'active', 'nextcall', 'interval_number', 'interval_type'], { limit: 50 });
    ctx.flagActionIds = ids;
    ctx.autos = autos; ctx.autosOnAvail = autosOnAvail; ctx.flagCrons = crons;
    return {
      actionsMentioningFlag: acts.map((a) => ({ id: a.id, name: a.name, state: a.state, writesFlag: /x_to_recompute['"]?\s*[:=]\s*(True|False)/.test(a.code), setsTrue: /x_to_recompute['"]?\s*[:=]\s*True/.test(a.code), setsFalse: /x_to_recompute['"]?\s*[:=]\s*False/.test(a.code), refs: xmlidsIn(a.code) })),
      actionsMentioningBooked: bookedActs.map((a) => ({ id: a.id, name: a.name })),
      automationsUsingThem: autos.map((a) => ({ id: a.id, name: a.name, active: a.active, trigger: a.trigger, model: Array.isArray(a.model_id) ? a.model_id[1] : a.model_id, actions: a.action_server_ids, triggerFieldIds: a.trigger_field_ids ?? null })),
      automationsOnModelXAvailability: autosOnAvail.map((a) => ({ id: a.id, name: a.name, active: a.active, trigger: a.trigger, actions: a.action_server_ids })),
      cronsRunningThem: crons.map((c) => ({ id: c.id, name: c.cron_name, active: c.active, nextcall: c.nextcall, every: `${c.interval_number} ${c.interval_type}` })),
    };
  }));

  steps.push(await step('cascade.real-bookings', async () => {
    const orders = await odoo.searchRead('sale.order', [['create_date', '>=', '2026-10-26 22:00:00']], ['id', 'create_date', 'state'], { limit: 20, order: 'id' });
    const lastSlots = await odoo.searchRead('planning.slot', [['create_date', '>=', '2026-10-26 22:00:00']], ['id', 'role_id', 'create_date', 'state'], { limit: 20, order: 'id' });
    return { saleOrdersSince22h: orders.map((o) => ({ id: o.id, created: o.create_date, state: o.state })), planningSlotsCreatedSince22h: lastSlots.map((s) => ({ id: s.id, role: idOf(s.role_id), created: s.create_date, state: s.state })) };
  }));

  return { steps, ctx };
}

/** Evalua las puertas. Puro: recibe el resultado de runRecomputePrecheck. */
export function evaluateGates(result) {
  const byName = Object.fromEntries(result.steps.map((s) => [s.name, s]));
  const c = result.ctx;
  const code = c.cron?.srv?.code ?? '';
  const a1493 = c.actions?.find((a) => a.id === 1493)?.code ?? '';
  const g = {};
  g.onlyTwoPendingRows = Boolean(c.pendingOnlyExpected);
  g.targetRowsBelongToOffer12136 = Boolean(c.targetRowsOfOffer);
  g.slotsAbsent = Boolean(c.slotsAbsent);
  g.icalClean = Boolean(c.icalClean);
  g.noRealOverlapOnNight = c.realOverlaps === 0;
  g.cronIdentifiedByXmlId = Boolean(c.cron?.c?.id) && !(byName['cron.identify']?.unresolved?.length);
  const bad = analyzeActionCode(`${code}\n${a1493}`);
  g.noExternalEffects = g.cronIdentifiedByXmlId && !bad.http && !bad.mail && !bad.saleOrder && !bad.ical && !bad.webhook && !bad.create && !bad.unlink;
  g.writesOnlyAvailability = g.cronIdentifiedByXmlId && bad.models.every((m) => ['x_availability'].includes(m));
  const flagSetters = (byName['cascade.flag-users']?.actionsMentioningFlag ?? []).filter((a) => a.setsTrue);
  g.noRecurringRecomputeTriggersOnOthers = (byName['cascade.flag-users']?.automationsOnModelXAvailability ?? []).length === 0 && flagSetters.length === 0;
  g.minimalMethodDefined = false; // lo fija el codigo de ejecucion tras revisar el scope real
  return { gates: g, allGatesProven: Object.values(g).every(Boolean) };
}
