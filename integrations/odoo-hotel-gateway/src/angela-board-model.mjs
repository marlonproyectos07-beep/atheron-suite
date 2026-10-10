/**
 * ATH-STAGING-RECOVERY-CLAUDE-003 — reglas funcionales del tablero de Ángela (modelo PURO, sin red).
 * Aprobadas por dirección (2026-10-10):
 *   1) CONFIRMADA  2) ventanas HOY/MAÑANA/7 DÍAS/MES  3) SALDO_REAL solo con PAYMENT_CONFIRMED
 *   4) fila KPI arriba, en orden fijo  5) OCUPADAS = unidades FÍSICAS, sin duplicar Casa+habitaciones
 *   6) separación visual: operación comercial / inventario no vendible / financiero.
 * Nada se supone: lo que la fuente no permite decidir se reporta como PENDIENTE y NO entra en el número.
 */

export const ROOMS = Object.freeze(['201', '202', '203', '301', '302']);
export const CASA = 'CASA_COMPLETA';
export const LA_MAGIA = 'HOTEL ATHERON SUITE';

// ---------------- fechas (strings YYYY-MM-DD, sin zona horaria: la fecha local de Bogotá la pone quien llama) --------
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function datesBetween(start, end) { const out = []; for (let d = start; d <= end; d = addDays(d, 1)) out.push(d); return out; }

/**
 * Ventanas aprobadas: HOY = fecha actual; MAÑANA = día siguiente; 7 DÍAS = hoy + los 6 siguientes;
 * MES = mes calendario actual (del día 1 al último).
 */
export function resolveWindow(name, asOf) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '')) throw new Error('asOf debe ser YYYY-MM-DD');
  let start; let end;
  switch (name) {
    case 'HOY': start = end = asOf; break;
    case 'MAÑANA': start = end = addDays(asOf, 1); break;
    case '7 DÍAS': start = asOf; end = addDays(asOf, 6); break;
    case 'MES': {
      const [y, m] = asOf.split('-').map(Number);
      start = `${y}-${String(m).padStart(2, '0')}-01`;
      end = iso(new Date(Date.UTC(y, m, 0))); // día 0 del mes siguiente = último del actual
      break;
    }
    default: throw new Error(`ventana desconocida: ${name}`);
  }
  return { name, start, end, dates: datesBetween(start, end) };
}
export const WINDOW_NAMES = Object.freeze(['HOY', 'MAÑANA', '7 DÍAS', 'MES']);

// ---------------- qué es operación real ------------------------------------------------------------------------
/**
 * QA / TEST / FICTICIO. Mismo criterio que el filtro «Operación real (oculta QA)» ya existente en el repo
 * (coincidencia por subcadena, sin distinguir mayúsculas, sobre el nombre del cliente) más el origen de HOLD «qa»
 * y una marca explícita `is_test` si la fuente la trae.
 */
export function isTestRecord(r) {
  if (r.is_test === true || r.hold_origin === 'qa') return true;
  const g = String(r.guest ?? '');
  return /qa-|ficticio|test/i.test(g) || g === 'Cliente WhatsApp';
}

// Estados reales de x_reservation_status (selección confirmada en el respaldo)
const POST_CONFIRMATION = Object.freeze(['confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed']);

/**
 * Criterio comercial de confirmación POR PROPIEDAD/ACUERDO. NADIE lo ha definido todavía → por defecto PENDIENTE.
 * Presets disponibles para cuando se decida:
 *   'status'     — basta el estado post-confirmación de Odoo.
 *   'deposit_ok' — además exige el anticipo mínimo cubierto (x_hotel_deposit_ok).
 * Un criterio también puede ser una función (reserva) => boolean.
 */
export const CRITERION_PENDING = 'PENDIENTE';
export const CRITERIA_PRESETS = Object.freeze({
  status: () => true,
  deposit_ok: (r) => r.deposit_ok === true,
});

function criterionFor(r, criteria) {
  const c = criteria?.[r.property ?? LA_MAGIA] ?? criteria?.['*'] ?? CRITERION_PENDING;
  if (c === CRITERION_PENDING) return CRITERION_PENDING;
  if (typeof c === 'function') return c;
  if (CRITERIA_PRESETS[c]) return CRITERIA_PRESETS[c];
  throw new Error(`criterio desconocido: ${String(c)}`);
}

/**
 * Clasifica una reserva. Devuelve {state, reason}:
 *   CONFIRMADA | NO_CONFIRMADA | PENDIENTE_CRITERIO | EXCLUIDA
 * Un registro que existe NO es una reserva confirmada por existir.
 */
export function classifyConfirmation(r, criteria) {
  if (isTestRecord(r)) return { state: 'EXCLUIDA', reason: 'QA/TEST/FICTICIO' };
  const s = r.odoo_status_raw ?? null;
  if (s === null) return { state: 'NO_CONFIRMADA', reason: 'estado desconocido' };
  if (s === 'cancelled') return { state: 'EXCLUIDA', reason: 'cancelada' };
  if (s === 'no_show') return { state: 'NO_CONFIRMADA', reason: 'no_show' };
  if (s === 'hold') return { state: 'NO_CONFIRMADA', reason: 'solo HOLD' };
  if (!POST_CONFIRMATION.includes(s)) return { state: 'NO_CONFIRMADA', reason: `estado ${s}` };
  const c = criterionFor(r, criteria);
  if (c === CRITERION_PENDING) return { state: 'PENDIENTE_CRITERIO', reason: 'criterio comercial no definido para la propiedad' };
  return c(r) ? { state: 'CONFIRMADA', reason: 'ok' } : { state: 'NO_CONFIRMADA', reason: 'no cumple criterio comercial' };
}
export const isConfirmed = (r, criteria) => classifyConfirmation(r, criteria).state === 'CONFIRMADA';

// ---------------- saldo real ------------------------------------------------------------------------------------
export const PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED';
export const PAYMENT_REPORTED = 'PAYMENT_REPORTED';

/**
 * SALDO_REAL = TOTAL_RESERVA − Σ pagos con status PAYMENT_CONFIRMED. Todo lo demás (PAYMENT_REPORTED incluido) NO reduce.
 * Origen del estado CONFIRMED: un pago de account.payment con state='paid' (misma regla que HOTEL_PAYMENT_DOMAIN del lector,
 * que "nunca cuenta un pago cancelado o en borrador como cobrado"); ver attachConfirmedPayments en odoo-reporting-reader.
 * PAYMENT_REPORTED (el cliente dice que pagó) no tiene fuente en Odoo en el repo: solo entra si quien llama lo aporta.
 *   - payments con `status` explícito           => se calcula (solo CONFIRMED resta).
 *   - payments_source='account.payment'         => lista completa de pagos 'paid': se calcula aunque esté vacía.
 *   - sin pagos y collected === 0               => nada que clasificar: saldo = total.
 *   - pagos sin status, o solo x_hotel_paid > 0 => PENDIENTE_CLASIFICACION, saldo null (no se adivina qué es confirmado).
 */
export function realBalance(r) {
  const total = r.gross_sale;
  if (total == null) return { balance: null, status: 'SIN_TOTAL' };
  const pays = Array.isArray(r.payments) ? r.payments : [];
  const classified = pays.length > 0 && pays.every((p) => p && p.status !== undefined);
  if (classified || r.payments_source === 'account.payment') {
    if (pays.some((p) => p && p.status === undefined)) return { balance: null, status: 'PENDIENTE_CLASIFICACION' };
    const sign = (p) => (p.direction === 'outbound' ? -1 : 1); // un reembolso confirmado vuelve a subir el saldo
    const confirmed = pays.filter((p) => p.status === PAYMENT_CONFIRMED).reduce((a, p) => a + sign(p) * (Number(p.amount) || 0), 0);
    const reported = pays.filter((p) => p.status === PAYMENT_REPORTED).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    return { balance: Math.max(total - confirmed, 0), status: 'OK', reported_unconfirmed: reported };
  }
  if (pays.length === 0 && (r.collected ?? 0) === 0) return { balance: total, status: 'OK' };
  return { balance: null, status: 'PENDIENTE_CLASIFICACION' };
}

// ---------------- unidades físicas ------------------------------------------------------------------------------
/** Habitaciones físicas que una reserva ocupa. CASA COMPLETA de La Magia = las 5; otras propiedades quedan fuera. */
export function physicalRooms(r) {
  const u = String(r.unit ?? '').trim();
  if (ROOMS.includes(u)) return [u];
  if (/^CASA[ _]COMPLETA$/i.test(u) && (r.property == null || r.property === LA_MAGIA)) return [...ROOMS];
  return []; // otra propiedad o unidad desconocida: fuera de este tablero
}

// ---------------- estado de cada habitación en una fecha --------------------------------------------------------
/**
 * Qué estados cuentan como "ocupación efectiva" según la fecha evaluada respecto a `asOf` (hoy):
 *   hoy      → FÍSICA: solo checked_in (el huésped está dentro).
 *   futuro   → PROYECTADA: reservas confirmadas (según criterio), pre_checkin o checked_in que cubren la noche.
 *   pasado   → HISTÓRICA: checked_in, checked_out o closed.
 * Noche = [checkin, checkout): el día de salida no cuenta (mismo criterio que inventory-model).
 */
function occupyingStatuses(date, asOf) {
  if (date === asOf) return ['checked_in'];
  if (date > asOf) return ['confirmed', 'pre_checkin', 'checked_in'];
  return ['checked_in', 'checked_out', 'closed'];
}
const coversNight = (r, date) => Boolean(r.checkin && r.checkout) && date >= r.checkin && date < r.checkout;

function blockCoversNight(b, date) { return Boolean(b.start && b.end) && date >= b.start.slice(0, 10) && date < b.end.slice(0, 10); }

/**
 * Política para bloques `external` (los que llegan de Booking/Airbnb por iCal). Pueden ser huéspedes reales o bloqueos
 * manuales hechos en la OTA y el tipo de bloque NO lo distingue. Hasta que dirección decida:
 *   'SEPARATE' (defecto) → categoría propia OTA_EXTERNO: no vendible, no cuenta como OCUPADA ni como BLOQUEADA.
 */
export const EXTERNAL_POLICIES = Object.freeze(['SEPARATE', 'AS_OCCUPIED', 'AS_BLOCKED']);

/**
 * Partición de las 5 habitaciones en una fecha. Cada habitación cae en EXACTAMENTE una categoría, por prioridad:
 * OCUPADA > HOLD > BLOQUEADA > OTA_EXTERNO > DISPONIBLE. Así DISPONIBLES+OCUPADAS+HOLD+BLOQUEADAS(+OTA_EXTERNO) = 5
 * y una Casa Completa nunca suma ocupación sobre las habitaciones que ya contiene.
 */
export function roomsOnDate(date, { reservations, blocks = [], asOf, criteria, externalPolicy = 'SEPARATE', now = null }) {
  const occupying = occupyingStatuses(date, asOf);
  const claims = new Map(ROOMS.map((room) => [room, []])); // room -> reservas que la reclaman como ocupada
  const held = new Set(); const blocked = new Set(); const external = new Set();

  for (const r of reservations) {
    if (isTestRecord(r)) continue;
    const rooms = physicalRooms(r);
    if (!rooms.length || !coversNight(r, date)) continue;
    const s = r.odoo_status_raw;
    if (s === 'hold') {
      const vigente = r.hold_expired !== true && !(now && r.hold_expires && String(r.hold_expires).replace(' ', 'T') <= now);
      if (vigente) rooms.forEach((x) => held.add(x));
      continue;
    }
    if (!occupying.includes(s)) continue;
    // una reserva "confirmed" solo ocupa si cumple el criterio comercial; checked_in ya ocurrió y siempre ocupa
    if (s === 'confirmed' || s === 'pre_checkin') { if (!isConfirmed(r, criteria)) continue; }
    rooms.forEach((x) => claims.get(x).push(r.external_reference ?? r.odoo_id ?? '?'));
  }

  for (const b of blocks) {
    if (!blockCoversNight(b, date)) continue;
    const rooms = b.unit === CASA || /^CASA[ _]COMPLETA$/i.test(String(b.unit ?? '')) ? [...ROOMS] : ROOMS.includes(String(b.unit)) ? [String(b.unit)] : [];
    if (b.is_test === true) continue;
    // 'derived' es la sombra de otra reserva/bloqueo de Casa: no se cuenta aparte (evita el doble conteo)
    if (b.kind === 'manual') rooms.forEach((x) => blocked.add(x));
    else if (b.kind === 'external') {
      const target = externalPolicy === 'AS_BLOCKED' ? blocked : externalPolicy === 'AS_OCCUPIED' ? null : external;
      if (target) rooms.forEach((x) => target.add(x)); else rooms.forEach((x) => claims.get(x).push(`ota:${b.id ?? '?'}`));
    }
  }

  const out = { OCUPADA: [], HOLD: [], BLOQUEADA: [], OTA_EXTERNO: [], DISPONIBLE: [] };
  const conflicts = [];
  for (const room of ROOMS) {
    if (claims.get(room).length > 1) conflicts.push({ room, date, claims: claims.get(room) });
    if (claims.get(room).length) out.OCUPADA.push(room);
    else if (held.has(room)) out.HOLD.push(room);
    else if (blocked.has(room)) out.BLOQUEADA.push(room);
    else if (external.has(room)) out.OTA_EXTERNO.push(room);
    else out.DISPONIBLE.push(room);
  }
  return { date, rooms: out, conflicts, mode: date === asOf ? 'FISICA' : date > asOf ? 'PROYECTADA' : 'HISTORICA' };
}

// ---------------- la fila KPI y su agrupación visual ---------------------------------------------------------
/** Orden fijo aprobado de la fila KPI y su grupo visual. Es la ÚNICA fuente: R7 y las pruebas la leen de aquí. */
export const KPI_ROW = Object.freeze([
  { key: 'DISPONIBLES', label: 'DISPONIBLES', group: 'OPERACION_COMERCIAL' },
  { key: 'OCUPADAS', label: 'OCUPADAS', group: 'OPERACION_COMERCIAL' },
  { key: 'HOLD', label: 'HOLD', group: 'INVENTARIO_NO_VENDIBLE' },
  { key: 'BLOQUEADAS', label: 'BLOQUEADAS', group: 'INVENTARIO_NO_VENDIBLE' },
  { key: 'LLEGADAS', label: 'LLEGADAS HOY', group: 'OPERACION_COMERCIAL' },
  { key: 'SALIDAS', label: 'SALIDAS HOY', group: 'OPERACION_COMERCIAL' },
  { key: 'CONFIRMADAS', label: 'RESERVAS CONFIRMADAS', group: 'OPERACION_COMERCIAL' },
  { key: 'SALDO_PENDIENTE', label: 'SALDO PENDIENTE', group: 'FINANCIERO' },
]);
export const KPI_GROUPS = Object.freeze({
  OPERACION_COMERCIAL: ['DISPONIBLES', 'OCUPADAS', 'LLEGADAS', 'SALIDAS', 'CONFIRMADAS'],
  INVENTARIO_NO_VENDIBLE: ['HOLD', 'BLOQUEADAS'],
  FINANCIERO: ['SALDO_PENDIENTE'],
});

const overlaps = (r, w) => Boolean(r.checkin && r.checkout) && r.checkin <= w.end && r.checkout >= w.start;

/**
 * Tablero para una ventana. Habitaciones y noches-habitación se miden sobre las 5 unidades físicas;
 * llegadas/salidas/confirmadas/saldo son conteos de reservas de la ventana.
 * Los rótulos «LLEGADAS HOY»/«SALIDAS HOY» pasan a «LLEGADAS»/«SALIDAS» cuando la ventana no es HOY.
 */
export function buildBoard(reservations, { blocks = [], asOf, window = 'HOY', criteria = {}, externalPolicy = 'SEPARATE', now = null } = {}) {
  if (!EXTERNAL_POLICIES.includes(externalPolicy)) throw new Error(`externalPolicy inválida: ${externalPolicy}`);
  const w = resolveWindow(window, asOf);
  const real = reservations.filter((r) => !isTestRecord(r));
  const days = w.dates.map((d) => roomsOnDate(d, { reservations, blocks, asOf, criteria, externalPolicy, now }));
  const sum = (k) => days.reduce((a, d) => a + d.rooms[k].length, 0);
  const unit = w.dates.length === 1 ? 'habitaciones' : 'noches-habitación';

  const inWindow = real.filter((r) => overlaps(r, w));
  const cls = new Map(inWindow.map((r) => [r, classifyConfirmation(r, criteria)]));
  const confirmed = inWindow.filter((r) => cls.get(r).state === 'CONFIRMADA');
  const pendingCriterion = inWindow.filter((r) => cls.get(r).state === 'PENDIENTE_CRITERIO');

  const ARR = ['confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed'];
  const arrivals = confirmed.filter((r) => ARR.includes(r.odoo_status_raw) && r.checkin >= w.start && r.checkin <= w.end);
  const DEP = ['checked_in', 'checked_out', 'closed'];
  const departures = confirmed.filter((r) => DEP.includes(r.odoo_status_raw) && r.checkout >= w.start && r.checkout <= w.end);

  // Saldo: solo reservas CONFIRMADAS de la ventana; las que no se pueden clasificar NO se suman ni se inventan.
  let saldo = 0; let sinClasificar = 0; let reportadoSinConfirmar = 0;
  for (const r of confirmed) {
    const b = realBalance(r);
    if (b.status === 'OK') { saldo += b.balance; reportadoSinConfirmar += b.reported_unconfirmed ?? 0; } else sinClasificar += 1;
  }

  const kpi = {
    DISPONIBLES: { value: sum('DISPONIBLE'), unit },
    OCUPADAS: { value: sum('OCUPADA'), unit, mode: [...new Set(days.map((d) => d.mode))] },
    HOLD: { value: sum('HOLD'), unit },
    BLOQUEADAS: { value: sum('BLOQUEADA'), unit },
    LLEGADAS: { value: arrivals.length, unit: 'reservas' },
    SALIDAS: { value: departures.length, unit: 'reservas' },
    CONFIRMADAS: { value: confirmed.length, unit: 'reservas' },
    SALDO_PENDIENTE: { value: saldo, unit: 'COP', sin_clasificar: sinClasificar, reportado_sin_confirmar: reportadoSinConfirmar },
  };
  const row = KPI_ROW.map((k) => ({ ...k, label: w.name !== 'HOY' && (k.key === 'LLEGADAS' || k.key === 'SALIDAS') ? k.key : k.label, ...kpi[k.key] }));
  const groups = Object.fromEntries(Object.entries(KPI_GROUPS).map(([g, keys]) => [g, row.filter((k) => keys.includes(k.key))]));

  return {
    window: w, asOf, kpi_row: row, groups,
    // partes que NO entran en ningún número y que Ángela/dirección deben ver
    pendientes: {
      ota_externo: { value: sum('OTA_EXTERNO'), unit, politica: externalPolicy },
      confirmadas_sin_criterio_comercial: pendingCriterion.length,
      saldo_sin_clasificar: sinClasificar,
    },
    conflictos_de_ocupacion: days.flatMap((d) => d.conflicts),
    total_capacidad: ROOMS.length * w.dates.length,
    partition_ok: days.every((d) => Object.values(d.rooms).flat().length === ROOMS.length),
  };
}

/** Texto plano de la fila KPI (misma salida para consola y para pruebas). */
export function renderKpiText(board) {
  const lines = [`VENTANA ${board.window.name} (${board.window.start}${board.window.start === board.window.end ? '' : ' → ' + board.window.end})`];
  for (const [g, items] of Object.entries(board.groups)) {
    lines.push(`[${g}]`);
    for (const k of items) lines.push(`  ${k.label}: ${k.value} ${k.unit}${k.sin_clasificar ? ` (+${k.sin_clasificar} sin clasificar)` : ''}`);
  }
  return lines.join('\n');
}
