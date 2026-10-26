import { UNITS, unitForOdooRole } from './unit-map.mjs';
import { defaultNightWindow, slotKey, uncoveredIntervals } from './reconcile.mjs';

/**
 * ENSAYO SIN ESCRITURAS (ATH-DEV-017). Este modulo SOLO invoca `searchRead` y `fieldsGet` del cliente JSON-2
 * (el cliente rechaza cualquier otro metodo antes de la red). No ejecuta acciones, crons, create/write/unlink ni
 * endpoints. Predice los efectos de un turno ficticio replicando el CODIGO LEIDO de las automatizaciones
 * (ATH-DEV-016); es una prediccion, no una prueba del comportamiento real.
 * Salida anonimizada: ids, roles, horas y banderas; nunca nombres ni valores de x_nobeds_id.
 */
export const ROLE_IDS = UNITS.map((u) => u.odooRoleId);
export const FICTIONAL_RESERVATION_ID = 900000001; // fuera del rango real; distinta de 161419736
const HOUR = 3600000; const DAY = 24 * HOUR;
const idOf = (v) => (Array.isArray(v) ? v[0] : v || null);
const ms = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
const dstr = (t) => new Date(t).toISOString().slice(0, 10);
const shape = (v) => String(v ?? '').replace(/[A-Za-zÁÉÍÓÚÑáéíóúñ]+/g, 'a').replace(/\d+/g, '9').slice(0, 24);

async function step(name, fn) {
  try { return { name, status: 'OK', ...(await fn()) }; } catch (e) { return { name, status: 'FAIL', code: e.code ?? e.message ?? 'UNKNOWN', httpStatus: e.status ?? null }; }
}
async function present(odoo, model, wanted) {
  const f = await odoo.fieldsGet(model, ['type']); // solo lectura
  return { have: wanted.filter((k) => f[k]), missing: wanted.filter((k) => !f[k]) };
}

export function toPilotSlot(r) {
  return { id: r.id, roleId: idOf(r.role_id), resourceId: idOf(r.resource_id), start: ms(r.start_datetime), end: ms(r.end_datetime),
    state: r.state ?? null, blockRef: r.x_bloqueo_ref ? String(r.x_bloqueo_ref) : null, hasNobeds: Boolean(r.x_nobeds_id), hasSaleLine: Boolean(idOf(r.sale_line_id)),
    hasGuest: Boolean(idOf(r.x_guest_id)), checkin: r.x_checkin_state || null, channel: r.x_channel || null };
}

/** Replica la seleccion de turnos del feed iCal de la accion 1654 (que turnos aparecen en el .ics de cada rol). */
export function feedMembership(slots, roles) {
  const houses = {};
  for (const r of roles) { const c = r.x_casa || ''; houses[c] ??= { casa: null, rooms: [] }; if (/completa/i.test(r.name || '')) houses[c].casa = r; else houses[c].rooms.push(r); }
  const out = {};
  for (const role of roles) {
    const h = houses[role.x_casa || ''] ?? { casa: null, rooms: [] };
    const linked = /completa/i.test(role.name || '') ? h.rooms.map((x) => x.id) : (h.casa ? [h.casa.id] : []);
    out[role.id] = slots.filter((s) => s.state === 'published' && ((s.roleId === role.id && !s.hasNobeds) || (linked.includes(s.roleId) && !s.blockRef))).map((s) => s.id).sort((a, b) => a - b);
  }
  return out;
}

/** Replica el calculo de disponibilidad de la accion 1493: noches [fecha inicio, fecha fin) por recurso, sin mirar el estado. */
export function bookedDatesByResource(slots) {
  const m = {};
  for (const s of slots) {
    if (!s.resourceId) continue;
    const a = Date.parse(`${dstr(s.start)}T00:00:00Z`); const b = Date.parse(`${dstr(s.end)}T00:00:00Z`);
    const nights = Math.round((b - a) / DAY);
    (m[s.resourceId] ??= new Set());
    if (nights > 0) for (let i = 0; i < nights; i += 1) m[s.resourceId].add(dstr(a + i * DAY)); else m[s.resourceId].add(dstr(a));
  }
  return m;
}
export function availabilityFor({ slots, offers, leaves = {}, dates }) {
  const booked = bookedDatesByResource(slots);
  return offers.flatMap((o) => dates.map((d) => {
    const active = o.resourceIds.filter((r) => !(leaves[r] ?? new Set()).has(d));
    return { offerId: o.id, date: d, total: active.length, booked: active.filter((r) => (booked[r] ?? new Set()).has(d)).length };
  }));
}

export async function readPilotState({ odoo, today = new Date().toISOString().slice(0, 10), pastDays = 45, futureDays = 90 }) {
  const steps = []; const state = {};
  const from = `${dstr(Date.parse(`${today}T00:00:00Z`) - pastDays * DAY)} 00:00:00`;
  const to = `${dstr(Date.parse(`${today}T00:00:00Z`) + futureDays * DAY)} 00:00:00`;
  steps.push(await step('roles.six', async () => {
    const p = await present(odoo, 'planning.role', ['id', 'name', 'x_casa', 'x_is_a_room_offer', 'resource_ids', 'active', 'x_nobeds_room_id']);
    const rows = await odoo.searchRead('planning.role', [['id', 'in', ROLE_IDS]], p.have);
    state.roles = rows.map((r) => ({ id: r.id, name: r.name, x_casa: r.x_casa || '', isRoomOffer: Boolean(r.x_is_a_room_offer), resourceIds: r.resource_ids ?? [], hasNobedsRoom: Boolean(r.x_nobeds_room_id), active: r.active !== false }));
    return { missingFields: p.missing, roles: state.roles.map((r) => ({ ...r, unit: unitForOdooRole(r.id)?.unit, name: undefined })) };
  }));
  steps.push(await step('slots.window', async () => {
    const p = await present(odoo, 'planning.slot', ['id', 'role_id', 'resource_id', 'start_datetime', 'end_datetime', 'state', 'x_bloqueo_ref', 'x_nobeds_id', 'sale_line_id', 'x_guest_id', 'x_checkin_state', 'x_channel']);
    const rows = await odoo.searchRead('planning.slot', [['role_id', 'in', ROLE_IDS], ['end_datetime', '>=', from], ['start_datetime', '<=', to]], p.have, { limit: 2000, order: 'start_datetime' });
    state.slots = rows.map(toPilotSlot);
    const by = {}; state.slots.forEach((s) => { const k = `${unitForOdooRole(s.roleId)?.unit}|${s.state}|ref:${s.blockRef ? 'si' : 'no'}|nobeds:${s.hasNobeds ? 'si' : 'no'}`; by[k] = (by[k] ?? 0) + 1; });
    return { window: [from, to], count: state.slots.length, missingFields: p.missing, profile: by };
  }));
  steps.push(await step('pickup-return-and-timezone', async () => {
    const rec = await odoo.searchRead('sale.temporal.recurrence', [], ['id', 'name', 'pickup_time', 'return_time'], { limit: 20 });
    state.recurrence = rec;
    let tz = null;
    try { const w = await present(odoo, 'website', ['tz']); if (w.have.length) tz = (await odoo.searchRead('website', [], ['id', 'tz'], { limit: 5 })).map((x) => x.tz); } catch { tz = 'NO_LEGIBLE'; }
    return { recurrences: rec.map((r) => ({ id: r.id, name: r.name, pickup: r.pickup_time, return: r.return_time })), websiteTimezones: tz };
  }));
  steps.push(await step('booking-engine.offers-availability-leaves', async () => {
    const po = await present(odoo, 'product.template', ['id', 'name', 'x_resource_ids']);
    const offers = po.have.includes('x_resource_ids') ? await odoo.searchRead('product.template', [['x_resource_ids', 'in', state.roles.flatMap((r) => r.resourceIds)]], po.have) : [];
    state.offers = offers.map((o) => ({ id: o.id, resourceIds: o.x_resource_ids ?? [] }));
    const pa = await present(odoo, 'x_availability', ['x_date', 'x_stay_offer_id', 'x_total_units', 'x_booked', 'x_to_recompute']);
    const av = pa.have.length ? await odoo.searchRead('x_availability', [['x_date', '>=', from.slice(0, 10)], ['x_date', '<=', to.slice(0, 10)], ['x_stay_offer_id', 'in', state.offers.map((o) => o.id)]], pa.have, { limit: 4000 }) : [];
    state.availability = av.map((a) => ({ date: a.x_date, offerId: idOf(a.x_stay_offer_id), total: a.x_total_units, booked: a.x_booked, pending: Boolean(a.x_to_recompute) }));
    const pl = await present(odoo, 'resource.calendar.leaves', ['resource_id', 'calendar_id', 'date_from', 'date_to']);
    const lv = pl.have.length ? await odoo.searchRead('resource.calendar.leaves', [['date_to', '>=', from], ['date_from', '<=', to]], pl.have, { limit: 500 }) : [];
    state.leaves = lv.map((l) => ({ resourceId: idOf(l.resource_id), calendarId: idOf(l.calendar_id), from: l.date_from, to: l.date_to }));
    return { offers: state.offers.length, availabilityRows: state.availability.length, pendingRecompute: state.availability.filter((a) => a.pending).length, leaves: state.leaves.length, missing: { offers: po.missing, availability: pa.missing, leaves: pl.missing } };
  }));
  steps.push(await step('ical-attachments.metadata', async () => {
    const rows = await odoo.searchRead('ir.attachment', [['name', 'like', 'ical_atheron_role_']], ['id', 'name', 'res_id', 'public', 'write_date', 'file_size'], { limit: 30 });
    state.feeds = rows.map((r) => ({ id: r.id, roleId: r.res_id, public: Boolean(r.public), writeDate: r.write_date, size: r.file_size }));
    return { feeds: state.feeds };
  }));
  steps.push(await step('guest-placeholder-candidate', async () => {
    const rows = await odoo.searchRead('res.partner', [['id', '=', 7]], ['id', 'name', 'is_company', 'active'], {});
    const p = rows[0];
    const refs = await odoo.searchRead('ir.actions.server', [['code', 'ilike', 'x_guest_id']], ['id', 'name', 'model_id'], { limit: 40 });
    state.partner7 = p ? { exists: true, genericLooking: /ota|hu[eé]sped|reserva|gen[eé]ric|cliente|mostrador/i.test(p.name || ''), nameShape: shape(p.name), isCompany: Boolean(p.is_company) } : { exists: false };
    return { partner7: state.partner7, actionsReferencingGuest: refs.map((r) => ({ id: r.id, name: r.name, model: Array.isArray(r.model_id) ? r.model_id[1] : null })) };
  }));
  return { steps, state };
}

/** Noches candidatas (solo evaluacion): libres en las seis unidades y sin cierre del recurso. */
export function selectCandidates({ state, today = new Date().toISOString().slice(0, 10), unit = '301', max = 3 }) {
  const role = UNITS.find((u) => u.unit === unit).odooRoleId;
  const res = state.roles.find((r) => r.id === role)?.resourceIds ?? [];
  const leaveDates = new Set();
  for (const l of state.leaves ?? []) if (res.includes(l.resourceId)) for (let t = Date.parse(`${String(l.from).slice(0, 10)}T00:00:00Z`); t <= Date.parse(`${String(l.to).slice(0, 10)}T00:00:00Z`); t += DAY) leaveDates.add(dstr(t));
  const cands = [];
  const first = Date.parse(`${today}T00:00:00Z`) - 45 * DAY; const last = Date.parse(`${today}T00:00:00Z`) + 90 * DAY;
  for (let t = first; t <= last; t += DAY) {
    const night = dstr(t); const [ws, we] = defaultNightWindow(night);
    const busy = state.slots.filter((s) => s.start < we && s.end > ws);
    const adjacent = state.slots.some((s) => s.roleId === role && (Math.abs(s.end - ws) < 6 * HOUR || Math.abs(s.start - we) < 6 * HOUR));
    const past = we < Date.parse(`${today}T00:00:00Z`);
    const avRows = (state.availability ?? []).filter((a) => a.date === night && (state.offers ?? []).some((o) => o.id === a.offerId && o.resourceIds.includes(res[0])));
    const sellable = !past && avRows.some((a) => a.total > 0) && !leaveDates.has(night);
    cands.push({ night, past, busyRoles: [...new Set(busy.map((s) => unitForOdooRole(s.roleId)?.unit))], free: busy.length === 0, adjacentToStay: adjacent, hasLeave: leaveDates.has(night), availabilityRows: avRows.length, commerciallySellable: sellable });
  }
  const ok = cands.filter((c) => c.free && !c.hasLeave);
  const pastFree = ok.filter((c) => c.past).sort((a, b) => (a.adjacentToStay - b.adjacentToStay) || (a.night < b.night ? 1 : -1));
  const futureFree = ok.filter((c) => !c.past).sort((a, b) => (a.night < b.night ? -1 : 1));
  return { past: pastFree.slice(0, max), future: futureFree.slice(0, max), futureFreeCount: futureFree.length, futureSellableCount: futureFree.filter((c) => c.commerciallySellable).length };
}

/** Prediccion (por lectura del codigo, ATH-DEV-016) de lo que dispararia crear UN turno ficticio de la habitacion 301. */
export function predictCreate({ state, night, variant, unit = '301', reservationId = FICTIONAL_RESERVATION_ID, guestPlaceholder = false, opaqueToken = null }) {
  const u = UNITS.find((x) => x.unit === unit); const [ws, we] = defaultNightWindow(night);
  const roleRec = state.roles.find((r) => r.id === u.odooRoleId);
  const casaRole = state.roles.find((r) => /completa/i.test(r.name || ''));
  const published = variant === 'published';
  const key = slotKey(reservationId, unit, night);
  const hypo = { id: -1, roleId: u.odooRoleId, resourceId: roleRec.resourceIds[0], start: ws, end: we, state: published ? 'published' : 'draft', blockRef: null, hasNobeds: false, hasSaleLine: false, hasGuest: guestPlaceholder, checkin: null, channel: null };
  const before = state.slots;
  const created = [{ kind: 'slot', ...pick(hypo), key }];
  const triggers = [];
  const rec = (id, fires, effect) => triggers.push({ automation: id, fires, effect });
  const rn = state.recurrence?.[0];
  const timesOk = rn ? Number.isFinite(rn.pickup_time) : null;
  rec(12, roleRec.isRoomOffer, roleRec.isRoomOffer ? (timesOk ? 'revisa horas; con 15:00/11:00 Bogota no reescribe (pendiente confirmar zona del sitio web)' : 'horas de entrada/salida no legibles: puede reescribir') : 'rol sin x_is_a_room_offer');
  rec(22, true, 'enlaza y recalcula x_availability de las fechas del turno (ignora state)');
  rec(55, false, 'sin acciones enlazadas: inerte'); rec(157, false, 'sin acciones enlazadas: inerte');
  rec(164, false, 'requiere x_nobeds_id'); rec(170, false, 'requiere x_nobeds_id'); rec(171, false, 'requiere x_nobeds_id y state=draft con linea de venta');
  rec(167, false, 'solo turnos del rol Casa Completa'); rec(158, false, 'solo al borrar'); rec(168, false, 'solo al borrar'); rec(23, false, 'solo al borrar');
  let mirror = null;
  if (published && roleRec.isRoomOffer && roleRec.x_casa && casaRole) {
    const overlap = before.filter((s) => s.roleId === casaRole.id && s.start < we && s.end > ws);
    if (overlap.length) {
      const gaps = uncoveredIntervals(ws, we, overlap);
      rec(169, true, gaps.length ? `OMITE el espejo (solape con turno de Casa) y deja ${gaps.length} tramo(s) de Casa sin bloquear` : 'omite el espejo; Casa ya bloqueada por un turno que cubre toda la noche');
      mirror = { kind: 'casa-mirror', created: false, gaps: gaps.map(([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()]) };
    } else {
      rec(169, true, 'CREA un turno espejo en Casa Completa con el mismo intervalo y x_bloqueo_ref = id del turno');
      mirror = { kind: 'casa-mirror', created: true, roleId: casaRole.id, start: new Date(ws).toISOString(), end: new Date(we).toISOString() };
      created.push({ kind: 'slot', roleId: casaRole.id, resourceId: casaRole.resourceIds[0], state: 'published', blockRef: '<id del turno>', start: ws, end: we, cascade: 'dispara 12 y 22 para el espejo; 167/169 lo ignoran por x_bloqueo_ref' });
    }
  } else rec(169, false, published ? 'rol sin x_casa o sin Casa Completa' : 'exige state=published: un borrador no genera espejo');
  const after = [...before, { ...hypo, id: -1 }, ...(mirror?.created ? [{ id: -2, roleId: casaRole.id, resourceId: casaRole.resourceIds[0], start: ws, end: we, state: 'published', blockRef: '-1', hasNobeds: false }] : [])];
  const fb = feedMembership(before, state.roles); const fa = feedMembership(after, state.roles);
  const feedsChanged = Object.keys(fa).filter((r) => JSON.stringify(fa[r]) !== JSON.stringify(fb[r])).map((r) => ({ roleId: Number(r), unit: unitForOdooRole(Number(r))?.unit, addedEvents: fa[r].filter((i) => !fb[r].includes(i)).length }));
  const guestLabel = opaqueToken ?? (guestPlaceholder ? '(nombre del huesped marcador)' : key);
  const date = night; const offers = state.offers ?? [];
  const avBefore = availabilityFor({ slots: before, offers, dates: [date] }); const avAfter = availabilityFor({ slots: after, offers, dates: [date] });
  const avDiff = avAfter.map((a, i) => ({ ...a, bookedBefore: avBefore[i].booked })).filter((a) => a.booked !== a.bookedBefore);
  return {
    variant, night, key, created, triggers, mirror, feedsChanged: published ? feedsChanged : [],
    ical: { reachesPublicFeedWithinMinutes: published ? 5 : null, summaryWouldShow: published ? `ODOO <unidad> - ${guestLabel}` : null, keyVisibleInPublicIcal: published && !guestPlaceholder && !opaqueToken, opaqueToken: Boolean(opaqueToken) },
    availabilityChange: avDiff,
    sideEffects: { saleOrders: 0, partners: 0, emails: 0, webhooksFromOdoo: 0 },
    echoWithSmoobu: published ? 'NO DESCARTABLE: el turno es "directo" (sin x_nobeds_id), entra en el .ics que consume NOBEDS/Worker; si Smoobu o un canal conectado a Smoobu importa ese calendario, la reserva volveria como bloqueo. Mitigacion: filtro anti-eco del conector y marcador ODOO' : 'no aplica: un borrador no entra en el iCal',
  };
}
const pick = ({ roleId, resourceId, start, end, state }) => ({ roleId, resourceId, start, end, state });

/** Garantiza que ninguna propuesta de un resultado sea destructiva. */
export function assertNoDestructiveOps(proposals) {
  const bad = proposals.filter((p) => !['CREATE_SLOT', 'COVER_CASA_GAP', 'UPDATE_SLOT', 'RELEASE_SLOT'].includes(p.op) || (p.op !== 'CREATE_SLOT' && !String(p.status).startsWith('BLOCKED')) || p.writesEnabled !== false);
  if (bad.length) { const e = new Error('DESTRUCTIVE_OR_UNBLOCKED_OPERATION'); e.code = 'DESTRUCTIVE_OR_UNBLOCKED_OPERATION'; e.ops = bad.map((b) => b.op); throw e; }
  return true;
}
