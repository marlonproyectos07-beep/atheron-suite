/**
 * ATH-ODOO-HOTEL-012 V2 -- ATHERON HOTEL CONTROL CENTER (read-model).
 *
 * Evoluciona (no reemplaza) los modelos ya aprobados:
 *   - master-board-model.mjs       -> catalogo de unidades y relacion CASA COMPLETA <-> habitaciones
 *   - operational-read-model.mjs   -> paymentStatus()
 *   - odoo-reporting-reader.mjs    -> filas reales de sale.order ya mapeadas
 *   - housekeeping-model.mjs       -> etapas de aseo y prioridad por proxima llegada
 *
 * Es PURO y de SOLO LECTURA: recibe datos ya leidos (reservas, pagos,
 * tareas de aseo) y devuelve el contrato que la vista/informe consume.
 * Nunca escribe en Odoo, nunca calcula tarifas, nunca inventa un dato:
 * donde la fuente no existe devuelve `null` y lo declara en `data_gaps`.
 *
 * Reglas semanticas (todas con prueba en test/control-center-model.test.mjs):
 *   - La noche `d` de una reserva es checkin <= d < checkout. El dia de
 *     check-out NO es noche vendida (es "sale hoy").
 *   - bloqueado != ocupado, HOLD != vendido, reserva != pago.
 *   - VENDIDO = confirmed | pre_checkin | checked_in | checked_out | closed.
 *     HOLD / opcion / consulta son pipeline, nunca ingreso ni cartera.
 *   - Las unidades vendibles son las FISICAS. CASA COMPLETA de Atheron Suite
 *     es COMPUESTA (mismo inventario que sus 5 habitaciones): no se suma al
 *     denominador; cuando se vende, ocupa sus 5 habitaciones.
 */

import { BOARD_UNITS, PROPERTIES, CASA_COMPLETA_ATHERON_SUITE } from './master-board-model.mjs';
import { paymentStatus } from './operational-read-model.mjs';
import { computeHousekeepingPriority } from './housekeeping-model.mjs';

// ---------------------------------------------------------------------------
// Constantes de dominio
// ---------------------------------------------------------------------------

export const SOLD_STATUSES = Object.freeze(['confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed']);
export const RESERVED_STATUSES = Object.freeze(['confirmed', 'pre_checkin']);
export const PIPELINE_STATUSES = Object.freeze(['hold', 'opcion', 'draft']);
export const DEAD_STATUSES = Object.freeze(['cancelled', 'no_show']);
export const KNOWN_STATUSES = Object.freeze([...SOLD_STATUSES, ...PIPELINE_STATUSES, ...DEAD_STATUSES]);

export const INVENTORY_STATES = Object.freeze([
  'DISPONIBLE',
  'RESERVADO',
  'OCUPADO',
  'HOLD',
  'BLOQUEADO',
  'ASEO_PENDIENTE',
  'LISTO',
  'FUERA_DE_SERVICIO',
]);

/**
 * capacidad_comercial vista EN VIVO contra Odoo STAGING (HOTEL-009 Gate
 * 009-A, AI/ATH-ODOO-HOTEL-009_HANDOFF.md). Casa Algarra y Casa Neusa NO
 * tienen capacidad confirmada: quedan en `null` (DATA_GAP), no se suponen.
 */
export const UNIT_CAPACITY = Object.freeze({
  201: 2,
  202: 4,
  203: 4,
  301: 7,
  302: 3,
  [CASA_COMPLETA_ATHERON_SUITE]: 22,
});

/** Housekeeping solo esta configurado en Atheron Suite (DIAGNOSTICO s6, decision CEO 4). */
export const HOUSEKEEPING_PROPERTIES = Object.freeze([PROPERTIES.ATHERON_SUITE]);

export const HORIZON_PRESETS = Object.freeze(['HOY', 'MANANA', '7_DIAS', 'MES_ACTUAL', 'RANGO']);

// ---------------------------------------------------------------------------
// Fechas (UTC, ISO yyyy-mm-dd)
// ---------------------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v) => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkin, checkout) {
  return Math.round((new Date(`${checkout}T00:00:00Z`) - new Date(`${checkin}T00:00:00Z`)) / 86400000);
}

export function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = domingo ... 6 = sabado. */
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const WEEKDAY_LABELS = Object.freeze(['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']);

/** [from, to] inclusivo, en dias. Lanza error ante un rango invalido (nunca adivina). */
export function resolveHorizon(referenceDate, preset = 'HOY', range = null) {
  if (!isIsoDate(referenceDate)) throw new Error(`INVALID_REFERENCE_DATE: ${referenceDate}`);
  let from;
  let to;
  switch (preset) {
    case 'HOY':
      from = referenceDate;
      to = referenceDate;
      break;
    case 'MANANA':
      from = addDays(referenceDate, 1);
      to = from;
      break;
    case '7_DIAS':
      from = referenceDate;
      to = addDays(referenceDate, 6);
      break;
    case 'MES_ACTUAL': {
      from = `${referenceDate.slice(0, 7)}-01`;
      const next = new Date(`${from}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      to = addDays(next.toISOString().slice(0, 10), -1);
      break;
    }
    case 'RANGO':
      if (!range || !isIsoDate(range.from) || !isIsoDate(range.to)) throw new Error('INVALID_RANGE: from/to ISO requeridos');
      if (range.from > range.to) throw new Error('INVALID_RANGE: from > to');
      from = range.from;
      to = range.to;
      break;
    default:
      throw new Error(`UNKNOWN_HORIZON_PRESET: ${preset}`);
  }
  const days = nightsBetween(from, to) + 1;
  if (days > 366) throw new Error('INVALID_RANGE: maximo 366 dias');
  return { preset, from, to, days };
}

// ---------------------------------------------------------------------------
// Catalogo de unidades
// ---------------------------------------------------------------------------

export function buildUnitCatalog(capacity = UNIT_CAPACITY) {
  return BOARD_UNITS.map((u) => ({
    key: u.unit,
    label: u.label,
    property: u.property,
    parent: u.parent ?? null,
    children: u.children ?? [],
    kind: (u.children ?? []).length > 0 ? 'COMPUESTA' : 'FISICA',
    capacity: capacity[u.unit] ?? null,
  }));
}

const strip = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/**
 * Traduce el nombre de unidad/propiedad que trae Odoo (many2one) a la clave
 * del catalogo. null si no se puede resolver con certeza: nunca se adivina.
 * "CASA COMPLETA" existe una vez por propiedad, por eso se resuelve con la propiedad.
 */
export function resolveUnitKey(rawUnit, rawProperty, catalog) {
  if (rawUnit === null || rawUnit === undefined || String(rawUnit).trim() === '') return null;
  const raw = String(rawUnit).trim();
  if (catalog.some((u) => u.key === raw) && raw !== 'CASA_COMPLETA') return raw;
  const s = strip(raw);
  const p = rawProperty ? strip(rawProperty) : '';
  if (/CASA[ _]?COMPLETA/.test(s)) {
    const hay = `${s} ${p}`;
    if (hay.includes('ALGARRA')) return 'CASA_COMPLETA_ALGARRA';
    if (hay.includes('NEUSA')) return 'CASA_COMPLETA_NEUSA';
    if (hay.includes('ATHERON') || p === '') return CASA_COMPLETA_ATHERON_SUITE;
    return null;
  }
  const m = s.match(/(\d{3})(?!.*\d{3})/);
  if (m && catalog.some((u) => u.key === m[1])) return m[1];
  return null;
}

// ---------------------------------------------------------------------------
// Normalizacion de reservas (entrada: forma de mapSaleOrderToReservation)
// ---------------------------------------------------------------------------

function validDates(r) {
  return isIsoDate(r.checkin) && isIsoDate(r.checkout) && r.checkout > r.checkin;
}

export function normalizeReservation(raw, catalog) {
  const status = raw.real_status ?? raw.odoo_status_raw ?? null;
  const unit = resolveUnitKey(raw.unit, raw.property, catalog);
  const unitDef = unit ? catalog.find((u) => u.key === unit) : null;
  const total = raw.gross_sale ?? null;
  const paid = raw.collected ?? 0;
  const balanceCalc = total == null ? null : Math.max(total - paid, 0);
  return {
    ref: raw.external_reference ?? null,
    guest: raw.guest ?? null,
    phone: raw.phone ?? null,
    channel: raw.channel ?? null,
    origin: raw.hold_origin ?? null,
    unit,
    unit_raw: raw.unit ?? null,
    property: unitDef?.property ?? raw.property ?? null,
    status,
    status_known: status !== null && KNOWN_STATUSES.includes(status),
    created: raw.reservation_date ?? null,
    checkin: raw.checkin ?? null,
    checkout: raw.checkout ?? null,
    guests: raw.guests ?? null,
    total,
    paid,
    balance: raw.balance ?? balanceCalc,
    balance_calc: balanceCalc,
    hold_expires: raw.hold_expires ?? null,
    hold_expired: raw.hold_expired === true,
  };
}

const isSold = (r) => SOLD_STATUSES.includes(r.status);
const covers = (r, d) => validDates(r) && r.checkin <= d && d < r.checkout;

/** Noches de una reserva dentro de [from, to] (inclusivo en dias-noche). */
export function nightsInRange(r, from, to) {
  if (!validDates(r)) return 0;
  const start = r.checkin > from ? r.checkin : from;
  const endExclusive = r.checkout < addDays(to, 1) ? r.checkout : addDays(to, 1);
  return Math.max(nightsBetween(start, endExclusive), 0);
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

const HK_ALIASES = Object.freeze({
  LISTA: 'LISTA',
  LISTA_PARA_HUESPED: 'LISTA',
  POR_LIMPIAR: 'POR_LIMPIAR',
  EN_LIMPIEZA: 'EN_LIMPIEZA',
  EN_ASEO: 'EN_LIMPIEZA',
  LISTA_PARA_REVISAR: 'LISTA_PARA_REVISAR',
  INCIDENCIA: 'INCIDENCIA',
});

export function normalizeHousekeepingStage(raw) {
  if (!raw) return null;
  return HK_ALIASES[strip(raw).replace(/\s+/g, '_')] ?? null;
}

export const HK_FLOW_LABEL = Object.freeze({
  POR_LIMPIAR: 'ASEO PENDIENTE',
  EN_LIMPIEZA: 'EN LIMPIEZA',
  LISTA_PARA_REVISAR: 'POR REVISAR',
  LISTA: 'LISTA',
  INCIDENCIA: 'INCIDENCIA',
});

function indexHousekeeping(tasks, catalog) {
  const byUnit = new Map();
  for (const t of tasks ?? []) {
    const key = resolveUnitKey(t.unit, t.property ?? null, catalog);
    const stage = normalizeHousekeepingStage(t.stage);
    if (!key || !stage) continue;
    byUnit.set(key, { stage, assignee: t.assignee ?? null, updated_at: t.updated_at ?? null, task_ref: t.task_ref ?? null });
  }
  return byUnit;
}

// ---------------------------------------------------------------------------
// Estado de inventario por unidad para una fecha
// ---------------------------------------------------------------------------

const RANK = Object.freeze({ OCUPADO: 4, RESERVADO: 3, HOLD: 2, BLOQUEADO: 1 });

function claimOf(r, date, referenceDate) {
  if (!r.unit) return null;
  if (r.status === 'checked_in') {
    if (isIsoDate(r.checkin) && r.checkin <= date && (date === referenceDate || covers(r, date))) {
      // checked_in con checkout vencido sigue ocupando HOY (alerta aparte)
      if (date === referenceDate || date < (r.checkout ?? '9999-12-31')) return 'OCUPADO';
    }
    return null;
  }
  if (RESERVED_STATUSES.includes(r.status)) return covers(r, date) ? 'RESERVADO' : null;
  if (r.status === 'hold') return !r.hold_expired && covers(r, date) ? 'HOLD' : null;
  if (r.status !== null && !r.status_known) return covers(r, date) ? 'BLOQUEADO' : null; // estado desconocido: revision humana
  return null;
}

function strongest(claims) {
  return claims.reduce((best, c) => (!best || RANK[c.state] > RANK[best.state] ? c : best), null);
}

/**
 * Estado base (sin aseo) de cada unidad del catalogo para `date`.
 * Hijas heredan el estado de su CASA COMPLETA (via: parent) y la CASA
 * COMPLETA queda BLOQUEADA cuando alguna hija esta tomada (via: child).
 */
export function computeUnitStates(reservations, catalog, date, { referenceDate = date, outOfService = [] } = {}) {
  const own = new Map(catalog.map((u) => [u.key, []]));
  for (const r of reservations) {
    const state = claimOf(r, date, referenceDate);
    if (state && own.has(r.unit)) own.get(r.unit).push({ state, reservation: r });
  }
  const oos = new Set(outOfService);
  const out = new Map();
  for (const u of catalog) {
    if (oos.has(u.key)) {
      out.set(u.key, { state: 'FUERA_DE_SERVICIO', via: null, reservation: null, claims: [] });
      continue;
    }
    let pick = strongest(own.get(u.key));
    let via = null;
    if (u.parent) {
      const parentPick = strongest(own.get(u.parent));
      if (parentPick && (!pick || RANK[parentPick.state] > RANK[pick.state])) {
        pick = parentPick;
        via = 'CASA_COMPLETA';
      }
    }
    if (u.kind === 'COMPUESTA' && !pick) {
      const childPick = strongest(u.children.flatMap((k) => own.get(k)));
      if (childPick) {
        pick = { state: 'BLOQUEADO', reservation: childPick.reservation, blockedBy: childPick.state };
        via = 'HABITACION';
      }
    }
    const all = [...own.get(u.key), ...(u.parent ? own.get(u.parent) : [])];
    out.set(u.key, {
      state: pick ? pick.state : 'DISPONIBLE',
      via,
      reservation: pick?.reservation ?? null,
      blocked_by_state: pick?.blockedBy ?? null,
      claims: all,
    });
  }
  return out;
}

/** Conflictos de inventario: dos reclamos fuertes (ocupa/reserva/hold) sobre la misma unidad fisica y noche. */
export function detectInventoryConflicts(reservations, catalog, dates, referenceDate) {
  const conflicts = [];
  const seen = new Set();
  for (const date of dates) {
    const states = new Map(catalog.map((u) => [u.key, []]));
    for (const r of reservations) {
      const c = claimOf(r, date, referenceDate);
      if (c && c !== 'BLOQUEADO' && states.has(r.unit)) states.get(r.unit).push(r);
    }
    for (const u of catalog) {
      const mine = states.get(u.key);
      const overlapping = [...mine, ...(u.parent ? states.get(u.parent) : [])];
      const refs = [...new Set(overlapping.map((r) => r.ref))];
      if (refs.length > 1) {
        const k = `${u.key}|${refs.sort().join(',')}`;
        if (!seen.has(k)) {
          seen.add(k);
          conflicts.push({ unit: u.key, date, references: refs });
        }
      }
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// Definiciones de KPI (SOURCE / DOMAIN / FORMULA / VALIDATION)
// ---------------------------------------------------------------------------

const SO = 'sale.order (Hotel v1)';
const DOM = "x_order_involves_room = true AND x_reservation_status NOT IN ('cancelled','no_show')  [HOTEL_ORDER_DOMAIN]";

export const KPI_DEFINITIONS = Object.freeze([
  { id: 'disponibles', label: 'Disponibles hoy', source: `${SO} + x_hotel_unit`, domain: DOM, formula: 'unidades fisicas con estado base DISPONIBLE hoy', validation: 'disponibles+reservadas+ocupadas+hold+bloqueadas+fuera_de_servicio = unidades fisicas (particion)' },
  { id: 'reservadas', label: 'Vendido / reservado', source: `${SO}.x_reservation_status`, domain: `${DOM}; status IN (confirmed, pre_checkin); checkin <= hoy < checkout`, formula: 'unidades fisicas RESERVADAS hoy (incluye las que bloquea una CASA COMPLETA vendida)', validation: 'HOLD no entra aqui' },
  { id: 'ocupadas', label: 'Ocupadas (en casa)', source: `${SO}.x_reservation_status`, domain: `${DOM}; status = checked_in`, formula: 'unidades fisicas con huesped en casa (checked_in) hoy', validation: 'bloqueada != ocupada; una reserva confirmed sin check-in NO ocupa' },
  { id: 'hold', label: 'En HOLD', source: `${SO}.x_reservation_status, x_hold_expired`, domain: `${DOM}; status = hold AND NOT x_hold_expired`, formula: 'unidades fisicas con HOLD vigente hoy', validation: 'HOLD != vendido: no suma a ingresos ni a cartera' },
  { id: 'bloqueadas', label: 'Bloqueadas', source: `${SO} + x_hotel_unit (padre/hijas)`, domain: 'estado desconocido con fechas, o CASA COMPLETA con una hija tomada', formula: 'unidades en BLOQUEADO (la CASA COMPLETA cuando una habitacion esta tomada; reserva con estado no catalogado)', validation: 'no se cuenta como ocupada. DATA_GAP: bloqueos administrativos/mantenimiento no tienen campo estructurado' },
  { id: 'fuera_de_servicio', label: 'Fuera de servicio', source: 'sin campo estructurado en Odoo', domain: 'sin dominio (sin fuente)', formula: 'DATA_GAP: solo se calcula si se inyecta outOfService', validation: 'siempre 0 hasta que exista la fuente' },
  { id: 'llegan_hoy', label: 'Llegan hoy', source: `${SO}.x_checkin`, domain: `${DOM}; status IN (confirmed, pre_checkin, checked_in); checkin = hoy`, formula: 'conteo de reservas', validation: 'distingue ya-llego (checked_in) de pendiente' },
  { id: 'salen_hoy', label: 'Salen hoy', source: `${SO}.x_checkout`, domain: `${DOM}; status IN (checked_in, checked_out); checkout = hoy`, formula: 'conteo de reservas', validation: 'distingue ya-salio (checked_out) de pendiente' },
  { id: 'en_casa', label: 'En casa (huespedes)', source: `${SO}.x_num_adults + x_num_children`, domain: `${DOM}; status = checked_in`, formula: 'suma de personas de reservas checked_in', validation: 'reserva sin personas se cuenta como DATA_GAP, no como 0' },
  { id: 'occupancy_rooms', label: 'Ocupacion por unidades %', source: 'x_hotel_unit + x_reservation_status', domain: 'unidades fisicas (CASA COMPLETA Atheron es compuesta: no suma al denominador)', formula: 'unidades ocupadas / unidades vendibles x 100  (vendibles = fisicas - fuera de servicio)', validation: '0 <= pct <= 100; ocupadas <= vendibles' },
  { id: 'occupancy_pax', label: 'Ocupacion por personas %', source: 'x_num_adults+x_num_children / x_hotel_unit.capacidad_comercial', domain: 'propiedades con capacidad confirmada (Algarra/Neusa = DATA_GAP)', formula: 'personas alojadas / capacidad vendible x 100  (capacidad vendible = suma capacidad_comercial de unidades fisicas; si la CASA COMPLETA esta tomada, su capacidad_comercial)', validation: 'pct > 100 dispara SOBREOCUPACION' },
  { id: 'saldo_operativo', label: 'Saldo por cobrar (operativo)', source: `${SO}.x_hotel_balance`, domain: `${DOM}; status IN (${SOLD_STATUSES.join(', ')}); balance > 0`, formula: 'suma de x_hotel_balance de reservas VENDIDAS con saldo', validation: 'excluye HOLD/opcion/consulta (no son cartera). Se descompone en en_casa_o_futuras vs estancias_terminadas' },
  { id: 'saldo_formula_hotel009', label: 'accounts_receivable (formula HOTEL-009)', source: `${SO}.amount_total - x_hotel_paid`, domain: DOM, formula: 'suma de max(amount_total - x_hotel_paid, 0) de TODAS las reservas no canceladas (incluye HOLD/opcion/consulta)', validation: 'se conserva SOLO para comparar contra saldo_operativo; la diferencia es pipeline no vendido' },
  { id: 'ventas_dia', label: 'Ventas del dia', source: `${SO}.create_date + amount_total`, domain: `${DOM}; status IN (${SOLD_STATUSES.join(', ')}); create_date = hoy`, formula: 'suma amount_total de reservas VENDIDAS creadas hoy', validation: 'venta != estancia != cobro' },
  { id: 'reservas_dia', label: 'Reservas del dia', source: `${SO}.create_date`, domain: `${DOM}; create_date = hoy`, formula: 'conteo de reservas creadas hoy, por estado', validation: 'incluye pipeline (HOLD/consulta) por separado' },
  { id: 'reservas_activas', label: 'Reservas activas', source: `${SO}.x_reservation_status`, domain: `${DOM}; status IN (confirmed, pre_checkin, checked_in); checkout > hoy`, formula: 'conteo', validation: 'no incluye HOLD' },
  { id: 'ingresos_periodo', label: 'Ingresos del periodo (devengado)', source: `${SO}.amount_total, x_checkin, x_checkout`, domain: `${DOM}; status IN (${SOLD_STATUSES.join(', ')})`, formula: 'sum(amount_total / noches_reserva x noches dentro del periodo)', validation: 'amount_total puede incluir extras no separados por noche (aproximacion declarada en HOTEL-009)' },
  { id: 'cobrado_acumulado', label: 'Cobrado acumulado de las reservas del periodo', source: `${SO}.x_hotel_paid`, domain: 'reservas VENDIDAS cuya estancia toca el periodo', formula: 'sum(x_hotel_paid)', validation: 'x_hotel_paid no tiene fecha: NO es "cobrado hoy"' },
  { id: 'cobrado_fecha', label: 'Cobrado por fecha real', source: 'account.payment (x_hotel_sale_order_id, state=paid)', domain: HOTEL_PAYMENT_DOMAIN_TEXT(), formula: 'sum(amount) con date en el periodo', validation: 'solo existe si se leen pagos; si no, null (DATA_GAP), nunca 0 inventado' },
  { id: 'noches_vendidas', label: 'Noches vendidas', source: `${SO}.x_checkin/x_checkout`, domain: `${DOM}; status IN (${SOLD_STATUSES.join(', ')})`, formula: 'sum(noches de la reserva dentro del periodo); casa completa Atheron = 5 noches-habitacion por noche', validation: 'noches_vendidas <= noches_disponibles' },
  { id: 'adr', label: 'ADR', source: 'ingresos_periodo / noches_vendidas', domain: 'idem', formula: 'ingresos devengados / noches-habitacion vendidas (casa completa Atheron cuenta 5)', validation: 'null si no hay noches vendidas (no 0)' },
  { id: 'revpar', label: 'RevPAR', source: 'ingresos_periodo / noches_disponibles', domain: 'idem', formula: 'ingresos devengados / (unidades vendibles x dias)', validation: 'RevPAR = ADR x ocupacion vendida' },
  { id: 'canales', label: 'Reservas e ingresos por canal', source: `${SO}.x_booking_source`, domain: 'reservas VENDIDAS con estancia en el periodo', formula: 'agrupa por canal; sin canal = SIN_CANAL_REGISTRADO', validation: 'la suma por canal = total del periodo' },
  { id: 'aseos', label: 'Aseos (hoy)', source: 'project.task "Limpieza" (stage_id, x_resource_id) + sale.order checkout', domain: 'solo propiedades con housekeeping configurado (Atheron Suite)', formula: 'aseos_hoy = salidas de hoy + unidades con tarea abierta; completados = etapa LISTA tras check-out', validation: 'Algarra/Neusa = DATA_GAP' },
]);

function HOTEL_PAYMENT_DOMAIN_TEXT() {
  return "x_hotel_sale_order_id != false AND state = 'paid'  [HOTEL_PAYMENT_DOMAIN]";
}

// ---------------------------------------------------------------------------
// Utilidades de agregacion
// ---------------------------------------------------------------------------

const sum = (items, pick) => items.reduce((a, i) => a + (pick(i) ?? 0), 0);
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const SIN_CANAL = 'SIN_CANAL_REGISTRADO';

function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length < 4 ? '****' : `****${digits.slice(-4)}`;
}

/** Cuantas habitaciones-noche (unidades fisicas) ocupa una reserva. */
function physicalUnitsOf(r, catalog) {
  const u = catalog.find((x) => x.key === r.unit);
  if (!u) return 0;
  return u.kind === 'COMPUESTA' ? u.children.length : 1;
}

// ---------------------------------------------------------------------------
// Constructor principal
// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {Array}  input.reservations   forma de mapSaleOrderToReservation()
 * @param {string} input.referenceDate  ISO
 * @param {object} [input.horizon]      {preset, range:{from,to}}
 * @param {object} [input.filters]      {property, channel, status:[], unit}
 * @param {Array}  [input.housekeepingTasks] [{unit, stage, assignee, updated_at}]
 * @param {Array}  [input.payments]     forma de mapAccountPaymentToCollection()
 * @param {string[]} [input.outOfService] claves de unidad fuera de servicio (solo si existe la fuente)
 * @param {object} [input.costs]        costos atribuibles reales (Revenue Intelligence). Sin esto = DATA_NOT_READY
 * @param {object} [input.options]      {capacity, housekeepingProperties, truncated, holdSoonHours}
 */
export function buildControlCenter(input) {
  const {
    reservations: rawReservations = [],
    referenceDate,
    horizon: horizonInput = {},
    filters = {},
    housekeepingTasks = null,
    payments = null,
    outOfService = [],
    costs = null,
    options = {},
  } = input;

  const horizon = resolveHorizon(referenceDate, horizonInput.preset ?? 'HOY', horizonInput.range ?? null);
  const catalog = buildUnitCatalog(options.capacity ?? UNIT_CAPACITY);
  const hkProperties = options.housekeepingProperties ?? HOUSEKEEPING_PROPERTIES;
  const gaps = [];
  const alerts = [];

  const all = rawReservations.map((r) => normalizeReservation(r, catalog));
  const live = all.filter((r) => !DEAD_STATUSES.includes(r.status)); // el lector ya los excluye; defensivo

  if (options.truncated) {
    gaps.push({ code: 'LECTURA_TRUNCADA', detail: 'La lectura de reservas llego al limite de filas: los KPI pueden estar incompletos. Usar fetchAllHotelReservations (paginado).' });
  }

  // --- filtros -----------------------------------------------------------
  const unitDefs = catalog.filter(
    (u) => (!filters.property || u.property === filters.property) && (!filters.unit || u.key === filters.unit),
  );
  const unitKeys = new Set(unitDefs.map((u) => u.key));
  const statusFilter = filters.status?.length ? new Set(filters.status) : null;
  const matches = (r) =>
    (!filters.property || r.property === filters.property) &&
    (!filters.unit || r.unit === filters.unit) &&
    (!filters.channel || (r.channel ?? SIN_CANAL) === filters.channel) &&
    (!statusFilter || statusFilter.has(r.status));
  const scoped = live.filter(matches);

  // --- reservas incompletas / anomalias de dato ---------------------------
  for (const r of live) {
    const missing = [];
    if (!r.unit) missing.push(r.unit_raw ? `unidad no reconocida (${r.unit_raw})` : 'sin unidad');
    if (!validDates(r)) missing.push('fechas ausentes o invertidas');
    if (r.guests == null && !PIPELINE_STATUSES.includes(r.status)) missing.push('sin numero de personas');
    if (!r.status_known) missing.push(`estado no catalogado (${r.status ?? 'vacio'})`);
    if (missing.length && (matches(r) || !r.unit)) {
      alerts.push({ code: 'RESERVA_INCOMPLETA', severity: PIPELINE_STATUSES.includes(r.status) ? 'BAJA' : 'MEDIA', unit: r.unit, reference: r.ref, message: `Reserva ${r.ref ?? '(sin referencia)'} incompleta: ${missing.join('; ')}` });
    }
    if (r.balance != null && r.balance_calc != null && Math.abs(r.balance - r.balance_calc) > 1 && matches(r)) {
      alerts.push({ code: 'ANOMALIA_SALDO', severity: 'MEDIA', unit: r.unit, reference: r.ref, message: `x_hotel_balance (${r.balance}) difiere de total - cobrado (${r.balance_calc}) en ${r.ref}` });
    }
  }

  // --- inventario HOY (verdad completa, no filtrada por canal/estado) ------
  const states = computeUnitStates(live, catalog, referenceDate, { referenceDate, outOfService });
  const hk = housekeepingTasks ? indexHousekeeping(housekeepingTasks, catalog) : new Map();
  const hkConfigured = (u) => hkProperties.includes(u.property);
  const hasHkData = housekeepingTasks !== null;

  const tomorrow = addDays(referenceDate, 1);
  const departuresToday = live.filter((r) => r.unit && r.checkout === referenceDate && ['checked_in', 'checked_out'].includes(r.status));
  const arrivalsToday = live.filter((r) => r.unit && r.checkin === referenceDate && [...RESERVED_STATUSES, 'checked_in'].includes(r.status));

  const cards = [];
  for (const u of catalog) {
    const st = states.get(u.key);
    // CASA COMPLETA bloqueada por una habitacion: no se muestran los datos del huesped de la habitacion en la tarjeta de la casa
    const res = st.via === 'HABITACION' ? null : st.reservation;
    const blockedBy = st.via === 'HABITACION' && st.reservation ? { unit: st.reservation.unit, reference: st.reservation.ref } : null;
    const hkRow = hk.get(u.key) ?? null;
    const configured = hkConfigured(u);
    let housekeeping;
    if (!configured) housekeeping = { stage: null, label: 'SIN HOUSEKEEPING', status: 'DATA_GAP', assignee: null, updated_at: null };
    else if (!hasHkData) housekeeping = { stage: null, label: 'SIN DATO', status: 'DATA_GAP', assignee: null, updated_at: null };
    else if (!hkRow) housekeeping = { stage: null, label: 'SIN TAREA', status: 'SIN_DATO', assignee: null, updated_at: null };
    else housekeeping = { stage: hkRow.stage, label: HK_FLOW_LABEL[hkRow.stage], status: 'OK', assignee: hkRow.assignee, updated_at: hkRow.updated_at };

    let display = st.state;
    if (st.state === 'DISPONIBLE') {
      if (['POR_LIMPIAR', 'EN_LIMPIEZA', 'LISTA_PARA_REVISAR', 'INCIDENCIA'].includes(housekeeping.stage)) display = 'ASEO_PENDIENTE';
      else if (housekeeping.stage === 'LISTA') display = 'LISTO';
    }

    const nextArrival = live
      .filter((r) => r.unit === u.key && [...RESERVED_STATUSES, 'hold'].includes(r.status) && r.checkin > referenceDate && validDates(r) && !(r.status === 'hold' && r.hold_expired))
      .sort((a, b) => a.checkin.localeCompare(b.checkin))[0] ?? null;

    const departsToday = !!res && res.checkout === referenceDate && st.state === 'OCUPADO';
    const row = {
      unit: u.key,
      label: u.label,
      property: u.property,
      kind: u.kind,
      capacity: u.capacity,
      state: st.state,
      display_state: display,
      via: st.via,
      blocked_by_state: st.blocked_by_state ?? null,
      blocked_by: blockedBy,
      sale_hoy: departsToday,
      llega_hoy: !!res && res.checkin === referenceDate && ['RESERVADO', 'OCUPADO'].includes(st.state),
      reference: res?.ref ?? null,
      guest: res?.guest ?? null,
      phone_masked: maskPhone(res?.phone),
      channel: res ? (res.channel ?? SIN_CANAL) : null,
      checkin: res?.checkin ?? null,
      checkout: res?.checkout ?? null,
      guests: res?.guests ?? null,
      total: res?.total ?? null,
      paid: res?.paid ?? null,
      balance: res?.balance ?? null,
      payment_status: res ? paymentStatus({ gross_sale: res.total, collected: res.paid }) : null,
      reservation_status: res?.status ?? null,
      next_arrival: nextArrival ? { reference: nextArrival.ref, date: nextArrival.checkin, status: nextArrival.status, channel: nextArrival.channel ?? SIN_CANAL } : null,
      housekeeping,
      alerts: [],
    };
    cards.push(row);
  }

  // --- unidades visibles segun filtros ------------------------------------
  const cardByKey = new Map(cards.map((c) => [c.unit, c]));
  const reservationFilterActive = !!(filters.channel || statusFilter);
  const visibleCards = cards.filter((c) => {
    if (!unitKeys.has(c.unit)) return false;
    if (!reservationFilterActive) return true;
    const r = states.get(c.unit).reservation;
    return !!r && matches(r);
  });

  // --- ocupacion HOY -------------------------------------------------------
  const leaves = unitDefs.filter((u) => u.kind === 'FISICA');
  const leafState = (u) => states.get(u.key).state;
  const sellableLeaves = leaves.filter((u) => leafState(u) !== 'FUERA_DE_SERVICIO');
  const count = (list, s) => list.filter((u) => leafState(u) === s).length;
  const inventory = {
    unidades_fisicas: leaves.length,
    vendibles: sellableLeaves.length,
    disponibles: count(leaves, 'DISPONIBLE'),
    reservadas: count(leaves, 'RESERVADO'),
    ocupadas: count(leaves, 'OCUPADO'),
    hold: count(leaves, 'HOLD'),
    bloqueadas: count(leaves, 'BLOQUEADO'),
    fuera_de_servicio: count(leaves, 'FUERA_DE_SERVICIO'),
    disponibles_listas: leaves.filter((u) => cardByKey.get(u.key).display_state === 'LISTO').length,
    disponibles_con_aseo_pendiente: leaves.filter((u) => cardByKey.get(u.key).display_state === 'ASEO_PENDIENTE').length,
    llegan_hoy: arrivalsToday.filter((r) => matches(r)).length,
    salen_hoy: departuresToday.filter((r) => matches(r)).length,
  };
  inventory.composicion_ok =
    inventory.disponibles + inventory.reservadas + inventory.ocupadas + inventory.hold + inventory.bloqueadas + inventory.fuera_de_servicio === inventory.unidades_fisicas;

  const inHouseRes = live.filter((r) => r.status === 'checked_in' && r.unit && matches(r));
  const withUnknownPax = inHouseRes.filter((r) => r.guests == null);
  if (withUnknownPax.length) gaps.push({ code: 'PERSONAS_SIN_DATO', detail: `${withUnknownPax.length} reserva(s) en casa sin numero de personas: la ocupacion por personas las cuenta como 0.` });

  // capacidad vendible por propiedad (hoy)
  const propertiesInScope = [...new Set(leaves.map((u) => u.property))];
  const paxByProperty = [];
  for (const prop of propertiesInScope) {
    const propLeaves = sellableLeaves.filter((u) => u.property === prop);
    const compositeDef = catalog.find((u) => u.property === prop && u.kind === 'COMPUESTA');
    const compositeTaken = compositeDef && states.get(compositeDef.key).claims.some((c) => c.reservation.unit === compositeDef.key && c.state === 'OCUPADO');
    const capsKnown = propLeaves.every((u) => u.capacity != null) && propLeaves.length > 0;
    let capacity = null;
    if (capsKnown) capacity = compositeTaken && compositeDef.capacity != null ? compositeDef.capacity : sum(propLeaves, (u) => u.capacity);
    const people = sum(inHouseRes.filter((r) => r.property === prop), (r) => r.guests ?? 0);
    const roomsOcc = propLeaves.filter((u) => leafState(u) === 'OCUPADO').length;
    paxByProperty.push({
      property: prop,
      personas: people,
      capacidad_vendible: capacity,
      pct: capacity != null ? pct(people, capacity) : null,
      unidades_ocupadas: roomsOcc,
      unidades_vendibles: propLeaves.length,
      pct_unidades: pct(roomsOcc, propLeaves.length),
      data_gap: capacity == null ? 'CAPACIDAD_NO_CONFIRMADA' : null,
    });
    if (capacity == null) gaps.push({ code: 'CAPACIDAD_NO_CONFIRMADA', detail: `${prop}: capacidad_comercial sin confirmar contra Odoo; excluida de ocupacion por personas.` });
  }
  const paxKnown = paxByProperty.filter((p) => p.capacidad_vendible != null);
  const occupancy = {
    rooms: {
      formula: 'unidades ocupadas / unidades vendibles x 100',
      ocupadas: inventory.ocupadas,
      vendibles: inventory.vendibles,
      pct: pct(inventory.ocupadas, inventory.vendibles),
      vendida_pct: pct(inventory.ocupadas + inventory.reservadas, inventory.vendibles),
      by_property: paxByProperty.map((p) => ({ property: p.property, ocupadas: p.unidades_ocupadas, vendibles: p.unidades_vendibles, pct: p.pct_unidades })),
    },
    pax: {
      formula: 'personas alojadas / capacidad vendible x 100',
      personas: sum(paxKnown, (p) => p.personas),
      capacidad_vendible: sum(paxKnown, (p) => p.capacidad_vendible),
      pct: pct(sum(paxKnown, (p) => p.personas), sum(paxKnown, (p) => p.capacidad_vendible)),
      parcial: paxKnown.length < paxByProperty.length,
      by_property: paxByProperty.map((p) => ({ property: p.property, personas: p.personas, capacidad_vendible: p.capacidad_vendible, pct: p.pct, data_gap: p.data_gap })),
    },
  };

  // --- sobreocupacion ------------------------------------------------------
  for (const r of live.filter((x) => x.unit && validDates(x) && [...SOLD_STATUSES, 'hold'].includes(x.status) && x.checkout >= referenceDate && matches(x))) {
    const cap = catalog.find((u) => u.key === r.unit)?.capacity;
    if (cap != null && r.guests != null && r.guests > cap) {
      alerts.push({ code: 'SOBREOCUPACION', severity: 'ALTA', unit: r.unit, reference: r.ref, message: `${r.ref}: ${r.guests} personas > capacidad comercial ${cap} (verificar capacidad extra aprobada)` });
    }
  }

  // --- conflicto de inventario --------------------------------------------
  const conflictDates = datesBetween(referenceDate, addDays(referenceDate, 13));
  for (const c of detectInventoryConflicts(live, catalog, conflictDates, referenceDate)) {
    if (unitKeys.has(c.unit)) alerts.push({ code: 'CONFLICTO_INVENTARIO', severity: 'ALTA', unit: c.unit, date: c.date, references: c.references, message: `Conflicto en ${c.unit} el ${c.date}: ${c.references.join(' / ')}` });
  }

  // --- HOLD, bloqueo, check-out/llegada vencidos, saldo ---------------------
  for (const r of live.filter(matches)) {
    if (r.status === 'hold' && validDates(r) && r.checkout > referenceDate) {
      if (r.hold_expired) alerts.push({ code: 'HOLD_VENCIDO', severity: 'MEDIA', unit: r.unit, reference: r.ref, message: `HOLD ${r.ref} vencido sin liberar (${r.unit ?? 'sin unidad'})` });
      else if (r.checkin <= addDays(referenceDate, 1)) alerts.push({ code: 'HOLD_RELEVANTE', severity: 'MEDIA', unit: r.unit, reference: r.ref, message: `HOLD ${r.ref} vigente para ${r.checkin} en ${r.unit ?? 'sin unidad'}${r.hold_expires ? ` (vence ${r.hold_expires})` : ''}` });
    }
    if (r.status === 'checked_in' && validDates(r) && r.checkout < referenceDate) alerts.push({ code: 'CHECKOUT_VENCIDO', severity: 'ALTA', unit: r.unit, reference: r.ref, message: `${r.ref} sigue en casa y su salida era ${r.checkout}` });
    if (RESERVED_STATUSES.includes(r.status) && validDates(r) && r.checkin < referenceDate) alerts.push({ code: 'LLEGADA_VENCIDA', severity: 'MEDIA', unit: r.unit, reference: r.ref, message: `${r.ref} debio llegar el ${r.checkin} y no tiene check-in (posible no-show)` });
    const upcomingOrActive = isSold(r) && r.status !== 'checked_out' && r.status !== 'closed' && validDates(r) && r.checkin <= tomorrow && r.checkout >= referenceDate;
    const dueToday = ['checked_in', 'checked_out'].includes(r.status) && r.checkout === referenceDate;
    if ((upcomingOrActive || dueToday) && (r.balance ?? 0) > 0) alerts.push({ code: 'SALDO_PENDIENTE', severity: dueToday || r.status === 'checked_in' ? 'ALTA' : 'MEDIA', unit: r.unit, reference: r.ref, message: `${r.ref} con saldo pendiente $${r.balance} (${r.status})` });
  }
  for (const c of cards.filter((x) => unitKeys.has(x.unit) && x.state === 'BLOQUEADO')) {
    alerts.push({ code: 'BLOQUEO', severity: 'BAJA', unit: c.unit, message: `${c.label} bloqueada (${c.via === 'HABITACION' ? 'una habitacion esta tomada' : 'estado a revisar'})` });
  }

  // --- housekeeping ----------------------------------------------------------
  const hkUnits = leaves.filter(hkConfigured);
  const hkMap = new Map();
  const hkItem = (key) => {
    if (!hkMap.has(key)) hkMap.set(key, { unit: key, razones: [] });
    return hkMap.get(key);
  };
  const leavesOf = (key) => {
    const u = catalog.find((x) => x.key === key);
    return u?.kind === 'COMPUESTA' ? u.children : [key];
  };
  for (const r of departuresToday) {
    for (const k of leavesOf(r.unit)) if (hkUnits.some((u) => u.key === k)) hkItem(k).razones.push(r.status === 'checked_out' ? 'SALIO_HOY' : 'SALE_HOY_PENDIENTE');
  }
  for (const u of hkUnits) {
    const stage = hk.get(u.key)?.stage;
    if (stage && stage !== 'LISTA') hkItem(u.key).razones.push('TAREA_ABIERTA');
  }
  const aseoList = [...hkMap.values()].map((it) => {
    const stage = hk.get(it.unit)?.stage ?? null;
    const left = it.razones.includes('SALE_HOY_PENDIENTE') && !it.razones.includes('SALIO_HOY');
    let estado;
    if (left) estado = 'AUN_NO_SALE';
    else if (!hasHkData) estado = 'SIN_DATO';
    else if (!stage) estado = 'SIN_TAREA';
    else estado = stage;
    const row = hk.get(it.unit);
    return { unit: it.unit, estado, label: HK_FLOW_LABEL[estado] ?? (estado === 'AUN_NO_SALE' ? 'SALE HOY' : estado), responsable: row?.assignee ?? null, hora: row?.updated_at ?? null };
  });
  const completados = aseoList.filter((a) => a.estado === 'LISTA').length;
  const housekeeping = {
    configurado_en: hkProperties,
    sin_housekeeping: [...new Set(leaves.filter((u) => !hkConfigured(u)).map((u) => u.property))],
    datos_disponibles: hasHkData,
    aseos_hoy: aseoList.length,
    pendientes: aseoList.filter((a) => ['POR_LIMPIAR', 'AUN_NO_SALE', 'SIN_TAREA', 'SIN_DATO'].includes(a.estado)).length,
    en_limpieza: aseoList.filter((a) => a.estado === 'EN_LIMPIEZA').length,
    por_revisar: aseoList.filter((a) => a.estado === 'LISTA_PARA_REVISAR').length,
    con_incidencia: aseoList.filter((a) => a.estado === 'INCIDENCIA').length,
    completados,
    pct_completados: hasHkData ? pct(completados, aseoList.length) : null,
    habitaciones_no_listas: hasHkData ? hkUnits.filter((u) => hk.get(u.key)?.stage !== 'LISTA').map((u) => u.key) : null,
    flujo: ['CHECK-OUT', 'ASEO PENDIENTE', 'EN LIMPIEZA', 'POR REVISAR', 'LISTA', 'CHECK-IN'],
    detalle: aseoList,
    proximos_checkin_no_listos: [],
    prioridad: [],
  };
  // proximo check-in + habitacion no lista (hoy y manana)
  if (hasHkData) {
    const upcomingArrivals = live.filter((r) => r.unit && [...RESERVED_STATUSES].includes(r.status) && (r.checkin === referenceDate || r.checkin === tomorrow) && matches(r));
    for (const r of upcomingArrivals) {
      for (const k of leavesOf(r.unit)) {
        const u = hkUnits.find((x) => x.key === k);
        if (!u) continue;
        const stage = hk.get(k)?.stage ?? null;
        if (stage !== 'LISTA') {
          const item = { unit: k, llegada: r.checkin, reference: r.ref, estado_aseo: stage ?? 'SIN_TAREA', responsable: hk.get(k)?.assignee ?? null };
          housekeeping.proximos_checkin_no_listos.push(item);
          alerts.push({ code: 'CHECKIN_PROXIMO_NO_LISTA', severity: r.checkin === referenceDate ? 'ALTA' : 'MEDIA', unit: k, reference: r.ref, message: `Llega ${r.checkin} (${r.ref}) y ${k} no esta lista (${stage ? HK_FLOW_LABEL[stage] : 'sin tarea de aseo'})` });
        }
      }
    }
    for (const a of aseoList.filter((x) => x.estado === 'INCIDENCIA')) alerts.push({ code: 'ANOMALIA_OPERATIVA', severity: 'ALTA', unit: a.unit, message: `Incidencia abierta de aseo en ${a.unit}: no se libera sola (regla v1 CEO)` });
  }
  const nextArrivals = hkUnits.map((u) => ({ unit: u.key, nextArrivalDate: cardByKey.get(u.key).next_arrival?.date ?? (cardByKey.get(u.key).llega_hoy ? referenceDate : null) }));
  housekeeping.prioridad = computeHousekeepingPriority(nextArrivals, referenceDate).filter((u) => u.priority !== 'NORMAL');
  for (const g of housekeeping.sin_housekeeping) gaps.push({ code: 'HOUSEKEEPING_NO_CONFIGURADO', detail: `${g}: sin proyecto/etapas de limpieza (decision CEO 4, v1 solo Atheron Suite).` });
  if (!hasHkData) gaps.push({ code: 'HOUSEKEEPING_SIN_LECTURA', detail: 'No se leyeron tareas de aseo (project.task): aseos/listos quedan SIN DATO, no se asumen.' });

  // --- finanzas ------------------------------------------------------------
  const sold = scoped.filter(isSold);
  const inPeriod = sold.filter((r) => nightsInRange(r, horizon.from, horizon.to) > 0);
  const balanceOf = (r) => r.balance ?? 0;
  const owing = sold.filter((r) => balanceOf(r) > 0);
  const groupAmount = (list) => ({ count: list.length, amount: round2(sum(list, balanceOf)) });
  const pipelineValue = (s) => {
    const l = scoped.filter((r) => r.status === s);
    return { count: l.length, valor: round2(sum(l, (r) => r.total ?? 0)) };
  };
  const nonDead = scoped;
  const legacy = nonDead.filter((r) => (r.total ?? 0) - (r.paid ?? 0) > 0);
  const saldos = {
    operativo: groupAmount(owing),
    en_casa_o_futuras: groupAmount(owing.filter((r) => ['confirmed', 'pre_checkin', 'checked_in'].includes(r.status))),
    estancias_terminadas: groupAmount(owing.filter((r) => ['checked_out', 'closed'].includes(r.status))),
    pipeline_no_vendido: { hold: pipelineValue('hold'), opcion: pipelineValue('opcion'), consulta: pipelineValue('draft') },
    formula_hotel009: { count: legacy.length, amount: round2(sum(legacy, (r) => Math.max((r.total ?? 0) - (r.paid ?? 0), 0))) },
    diferencia_vs_formula_hotel009: round2(sum(legacy, (r) => Math.max((r.total ?? 0) - (r.paid ?? 0), 0)) - sum(owing, balanceOf)),
    scope: 'solo dominio hotelero (x_order_involves_room = true); NO incluye sale.order de otras lineas de negocio',
  };

  const createdToday = scoped.filter((r) => r.created === referenceDate);
  const collectedByDate = (from, to) => (payments ? round2(sum(payments.filter((p) => p.collected_date >= from && p.collected_date <= to), (p) => p.amount)) : null);
  const finance = {
    ventas_dia: { count: createdToday.filter(isSold).length, amount: round2(sum(createdToday.filter(isSold), (r) => r.total ?? 0)) },
    reservas_dia: {
      total: createdToday.length,
      por_estado: Object.fromEntries([...new Set(createdToday.map((r) => r.status ?? 'sin_estado'))].map((s) => [s, createdToday.filter((r) => (r.status ?? 'sin_estado') === s).length])),
    },
    reservas_activas: scoped.filter((r) => ['confirmed', 'pre_checkin', 'checked_in'].includes(r.status) && validDates(r) && r.checkout > referenceDate).length,
    ingresos_periodo: round2(sum(inPeriod, (r) => ((r.total ?? 0) / nightsBetween(r.checkin, r.checkout)) * nightsInRange(r, horizon.from, horizon.to))),
    valor_reservas_periodo: round2(sum(inPeriod, (r) => r.total ?? 0)),
    cobrado_acumulado: round2(sum(inPeriod, (r) => r.paid ?? 0)),
    pendiente_periodo: round2(sum(inPeriod, balanceOf)),
    cobrado_hoy_real: collectedByDate(referenceDate, referenceDate),
    cobrado_periodo_real: collectedByDate(horizon.from, horizon.to),
    saldos,
  };
  if (payments === null) gaps.push({ code: 'COBRADO_POR_FECHA_NO_LEIDO', detail: 'No se leyo account.payment: "cobrado hoy/periodo" por fecha real = null. x_hotel_paid es acumulado sin fecha.' });

  // --- noches vendidas, ADR, RevPAR, canales ---------------------------------
  const roomNights = (r, from, to) => nightsInRange(r, from, to) * physicalUnitsOf(r, catalog);
  const horizonDays = datesBetween(horizon.from, horizon.to);
  const nightsSold = sum(inPeriod, (r) => roomNights(r, horizon.from, horizon.to));
  const nightsAvailable = sellableLeaves.length * horizon.days;
  const revenue = finance.ingresos_periodo;
  const channelMap = new Map();
  for (const r of inPeriod) {
    const k = r.channel ?? SIN_CANAL;
    const cur = channelMap.get(k) ?? { channel: k, reservas: 0, noches: 0, ingresos: 0 };
    cur.reservas += 1;
    cur.noches += roomNights(r, horizon.from, horizon.to);
    cur.ingresos += ((r.total ?? 0) / nightsBetween(r.checkin, r.checkout)) * nightsInRange(r, horizon.from, horizon.to);
    channelMap.set(k, cur);
  }
  const channels = [...channelMap.values()].map((c) => ({ ...c, ingresos: round2(c.ingresos), pct_ingresos: revenue > 0 ? pct(c.ingresos, revenue) : null })).sort((a, b) => b.ingresos - a.ingresos);
  const horizonKpis = {
    horizon,
    noches_vendidas: nightsSold,
    noches_disponibles: nightsAvailable,
    ocupacion_vendida_pct: pct(nightsSold, nightsAvailable),
    ocupacion_personas_vendida_pct: null,
    adr: nightsSold > 0 ? round2(revenue / nightsSold) : null,
    revpar: nightsAvailable > 0 ? round2(revenue / nightsAvailable) : null,
    ingresos: revenue,
    reservas_periodo: inPeriod.length,
  };
  // personas-noche vendidas / capacidad-noche (solo propiedades con capacidad confirmada)
  {
    const capProps = paxByProperty.filter((p) => p.capacidad_vendible != null).map((p) => p.property);
    let paxNights = 0;
    let capNights = 0;
    for (const day of horizonDays) {
      for (const prop of capProps) {
        const propLeaves = sellableLeaves.filter((u) => u.property === prop);
        capNights += sum(propLeaves, (u) => u.capacity);
      }
      for (const r of inPeriod) if (capProps.includes(r.property) && covers(r, day)) paxNights += r.guests ?? 0;
    }
    horizonKpis.ocupacion_personas_vendida_pct = capNights > 0 ? pct(paxNights, capNights) : null;
  }
  // serie diaria
  const daily = horizonDays.map((day) => {
    const st = computeUnitStates(live, catalog, day, { referenceDate, outOfService });
    const taken = sellableLeaves.filter((u) => ['OCUPADO', 'RESERVADO'].includes(st.get(u.key).state)).length;
    const hold = sellableLeaves.filter((u) => st.get(u.key).state === 'HOLD').length;
    return { date: day, vendidas: taken, hold, vendibles: sellableLeaves.length, pct_vendida: pct(taken, sellableLeaves.length) };
  });

  // --- llegadas / salidas / en casa (listas) ---------------------------------
  const listItem = (r) => ({ unit: r.unit, reference: r.ref, guest: r.guest, phone_masked: maskPhone(r.phone), channel: r.channel ?? SIN_CANAL, checkin: r.checkin, checkout: r.checkout, guests: r.guests, status: r.status, total: r.total, paid: r.paid, balance: r.balance, payment_status: paymentStatus({ gross_sale: r.total, collected: r.paid }) });
  const lists = {
    llegan_hoy: arrivalsToday.filter(matches).map(listItem),
    salen_hoy: departuresToday.filter(matches).map(listItem),
    en_casa: inHouseRes.map(listItem),
    holds: live.filter((r) => r.status === 'hold' && !r.hold_expired && validDates(r) && r.checkout > referenceDate && matches(r)).map(listItem),
  };
  const en_casa = { reservas: inHouseRes.length, personas: sum(inHouseRes, (r) => r.guests ?? 0) };

  // --- Revenue Intelligence ----------------------------------------------------
  const revenue_intelligence = buildRevenueIntelligence({ reservations: live, catalog, sellableLeaves, referenceDate, costs, channels, options });
  for (const g of revenue_intelligence.data_gaps) gaps.push({ code: g.code, detail: g.detail, area: 'REVENUE_INTELLIGENCE' });

  // --- cabecera "5 segundos" ----------------------------------------------------
  const headline = {
    disponibles: inventory.disponibles,
    vendido: inventory.reservadas,
    ocupado: inventory.ocupadas,
    bloqueado: inventory.bloqueadas,
    hold: inventory.hold,
    llegan_hoy: inventory.llegan_hoy,
    salen_hoy: inventory.salen_hoy,
    requieren_aseo: housekeeping.datos_disponibles ? housekeeping.pendientes + housekeeping.en_limpieza + housekeeping.por_revisar + housekeeping.con_incidencia : null,
    listas: housekeeping.datos_disponibles ? inventory.disponibles_listas : null,
    vendido_periodo: finance.ingresos_periodo,
    cobrado: finance.cobrado_periodo_real ?? null,
    cobrado_acumulado: finance.cobrado_acumulado,
    ocupacion_unidades_pct: occupancy.rooms.pct,
    ocupacion_personas_pct: occupancy.pax.pct,
    alertas: alerts.length,
  };

  const validation = runValidation({ inventory, occupancy, cards, saldos, finance, horizonKpis, channels, live, catalog, inHouseRes });

  const SEV = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  alerts.sort((a, b) => SEV[a.severity] - SEV[b.severity]);

  return {
    meta: {
      reference_date: referenceDate,
      horizon,
      filters,
      reservations_read: rawReservations.length,
      reservations_in_scope: scoped.length,
      scope_note: 'solo reservas del dominio hotelero; solo lectura',
    },
    headline,
    inventory,
    units: visibleCards,
    occupancy,
    housekeeping,
    finance,
    horizon_kpis: horizonKpis,
    daily,
    channels,
    lists,
    en_casa,
    revenue_intelligence,
    alerts,
    data_gaps: gaps,
    kpi_definitions: KPI_DEFINITIONS,
    validation,
  };
}

// ---------------------------------------------------------------------------
// Revenue Intelligence (READ-ONLY, sin tocar tarifas)
// ---------------------------------------------------------------------------

export const REQUIRED_COSTS = Object.freeze([
  { key: 'costo_variable_noche', label: 'costo variable por noche ocupada (total o desglosado)' },
  { key: 'costo_aseo', label: 'aseo por salida' },
  { key: 'costo_lavanderia', label: 'lavanderia por noche/salida' },
  { key: 'costo_amenities', label: 'amenities por huesped/noche' },
  { key: 'comision_ota_pct', label: 'comision OTA (% por canal)' },
  { key: 'servicios_variables', label: 'servicios variables (agua/energia/otros)' },
  { key: 'costo_fijo_diario', label: 'costo fijo diario atribuible' },
  { key: 'margen_minimo_pct', label: 'margen minimo objetivo (%)' },
]);

/**
 * TARIFA PISO y PUNTO DE EQUILIBRIO. Matematica pura, SIN datos por defecto:
 * si falta cualquier costo devuelve DATA_NOT_READY con la lista exacta.
 *
 *   tarifa_piso = (CV + CF / noches_esperadas_dia) / (1 - comision - margen)
 *   noches_equilibrio = CF / (ADR x (1 - comision) - CV)         [si el denominador > 0]
 *   ocupacion_equilibrio = noches_equilibrio / unidades_vendibles
 *
 * `costs` = { costo_variable_noche, comision_ota_pct (0..1), costo_fijo_diario,
 *             margen_minimo_pct (0..1), noches_esperadas_dia, adr }.
 * costo_variable_noche ya debe sumar aseo+lavanderia+amenities+servicios.
 */
export function computeFloorRate(costs, { sellableUnits = null } = {}) {
  const needed = ['costo_variable_noche', 'comision_ota_pct', 'costo_fijo_diario', 'margen_minimo_pct', 'noches_esperadas_dia'];
  const missing = needed.filter((k) => costs?.[k] === undefined || costs?.[k] === null || Number.isNaN(Number(costs?.[k])));
  if (missing.length) return { status: 'DATA_NOT_READY', missing, tarifa_piso: null, noches_equilibrio: null, ocupacion_equilibrio: null };
  const { costo_variable_noche: cv, comision_ota_pct: c, costo_fijo_diario: cf, margen_minimo_pct: m, noches_esperadas_dia: n } = costs;
  if (c < 0 || m < 0 || c + m >= 1) return { status: 'INVALID_INPUT', missing: [], error: 'comision + margen debe ser < 100%', tarifa_piso: null, noches_equilibrio: null, ocupacion_equilibrio: null };
  if (n <= 0) return { status: 'INVALID_INPUT', missing: [], error: 'noches_esperadas_dia debe ser > 0', tarifa_piso: null, noches_equilibrio: null, ocupacion_equilibrio: null };
  const piso = (cv + cf / n) / (1 - c - m);
  let noches = null;
  let occ = null;
  if (costs.adr != null) {
    const unitMargin = costs.adr * (1 - c) - cv;
    if (unitMargin > 0) {
      noches = cf / unitMargin;
      occ = sellableUnits ? Math.round((noches / sellableUnits) * 1000) / 10 : null;
    }
  }
  return { status: 'READY', missing: [], tarifa_piso: round2(piso), noches_equilibrio: noches == null ? null : round2(noches), ocupacion_equilibrio: occ };
}

function buildRevenueIntelligence({ reservations, catalog, sellableLeaves, referenceDate, costs, options }) {
  const gaps = [];
  const sold = reservations.filter(isSold).filter(validDates);
  const sellableCount = sellableLeaves.length;
  const minWeeks = options.minWeeksPerWeekday ?? 4;
  const valleyFactor = options.valleyFactor ?? 0.75;

  // historia: desde la primera noche vendida hasta AYER
  const yesterday = addDays(referenceDate, -1);
  const firstNight = sold.map((r) => r.checkin).sort()[0] ?? null;
  const historyFrom = firstNight && firstNight <= yesterday ? firstNight : null;
  const nightsOnDay = (day) => sold.filter((r) => covers(r, day)).reduce((a, r) => a + physicalUnitsOf(r, catalog), 0);
  const revOnDay = (day) => sold.filter((r) => covers(r, day)).reduce((a, r) => a + (r.total ?? 0) / nightsBetween(r.checkin, r.checkout), 0);

  const byWeekday = Array.from({ length: 7 }, (_, i) => ({ weekday: i, label: WEEKDAY_LABELS[i], dias: 0, noches_vendidas: 0, ocupacion_pct: null, adr: null, ingresos: 0 }));
  let histNights = 0;
  let histRev = 0;
  let histDays = 0;
  if (historyFrom) {
    for (const day of datesBetween(historyFrom, yesterday)) {
      const w = byWeekday[weekdayOf(day)];
      const n = nightsOnDay(day);
      const rev = revOnDay(day);
      w.dias += 1;
      w.noches_vendidas += n;
      w.ingresos += rev;
      histNights += n;
      histRev += rev;
      histDays += 1;
    }
  }
  for (const w of byWeekday) {
    w.ocupacion_pct = w.dias > 0 && sellableCount > 0 ? pct(w.noches_vendidas, w.dias * sellableCount) : null;
    w.adr = w.noches_vendidas > 0 ? round2(w.ingresos / w.noches_vendidas) : null;
    w.ingresos = round2(w.ingresos);
    w.muestra_suficiente = w.dias >= minWeeks;
  }
  const baselineReady = historyFrom !== null && byWeekday.every((w) => w.muestra_suficiente);
  if (!historyFrom) gaps.push({ code: 'HISTORIAL_INSUFICIENTE', detail: 'No hay noches vendidas anteriores a hoy: sin patron por dia de semana.' });
  else if (!baselineReady) gaps.push({ code: 'HISTORIAL_INSUFICIENTE', detail: `Patron por dia de semana con menos de ${minWeeks} muestras en algun dia: DIA VALLE no se declara hasta tener historial suficiente.` });
  gaps.push({ code: 'COMPARATIVO_ANUAL_NO_DISPONIBLE', detail: 'Sin historia de 12 meses (STAGING arranca en 2026-09): no hay comparativo contra el mismo dia del ano anterior.' });

  const historic = {
    dias: histDays,
    desde: historyFrom,
    noches_vendidas: histNights,
    ingresos: round2(histRev),
    adr: histNights > 0 ? round2(histRev / histNights) : null,
    revpar: histDays > 0 && sellableCount > 0 ? round2(histRev / (histDays * sellableCount)) : null,
    ocupacion_pct: histDays > 0 && sellableCount > 0 ? pct(histNights, histDays * sellableCount) : null,
  };

  // proximos 30 dias + pickup (reservas creadas en los ultimos 7 dias)
  const horizonDays = datesBetween(referenceDate, addDays(referenceDate, 29));
  const pickupSince = addDays(referenceDate, -7);
  const upcoming = horizonDays.map((day) => {
    const n = nightsOnDay(day);
    const w = byWeekday[weekdayOf(day)];
    const expected = baselineReady ? w.ocupacion_pct : null;
    const projected = pct(n, sellableCount);
    const pickup = sold.filter((r) => covers(r, day) && r.created && r.created >= pickupSince && r.created <= referenceDate).reduce((a, r) => a + physicalUnitsOf(r, catalog), 0);
    const valley = expected != null && projected != null ? projected < expected * valleyFactor : null;
    return { date: day, weekday: w.label, vendidas: n, ocupacion_proyectada_pct: projected, esperada_pct: expected, pickup_7d: pickup, dia_valle: valley };
  });
  const lowest = [...upcoming].sort((a, b) => (a.ocupacion_proyectada_pct ?? 0) - (b.ocupacion_proyectada_pct ?? 0)).slice(0, 5);
  const pickupTotal = sum(upcoming, (d) => d.pickup_7d);

  const floor = costs ? computeFloorRate({ ...costs, adr: costs.adr ?? historic.adr }, { sellableUnits: sellableCount }) : computeFloorRate(null);
  const requiredCosts = REQUIRED_COSTS.map((c) => ({ ...c, disponible: costs?.[c.key] !== undefined && costs?.[c.key] !== null }));
  if (floor.status !== 'READY') gaps.push({ code: 'COSTOS_NO_DISPONIBLES', detail: `TARIFA PISO / PUNTO DE EQUILIBRIO = DATA NOT READY. Falta: ${(floor.missing.length ? floor.missing : REQUIRED_COSTS.map((c) => c.key)).join(', ')}` });

  return {
    read_only: true,
    modifica_tarifas: false,
    historico: historic,
    por_dia_semana: byWeekday,
    patron_listo: baselineReady,
    parametros_heuristicos: { min_semanas_por_dia: minWeeks, factor_valle: valleyFactor, nota: 'Parametros de analisis configurables, NO decisiones comerciales ni tarifas.' },
    proximos_30_dias: upcoming,
    dias_mas_bajos: lowest,
    booking_pace: { ventana_dias: 7, noches_habitacion_captadas_en_ventana: pickupTotal, base: 'reservas creadas en los ultimos 7 dias con noches en los proximos 30', comparativo: 'DATA_NOT_READY' },
    definiciones: {
      dia_valle: 'dia con ocupacion proyectada < factor x ocupacion historica de ese dia de la semana (solo si hay muestra suficiente)',
      tarifa_piso: 'precio minimo economicamente justificable = (CV + CF/noches esperadas) / (1 - comision - margen)',
      punto_equilibrio_diario: 'noches necesarias = CF / (ADR x (1 - comision) - CV)',
    },
    costos_requeridos: requiredCosts,
    tarifa_piso: floor,
    status: floor.status === 'READY' ? 'READY' : 'DATA_NOT_READY',
    data_gaps: gaps,
  };
}

// ---------------------------------------------------------------------------
// Validaciones cruzadas (auto-chequeo de que los KPI no se contradicen)
// ---------------------------------------------------------------------------

function runValidation({ inventory, occupancy, cards, saldos, finance, horizonKpis, channels, live, inHouseRes }) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });
  add('particion_unidades', inventory.composicion_ok, 'disponibles+reservadas+ocupadas+hold+bloqueadas+fuera = unidades fisicas');
  add('ocupadas_le_vendibles', inventory.ocupadas <= inventory.vendibles, `${inventory.ocupadas} <= ${inventory.vendibles}`);
  add('pct_unidades_0_100', occupancy.rooms.pct === null || (occupancy.rooms.pct >= 0 && occupancy.rooms.pct <= 100), `pct=${occupancy.rooms.pct}`);
  add('noches_vendidas_le_disponibles', horizonKpis.noches_vendidas <= horizonKpis.noches_disponibles || horizonKpis.noches_disponibles === 0, `${horizonKpis.noches_vendidas} <= ${horizonKpis.noches_disponibles}`);
  const channelTotal = round2(sum(channels, (c) => c.ingresos));
  add('canales_suman_ingresos', Math.abs(channelTotal - (horizonKpis.ingresos ?? 0)) < 1, `canales=${channelTotal} ingresos=${horizonKpis.ingresos}`);
  add('saldo_operativo_descompone', Math.abs(saldos.operativo.amount - (saldos.en_casa_o_futuras.amount + saldos.estancias_terminadas.amount)) < 1, 'operativo = en_casa_o_futuras + estancias_terminadas');
  add('saldo_operativo_le_formula_hotel009', saldos.operativo.amount <= saldos.formula_hotel009.amount + 1, 'el operativo nunca excede la formula amplia');
  add('hold_no_es_cartera', true, 'HOLD/opcion/consulta se reportan en pipeline_no_vendido, fuera de saldo_operativo');
  const inHousePeople = sum(inHouseRes, (r) => r.guests ?? 0);
  add('personas_en_casa_coherentes', occupancy.pax.parcial || inHousePeople >= occupancy.pax.personas, `en casa=${inHousePeople}, ocupacion personas=${occupancy.pax.personas}`);
  add('casa_completa_exclusion', cards.every((c) => c.kind !== 'COMPUESTA' || c.state !== 'OCUPADO' || cards.filter((x) => x.property === c.property && x.kind === 'FISICA').every((x) => x.state === 'OCUPADO')), 'si la CASA COMPLETA esta ocupada, todas sus habitaciones aparecen ocupadas');
  void finance;
  void live;
  return { ok: checks.every((c) => c.ok), checks };
}

/** Dominios Odoo equivalentes a cada KPI/filtro (para replicar en la vista/Studio, sin guardar nada desde aqui). */
export function odooDomainsFor({ referenceDate }) {
  const hotel = [['x_order_involves_room', '=', true]];
  const live = [...hotel, ['x_reservation_status', 'not in', ['cancelled', 'no_show']]];
  const sold = [...hotel, ['x_reservation_status', 'in', [...SOLD_STATUSES]]];
  return {
    llegan_hoy: [...hotel, ['x_reservation_status', 'in', ['confirmed', 'pre_checkin', 'checked_in']], ['x_checkin', '>=', `${referenceDate} 00:00:00`], ['x_checkin', '<=', `${referenceDate} 23:59:59`]],
    salen_hoy: [...hotel, ['x_reservation_status', 'in', ['checked_in', 'checked_out']], ['x_checkout', '>=', `${referenceDate} 00:00:00`], ['x_checkout', '<=', `${referenceDate} 23:59:59`]],
    en_casa: [...hotel, ['x_reservation_status', '=', 'checked_in']],
    hold_vigente: [...hotel, ['x_reservation_status', '=', 'hold'], ['x_hold_expired', '=', false]],
    saldo_operativo: [...sold, ['x_hotel_balance', '>', 0]],
    saldo_formula_hotel009: [...live, ['x_hotel_balance', '>', 0]],
    vendidas: sold,
  };
}
