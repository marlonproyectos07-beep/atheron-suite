/**
 * ATH-ODOO-HOTEL-012, Fase 1 - contrato de datos del tablero maestro de
 * recepcion (filas=unidades, columnas=fechas).
 *
 * No reimplementa disponibilidad ni el bloqueo cruzado Casa Completa <->
 * habitaciones (eso vive en Odoo, accion 1967, ya aprobado en HOTEL-002/
 * 008A/009 Gate 009-E). Cuando una celda no tiene reserva, este modulo
 * pregunta a `checkAvailability` (inyectado, el mismo motor real) en vez
 * de asumir LIBRE por su cuenta.
 *
 * Catalogo de unidades: solo lo confirmado contra Odoo STAGING
 * (AI/ATH-ODOO-HOTEL-009_HANDOFF.md, Gate 009-A). Casa Algarra y Casa
 * Neusa solo tienen confirmada su propia unidad "casa completa"; no se
 * inventan habitaciones sueltas para ellas todavia.
 */

export const PROPERTIES = Object.freeze({
  ATHERON_SUITE: 'HOTEL ATHERON SUITE',
  CASA_ALGARRA: 'CASA ALGARRA',
  CASA_NEUSA: 'CASA NEUSA',
});

export const CASA_COMPLETA_ATHERON_SUITE = 'CASA_COMPLETA_ATHERON_SUITE';

export const BOARD_UNITS = Object.freeze([
  { unit: '201', label: '201', property: PROPERTIES.ATHERON_SUITE, parent: CASA_COMPLETA_ATHERON_SUITE },
  { unit: '202', label: '202', property: PROPERTIES.ATHERON_SUITE, parent: CASA_COMPLETA_ATHERON_SUITE },
  { unit: '203', label: '203', property: PROPERTIES.ATHERON_SUITE, parent: CASA_COMPLETA_ATHERON_SUITE },
  { unit: '301', label: '301', property: PROPERTIES.ATHERON_SUITE, parent: CASA_COMPLETA_ATHERON_SUITE },
  { unit: '302', label: '302', property: PROPERTIES.ATHERON_SUITE, parent: CASA_COMPLETA_ATHERON_SUITE },
  {
    unit: CASA_COMPLETA_ATHERON_SUITE,
    label: 'CASA COMPLETA',
    property: PROPERTIES.ATHERON_SUITE,
    parent: null,
    children: ['201', '202', '203', '301', '302'],
  },
  { unit: 'CASA_COMPLETA_ALGARRA', label: 'CASA ALGARRA (casa completa)', property: PROPERTIES.CASA_ALGARRA, parent: null, children: [] },
  { unit: 'CASA_COMPLETA_NEUSA', label: 'CASA NEUSA (casa completa)', property: PROPERTIES.CASA_NEUSA, parent: null, children: [] },
]);

/** Estados que pide el CEO para el tablero (HOTEL-012). Nunca se muestra solo color. */
export const BOARD_STATUSES = Object.freeze(['LIBRE', 'RESERVADA', 'OCUPADA', 'HOLD', 'BLOQUEADA']);

export const STATUS_PRESENTATION = Object.freeze({
  LIBRE: { icon: 'o', text: 'Libre' },
  RESERVADA: { icon: 'r', text: 'Reservada' },
  OCUPADA: { icon: 'x', text: 'Ocupada' },
  HOLD: { icon: 'h', text: 'Hold' },
  BLOQUEADA: { icon: '!', text: 'Revisar' },
});

/**
 * x_reservation_status real, confirmado via fields_get en Gate 009-A.
 * draft/opcion/cancelled/no_show no bloquean inventario (no se muestran
 * como ocupacion en el tablero); el resto SI ocupa la unidad.
 */
export const NON_BLOCKING_REAL_STATUSES = Object.freeze(['draft', 'opcion', 'cancelled', 'no_show']);
export const HOLD_REAL_STATUS = 'hold';
export const OCCUPYING_REAL_STATUSES = Object.freeze(['confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed']);
export const KNOWN_REAL_STATUSES = Object.freeze([
  ...NON_BLOCKING_REAL_STATUSES,
  HOLD_REAL_STATUS,
  ...OCCUPYING_REAL_STATUSES,
]);

function hasVerifiedDates(reservation) {
  const { checkin, checkout } = reservation;
  return (
    Boolean(checkin) &&
    Boolean(checkout) &&
    checkin !== 'PENDIENTE_DE_VERIFICAR' &&
    checkout !== 'PENDIENTE_DE_VERIFICAR'
  );
}

/**
 * Estado de UNA reserva para una fecha dada, o null si esa reserva no
 * ocupa esa fecha (p.ej. CONSULTA/OPCION, o fuera de su rango de estancia).
 * Nunca devuelve un estado optimista: si el real_status es desconocido,
 * es BLOQUEADA (requiere revision humana), igual que angela-read-model.
 */
export function deriveCellStatusForReservation(reservation, referenceDate) {
  const real = reservation.real_status ?? null;
  if (real && NON_BLOCKING_REAL_STATUSES.includes(real)) return null;
  if (real === HOLD_REAL_STATUS) return 'HOLD';
  if (real && !OCCUPYING_REAL_STATUSES.includes(real)) return 'BLOQUEADA';

  if (!hasVerifiedDates(reservation)) return 'BLOQUEADA';
  const { checkin, checkout } = reservation;
  if (referenceDate < checkin) return 'RESERVADA';
  if (referenceDate >= checkin && referenceDate <= checkout) return 'OCUPADA';
  return null;
}

const STATUS_PRIORITY = Object.freeze({ BLOQUEADA: 3, HOLD: 2, OCUPADA: 2, RESERVADA: 1 });

/** Si (defensivamente) mas de una reserva cubre la misma celda, gana la de mayor riesgo. */
function pickHighestPriority(statuses) {
  return statuses.reduce((best, s) => (STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best));
}

/**
 * @param {string} unit
 * @param {string} date - ISO yyyy-mm-dd
 * @param {Array} reservationsForUnit
 * @param {(unit: string, date: string) => (boolean | Promise<boolean>)} [checkAvailability]
 *   Motor real de disponibilidad (el mismo que usa el Gateway), inyectado.
 *   Si se omite, una celda sin reserva se asume LIBRE (solo valido para
 *   pruebas con fixtures; en produccion SIEMPRE se debe inyectar).
 */
export async function buildBoardCell(unit, date, reservationsForUnit, checkAvailability) {
  const covering = reservationsForUnit
    .map((r) => deriveCellStatusForReservation(r, date))
    .filter((s) => s !== null);

  if (covering.length > 0) {
    const status = pickHighestPriority(covering);
    return { status, ...STATUS_PRESENTATION[status] };
  }

  if (checkAvailability) {
    const available = await checkAvailability(unit, date);
    const status = available ? 'LIBRE' : 'BLOQUEADA';
    return { status, ...STATUS_PRESENTATION[status] };
  }

  return { status: 'LIBRE', ...STATUS_PRESENTATION.LIBRE };
}

/** Rango de fechas ISO [start, end) segun el selector pedido por el CEO. */
export const DATE_RANGE_PRESETS = Object.freeze({ HOY: 1, '7_DIAS': 7, '14_DIAS': 14, '30_DIAS': 30 });

export function buildDateRange(referenceDate, preset) {
  const days = DATE_RANGE_PRESETS[preset];
  if (!days) throw new Error(`UNKNOWN_DATE_RANGE_PRESET: ${preset}`);
  const start = new Date(`${referenceDate}T00:00:00Z`);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * @param {Array} units - subconjunto de BOARD_UNITS a mostrar (filas).
 * @param {(unit: string) => Array} reservationsByUnitFn
 * @param {string[]} dateRange - columnas, ISO yyyy-mm-dd.
 * @param {(unit: string, date: string) => (boolean | Promise<boolean>)} [checkAvailability]
 */
export async function buildMasterBoard(units, reservationsByUnitFn, dateRange, checkAvailability) {
  const rows = [];
  for (const u of units) {
    const reservationsForUnit = reservationsByUnitFn(u.unit) ?? [];
    const cells = [];
    for (const date of dateRange) {
      cells.push({ date, ...(await buildBoardCell(u.unit, date, reservationsForUnit, checkAvailability)) });
    }
    rows.push({ unit: u.unit, label: u.label, property: u.property, cells });
  }
  return rows;
}
