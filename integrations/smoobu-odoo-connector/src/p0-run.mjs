import { createHash } from 'node:crypto';
import { analyzeActionCode } from './audit.mjs';
import { matches } from './domain-eval.mjs';
import { P0_RECOVERY_ID, P0_RECOVERY_MIRROR_ID, P0_VALS, P0_MARKER_NAME, P0_WINDOW, SIX_ROLE_IDS, SIX_RESOURCE_IDS, EXPECTED_SLOT_AUTOMATIONS, EXPECTED_FIRE_ON_CREATE_DRAFT, EXPECTED_FIRE_ON_UNLINK, PRODUCTION, P0_FICTIONAL_RESERVATION } from './p0-spec.mjs';

/**
 * Orquestacion del piloto P0 (ATH-DEV-018): PRECHECK -> crear 1 borrador -> verificar -> retirar -> verificar.
 * `reader` = cliente de solo lectura; `writer` = P0WriteClient (opcional; sin el no hay escritura posible).
 * Todo se registra saneado: ids, estados, conteos; nunca nombres de personas ni secretos.
 */
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const sha = (t) => createHash('sha256').update(String(t ?? '')).digest('hex').slice(0, 16);
const NEW_RECORD = { state: P0_VALS.state, x_bloqueo_ref: false, x_nobeds_id: false, sale_line_id: false, x_guest_id: false };
const ci = (arr) => [...arr].sort((a, b) => a - b);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const check = (name, passed, detail = {}) => ({ name, passed: Boolean(passed), ...detail });
async function guarded(name, fn) { try { return await fn(); } catch (e) { return check(name, false, { reason: 'NO_LEGIBLE', code: e.code ?? e.message ?? 'UNKNOWN', httpStatus: e.status ?? null }); } }

const COUNT_DOMAINS = {
  slotsTotal: ['planning.slot', []],
  slotsRole37: ['planning.slot', [['role_id', '=', 37]]],
  saleOrders: ['sale.order', []],
  partners: ['res.partner', []],
  mailMail: ['mail.mail', []],
  mailMailOutgoing: ['mail.mail', [['state', '=', 'outgoing']]],
};

/** Contadores y filas relacionadas con los efectos posibles. */
export async function snapshot(reader, slotId = null) {
  const s = { counts: {} };
  for (const [k, [m, d]] of Object.entries(COUNT_DOMAINS)) s.counts[k] = await reader.searchCount(m, d);
  s.counts.mailMessagesPlanningSlot = await reader.searchCount('mail.message', [['model', '=', 'planning.slot']]);
  s.counts.availabilityPendingRecompute = await reader.searchCount('x_availability', [['x_to_recompute', '=', true]]);
  s.windowSlots = (await reader.searchRead('planning.slot', [['role_id', 'in', [...SIX_ROLE_IDS]], ['start_datetime', '<', P0_WINDOW.end], ['end_datetime', '>', P0_WINDOW.start]], ['id', 'role_id', 'state'])).map((r) => ({ id: r.id, role: idOf(r.role_id), state: r.state }));
  const offers = await reader.searchRead('product.template', [['x_resource_ids', 'in', [...SIX_RESOURCE_IDS]]], ['id', 'x_resource_ids']);
  s.offers = offers.map((o) => ({ id: o.id, resourceIds: o.x_resource_ids ?? [] }));
  s.availability = (await reader.searchRead('x_availability', [['x_date', '>=', P0_WINDOW.night], ['x_date', '<=', P0_WINDOW.nextDay], ['x_stay_offer_id', 'in', s.offers.map((o) => o.id)]], ['id', 'x_date', 'x_stay_offer_id', 'x_total_units', 'x_booked', 'x_to_recompute']))
    .map((a) => ({ id: a.id, date: a.x_date, offer: idOf(a.x_stay_offer_id), total: a.x_total_units, booked: a.x_booked, pending: Boolean(a.x_to_recompute) })).sort((a, b) => a.id - b.id);
  s.feeds = (await reader.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role'], ['res_id', 'in', [...SIX_ROLE_IDS]]], ['id', 'res_id', 'file_size', 'write_date'])).map((f) => ({ role: f.res_id, size: f.file_size, writeDate: f.write_date })).sort((a, b) => a.role - b.role);
  if (slotId) {
    s.mirrorsOfSlot = await reader.searchCount('planning.slot', [['x_bloqueo_ref', '=', String(slotId)]]);
    s.messagesOfSlot = await reader.searchCount('mail.message', [['model', '=', 'planning.slot'], ['res_id', '=', slotId]]);
  }
  return s;
}

/** PRECHECK de solo lectura. `approved` solo si TODAS las comprobaciones bloqueantes pasan. */
export async function runPrecheck({ reader, cfg }) {
  const checks = [];
  checks.push(check('target-is-production-as-authorized', (() => { try { return new URL(cfg.baseUrl).hostname === PRODUCTION.host && cfg.database === PRODUCTION.database; } catch { return false; } })(), { host: (() => { try { return new URL(cfg.baseUrl).hostname; } catch { return null; } })(), database: cfg.database }));
  checks.push(await guarded('user', async () => {
    const ctx = await reader.call('res.users', 'context_get', {});
    const uid = ctx?.uid;
    const u = (await reader.searchRead('res.users', [['id', '=', uid]], ['id', 'active', 'share', 'login']))[0];
    return check('user', Number.isInteger(uid) && u && u.active && !u.share, { uid, active: u?.active, internalUser: u ? !u.share : null, loginShape: String(u?.login ?? '').replace(/[A-Za-z]+/g, 'a').replace(/\d+/g, '9').slice(0, 20) });
  }));
  checks.push(await guarded('base-url-param', async () => {
    const p = await reader.searchRead('ir.config_parameter', [['key', 'in', ['web.base.url', 'database.is_neutralized']]], ['key', 'value']);
    const base = p.find((x) => x.key === 'web.base.url')?.value ?? '';
    const neutral = p.find((x) => x.key === 'database.is_neutralized');
    let h = ''; try { h = new URL(base).hostname; } catch { /* vacio */ }
    return check('base-url-param', h === PRODUCTION.host || h.endsWith('.odoo.com') && h.startsWith('atheron1'), { webBaseUrlHost: h, neutralized: Boolean(neutral && String(neutral.value).toLowerCase() === 'true') });
  }));
  checks.push(await guarded('company-5', async () => {
    const c = await reader.searchRead('res.company', [['id', '=', P0_VALS.company_id]], ['id', 'name']);
    return check('company-5', c.length === 1, { companyId: c[0]?.id });
  }));
  checks.push(await guarded('schema-planning.slot', async () => {
    const f = await reader.fieldsGet('planning.slot', ['type', 'required', 'readonly', 'selection', 'relation']);
    const req = Object.entries(f).filter(([, d]) => d.required).map(([k]) => k).sort();
    const t = (k, type, rel) => f[k] && f[k].type === type && (rel === undefined || f[k].relation === rel);
    const problems = [];
    if (!eq(req, ['access_token', 'company_id', 'repeat_unit'])) problems.push(`required=${req.join(',')}`);
    for (const [k, type, rel] of [['role_id', 'many2one', 'planning.role'], ['resource_id', 'many2one', 'resource.resource'], ['company_id', 'many2one', 'res.company'], ['start_datetime', 'datetime'], ['end_datetime', 'datetime'], ['state', 'selection'], ['name', 'text'], ['x_bloqueo_ref', 'char'], ['x_nobeds_id', 'char'], ['x_guest_id', 'many2one', 'res.partner'], ['sale_line_id', 'many2one', 'sale.order.line']]) if (!t(k, type, rel)) problems.push(`campo ${k}`);
    if (!eq((f.state?.selection ?? []).map((x) => x[0]), ['draft', 'published'])) problems.push('state.selection');
    for (const k of Object.keys(P0_VALS)) if (f[k]?.readonly) problems.push(`${k} es solo lectura`);
    return check('schema-planning.slot', problems.length === 0, { requiredFields: req, problems });
  }));
  checks.push(await guarded('role-37-resource-31', async () => {
    const r = (await reader.searchRead('planning.role', [['id', '=', 37]], ['id', 'name', 'x_casa', 'x_is_a_room_offer', 'resource_ids', 'active']))[0];
    const res = (await reader.searchRead('resource.resource', [['id', '=', 31]], ['id', 'resource_type', 'company_id', 'active']))[0];
    return check('role-37-resource-31', r && /301/.test(r.name) && r.x_is_a_room_offer && eq(r.resource_ids, [31]) && r.active !== false && res && res.resource_type === 'material' && idOf(res.company_id) === 5 && res.active, { roleName301: Boolean(r && /301/.test(r.name)), roomOffer: Boolean(r?.x_is_a_room_offer), resourceIds: r?.resource_ids, resourceType: res?.resource_type, resourceCompany: idOf(res?.company_id) });
  }));
  const win = [['start_datetime', '<', P0_WINDOW.end], ['end_datetime', '>', P0_WINDOW.start]];
  checks.push(await guarded('window-free-six-roles-and-casa-mirrors', async () => {
    const byRole = await reader.searchRead('planning.slot', [['role_id', 'in', [...SIX_ROLE_IDS]], ...win], ['id', 'role_id']);
    const byRes = await reader.searchRead('planning.slot', [['resource_id', 'in', [...SIX_RESOURCE_IDS]], ...win], ['id', 'resource_id']);
    const marker = await reader.searchCount('planning.slot', [['name', '=', P0_MARKER_NAME]]);
    const casa = byRole.filter((x) => idOf(x.role_id) === 69).length;
    return check('window-free-six-roles-and-casa-mirrors', byRole.length === 0 && byRes.length === 0 && marker === 0, { slotsByRole: byRole.length, slotsByResource: byRes.length, casaSlots: casa, existingMarkerSlots: marker });
  }));
  checks.push(await guarded('no-leaves-no-orders', async () => {
    const leaves = await reader.searchCount('resource.calendar.leaves', [['resource_id', 'in', [31]], ['date_from', '<', P0_WINDOW.end], ['date_to', '>', P0_WINDOW.start]]);
    const calLeaves = await reader.searchCount('resource.calendar.leaves', [['resource_id', '=', false], ['date_from', '<', P0_WINDOW.end], ['date_to', '>', P0_WINDOW.start]]);
    const lines = await reader.searchCount('sale.order.line', [['product_id.product_tmpl_id.planning_role_id', '=', 37], ['order_id.x_checkin', '<', P0_WINDOW.nextDay], ['order_id.x_checkout', '>', P0_WINDOW.night], ['order_id.state', '!=', 'cancel']]);
    return check('no-leaves-no-orders', leaves === 0 && calLeaves === 0 && lines === 0, { resourceLeaves: leaves, calendarLeaves: calLeaves, activeOrderLinesForRole37: lines });
  }));
  // automatizaciones: conjunto exacto, quien se dispara, y codigo seguro
  const auto = await guarded('automations', async () => {
    const autos = await reader.searchRead('base.automation', [['model_id.model', '=', 'planning.slot'], ['active', '=', true]], ['id', 'name', 'trigger', 'filter_domain', 'action_server_ids']);
    const ids = ci(autos.map((a) => a.id));
    const actionIds = new Set(autos.flatMap((a) => a.action_server_ids ?? []));
    const chain = [1493, 1495];
    const acts = await reader.searchRead('ir.actions.server', [['id', 'in', [...actionIds, ...chain]]], ['id', 'name', 'state', 'code']);
    const byId = new Map(acts.map((a) => [a.id, a]));
    const decide = (triggers) => autos.filter((a) => triggers.includes(a.trigger)).map((a) => ({ a, m: matches(a.filter_domain, NEW_RECORD) }));
    const onCreate = decide(['on_create', 'on_create_or_write']); const onUnlink = decide(['on_unlink']);
    const unknownDomain = [...onCreate, ...onUnlink].filter((x) => x.m === 'unknown').map((x) => x.a.id);
    // una automatizacion que se dispara pero NO tiene acciones enlazadas es inerte (p. ej. 157): se informa, no cuenta
    const withActions = (arr) => ci(arr.filter((x) => x.m === true && (x.a.action_server_ids ?? []).length > 0).map((x) => x.a.id));
    const inertCreate = ci(onCreate.filter((x) => x.m === true && !(x.a.action_server_ids ?? []).length).map((x) => x.a.id));
    const fireCreate = withActions(onCreate);
    const fireUnlink = withActions(onUnlink);
    const safe = (id) => { const x = byId.get(id); if (!x) return { id, ok: false, why: 'sin accion' }; const an = analyzeActionCode(x.code);
      return { id, ok: x.state === 'code' && !an.http && !an.mail && !an.saleOrder && !an.webhook && !an.configParam, state: x.state, flags: { http: an.http, mail: an.mail, saleOrder: an.saleOrder, ical: an.ical, webhook: an.webhook, cronOrQueue: an.cronOrQueue }, create: an.create, unlink: an.unlink, hash: sha(x.code) }; };
    const createChainIds = [...autos.filter((a) => fireCreate.includes(a.id)).flatMap((a) => a.action_server_ids ?? []), ...chain];
    const createChain = createChainIds.map(safe);
    const unlinkChain = autos.filter((a) => fireUnlink.includes(a.id)).flatMap((a) => a.action_server_ids ?? []).map(safe);
    const strictCreate = createChain.every((x) => x.ok && x.create === 0 && x.unlink === 0 && !x.flags.ical);
    const strictUnlink = unlinkChain.every((x) => x.ok) && unlinkChain.filter((x) => x.unlink > 0).length <= 1;
    const mirrorCleanup = acts.filter((a) => /x_bloqueo_ref/.test(a.code ?? '') && /str\(\s*slot\.id\s*\)/.test(a.code ?? '') && /unlink\(\)/.test(a.code ?? '')).length >= 1;
    const x_av = await reader.searchRead('base.automation', [['model_id.model', '=', 'x_availability'], ['active', '=', true]], ['id', 'name', 'trigger', 'action_server_ids']);
    return check('automations', eq(ids, ci([...EXPECTED_SLOT_AUTOMATIONS])) && unknownDomain.length === 0 && eq(fireCreate, ci([...EXPECTED_FIRE_ON_CREATE_DRAFT])) && eq(fireUnlink, ci([...EXPECTED_FIRE_ON_UNLINK])) && strictCreate && strictUnlink && mirrorCleanup && x_av.length === 0,
      { activeOnPlanningSlot: ids, unknownDomain, inertFiringOnCreate: inertCreate, fireOnCreateDraft: fireCreate, fireOnUnlink: fireUnlink, createChain, unlinkChain, mirrorCleanupByRefOnly: mirrorCleanup, automationsOnXAvailability: x_av.map((x) => x.id) });
  });
  checks.push(auto);
  let baseline = null;
  checks.push(await guarded('baseline', async () => { baseline = await snapshot(reader); const offers31 = new Set(baseline.offers.filter((o) => o.resourceIds.includes(31)).map((o) => o.id)); const rowForNight = baseline.availability.some((a) => a.date === P0_WINDOW.night && offers31.has(a.offer)); return check('baseline', rowForNight && baseline.counts.availabilityPendingRecompute === 0, { rowForNightExists: rowForNight, pendingRecompute: baseline.counts.availabilityPendingRecompute, counts: baseline.counts, availabilityRows: baseline.availability.length, offers: baseline.offers.length, feeds: baseline.feeds.length }); }));
  const approved = checks.every((c) => c.passed);
  return { approved, verdict: approved ? 'PRECHECK_APROBADO' : 'PRECHECK_NO_APROBADO', checks, baseline };
}

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(fn, ok, { tries = 18, ms = 10000, sleep = sleepDefault } = {}) {
  let last; for (let i = 0; i < tries; i += 1) { last = await fn(); if (ok(last)) return { ok: true, value: last, attempts: i + 1 }; await sleep(ms); }
  return { ok: false, value: last, attempts: tries };
}

/** Efectos esperados tras CREAR el borrador (se comparan con lo OBSERVADO). */
export function diffAfterCreate(before, after, newId) {
  const c = (k) => after.counts[k] - before.counts[k];
  const offersWith31 = new Set(after.offers.filter((o) => o.resourceIds.includes(31)).map((o) => o.id));
  const availDiffs = after.availability.map((a) => ({ ...a, before: before.availability.find((b) => b.id === a.id) })).filter((a) => a.before && (a.before.booked !== a.booked || a.before.total !== a.total))
    .map((a) => ({ id: a.id, date: a.date, offer: a.offer, bookedBefore: a.before.booked, bookedAfter: a.booked }));
  const expectedAvail = availDiffs.length > 0 && availDiffs.every((d) => offersWith31.has(d.offer) && d.date === P0_WINDOW.night && d.bookedAfter === d.bookedBefore + 1);
  const unexpected = [];
  if (c('slotsTotal') !== 1) unexpected.push('slotsTotal');
  if (c('slotsRole37') !== 1) unexpected.push('slotsRole37');
  if (!eq(after.windowSlots.map((s) => s.id), [newId])) unexpected.push('windowSlots');
  if (after.windowSlots.some((s) => s.role === 69)) unexpected.push('casaMirror');
  if (after.mirrorsOfSlot !== 0) unexpected.push('mirrorsOfSlot');
  for (const k of ['saleOrders', 'partners', 'mailMail', 'mailMailOutgoing']) if (c(k) !== 0) unexpected.push(k);
  if (!expectedAvail) unexpected.push('availability');
  const feedChanged = after.feeds.some((f) => before.feeds.find((b) => b.role === f.role)?.size !== f.size);
  if (feedChanged) unexpected.push('icalFeedSize');
  return { deltas: Object.fromEntries(Object.keys(before.counts).map((k) => [k, c(k)])), availDiffs, feedSizesChanged: feedChanged, unexpected };
}

export async function runP0({ reader, writer = null, cfg, mode = 'precheck', sleep = sleepDefault, settleOpts = {} }) {
  const report = { mode, phases: {}, result: 'DETENIDO', createdId: null, cleanup: null };
  const pre = await runPrecheck({ reader, cfg });
  report.phases.precheck = { verdict: pre.verdict, checks: pre.checks.map((c) => ({ ...c })) };
  if (!pre.approved) { report.result = 'DETENIDO'; report.note = 'PRECHECK NO APROBADO: sin escrituras'; return report; }
  if (mode !== 'execute') { report.result = 'PRECHECK_OK_SIN_ESCRITURAS'; report.note = 'modo precheck: no se escribio nada'; return report; }
  if (!writer) { report.result = 'DETENIDO'; report.note = 'sin cliente de escritura'; return report; }
  const before = pre.baseline;
  // FASE 2: unica escritura de creacion
  let newId = null;
  try { newId = await writer.createExactlyOne({ ...P0_VALS }); } catch (e) {
    // resultado ambiguo: buscar por el marcador exacto antes de decidir (nunca reintentar la creacion)
    const found = await reader.searchRead('planning.slot', [['name', '=', P0_MARKER_NAME]], ['id', 'state']);
    report.phases.create = { error: e.code ?? e.message, foundByMarker: found.map((f) => ({ id: f.id, state: f.state })) };
    if (found.length === 1) { newId = found[0].id; try { writer.adoptCreatedId(newId); } catch { /* ya contado */ } report.phases.create.adopted = true; }
    else { report.result = found.length === 0 ? 'DETENIDO' : 'REQUIERE_RECUPERACION'; report.note = found.length === 0 ? 'la creacion fallo y no existe ningun turno con el marcador' : 'hay varios turnos con el marcador: revision humana'; return report; }
  }
  report.createdId = newId;
  // FASE 3: verificacion inmediata
  const rec = (await reader.searchRead('planning.slot', [['id', '=', newId]], ['id', 'role_id', 'resource_id', 'company_id', 'state', 'start_datetime', 'end_datetime', 'name', 'x_guest_id', 'x_nobeds_id', 'x_bloqueo_ref', 'sale_line_id', 'x_channel']))[0];
  const exact = rec && idOf(rec.role_id) === 37 && idOf(rec.resource_id) === 31 && idOf(rec.company_id) === 5 && rec.state === 'draft' && rec.start_datetime === P0_VALS.start_datetime && rec.end_datetime === P0_VALS.end_datetime && rec.name === P0_MARKER_NAME
    && !idOf(rec.x_guest_id) && !rec.x_nobeds_id && !rec.x_bloqueo_ref && !idOf(rec.sale_line_id) && !rec.x_channel;
  report.phases.verifyCreate = { recordExactAsAuthorized: Boolean(exact), observedState: rec?.state, observedStart: rec?.start_datetime, observedEnd: rec?.end_datetime };
  const settled = await settle(() => snapshot(reader, newId), (s) => s.counts.availabilityPendingRecompute === before.counts.availabilityPendingRecompute && s.availability.some((a) => a.booked > (before.availability.find((b) => b.id === a.id)?.booked ?? 0)), { sleep, ...settleOpts });
  const after = settled.value;
  const diff = diffAfterCreate(before, after, newId);
  report.phases.verifyCreate.diff = { deltas: diff.deltas, availability: diff.availDiffs, feedSizesChanged: diff.feedSizesChanged, mirrorsOfSlot: after.mirrorsOfSlot, messagesOfSlot: after.messagesOfSlot, settledAttempts: settled.attempts, unexpected: diff.unexpected };
  if (!exact || diff.unexpected.length) { report.result = 'REQUIERE_RECUPERACION'; report.note = `efecto inesperado tras crear (${[...(!exact ? ['registro'] : []), ...diff.unexpected].join(',')}): se detiene toda operacion; id ${newId} pendiente de decision humana`; return report; }
  // FASE 4: retirada controlada del unico id
  const again = (await reader.searchRead('planning.slot', [['id', '=', newId]], ['id', 'state', 'name', 'role_id', 'x_bloqueo_ref']))[0];
  const mirrors = await reader.searchCount('planning.slot', [['x_bloqueo_ref', '=', String(newId)]]);
  const others = await reader.searchRead('planning.slot', [['role_id', 'in', [...SIX_ROLE_IDS]], ['start_datetime', '<', P0_WINDOW.end], ['end_datetime', '>', P0_WINDOW.start]], ['id']);
  const safeToRemove = again && again.state === 'draft' && again.name === P0_MARKER_NAME && idOf(again.role_id) === 37 && !again.x_bloqueo_ref && mirrors === 0 && others.length === 1 && others[0].id === newId && writer.createdIds.has(newId);
  report.phases.preDelete = { sameIdStillDraftAndMarked: Boolean(again && again.state === 'draft' && again.name === P0_MARKER_NAME), mirrorsReferencingId: mirrors, otherSlotsInWindow: others.length - 1, ownedByThisRun: writer.createdIds.has(newId), safeToRemove: Boolean(safeToRemove) };
  if (!safeToRemove) { report.result = 'REQUIERE_RECUPERACION'; report.note = `no es seguro retirar el id ${newId}: no se ejecuto borrado ciego`; return report; }
  try { await writer.unlinkOwn(newId); } catch (e) { report.phases.delete = { error: e.code ?? e.message }; report.result = 'REQUIERE_RECUPERACION'; report.note = `el borrado fallo; registro ${newId} pendiente`; return report; }
  const done = await settle(() => snapshot(reader, newId), (s) => s.counts.slotsTotal === before.counts.slotsTotal && eq(s.availability.map((a) => [a.id, a.booked, a.pending]), before.availability.map((a) => [a.id, a.booked, a.pending])) && s.counts.availabilityPendingRecompute === before.counts.availabilityPendingRecompute, { sleep, ...settleOpts });
  const fin = done.value;
  const gone = (await reader.searchRead('planning.slot', [['id', '=', newId]], ['id'])).length === 0;
  const restored = { slotExists: !gone, slotsTotalRestored: fin.counts.slotsTotal === before.counts.slotsTotal, role37Restored: fin.counts.slotsRole37 === before.counts.slotsRole37, windowEmpty: fin.windowSlots.length === 0,
    saleOrders: fin.counts.saleOrders === before.counts.saleOrders, partners: fin.counts.partners === before.counts.partners, mailMail: fin.counts.mailMail === before.counts.mailMail,
    availabilityRestored: eq(fin.availability.map((a) => [a.id, a.booked, a.pending]), before.availability.map((a) => [a.id, a.booked, a.pending])), pendingRecompute: fin.counts.availabilityPendingRecompute === before.counts.availabilityPendingRecompute,
    messagesOfSlotAfter: fin.messagesOfSlot, attempts: done.attempts };
  report.cleanup = restored;
  report.phases.delete = { done: true };
  const clean = gone && restored.slotsTotalRestored && restored.role37Restored && restored.windowEmpty && restored.saleOrders && restored.partners && restored.mailMail && restored.availabilityRestored && restored.pendingRecompute;
  report.result = clean ? 'PASO' : 'REQUIERE_RECUPERACION';
  if (!clean) report.note = 'el turno se borro pero algun contador no volvio al estado previo: revisar por lectura';
  return report;
}


/**
 * EVIDENCIA de solo lectura sobre un turno P0 ya creado (ATH-DEV-018, tras un efecto inesperado).
 * No escribe nada. Solo ids, estados, fechas, conteos y banderas; el nombre se reduce a "es el marcador".
 */
export async function collectEvidence({ reader, slotId }) {
  const fields = ['id', 'role_id', 'resource_id', 'company_id', 'state', 'start_datetime', 'end_datetime', 'name', 'x_bloqueo_ref', 'x_nobeds_id', 'x_guest_id', 'sale_line_id', 'create_date', 'write_date', 'x_checkin_state'];
  const row = (r) => ({ id: r.id, role: idOf(r.role_id), resource: idOf(r.resource_id), company: idOf(r.company_id), state: r.state, start: r.start_datetime, end: r.end_datetime,
    isP0Marker: r.name === P0_MARKER_NAME, hasBloqueoRef: Boolean(r.x_bloqueo_ref), bloqueoRefEqualsP0Id: r.x_bloqueo_ref === String(slotId), hasNobeds: Boolean(r.x_nobeds_id), hasGuest: Boolean(idOf(r.x_guest_id)), hasSaleLine: Boolean(idOf(r.sale_line_id)), checkin: r.x_checkin_state || null, created: r.create_date, written: r.write_date });
  const out = { slotId };
  out.slot = (await reader.searchRead('planning.slot', [['id', '=', slotId]], fields)).map(row);
  out.mirrors = (await reader.searchRead('planning.slot', [['x_bloqueo_ref', '=', String(slotId)]], fields)).map(row);
  out.windowSlots = (await reader.searchRead('planning.slot', [['role_id', 'in', [...SIX_ROLE_IDS]], ['start_datetime', '<', P0_WINDOW.end], ['end_datetime', '>', P0_WINDOW.start]], ['id', 'role_id', 'state'])).map((r) => ({ id: r.id, role: idOf(r.role_id), state: r.state }));
  const snap = await snapshot(reader, slotId);
  out.counts = snap.counts; out.availability = snap.availability; out.feeds = snap.feeds; out.mirrorsOfSlot = snap.mirrorsOfSlot; out.messagesOfSlot = snap.messagesOfSlot;
  out.mailMessagesForMirrors = [];
  for (const m of out.mirrors) out.mailMessagesForMirrors.push({ id: m.id, messages: await reader.searchCount('mail.message', [['model', '=', 'planning.slot'], ['res_id', '=', m.id]]) });
  // atribucion de cambios en contadores: registros creados desde las 22:00 UTC (solo id, hora de creacion y, en correos, el estado)
  try {
    const since = '2026-10-26 22:00:00';
    const rec = async (model, extra = []) => (await reader.searchRead(model, [['create_date', '>=', since]], ['id', 'create_date', ...extra], { limit: 50, order: 'id' })).map((r) => ({ id: r.id, created: r.create_date, ...(extra.includes('state') ? { state: r.state } : {}) }));
    out.createdSince2200 = { saleOrders: await rec('sale.order'), partners: await rec('res.partner'), mailMail: await rec('mail.mail', ['state']) };
  } catch (e) { out.createdSince2200 = { status: 'NO_LEGIBLE', code: e.code ?? 'UNKNOWN' }; }
  // exposicion publica: que .ics contienen ya el marcador (busqueda en el indice de texto del adjunto; no se lee el contenido)
  try {
    const hits = await reader.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role'], ['index_content', 'ilike', 'ATH-DEV-018 PRUEBA P0']], ['id', 'res_id', 'write_date', 'file_size']);
    out.feedsContainingMarker = hits.map((h) => ({ role: h.res_id, writeDate: h.write_date, size: h.file_size }));
  } catch (e) { out.feedsContainingMarker = { status: 'NO_LEGIBLE', code: e.code ?? 'UNKNOWN', httpStatus: e.status ?? null }; }
  // posible causa de la publicacion automatica: atributos del rol (solo los que existan)
  try {
    const f = await reader.fieldsGet('planning.role', ['type']);
    const want = ['sync_shift_rental', 'x_is_a_room_offer', 'x_casa'].filter((k) => f[k]);
    const r = (await reader.searchRead('planning.role', [['id', '=', 37]], ['id', ...want]))[0] ?? {};
    out.roleAttributes = Object.fromEntries(want.map((k) => [k, k === 'x_casa' ? Boolean(r[k]) : r[k]]));
  } catch { out.roleAttributes = 'NO_LEGIBLE'; }
  try {
    const f = await reader.fieldsGet('planning.slot', ['type', 'readonly', 'store', 'selection']);
    out.stateFieldMeta = { readonly: Boolean(f.state?.readonly), store: f.state?.store !== false, selection: (f.state?.selection ?? []).map((x) => x[0]) };
  } catch { out.stateFieldMeta = 'NO_LEGIBLE'; }
  return out;
}


/**
 * RECUPERACION (ATH-DEV-018) del turno P0 publicado por error: retira SOLO el id 39686. La regla 168 retirara por si sola
 * su espejo 39687 (x_bloqueo_ref = '39686'). Se verifica antes que no hay nada mas implicado y despues que todo volvio al estado previo.
 * Estado previo conocido (precheck aprobado de la misma ejecucion): turnos 601, rol 37: 85, ventana vacia, 301/2026-10-15 reservadas 0.
 */
export const P0_PRE_STATE = Object.freeze({ slotsTotal: 601, slotsRole37: 85, saleOrders: 1440, partners: 2727, mailMail: 5084 });
export async function runRecovery({ reader, writer, sleep = sleepDefault, settleOpts = {} }) {
  const id = P0_RECOVERY_ID; const mirrorId = P0_RECOVERY_MIRROR_ID;
  const rep = { mode: 'recover', slotId: id, expectedMirrorId: mirrorId, result: 'DETENIDO' };
  const fields = ['id', 'role_id', 'resource_id', 'company_id', 'state', 'start_datetime', 'end_datetime', 'name', 'x_bloqueo_ref', 'x_nobeds_id', 'x_guest_id', 'sale_line_id'];
  const slot = (await reader.searchRead('planning.slot', [['id', '=', id]], fields))[0];
  const mirrors = await reader.searchRead('planning.slot', [['x_bloqueo_ref', '=', String(id)]], fields);
  const windowSlots = await reader.searchRead('planning.slot', [['role_id', 'in', [...SIX_ROLE_IDS]], ['start_datetime', '<', P0_WINDOW.end], ['end_datetime', '>', P0_WINDOW.start]], ['id']);
  const slotOk = slot && slot.name === P0_MARKER_NAME && idOf(slot.role_id) === 37 && idOf(slot.resource_id) === 31 && idOf(slot.company_id) === 5 && slot.start_datetime === P0_VALS.start_datetime && slot.end_datetime === P0_VALS.end_datetime
    && !slot.x_bloqueo_ref && !slot.x_nobeds_id && !idOf(slot.x_guest_id) && !idOf(slot.sale_line_id);
  const mirrorOk = mirrors.length === 1 && mirrors[0].id === mirrorId && idOf(mirrors[0].role_id) === 69 && mirrors[0].start_datetime === P0_VALS.start_datetime && mirrors[0].end_datetime === P0_VALS.end_datetime && !mirrors[0].x_nobeds_id && !idOf(mirrors[0].sale_line_id);
  const onlyOurs = eq(ci(windowSlots.map((w) => w.id)), ci([id, mirrorId]));
  rep.preChecks = { slotIsExactlyTheP0Record: Boolean(slotOk), onlyMirrorReferencingIt: Boolean(mirrorOk), nothingElseInWindow: onlyOurs };
  if (!slotOk || !mirrorOk || !onlyOurs) { rep.note = 'las condiciones de recuperacion no se cumplen: sin escrituras'; return rep; }
  await writer.unlinkOwn(id);
  const done = await settle(() => snapshot(reader, id), (s) => s.counts.slotsTotal === P0_PRE_STATE.slotsTotal && s.windowSlots.length === 0 && s.availability.every((a) => a.booked === 0), { sleep, ...settleOpts });
  const s = done.value;
  const gone = (await reader.searchRead('planning.slot', [['id', 'in', [id, mirrorId]]], ['id'])).length === 0;
  let markerFeeds = null;
  try { markerFeeds = (await reader.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_'], ['res_model', '=', 'planning.role'], ['index_content', 'ilike', 'ATH-DEV-018 PRUEBA P0']], ['id', 'res_id'])).map((h) => h.res_id); } catch { markerFeeds = 'NO_LEGIBLE'; }
  rep.after = { bothRecordsGone: gone, counts: s.counts, windowEmpty: s.windowSlots.length === 0, availabilityAllZero: s.availability.every((a) => a.booked === 0), feedsStillContainingMarker: markerFeeds, settledAttempts: done.attempts };
  const restored = gone && s.counts.slotsTotal === P0_PRE_STATE.slotsTotal && s.counts.slotsRole37 === P0_PRE_STATE.slotsRole37 && s.counts.saleOrders === P0_PRE_STATE.saleOrders && s.counts.partners === P0_PRE_STATE.partners && s.counts.mailMail === P0_PRE_STATE.mailMail && s.windowSlots.length === 0 && s.availability.every((a) => a.booked === 0);
  rep.result = restored ? 'PASO' : 'REQUIERE_RECUPERACION';
  if (restored && Array.isArray(markerFeeds) && markerFeeds.length) rep.note = 'estado restaurado; los .ics aun contienen el marcador hasta el proximo refresco del cron (<= 5 min): verificar con evidence';
  return rep;
}
