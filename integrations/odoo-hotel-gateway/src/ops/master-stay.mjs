import { addDays, diffDays, isDate } from './dates.mjs';
import { isTestRecord } from '../angela-board-model.mjs';

/**
 * Consolidación de reservas Beds24 en ESTADÍAS MAESTRAS (MASTER_STAY).
 *
 * Una estadía comercial = N segmentos físicos (habitación Atheron o EXTERNAL) + un solo huésped, un solo total, un solo saldo.
 * Orden de agrupación (la primera regla que aplique gana; NUNCA se funde por nombre de huésped):
 *   1. registro maestro (x_hotel_master_stay): lista explícita de bookingId + tramos EXTERNAL + total comercial + plan de pagos.
 *   2. etiqueta ATH-STAY-… en apiReference/notas de Beds24.
 *   3. masterId de Beds24 (grupo nativo).
 *   4. reserva suelta → estadía de un solo segmento.
 * Lo que parece continuación (mismo huésped, fechas contiguas, distinta habitación) pero no está enlazado se reporta como
 * POSIBLE_CONTINUACION y NO se fusiona.
 */

export const PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED';
export const PAYMENT_REPORTED = 'PAYMENT_REPORTED';
const ACTIVE = new Set(['CONFIRMED', 'PENDING', 'HOLD']);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function validateRegistryEntry(e) {
  const bad = [];
  if (!e || typeof e.ref !== 'string' || !e.ref) bad.push('ref');
  for (const m of e?.members ?? []) {
    if (m.kind === 'BEDS24' && !m.bookingId) bad.push('member.bookingId');
    if (m.kind === 'EXTERNAL' && !(isDate(m.checkin) && isDate(m.checkout) && m.checkout > m.checkin)) bad.push('member.external.dates');
    if (m.kind !== 'BEDS24' && m.kind !== 'EXTERNAL') bad.push('member.kind');
  }
  return bad;
}

function groupBookings(bookings, registry, anomalies) {
  const groups = new Map(); // ref -> { ref, registry, members:[booking], external:[...] }
  const assigned = new Map(); // bookingId -> ref
  const byId = new Map(bookings.map((b) => [b.bookingId, b]));
  const ensure = (ref, reg = null) => {
    if (!groups.has(ref)) groups.set(ref, { ref, registry: reg, bookings: [], external: [] });
    return groups.get(ref);
  };

  for (const entry of registry) {
    const bad = validateRegistryEntry(entry);
    if (bad.length) { anomalies.push({ code: 'REGISTRO_INVALIDO', ref: entry?.ref ?? null, detail: bad.join(',') }); continue; }
    const g = ensure(entry.ref, entry);
    for (const m of entry.members ?? []) {
      if (m.kind === 'EXTERNAL') { g.external.push(m); continue; }
      const b = byId.get(String(m.bookingId));
      if (!b) { anomalies.push({ code: 'MIEMBRO_NO_ENCONTRADO', ref: entry.ref, detail: String(m.bookingId) }); continue; }
      if (assigned.has(b.bookingId)) { anomalies.push({ code: 'RESERVA_EN_DOS_ESTADIAS', ref: entry.ref, detail: b.bookingId }); continue; }
      g.bookings.push(b); assigned.set(b.bookingId, entry.ref);
    }
  }
  for (const b of bookings) {
    if (assigned.has(b.bookingId)) {
      if (b.masterStayRef && b.masterStayRef !== assigned.get(b.bookingId)) {
        anomalies.push({ code: 'REFERENCIA_CONFLICTIVA', ref: assigned.get(b.bookingId), detail: `${b.bookingId} lleva ${b.masterStayRef}` });
      }
      continue;
    }
    let ref;
    if (b.masterStayRef) {
      ref = b.masterStayRef;
      if (!groups.has(ref)) anomalies.push({ code: 'MASTER_SIN_REGISTRO', ref, detail: 'etiqueta en Beds24 sin registro maestro: total y plan de pagos no verificados' });
    } else if (b.masterId) ref = `BEDS24-MASTER-${b.masterId}`;
    else ref = `BEDS24-${b.bookingId}`;
    ensure(ref).bookings.push(b); assigned.set(b.bookingId, ref);
  }
  // un masterId puede ser la reserva «cabeza» (su propio id): úne al grupo si otras lo apuntan
  for (const [ref, g] of [...groups]) {
    if (!ref.startsWith('BEDS24-') || ref.startsWith('BEDS24-MASTER-')) continue;
    const head = g.bookings[0];
    const mg = groups.get(`BEDS24-MASTER-${head.bookingId}`);
    if (mg) { mg.bookings.push(head); groups.delete(ref); }
  }
  return groups;
}

function buildSegments(g, anomalies) {
  const segs = [];
  for (const b of g.bookings) {
    if (!ACTIVE.has(b.status) && b.status !== 'CANCELLED') continue;
    if (b.status === 'CANCELLED') continue;
    if (!b.unit) { anomalies.push({ code: 'RESERVA_SIN_HABITACION', ref: g.ref, detail: `${b.bookingId} roomId ${b.roomId}` }); continue; }
    if (!isDate(b.checkin) || !isDate(b.checkout) || b.checkout <= b.checkin) { anomalies.push({ code: 'FECHAS_INVALIDAS', ref: g.ref, detail: b.bookingId }); continue; }
    segs.push({ kind: 'ROOM', unit: b.unit, bookingId: b.bookingId, checkin: b.checkin, checkout: b.checkout, status: b.status, holdExpires: b.holdExpires, source: b.source, charge: b.chargeTotal });
  }
  for (const m of g.external) segs.push({ kind: 'EXTERNAL', unit: 'EXTERNAL', label: m.label ?? 'EXTERNAL', checkin: m.checkin, checkout: m.checkout, status: 'CONFIRMED', charge: Number(m.charge) || 0 });
  segs.sort((a, b) => a.checkin.localeCompare(b.checkin) || a.checkout.localeCompare(b.checkout));
  segs.forEach((s, i) => { s.first = i === 0; s.last = i === segs.length - 1; s.seq = i + 1; });
  for (let i = 1; i < segs.length; i += 1) {
    if (segs[i].checkin < segs[i - 1].checkout) anomalies.push({ code: 'SEGMENTOS_SOLAPADOS', ref: g.ref, detail: `${segs[i - 1].unit}/${segs[i].unit}` });
    else if (segs[i].checkin > segs[i - 1].checkout) anomalies.push({ code: 'SEGMENTO_HUECO', ref: g.ref, detail: `${segs[i - 1].checkout} → ${segs[i].checkin}` });
  }
  return segs;
}

/** Aplica los pagos confirmados a las cuotas del plan, en orden. */
export function allocatePlan(plan, confirmed, asOf) {
  let left = confirmed;
  return (plan ?? []).map((p, i) => {
    const paid = Math.min(Math.max(left, 0), p.amount); left -= paid;
    const status = paid >= p.amount ? 'PAID' : p.due_date && asOf && p.due_date < asOf ? 'OVERDUE' : paid > 0 ? 'PARTIAL' : 'PENDING';
    return { seq: p.seq ?? i + 1, amount: p.amount, due_date: p.due_date ?? null, paid, outstanding: p.amount - paid, status };
  });
}

/**
 * @param {object} p
 * @param {object[]} p.bookings            salida de normalizeBeds24Booking
 * @param {object[]} [p.registry]          estadías maestras
 * @param {object[]} [p.confirmedPayments] libro de pagos confirmados {id, ref|bookingId, amount, beds24PaymentId?}
 * @param {'REPORTED'|'CONFIRMED'} [p.paymentPolicy] cómo tratar los pagos que vienen de Beds24 (defecto REPORTED = no restan)
 */
export function consolidateStays({ bookings, registry = [], confirmedPayments = [], paymentPolicy = 'REPORTED', asOf = null }) {
  const anomalies = [];
  const real = bookings.filter((b) => !isTestRecord({ guest: b.guest }));
  const blackouts = real.filter((b) => b.status === 'BLACKOUT' && b.unit && b.checkin && b.checkout)
    .map((b) => ({ bookingId: b.bookingId, unit: b.unit, checkin: b.checkin, checkout: b.checkout, notes: b.notes }));
  const stayBookings = real.filter((b) => b.status !== 'BLACKOUT' && b.status !== 'INQUIRY');
  const groups = groupBookings(stayBookings, registry, anomalies);
  const stays = [];

  for (const g of groups.values()) {
    const segments = buildSegments(g, anomalies);
    const allCancelled = g.bookings.length > 0 && g.bookings.every((b) => b.status === 'CANCELLED') && g.external.length === 0;
    if (!segments.length && !allCancelled) { anomalies.push({ code: 'ESTADIA_SIN_SEGMENTOS', ref: g.ref, detail: '' }); continue; }
    const roomSegs = segments.filter((s) => s.kind === 'ROOM');
    const statuses = roomSegs.map((s) => s.status);
    const status = allCancelled ? 'CANCELLED'
      : statuses.length && statuses.every((s) => s === 'CONFIRMED') ? 'CONFIRMED'
        : statuses.includes('HOLD') ? 'HOLD' : statuses.length ? 'PENDING' : 'CONFIRMED';
    const first = segments[0]; const last = segments[segments.length - 1];
    const nights = first ? diffDays(first.checkin, last.checkout) : 0;
    const segNights = segments.reduce((a, s) => a + diffDays(s.checkin, s.checkout), 0);
    const reg = g.registry;
    if (reg?.commercial?.nights != null && reg.commercial.nights !== nights) {
      anomalies.push({ code: 'NOCHES_NO_COINCIDEN', ref: g.ref, detail: `registro ${reg.commercial.nights} vs segmentos ${nights}` });
    }
    if (segNights !== nights && segments.length) anomalies.push({ code: 'NOCHES_SEGMENTOS_VS_GLOBAL', ref: g.ref, detail: `${segNights} vs ${nights}` });

    // VENTA: una sola vez. Registro comercial manda; si no, suma de cargos de los segmentos.
    const sumCharges = segments.reduce((a, s) => a + (s.charge || 0), 0);
    const totalSale = reg?.commercial?.total_sale ?? sumCharges;
    if (reg?.commercial?.total_sale != null && sumCharges > 0 && sumCharges !== reg.commercial.total_sale) {
      anomalies.push({ code: 'TOTAL_DISCREPANCIA', ref: g.ref, detail: `registro ${reg.commercial.total_sale} vs cargos ${sumCharges}` });
    }
    if (reg?.commercial?.nightly_rate != null && reg.commercial.total_sale != null && reg.commercial.nights != null &&
        reg.commercial.nightly_rate * reg.commercial.nights !== reg.commercial.total_sale) {
      anomalies.push({ code: 'TARIFA_NO_CUADRA', ref: g.ref, detail: '' });
    }

    // PAGOS: cada pago cuenta una sola vez (por id). REPORTED nunca resta.
    const ledger = confirmedPayments.filter((p) => (p.ref ?? null) === g.ref || g.bookings.some((b) => b.bookingId === String(p.bookingId)));
    const confirmedIds = new Set(ledger.map((p) => p.beds24PaymentId).filter(Boolean).map(String));
    const payments = []; const seen = new Set();
    for (const b of g.bookings) for (const p of b.payments) {
      const key = `${b.bookingId}:${p.id}`; if (seen.has(key)) continue; seen.add(key);
      const confirmed = confirmedIds.has(p.id) || confirmedIds.has(key) || paymentPolicy === 'CONFIRMED';
      payments.push({ ...p, bookingId: b.bookingId, status: confirmed ? PAYMENT_CONFIRMED : PAYMENT_REPORTED });
    }
    for (const p of ledger) if (!p.beds24PaymentId) payments.push({ id: String(p.id), bookingId: p.bookingId ?? null, amount: Number(p.amount) || 0, date: p.date ?? null, status: PAYMENT_CONFIRMED });
    const paymentConfirmed = payments.filter((p) => p.status === PAYMENT_CONFIRMED).reduce((a, p) => a + p.amount, 0);
    const paymentReported = payments.filter((p) => p.status === PAYMENT_REPORTED).reduce((a, p) => a + p.amount, 0);
    const plan = reg?.payment_plan ? allocatePlan(reg.payment_plan, paymentConfirmed, asOf) : null;
    if (plan && plan.reduce((a, p) => a + p.amount, 0) !== totalSale) anomalies.push({ code: 'PLAN_NO_CUADRA', ref: g.ref, detail: '' });

    const head = roomSegs[0] ? g.bookings.find((b) => b.bookingId === roomSegs[0].bookingId) : g.bookings[0];
    stays.push({
      stay_id: g.ref,
      guest: reg?.guest ?? head?.guest ?? null,
      source: reg?.source ?? head?.source ?? null,
      guests: Math.max(0, ...g.bookings.map((b) => b.guests)),
      check_in_global: first?.checkin ?? null,
      check_out_global: last?.checkout ?? null,
      total_nights: nights,
      total_sale: totalSale,
      payment_confirmed: paymentConfirmed,
      payment_reported_unconfirmed: paymentReported,
      balance: Math.max(totalSale - paymentConfirmed, 0),
      overpaid: Math.max(paymentConfirmed - totalSale, 0),
      payment_plan: plan,
      payments,
      status,
      segments,
      booking_ids: g.bookings.map((b) => b.bookingId),
      has_registry: Boolean(reg),
    });
  }

  // continuaciones sin enlazar: aviso, jamás fusión
  const singles = stays.filter((s) => !s.has_registry && s.segments.length === 1 && s.status !== 'CANCELLED' && s.guest);
  for (let i = 0; i < singles.length; i += 1) for (let j = i + 1; j < singles.length; j += 1) {
    const a = singles[i]; const b = singles[j];
    if (norm(a.guest) === norm(b.guest) && (a.check_out_global === b.check_in_global || b.check_out_global === a.check_in_global || addDays(a.check_out_global, 1) === b.check_in_global || addDays(b.check_out_global, 1) === a.check_in_global)) {
      anomalies.push({ code: 'POSIBLE_CONTINUACION', ref: a.stay_id, detail: `${b.stay_id}: mismo huésped, fechas contiguas, sin enlace` });
    }
  }
  stays.sort((a, b) => (a.check_in_global ?? '').localeCompare(b.check_in_global ?? '') || a.stay_id.localeCompare(b.stay_id));
  return { stays, blackouts, anomalies };
}
