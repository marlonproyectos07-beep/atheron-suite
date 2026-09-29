/**
 * Workstream J - contrato de datos para el tablero de Angela.
 *
 * Solo el modelo/read-model (esta funcion), NO la UI de Odoo: construir la
 * UI en Studio requiere sesion de staging con escritura visual, que no se
 * hizo esta noche (regla: produccion congelada, no navegar configuracion
 * tecnica). Esto deja listo el contrato exacto que esa UI deberia leer.
 */

const STATUSES = Object.freeze([
  'DISPONIBLE',
  'HOLD',
  'RESERVADA',
  'OCUPADA',
  'CHECK-OUT',
  'LIMPIEZA',
  'BLOQUEADA',
]);

/**
 * Deriva el estado operativo de una reserva para una fecha de referencia.
 * No inventa un estado que la reserva no sustente: si faltan fechas
 * verificadas, el estado es 'BLOQUEADA' (requiere revision humana), nunca
 * un estado optimista.
 */
export function deriveStatus(reservation, referenceDate) {
  const { checkin, checkout } = reservation;
  const hasDates = Boolean(checkin) && Boolean(checkout) && checkin !== 'PENDIENTE_DE_VERIFICAR' && checkout !== 'PENDIENTE_DE_VERIFICAR';
  if (!hasDates) return 'BLOQUEADA';
  if (referenceDate < checkin) return 'RESERVADA';
  if (referenceDate === checkout) return 'CHECK-OUT';
  if (referenceDate >= checkin && referenceDate < checkout) return 'OCUPADA';
  return 'DISPONIBLE';
}

/**
 * Una fila del tablero, con exactamente los campos pedidos por el CEO
 * (Fase 3/J): huesped, telefono, canal, referencia externa, fecha de
 * creacion, check-in/out, personas, unidad, venta/comision/payout,
 * facturado/cobrado/saldo, estado de conciliacion.
 */
export function buildAngelaRow(reservation, { referenceDate } = {}) {
  const collected = reservation.collected ?? 0;
  return {
    unit: reservation.unit,
    status: referenceDate ? deriveStatus(reservation, referenceDate) : null,
    guest: reservation.guest,
    channel: reservation.channel ?? null,
    external_reference: reservation.external_reference,
    reservation_date: reservation.reservation_date,
    checkin: reservation.checkin,
    checkout: reservation.checkout,
    guests: reservation.guests ?? null,
    gross_sale: reservation.gross_sale,
    ota_commission: reservation.ota_commission ?? 0,
    expected_payout: reservation.expected_payout ?? null,
    received_payout: reservation.received_payout ?? null,
    invoiced: reservation.invoiced ?? 0,
    collected,
    balance: Math.max((reservation.gross_sale ?? 0) - collected, 0),
    reconciliation_status: collected > 0 ? 'PENDIENTE_DE_VERIFICAR' : 'NO_APLICA',
  };
}

export function buildAngelaBoard(reservations, { referenceDate } = {}) {
  return reservations.map((r) => buildAngelaRow(r, { referenceDate }));
}

export { STATUSES as ANGELA_STATUSES };
