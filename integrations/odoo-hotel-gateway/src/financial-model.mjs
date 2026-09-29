/**
 * ATH-ODOO-HOTEL-008 Nivel 1, Workstreams H/I/L - modelo financiero y
 * cierre gerencial.
 *
 * Regla que gobierna todo este archivo (ya confirmada con el caso real de
 * Camilo): VENTA != ESTANCIA != FACTURACION != COBRO != PAYOUT !=
 * CONCILIACION. Cada una tiene su propia fecha y nunca se sustituyen entre
 * si. Una reserva sin evidencia bancaria real nunca se reporta como
 * conciliada (0): se marca PENDIENTE_DE_VERIFICAR.
 */

export const PENDIENTE_DE_VERIFICAR = 'PENDIENTE_DE_VERIFICAR';

/**
 * @typedef {object} Reservation
 * @property {string} guest
 * @property {string|null} channel - 'AIRBNB' | 'BOOKING' | 'WEB' | 'WHATSAPP' | 'RECEPTION' | null si no se conoce
 * @property {string} unit
 * @property {string} external_reference
 * @property {string|null} reservation_date - fecha de VENTA (YYYY-MM-DD) o null/PENDIENTE_DE_VERIFICAR si no esta confirmada
 * @property {string} checkin
 * @property {string} checkout
 * @property {number} guests
 * @property {number} gross_sale - venta bruta, nunca el payout neto
 * @property {number} ota_commission - 0 si el canal no es OTA
 * @property {number} expected_payout
 * @property {number|null} received_payout - null si aun no llega
 * @property {string|null} payout_date
 * @property {number} invoiced - monto facturado
 * @property {string|null} invoiced_date
 * @property {number} collected - monto efectivamente cobrado
 * @property {string|null} collected_date
 * @property {string|null} payment_method - 'bancolombia'|'daviplata'|'efectivo'|'other'|null
 */

export function assertGrossSaleMatchesPayoutPlusCommission(reservation, { tolerance = 0.01 } = {}) {
  const { gross_sale, ota_commission, expected_payout } = reservation;
  const diff = Math.abs(gross_sale - (ota_commission + expected_payout));
  if (diff > tolerance) {
    throw new Error(
      `GROSS_SALE_MISMATCH: ${reservation.external_reference} gross=${gross_sale} != commission(${ota_commission}) + payout(${expected_payout})`,
    );
  }
  return true;
}

function hasVerifiedDate(date) {
  return Boolean(date) && date !== PENDIENTE_DE_VERIFICAR;
}

function sum(items, pick) {
  return items.reduce((acc, item) => acc + (pick(item) ?? 0), 0);
}

/**
 * Cierre gerencial de un dia. Nunca mezcla fechas de eventos distintos:
 * "creada hoy" mira reservation_date, "estancia hoy" mira checkin/checkout,
 * "facturado hoy" mira invoiced_date, "cobrado hoy" mira collected_date.
 *
 * `bankStatementLines`: si no se pasa evidencia bancaria real, `unreconciled`
 * se reporta como PENDIENTE_DE_VERIFICAR (nunca 0 por defecto).
 */
export function dailyClose(reservations, targetDate, { bankStatementLines = null } = {}) {
  const withUnverifiedDate = reservations.filter((r) => !hasVerifiedDate(r.reservation_date));

  const salesCreatedToday = reservations.filter((r) => r.reservation_date === targetDate);
  const staysToday = reservations.filter(
    (r) => hasVerifiedDate(r.checkin) && hasVerifiedDate(r.checkout) && targetDate >= r.checkin && targetDate < r.checkout,
  );
  const invoicedToday = reservations.filter((r) => r.invoiced_date === targetDate);
  const collectedToday = reservations.filter((r) => r.collected_date === targetDate);
  const payoutReceivedToday = reservations.filter((r) => r.payout_date === targetDate && r.received_payout != null);

  // `payments`: lineas de pago reales cuando una reserva se cobro dividida
  // entre varios medios (caso real Blanca: 40.000 Bancolombia + 15.000
  // efectivo en la misma reserva). Si no hay `payments`, se usa el par
  // unico payment_method/collected como antes.
  const paymentLinesToday = collectedToday.flatMap((r) =>
    Array.isArray(r.payments) && r.payments.length > 0
      ? r.payments
      : r.payment_method
        ? [{ method: r.payment_method, amount: r.collected }]
        : [],
  );
  const byMethod = (method) => sum(paymentLinesToday.filter((p) => p.method === method), (p) => p.amount);

  return {
    date: targetDate,
    sales_created_today: salesCreatedToday.length,
    sales_created_today_total: sum(salesCreatedToday, (r) => r.gross_sale),
    reservations_created_today: salesCreatedToday.map((r) => r.external_reference),
    stays_today: staysToday.length,
    stays_today_units: staysToday.map((r) => r.unit),
    invoiced_today: sum(invoicedToday, (r) => r.invoiced),
    collected_today: sum(collectedToday, (r) => r.collected),
    accounts_receivable: sum(reservations, (r) => Math.max(r.gross_sale - (r.collected ?? 0), 0)),
    ota_payout_pending: sum(
      reservations.filter((r) => r.channel && r.received_payout == null),
      (r) => r.expected_payout,
    ),
    ota_payout_received: sum(payoutReceivedToday, (r) => r.received_payout),
    ota_commissions: sum(
      reservations.filter((r) => r.reservation_date === targetDate),
      (r) => r.ota_commission,
    ),
    bancolombia: byMethod('bancolombia'),
    daviplata: byMethod('daviplata'),
    cash: byMethod('efectivo'),
    other: byMethod('other'),
    unreconciled: bankStatementLines === null ? PENDIENTE_DE_VERIFICAR : computeUnreconciled(collectedToday, bankStatementLines),
    unverified_reservation_dates: withUnverifiedDate.map((r) => r.external_reference),
  };
}

function computeUnreconciled(collectedToday, bankStatementLines) {
  const matchedRefs = new Set(bankStatementLines.map((line) => line.matched_reference).filter(Boolean));
  const unmatched = collectedToday.filter((r) => !matchedRefs.has(r.external_reference));
  return sum(unmatched, (r) => r.collected);
}
