/**
 * HOTEL-017 — operaciones genericas por habitacion (post-freeze).
 *
 * Todas las funciones reciben `ex(model, method, args, kwargs)`: un cliente execute_kw inyectable.
 * Asi el plan (DRY-RUN) se prueba sin red. Ninguna funcion escribe salvo `applyOutboundSetup`,
 * que exige opts.apply === true y se ejecuta solo tras la guarda de STAGING del llamador.
 */
import { createHash } from 'node:crypto';
import { renderRefresh, renderWrapper, ROOMS } from './hotel017-outbound.mjs';
import { resolveRoom } from './hotel017-tooling.mjs';

const sha16 = (v) => createHash('sha256').update(v).digest('hex').slice(0, 16);

/** Nombres y codigo esperados de la salida de una habitacion. Sin IDs efimeros. */
export function planOutbound(input) {
  const room = resolveRoom(input);
  const refreshCode = renderRefresh(room.number);
  return {
    room: room.number,
    canonical: room.canonical,
    odooUnit: room.odooUnit,
    resource: room.resource,
    role: room.role,
    attachment: room.attachment,
    refreshName: `ATHERON iCal — REFRESH SOLO ${room.number} (rol ${room.role})`,
    wrapperName: `ATHERON - Refrescar iCal SOLO ${room.number}`,
    cronName: `ATHERON - Refrescar iCal SOLO ${room.number}`,
    filtered: room.filtered,
    refreshSha16: sha16(refreshCode),
    refreshCode,
  };
}

/** Lecturas previas (sin escritura): unidad, adjunto, nombres ya existentes, feed. */
export async function readOutboundState(ex, plan) {
  const unit = (await ex('x_hotel_unit', 'search_read', [[['x_name', '=', plan.room]]], { fields: ['id', 'x_name', 'x_resource_id', 'x_role_id'], limit: 2 }))[0];
  const attachment = (await ex('ir.attachment', 'search_read', [[['id', '=', plan.attachment]]], { fields: ['id', 'name', 'res_model', 'res_id'], limit: 1 }))[0];
  const existingActions = await ex('ir.actions.server', 'search_read', [[['name', 'in', [plan.refreshName, plan.wrapperName]]]], { fields: ['id', 'name'], limit: 10 });
  const existingCrons = await ex('ir.cron', 'search_read', [[['name', '=', plan.cronName]]], { fields: ['id'], limit: 5 });
  const feed = await ex('x_hotel_ota_feed', 'search_read', [[['x_canonical_unit_id', '=', plan.canonical], ['x_source', '=', 'booking']]], { fields: ['id'], limit: 5 });
  return {
    unitOk: Boolean(unit) && unit.x_resource_id?.[0] === plan.resource && unit.x_role_id?.[0] === plan.role,
    attachmentOk: Boolean(attachment) && attachment.name === `ical_atheron_role_${plan.role}.ics` && attachment.res_model === 'planning.role' && attachment.res_id === plan.role,
    existingActions: existingActions.map((a) => a.id),
    existingCrons: existingCrons.map((c) => c.id),
    feedIds: feed.map((f) => f.id),
  };
}

/**
 * Plan de alta de salida: dice exactamente que crearia y si algo lo impide.
 * No escribe.
 */
export function assessOutboundSetup(plan, state) {
  const blockers = [];
  if (!state.unitOk) blockers.push('UNIT_MISMATCH');
  if (!state.attachmentOk) blockers.push('ATTACHMENT_MISMATCH');
  if (state.existingActions.length) blockers.push('ACTION_NAME_EXISTS');
  if (state.existingCrons.length) blockers.push('CRON_NAME_EXISTS');
  return {
    mode: 'DRY_RUN',
    room: plan.room,
    wouldCreate: { refreshAction: plan.refreshName, wrapperAction: plan.wrapperName, cron: plan.cronName, cronEvery: '5 minutes', feedIfMissing: `${plan.canonical} / booking` },
    refreshSha16: plan.refreshSha16,
    feedAlreadyExists: state.feedIds.length > 0,
    blockers,
    ready: blockers.length === 0,
  };
}

/** Cadena de alta. Ids leidos directamente del retorno de create (sin doble validacion). */
export async function applyOutboundSetup(ex, plan, { apply = false, modelId } = {}) {
  if (apply !== true) throw new Error('APPLY_FLAG_REQUIRED');
  if (!Number.isInteger(modelId)) throw new Error('MODEL_ID_REQUIRED');
  const state = await readOutboundState(ex, plan);
  const verdict = assessOutboundSetup(plan, state);
  if (!verdict.ready) throw new Error('SETUP_BLOCKED:' + verdict.blockers.join(','));
  const model = modelId;
  const refreshId = await ex('ir.actions.server', 'create', [{ name: plan.refreshName, model_id: model, state: 'code', code: plan.refreshCode }]);
  const wrapperId = await ex('ir.actions.server', 'create', [{ name: plan.wrapperName, model_id: model, state: 'code', code: renderWrapper(refreshId) }]);
  const cronId = await ex('ir.cron', 'create', [{ name: plan.cronName, model_id: model, interval_number: 5, interval_type: 'minutes', active: true, ir_actions_server_id: wrapperId, nextcall: new Date(Date.now() + 60000).toISOString().replace('T', ' ').slice(0, 19) }]);
  const cronRead = (await ex('ir.cron', 'read', [[cronId]], { fields: ['ir_actions_server_id', 'active'] }))[0];
  const wired = cronRead.ir_actions_server_id?.[0] === wrapperId && cronRead.active === true;
  return { refreshId, wrapperId, cronId, wired, feedCreated: false };
}

/** Feed booking de la habitacion, solo si falta. Sin referencia de inbound. */
export async function ensureBookingFeed(ex, plan, { apply = false } = {}) {
  const existing = await ex('x_hotel_ota_feed', 'search_read', [[['x_canonical_unit_id', '=', plan.canonical], ['x_source', '=', 'booking']]], { fields: ['id'], limit: 5 });
  if (existing.length) return { created: false, id: existing[0].id };
  if (apply !== true) return { created: false, wouldCreate: true };
  const id = await ex('x_hotel_ota_feed', 'create', [{ x_name: `${plan.canonical} / booking`, x_source: 'booking', x_canonical_unit_id: plan.canonical, x_odoo_unit_id: plan.odooUnit }]);
  return { created: true, id };
}

/** Lista de eventos del iCal ya leido, con su correspondencia a slots por ventana (solo lectura). */
export function correspondence(events, slots) {
  return events.map((e) => {
    const st = `${e.dtstart} 20:00:00`, en = `${e.dtend} 16:00:00`;
    const hits = slots.filter((s) => s.start_datetime < en && s.end_datetime > st);
    return { window: `${e.dtstart}/${e.dtend}`, slotIds: hits.map((h) => h.id), unique: hits.length === 1, conflict: hits.length > 1 };
  });
}

/**
 * Clasifica eventos iCal contra slots y vinculos OTA ya existentes. Pura, sin escritura.
 * CREATE: no hay slot que solape. DUPLICATE: el unico slot que solapa esta vinculado a ese evento.
 * CONFLICT: varios slots solapan, o el evento esta vinculado a otro slot.
 * ADOPTION_CANDIDATE: un unico slot sin vinculo. NUNCA se adopta automaticamente.
 * events: [{ dtstart, dtend, key }]; slots: [{ id, start_datetime, end_datetime }];
 * bindings: { [key]: slotId }.
 */
export function classifyEvents(events, slots, bindings = {}) {
  return events.map((e) => {
    const hits = slots.filter((s) => String(s.start_datetime) < `${e.dtend} 16:00:00` && String(s.end_datetime) > `${e.dtstart} 20:00:00`);
    const bound = bindings[e.key];
    let verdict;
    if (bound === AMBIGUOUS_BINDING) verdict = 'CONFLICT';
    else if (hits.length === 0) verdict = bound === undefined ? 'CREATE' : 'CONFLICT';
    else if (hits.length > 1) verdict = 'CONFLICT';
    else if (bound === undefined) verdict = 'ADOPTION_CANDIDATE';
    else if (bound === hits[0].id) verdict = 'DUPLICATE';
    else verdict = 'CONFLICT';
    return { window: `${e.dtstart}/${e.dtend}`, verdict, slotIds: hits.map((h) => h.id) };
  });
}

/** Resumen de clasificacion (conteos). */
export function summarizeClassification(rows) {
  const out = { CREATE: 0, DUPLICATE: 0, CONFLICT: 0, ADOPTION_CANDIDATE: 0 };
  for (const r of rows) out[r.verdict] += 1;
  return out;
}

/**
 * Exclusion de Casa Completa para una habitacion.
 * roomOverlap / casaOverlap: slots publicados que solapan la ventana.
 * casaRealWithOrder: reservas reales de Casa con pedido en la ventana.
 * Sin evidencia suficiente devuelve NOT_TESTABLE (no fabrica datos).
 */
export function casaExclusionVerdict({ roomOverlap, casaOverlap, casaRealWithOrder }) {
  // La evidencia comercial (reserva real de Casa con pedido) se evalua primero: es la mas especifica.
  if (casaRealWithOrder > 0 && roomOverlap === 0) return 'FAIL_CASA_REAL_ROOM_FREE';
  if (casaRealWithOrder > 0 && roomOverlap > 0) return 'PASS_CASA_REAL_ROOM_BLOCKED';
  if (roomOverlap > 0 && casaOverlap > 0) return 'PASS_ROOM_BLOCKS_CASA';
  if (roomOverlap > 0 && casaOverlap === 0) return 'FAIL_ROOM_OCCUPIED_CASA_FREE';
  if (roomOverlap === 0 && casaOverlap === 0) return 'NOT_TESTABLE_NO_OCCUPANCY_EVIDENCE';
  return 'NOT_TESTABLE';
}

/**
 * Revalidacion de un feed (solo lectura). Por evento: clasificacion, vinculo OTA y exclusion de Casa.
 * casaSlots: slots de la unidad padre Casa Completa; cada uno puede traer hasOrder (reserva real con pedido).
 * No asume habitacion ni IDs: opera sobre cualquier unidad.
 */
export function revalidateFeed({ events, slots, casaSlots = [], bindings = {} }) {
  const rows = classifyEvents(events, slots, bindings);
  return rows.map((r, i) => {
    const e = events[i];
    const st = `${e.dtstart} 20:00:00`, en = `${e.dtend} 16:00:00`;
    const overlap = (list) => list.filter((s) => String(s.start_datetime) < en && String(s.end_datetime) > st);
    const roomOverlap = overlap(slots).length;
    const casa = overlap(casaSlots);
    return {
      window: r.window,
      classification: r.verdict,
      bindingOk: r.verdict === 'DUPLICATE',
      casaExclusion: casaExclusionVerdict({
        roomOverlap,
        casaOverlap: casa.length,
        casaRealWithOrder: casa.filter((s) => s.hasOrder).length,
      }),
    };
  });
}

/**
 * Guarda de idempotencia para --apply: solo se escribe si TODOS los eventos ya son DUPLICATE.
 * Cualquier CREATE, CONFLICT o ADOPTION_CANDIDATE bloquea la escritura (no se adopta ni se crea a ciegas).
 */
export function assertIdempotentPlan(rows) {
  const pending = rows.filter((r) => r.verdict !== 'DUPLICATE');
  if (pending.length) throw new Error('APPLY_BLOCKED_NOT_IDEMPOTENT');
  return true;
}

/** Marca de binding ambiguo: la misma clave apunta a slots distintos en las fuentes. */
export const AMBIGUOUS_BINDING = 'AMBIGUOUS';

/**
 * Vinculos clave -> slot desde las dos fuentes reales de Odoo:
 *  - ota_block_adopt: slot en x_request.slot_id (adopcion explicita).
 *  - ota_block_apply: slot en x_response.data.slot_id (bloque creado por importacion).
 * Misma clave y mismo slot en ambas = valido. Clave con slots distintos = AMBIGUOUS_BINDING.
 * Filas no legibles o sin slot se ignoran; nunca producen un vinculo inventado.
 */
export function bindingsFromAuditRows(adoptRows = [], applyRows = []) {
  const map = {};
  const put = (key, slotId) => {
    if (!key || !Number.isInteger(slotId) || slotId < 1) return;
    if (!(key in map)) map[key] = slotId;
    else if (map[key] !== slotId) map[key] = AMBIGUOUS_BINDING;
  };
  for (const a of adoptRows) {
    try { put(a.x_idempotency_key, Number(JSON.parse(a.x_request || '{}').slot_id)); } catch { /* fila no legible */ }
  }
  for (const a of applyRows) {
    try { put(a.x_idempotency_key, Number(JSON.parse(a.x_response || '{}')?.data?.slot_id)); } catch { /* fila no legible */ }
  }
  return map;
}
