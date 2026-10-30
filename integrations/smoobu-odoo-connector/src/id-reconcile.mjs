import { classifyBooking, KINDS } from './classify.mjs';
import { unitForName, conflictsWith } from './unit-map.mjs';
import { parseReferences, normalizeOtaRef } from './reference-parse.mjs';
import { addDays, stayNightsInWindow } from './window.mjs';
import { RELEASE_UNLOCKED } from './odoo-facts.mjs';
import { WRITES_ENABLED } from './live-reconcile.mjs';
import { isOverbookingType } from './overbooking-watch.mjs';

/**
 * ATH-DEV-041 — Conciliacion Smoobu -> Odoo POR IDENTIFICADORES. Pura: no hace red ni escribe.
 *
 * Regla de oro: solo un identificador ETIQUETADO en `sale.order.x_pms_reference` (ID de Smoobu o de la OTA) identifica
 * una reserva. Habitacion, fechas o nombre NUNCA bastan: como mucho producen AMBIGUOUS.
 *
 * Veredictos:
 *  MATCH            un unico pedido de Odoo lleva el ID y coinciden habitacion y fechas.
 *  MISSING_IN_ODOO  ningun pedido lleva el ID y Odoo no tiene ocupacion en esa habitacion/noches.
 *  CONFLICT         el ID existe pero difieren habitacion, fechas, el otro ID, o el estado (cancelada en un lado y vigente en el otro).
 *  CANCELLED        cancelada en Smoobu y sin pedido vigente en Odoo.
 *  AMBIGUOUS        no se puede decidir sin una persona: varios pedidos con el ID, numero sin etiqueta,
 *                   ocupacion en Odoo sin ID, pedido compartido o con varias reservas.
 * ATH-CEO-PMS-100:
 *  MATCH            exige ademas pedido CONFIRMADO (sale/done) y turnos que cubran todas las noches de la habitacion.
 *  MATCH_DRAFT      el ID y los datos coinciden, pero el pedido esta en borrador (PEDIDO_EN_BORRADOR) o confirmado sin
 *                   turno que cubra las noches (CONFIRMADO_SIN_TURNO). No es ocupacion real en Odoo.
 *  DAYUSE_OK        uso diurno legitimo: Smoobu bloquea 1 noche tecnica, el pedido tiene entrada = salida = llegada y existe un
 *                   turno `DAYUSE ... SMOOBU-<id>` de menos de 24 h ese dia. No es pernocta.
 *  ROOM_MOVED       el producto del pedido es otra habitacion (producto bloqueado al confirmar), pero los turnos ENLAZADOS al
 *                   pedido estan en la habitacion de Smoobu y cubren las noches (intercambio operativo).
 * Avisos (lista `alerts`, no cambian el veredicto; solo codigos, nunca importes en el informe publico):
 *  PRICE_DIFF        el precio de Smoobu no coincide ni con la base ni con el total del pedido.
 *  TAX_MISSING       reserva de Booking.com (que cobra IVA) con pedido sin impuesto.
 *  INVOICE_DIFF      las facturas publicadas del pedido no suman el total del pedido.
 *  MANUAL_PRICE_DIFF una linea tiene "Precio Manual (fijo)" distinto de su precio unitario.
 */
export const VERDICTS = Object.freeze({ MATCH: 'MATCH', MATCH_DRAFT: 'MATCH_DRAFT', DAYUSE_OK: 'DAYUSE_OK', ROOM_MOVED: 'ROOM_MOVED', MISSING_IN_ODOO: 'MISSING_IN_ODOO', CONFLICT: 'CONFLICT', CANCELLED: 'CANCELLED', AMBIGUOUS: 'AMBIGUOUS' });
export const ALERTS = Object.freeze({ PRICE_DIFF: 'PRICE_DIFF', TAX_MISSING: 'TAX_MISSING', INVOICE_DIFF: 'INVOICE_DIFF', MANUAL_PRICE_DIFF: 'MANUAL_PRICE_DIFF' });
const BOOKING_CHANNEL_ID = 7208046;
const CONFIRMED_STATES = new Set(['sale', 'done']);
const AMOUNT_TOLERANCE = 1; // COP

/** Reservas que nunca se resuelven de forma automatica (alerta de sobreventa vigente, ATH-DEV-039/041). */
export const MANUAL_REVIEW_IDS = Object.freeze(new Set([160829171]));

/** Casos de control de ATH-DEV-041 (solo identificadores tecnicos). */
export const CONTROL_CASES = Object.freeze([
  Object.freeze({ smoobuId: 160965781, otaRef: '6044417870', unit: '302', arrival: '2026-10-31', departure: '2026-11-01' }),
  Object.freeze({ smoobuId: 161787956, otaRef: '5122466816', unit: '201', arrival: '2026-11-01', departure: '2026-11-02' }),
  Object.freeze({ smoobuId: 160829171, otaRef: '5046108535', unit: '301', arrival: '2027-01-04', departure: '2027-01-05' }),
]);

const isGuestStay = (k) => k === KINDS.RESERVATION || k === KINDS.MODIFICATION;
const m2oId = (v) => (Array.isArray(v) ? v[0] : (v ?? null));
const isCancelledOrder = (o) => o.state === 'cancel' || o.x_reservation_status === 'cancelled';
const dateOnly = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

/** Una noche D esta ocupada en Odoo si algun turno del rol cubre D+1 03:00 UTC (22:00 de D en Bogota). El Booking Engine cuenta tambien los draft. */
function occupiedNights(slots, roleId, nights) {
  const own = slots.filter((s) => m2oId(s.role_id) === roleId);
  return nights.filter((d) => { const probe = `${addDays(d, 1)} 03:00:00`; return own.some((s) => s.start_datetime <= probe && s.end_datetime > probe); });
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const near = (a, b) => a != null && b != null && Math.abs(a - b) <= AMOUNT_TOLERANCE;

/** Noches cubiertas por un conjunto concreto de turnos (misma regla de las 22:00 de Bogota). */
function coveredNights(own, nights) {
  return nights.filter((d) => { const probe = `${addDays(d, 1)} 03:00:00`; return own.some((s) => s.start_datetime <= probe && s.end_datetime > probe); });
}

/** Turno DAYUSE que respalda un uso diurno: etiquetado con el ID, empieza el dia de llegada (UTC-5) y dura menos de 24 h. */
function dayuseSlotFor(dayuseSlots, smoobuId, arrival) {
  return dayuseSlots.find((s) => {
    if (!/^\s*DAYUSE\b/i.test(String(s.name ?? ''))) return false;
    if (!parseReferences(String(s.name)).smoobu.includes(String(smoobuId))) return false;
    if (!s.start_datetime || !s.end_datetime) return false;
    const start = new Date(`${s.start_datetime.replace(' ', 'T')}Z`); const end = new Date(`${s.end_datetime.replace(' ', 'T')}Z`);
    const hours = (end - start) / 3600000;
    const localDay = new Date(start.getTime() - 5 * 3600000).toISOString().slice(0, 10);
    return hours > 0 && hours < 24 && localDay === arrival;
  }) ?? null;
}

/** Avisos de importes de un pedido emparejado. Solo codigos. */
function amountAlerts(c, o, rawBooking) {
  const alerts = [];
  const smoobuPrice = num(rawBooking?.price);
  const untaxed = num(o.amount_untaxed); const total = num(o.amount_total); const tax = num(o.amount_tax);
  if (smoobuPrice != null && smoobuPrice > 0 && (untaxed != null || total != null) && !near(smoobuPrice, untaxed) && !near(smoobuPrice, total)) alerts.push(ALERTS.PRICE_DIFF);
  if (c.channelId === BOOKING_CHANNEL_ID && tax != null && tax === 0) alerts.push(ALERTS.TAX_MISSING);
  const posted = (o.invoices ?? []).filter((i) => i.state === 'posted');
  if (posted.length && total != null) {
    const invoiced = posted.reduce((acc, i) => acc + (i.move_type === 'out_refund' ? -1 : 1) * (num(i.amount_total) ?? 0), 0);
    if (!near(invoiced, total)) alerts.push(ALERTS.INVOICE_DIFF);
  }
  if ((o.lines ?? []).some((l) => { const pm = num(l.x_precio_manual); return pm != null && pm !== 0 && !near(pm, num(l.price_unit)); })) alerts.push(ALERTS.MANUAL_PRICE_DIFF);
  return alerts;
}

/** Grupos de estancias VIGENTES de Smoobu que se pisan (misma habitacion, o Casa Completa contra una habitacion). */
export function smoobuOverlaps(stays) {
  const pairs = [];
  for (let i = 0; i < stays.length; i += 1) {
    for (let j = i + 1; j < stays.length; j += 1) {
      const a = stays[i]; const b = stays[j];
      const clash = a.unit === b.unit || conflictsWith(a.unit).includes(b.unit);
      if (!clash) continue;
      if (a.arrival < b.departure && b.arrival < a.departure) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

/**
 * @param {object} p
 * @param {object[]} p.bookings  registros crudos de GET /api/reservations (se leen solo campos tecnicos)
 * @param {{from:string,to:string}} p.window ventana validada (window.mjs)
 * @param {object[]} p.orders    sale.order leidos, con `units` (nombres de unidad) ya resueltos por quien llama
 * @param {object[]} p.slots     planning.slot leidos
 * @param {object[]} [p.dayuseSlots] turnos cuya nota empieza por DAYUSE (cualquier rol); solo se usan en memoria
 */
export function reconcileByIds({ bookings, window, orders, slots, dayuseSlots = [], manualReviewIds = MANUAL_REVIEW_IDS }) {
  const parsedOrders = orders.map((o) => ({ ...o, refs: parseReferences(o.x_pms_reference) }));
  const rawById = new Map(bookings.map((b) => [Number(b?.id), b]));
  const classified = bookings.map((b) => {
    const c = classifyBooking(b);
    return { ...c, otaRef: normalizeOtaRef(b?.['reference-id']), channelId: Number.isInteger(Number(b?.channel?.id)) ? Number(b.channel.id) : null };
  });

  const counts = { blocksActive: 0, blocksCancelled: 0, excludedCarrera19: 0, unmapped: 0, outsideWindow: 0, otherTypes: 0, invalid: 0, overbookingInList: 0 };
  const inScope = [];
  // ATH-DEV-053: si el listado llegara a traer un registro `type: OverBooking`, se separa como ALERTA de revision manual (sin veredicto ni propuesta)
  const overbookingInList = [];
  for (const c of classified) {
    if (c.kind === KINDS.BLOCK) { counts[c.blockedActive ? 'blocksActive' : 'blocksCancelled'] += 1; continue; }
    if (c.kind === KINDS.EXCLUDED) { counts.excludedCarrera19 += 1; continue; }
    if (c.kind === KINDS.UNMAPPED) { counts.unmapped += 1; continue; }
    if (c.kind === KINDS.INVALID) { counts.invalid += 1; continue; }
    if (c.kind === KINDS.OTHER_TYPE && isOverbookingType(c.type)) { counts.overbookingInList += 1; overbookingInList.push({ smoobuId: c.id, unit: c.unit, arrival: c.arrival, departure: c.departure, channelId: c.channelId, manualReview: 'REVISION_MANUAL_SOBREVENTA', automaticAction: 'NINGUNA', writesEnabled: false }); continue; }
    if (c.kind === KINDS.OTHER_TYPE) { counts.otherTypes += 1; continue; }
    const nights = stayNightsInWindow(c, window);
    if (!nights.length) { counts.outsideWindow += 1; continue; }
    inScope.push({ ...c, nights });
  }

  // sobreventa dentro de Smoobu: solo estancias de huesped vigentes (los bloqueos no cuentan)
  const activeStays = inScope.filter((c) => isGuestStay(c.kind));
  const overlapPairs = smoobuOverlaps(activeStays);
  const overlapsOf = (id) => overlapPairs.filter((p) => p.includes(id)).map((p) => (p[0] === id ? p[1] : p[0]));

  // que pedidos de Odoo apuntan a cada reserva (solo por ID etiquetado)
  const matchesFor = (c) => parsedOrders.filter((o) => o.refs.smoobu.includes(String(c.id)) || (c.otaRef && (o.refs.booking.includes(c.otaRef) || o.refs.airbnb.includes(c.otaRef))));
  const unlabeledFor = (c) => parsedOrders.filter((o) => o.refs.unlabeled.includes(String(c.id)) || (c.otaRef && o.refs.unlabeled.includes(c.otaRef)));
  const orderUsage = new Map();
  for (const c of inScope) for (const o of matchesFor(c)) orderUsage.set(o.id, [...(orderUsage.get(o.id) ?? []), c.id]);

  const perReservation = inScope.map((c) => {
    const unit = unitForName(c.unit);
    const freeNights = c.nights.filter((d) => !occupiedNights(slots, unit.odooRoleId, [d]).length);
    const occupancy = freeNights.length === 0 ? 'FULL' : (freeNights.length === c.nights.length ? 'NONE' : 'PARTIAL');
    const matched = matchesFor(c);
    const base = {
      smoobuId: c.id, otaRef: c.otaRef, channelId: c.channelId, unit: c.unit, arrival: c.arrival, departure: c.departure,
      smoobuStatus: isGuestStay(c.kind) ? 'ACTIVE' : 'CANCELLED', nightsInWindow: c.nights.length,
      odooOrders: matched.map((o) => ({ id: o.id, state: o.state ?? null })),
      odooOccupancy: occupancy, odooFreeNights: isGuestStay(c.kind) ? freeNights : [],
      overbookingWith: isGuestStay(c.kind) ? overlapsOf(c.id) : [],
      manualReview: manualReviewIds.has(c.id) ? 'ALERTA_SOBREVENTA_NO_RESOLVER_AUTOMATICAMENTE' : null,
      writesEnabled: false,
    };
    const verdict = (v, reason, extra = {}) => ({ ...base, verdict: v, reason, ...extra });

    if (c.kind === KINDS.CANCELLATION) {
      const active = matched.filter((o) => !isCancelledOrder(o));
      return active.length ? verdict(VERDICTS.CONFLICT, 'CANCELADA_EN_SMOOBU_VIGENTE_EN_ODOO') : verdict(VERDICTS.CANCELLED, matched.length ? 'CANCELADA_EN_AMBOS' : 'CANCELADA_SIN_PEDIDO_EN_ODOO');
    }
    // ATH-CEO-PMS-101: un pedido CANCELADO sustituido por otro vigente con el mismo ID (p. ej. intercambio de habitacion)
    // no es un duplicado; si queda exactamente un pedido vigente, se concilia contra ese.
    const live = matched.filter((o) => !isCancelledOrder(o));
    const candidates = matched.length > 1 && live.length === 1 ? live : matched;
    if (candidates.length > 1) return verdict(VERDICTS.AMBIGUOUS, 'VARIOS_PEDIDOS_CON_EL_MISMO_ID');
    if (candidates.length === 1) {
      const o = candidates[0];
      const matchedBy = [o.refs.smoobu.includes(String(c.id)) && 'SMOOBU_ID', c.otaRef && (o.refs.booking.includes(c.otaRef) || o.refs.airbnb.includes(c.otaRef)) && 'OTA_ID'].filter(Boolean).join('+');
      const extra = { matchedBy };
      if ((orderUsage.get(o.id) ?? []).length > 1) return verdict(VERDICTS.AMBIGUOUS, 'PEDIDO_COMPARTIDO_POR_VARIAS_RESERVAS', extra);
      if (o.refs.smoobu.length > 1) return verdict(VERDICTS.AMBIGUOUS, 'PEDIDO_REFERENCIA_VARIAS_RESERVAS', extra);
      if (o.refs.smoobu.length && !o.refs.smoobu.includes(String(c.id))) return verdict(VERDICTS.CONFLICT, 'ID_SMOOBU_DISTINTO_EN_EL_PEDIDO', extra);
      const otaRefsInOrder = [...o.refs.booking, ...o.refs.airbnb];
      if (otaRefsInOrder.length > 1) return verdict(VERDICTS.AMBIGUOUS, 'PEDIDO_REFERENCIA_VARIAS_RESERVAS', extra);
      if (c.otaRef && otaRefsInOrder.length && !otaRefsInOrder.includes(c.otaRef)) return verdict(VERDICTS.CONFLICT, 'ID_OTA_DISTINTO_EN_EL_PEDIDO', extra);
      if (isCancelledOrder(o)) return verdict(VERDICTS.CONFLICT, 'VIGENTE_EN_SMOOBU_CANCELADA_EN_ODOO', extra);
      extra.alerts = amountAlerts(c, o, rawById.get(c.id));
      if (!o.units?.length) return verdict(VERDICTS.AMBIGUOUS, 'HABITACION_DEL_PEDIDO_DESCONOCIDA', extra);
      if (o.units.length > 1) return verdict(VERDICTS.AMBIGUOUS, 'PEDIDO_CON_VARIAS_HABITACIONES', extra);
      const confirmed = CONFIRMED_STATES.has(o.state);
      const sameDates = dateOnly(o.x_checkin) === c.arrival && dateOnly(o.x_checkout) === c.departure;
      if (!o.units.includes(c.unit)) {
        // intercambio: el producto quedo en otra habitacion, pero los turnos ENLAZADOS al pedido estan en la de Smoobu
        const linked = slots.filter((s) => (o.lineIds ?? []).includes(m2oId(s.sale_line_id)) && m2oId(s.role_id) === unit?.odooRoleId);
        if (confirmed && sameDates && linked.length && coveredNights(linked, c.nights).length === c.nights.length) return verdict(VERDICTS.ROOM_MOVED, 'TURNO_EN_HABITACION_DE_SMOOBU_PRODUCTO_DISTINTO', extra);
        return verdict(VERDICTS.CONFLICT, 'HABITACION_DISTINTA', extra);
      }
      // uso diurno: Smoobu reserva 1 noche tecnica; Odoo entrada = salida = llegada + turno DAYUSE etiquetado
      const dayuse = dateOnly(o.x_checkin) === c.arrival && dateOnly(o.x_checkout) === c.arrival && c.departure === addDays(c.arrival, 1);
      if (dayuse) {
        if (confirmed && dayuseSlotFor(dayuseSlots, c.id, c.arrival)) return verdict(VERDICTS.DAYUSE_OK, 'USO_DIURNO_SIN_PERNOCTA', extra);
        return verdict(VERDICTS.CONFLICT, 'USO_DIURNO_SIN_TURNO_DAYUSE', extra);
      }
      if (!sameDates) return verdict(VERDICTS.CONFLICT, 'FECHAS_DISTINTAS', extra);
      if (!confirmed) return verdict(VERDICTS.MATCH_DRAFT, 'PEDIDO_EN_BORRADOR', extra);
      if (occupancy !== 'FULL') return verdict(VERDICTS.MATCH_DRAFT, 'CONFIRMADO_SIN_TURNO', extra);
      return verdict(VERDICTS.MATCH, 'ID_Y_DATOS_COINCIDEN', extra);
    }
    if (unlabeledFor(c).length) return verdict(VERDICTS.AMBIGUOUS, 'NUMERO_SIN_ETIQUETA_EN_REFERENCIA');
    if (occupancy !== 'NONE') return verdict(VERDICTS.AMBIGUOUS, 'ODOO_OCUPADO_SIN_ID');
    return verdict(VERDICTS.MISSING_IN_ODOO, 'SIN_PEDIDO_NI_OCUPACION_EN_ODOO');
  });

  // pedidos vigentes de Odoo con ID etiquetado de Smoobu/OTA que Smoobu no devolvio en la ventana
  const returnedIds = new Set(classified.map((c) => String(c.id)));
  const returnedOta = new Set(classified.map((c) => c.otaRef).filter(Boolean));
  const ordersNotReturnedBySmoobu = parsedOrders
    .filter((o) => !isCancelledOrder(o) && (o.refs.smoobu.length || o.refs.booking.length || o.refs.airbnb.length))
    .filter((o) => dateOnly(o.x_checkin) && dateOnly(o.x_checkout) && dateOnly(o.x_checkin) <= window.to && dateOnly(o.x_checkout) > window.from)
    .filter((o) => !o.refs.smoobu.some((x) => returnedIds.has(x)) && ![...o.refs.booking, ...o.refs.airbnb].some((x) => returnedOta.has(x)))
    .map((o) => ({ id: o.id, refKinds: ['smoobu', 'booking', 'airbnb'].filter((k) => o.refs[k].length) }));

  const summary = Object.fromEntries(Object.values(VERDICTS).map((v) => [v, perReservation.filter((r) => r.verdict === v).length]));
  const alertCounts = Object.fromEntries(Object.values(ALERTS).map((a) => [a, perReservation.filter((r) => (r.alerts ?? []).includes(a)).length]));
  const byId = new Map(perReservation.map((r) => [r.smoobuId, r]));
  const controlCases = CONTROL_CASES.map((k) => {
    const r = byId.get(k.smoobuId);
    if (!r) return { ...k, found: false, note: 'NO_DEVUELTA_POR_SMOOBU_EN_LA_VENTANA' };
    const consistent = r.unit === k.unit && r.arrival === k.arrival && r.departure === k.departure && (r.otaRef == null || r.otaRef === k.otaRef);
    return { ...k, found: true, consistentWithControl: consistent, verdict: r.verdict, reason: r.reason, odooOccupancy: r.odooOccupancy, manualReview: r.manualReview, overbookingWith: r.overbookingWith };
  });

  return {
    window: { from: window.from, to: window.to, nights: window.nights },
    summary, alertCounts, counts, perReservation,
    availabilityRisk: perReservation.filter((r) => r.smoobuStatus === 'ACTIVE' && r.odooOccupancy !== 'FULL').map((r) => ({ smoobuId: r.smoobuId, unit: r.unit, freeNightsInOdoo: r.odooFreeNights })),
    smoobuOverbooking: overlapPairs,
    overbookingInList,
    ordersNotReturnedBySmoobu,
    controlCases,
    safety: { writesEnabled: WRITES_ENABLED, releaseUnlocked: RELEASE_UNLOCKED, proposals: 0, identifiedOnlyByLabeledIds: true, rawReferenceTextPrinted: false, guestNamesPrinted: false },
  };
}
