import { KPI_ROW, KPI_GROUPS, resolveWindow, WINDOW_NAMES } from '../angela-board-model.mjs';
import { consolidateStays } from './master-stay.mjs';
import { addDays, datesBetween, coversNight } from './dates.mjs';
import { PHYSICAL_ROOMS, CASA_UNIT } from './config.mjs';

/**
 * CENTRO DE OPERACIONES ATHERON — modelo puro (sin red, sin escritura).
 * Entrada: reservas Beds24 normalizadas + registro de estadías maestras + libro de pagos confirmados (Odoo).
 * Reglas fijas: OTA confirmada = ocupación real; BLACKOUT = bloqueada, no ocupada; Casa Completa = sombra sobre las 5 físicas
 * (ocupación contada una vez, por habitación); un cambio de habitación NO es llegada ni salida; saldo = venta − pagos CONFIRMADOS.
 */
export const CELL_STATES = Object.freeze(['FREE', 'OCCUPIED', 'ARRIVAL', 'DEPARTURE', 'HOLD', 'BLACKOUT', 'OVERBOOKING', 'ROOM_MOVE']);
const PRIORITY = ['OVERBOOKING', 'ROOM_MOVE', 'ARRIVAL', 'DEPARTURE', 'OCCUPIED', 'HOLD', 'BLACKOUT', 'FREE'];

function holdIsLive(seg, asOf, now) {
  if (!seg.holdExpires) return true; // HOLD sin vencimiento escrito: sigue bloqueando y se avisa en anomalías
  const [d, t] = seg.holdExpires.split(' ');
  if (d !== asOf) return d > asOf;
  return !(now && t && `${d}T${t}` <= now);
}

/** Todas las reclamaciones sobre habitaciones físicas: {room, stay, seg, kind}. Casa se expande a las 5, marcada derived. */
function buildClaims(stays, blackouts, asOf, now) {
  const claims = [];
  for (const stay of stays) {
    if (stay.status === 'CANCELLED') continue;
    for (const seg of stay.segments) {
      if (seg.kind !== 'ROOM') continue;
      const rooms = seg.unit === CASA_UNIT ? PHYSICAL_ROOMS : PHYSICAL_ROOMS.includes(seg.unit) ? [seg.unit] : [];
      const kind = seg.status === 'CONFIRMED' ? 'OCCUPY' : seg.status === 'HOLD' ? (holdIsLive(seg, asOf, now) ? 'HOLD' : 'EXPIRED') : 'HOLD'; // PENDING bloquea como HOLD
      if (kind === 'EXPIRED') continue;
      for (const room of rooms) claims.push({ room, stay, seg, kind, derived: seg.unit === CASA_UNIT });
    }
  }
  for (const b of blackouts) {
    const rooms = b.unit === CASA_UNIT ? PHYSICAL_ROOMS : PHYSICAL_ROOMS.includes(b.unit) ? [b.unit] : [];
    for (const room of rooms) claims.push({ room, stay: null, seg: b, kind: 'BLACKOUT', derived: b.unit === CASA_UNIT });
  }
  return claims;
}

export function cellFor(room, date, claims) {
  const mine = claims.filter((c) => c.room === room);
  const states = new Set(); const refs = []; let overbook = null;
  const nightClaims = mine.filter((c) => coversNight(c.seg.checkin, c.seg.checkout, date));
  const occupy = nightClaims.filter((c) => c.kind === 'OCCUPY');
  const holds = nightClaims.filter((c) => c.kind === 'HOLD');
  const blacks = nightClaims.filter((c) => c.kind === 'BLACKOUT');
  if (occupy.length) states.add('OCCUPIED');
  if (!occupy.length && holds.length) states.add('HOLD');
  if (!occupy.length && !holds.length && blacks.length) states.add('BLACKOUT');
  if (occupy.length + blacks.length > 1 && occupy.length >= 1) {
    states.add('OVERBOOKING'); overbook = { room, date, claims: [...occupy, ...blacks].map((c) => c.stay?.stay_id ?? `BLOQUEO:${c.seg.bookingId}`) };
  }
  for (const c of mine.filter((x) => x.kind === 'OCCUPY' || x.kind === 'HOLD')) {
    if (c.seg.checkin === date) states.add(c.seg.first ? 'ARRIVAL' : 'ROOM_MOVE');
    if (c.seg.checkout === date) states.add(c.seg.last ? 'DEPARTURE' : 'ROOM_MOVE');
  }
  nightClaims.concat(mine.filter((c) => c.seg.checkin === date || c.seg.checkout === date)).forEach((c) => c.stay && refs.push(c.stay.stay_id));
  if (!states.size) states.add('FREE');
  const primary = PRIORITY.find((p) => states.has(p));
  // partición de inventario por noche (cada habitación cae en UNA categoría)
  const bucket = occupy.length ? 'OCUPADA' : holds.length ? 'HOLD' : blacks.length ? 'BLOQUEADA' : 'DISPONIBLE';
  return { room, date, states: PRIORITY.filter((p) => states.has(p)), primary, stays: [...new Set(refs)], bucket, overbooking: overbook };
}

export function describeStay(stay, asOf) {
  const segs = stay.segments;
  const label = (s) => (s.kind === 'EXTERNAL' ? 'EXTERNO' : s.unit === CASA_UNIT ? 'CASA COMPLETA' : s.unit);
  const cur = segs.find((s) => coversNight(s.checkin, s.checkout, asOf)) ?? null;
  const next = cur ? segs.find((s) => s.seq === cur.seq + 1) ?? null : segs.find((s) => s.checkin > asOf) ?? null;
  const unpaid = (stay.payment_plan ?? []).find((p) => p.outstanding > 0);
  return {
    ...stay,
    current_room: cur ? label(cur) : null,
    next_room: next ? label(next) : null,
    next_move_date: next && (cur || !next.first) ? next.checkin : null,
    next_payment_date: stay.balance > 0 ? (unpaid ? unpaid.due_date ?? 'SIN_FECHA' : null) : null,
    next_payment_amount: stay.balance > 0 ? (unpaid ? unpaid.outstanding : stay.balance) : 0,
    payment_overdue: (stay.payment_plan ?? []).some((p) => p.status === 'OVERDUE'),
    room_segments: segs.map((s) => ({ room_location: label(s), segment_checkin: s.checkin, segment_checkout: s.checkout, nights: (Date.parse(s.checkout) - Date.parse(s.checkin)) / 86400000, status: s.status })),
  };
}

const overlaps = (checkin, checkout, w) => checkin <= w.end && checkout >= w.start;

function kpiForWindow(windowName, ctx) {
  const { asOf, claims, stays } = ctx;
  const w = resolveWindow(windowName, asOf);
  const cells = w.dates.flatMap((d) => PHYSICAL_ROOMS.map((r) => cellFor(r, d, claims)));
  const sum = (k) => cells.filter((c) => c.bucket === k).length;
  const unit = w.dates.length === 1 ? 'habitaciones' : 'noches-habitación';
  const live = stays.filter((s) => s.status !== 'CANCELLED');
  const confirmed = live.filter((s) => s.status === 'CONFIRMED' && overlaps(s.check_in_global, s.check_out_global, w));
  const arrivals = confirmed.filter((s) => s.check_in_global >= w.start && s.check_in_global <= w.end);
  const departures = confirmed.filter((s) => s.check_out_global >= w.start && s.check_out_global <= w.end);
  const balance = confirmed.reduce((a, s) => a + s.balance, 0);
  const reported = confirmed.reduce((a, s) => a + s.payment_reported_unconfirmed, 0);
  const kpi = {
    DISPONIBLES: { value: sum('DISPONIBLE'), unit }, OCUPADAS: { value: sum('OCUPADA'), unit },
    HOLD: { value: sum('HOLD'), unit }, BLOQUEADAS: { value: sum('BLOQUEADA'), unit },
    LLEGADAS: { value: arrivals.length, unit: 'estadías' }, SALIDAS: { value: departures.length, unit: 'estadías' },
    CONFIRMADAS: { value: confirmed.length, unit: 'estadías' },
    SALDO_PENDIENTE: { value: balance, unit: 'COP', reportado_sin_confirmar: reported },
  };
  const row = KPI_ROW.map((k) => ({ ...k, label: w.name !== 'HOY' && (k.key === 'LLEGADAS' || k.key === 'SALIDAS') ? k.key : k.label, ...kpi[k.key] }));
  return {
    window: w, kpi_row: row,
    groups: Object.fromEntries(Object.entries(KPI_GROUPS).map(([g, keys]) => [g, row.filter((k) => keys.includes(k.key))])),
    total_capacidad: PHYSICAL_ROOMS.length * w.dates.length,
    partition_ok: sum('DISPONIBLE') + sum('OCUPADA') + sum('HOLD') + sum('BLOQUEADA') === PHYSICAL_ROOMS.length * w.dates.length,
  };
}

export function movesOn(date, stays) {
  const out = [];
  for (const st of stays) {
    if (st.status === 'CANCELLED') continue;
    for (let i = 0; i < st.segments.length - 1; i += 1) {
      const a = st.segments[i]; const b = st.segments[i + 1];
      if (a.checkout === date && b.checkin >= date) {
        const lab = (s) => (s.kind === 'EXTERNAL' ? 'EXTERNO' : s.unit);
        out.push({ stay_id: st.stay_id, guest: st.guest, from: lab(a), to: lab(b), departs: a.checkout, arrives: b.checkin });
      }
    }
  }
  return out;
}

export function buildOps({ bookings, registry = [], confirmedPayments = [], paymentPolicy = 'REPORTED', asOf, now = null, gridDays = 14 }) {
  const { stays: raw, blackouts, anomalies } = consolidateStays({ bookings, registry, confirmedPayments, paymentPolicy, asOf });
  const stays = raw.map((s) => describeStay(s, asOf));
  const claims = buildClaims(stays, blackouts, asOf, now);
  const gridDates = datesBetween(asOf, addDays(asOf, gridDays - 1));
  const grid = PHYSICAL_ROOMS.map((room) => ({ room, cells: gridDates.map((d) => cellFor(room, d, claims)) }));
  const ctx = { asOf, claims, stays };
  const windows = Object.fromEntries(WINDOW_NAMES.map((n) => [n, kpiForWindow(n, ctx)]));

  const todayCells = PHYSICAL_ROOMS.map((r) => cellFor(r, asOf, claims));
  const tomorrow = addDays(asOf, 1);
  const live = stays.filter((s) => s.status === 'CONFIRMED');
  const overbookings = [];
  for (const d of datesBetween(asOf, addDays(asOf, 60))) for (const r of PHYSICAL_ROOMS) { const o = cellFor(r, d, claims).overbooking; if (o) overbookings.push(o); }
  const holdAnoms = bookings.filter((b) => b.status === 'HOLD' && !b.holdExpires).map((b) => ({ code: 'HOLD_SIN_VENCIMIENTO', ref: b.bookingId, detail: '' }));

  const answers = {
    libres_hoy: todayCells.filter((c) => c.bucket === 'DISPONIBLE').map((c) => c.room),
    llegadas_hoy: live.filter((s) => s.check_in_global === asOf).map((s) => ({ stay_id: s.stay_id, guest: s.guest, room: s.segments[0].kind === 'ROOM' ? s.room_segments[0].room_location : 'EXTERNO' })),
    salidas_hoy: live.filter((s) => s.check_out_global === asOf).map((s) => ({ stay_id: s.stay_id, guest: s.guest })),
    alojados: live.filter((s) => s.current_room && s.current_room !== 'EXTERNO').map((s) => ({ stay_id: s.stay_id, guest: s.guest, room: s.current_room })),
    en_externo: live.filter((s) => s.current_room === 'EXTERNO').map((s) => ({ stay_id: s.stay_id, guest: s.guest })),
    cambios_hoy: movesOn(asOf, live),
    cambios_manana: movesOn(tomorrow, live),
    deben_pagar: live.filter((s) => s.balance > 0).map((s) => ({ stay_id: s.stay_id, guest: s.guest, balance: s.balance, next_payment_date: s.next_payment_date, next_payment_amount: s.next_payment_amount, overdue: s.payment_overdue, reportado_sin_confirmar: s.payment_reported_unconfirmed }))
      .sort((a, b) => String(a.next_payment_date).localeCompare(String(b.next_payment_date))),
    sobreventas: overbookings,
    bloqueos: blackouts.filter((b) => b.checkout > asOf).map((b) => ({ unit: b.unit, from: b.checkin, to: b.checkout, notes: b.notes })),
    holds: stays.flatMap((s) => s.segments.filter((g) => g.status === 'HOLD').map((g) => ({ stay_id: s.stay_id, guest: s.guest, unit: g.unit, expires: g.holdExpires }))),
  };
  return { asOf, windows, grid, stays, blackouts, answers, anomalies: [...anomalies, ...holdAnoms], gridDates };
}
