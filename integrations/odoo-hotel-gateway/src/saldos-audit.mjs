/**
 * ATH-ODOO-HOTEL-012 V2 -- auditoria del KPI "Saldos pendientes"
 * (alerta del CEO: ~357 documentos / $37.202.549 COP).
 *
 * Objetivo: DEMOSTRAR el origen del numero antes de cambiarlo. Esta sesion
 * cloud no tiene credenciales de Odoo STAGING, asi que el origen NO se
 * pudo probar aqui; este modulo deja la prueba lista y reproducible:
 * `scripts/saldos-audit-live.mjs` lee (SOLO LECTURA, solo campos de
 * agregacion, sin nombres ni telefonos) y esta funcion enumera las
 * definiciones candidatas y dice CUAL reproduce el numero del tablero.
 *
 * Hipotesis que cubre:
 *   H1  mezcla ventas/documentos NO hoteleros (CCTV/Syscom comparten sale.order)
 *   H2  mezcla pipeline hotelero no vendido (HOLD/opcion/consulta)
 *   H3  mezcla estancias ya terminadas / cerradas con saldo historico
 *   H4  cuenta canceladas/no-show
 *   H5  usa amount_total - cobrado en vez de x_hotel_balance
 */

const SOLD = ['confirmed', 'pre_checkin', 'checked_in', 'checked_out', 'closed'];
const DEAD = ['cancelled', 'no_show'];

/** Campos minimos que necesita la auditoria (agregados; nunca datos personales). */
export const SALDOS_AUDIT_FIELDS = Object.freeze([
  'id',
  'state',
  'invoice_status',
  'amount_total',
  'x_order_involves_room',
  'x_reservation_status',
  'x_hotel_paid',
  'x_hotel_balance',
]);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isHotel = (r) => r.x_order_involves_room === true;
const status = (r) => r.x_reservation_status || null;
const totalMinusPaid = (r) => Math.max(num(r.amount_total) - num(r.x_hotel_paid), 0);

/** Definiciones candidatas: cada una = filtro + monto por fila. */
export const CANDIDATES = Object.freeze([
  { id: 'A_hotel_no_canceladas_balance', hypothesis: 'definicion HOTEL-009 con x_hotel_balance', filter: (r) => isHotel(r) && !DEAD.includes(status(r)) && num(r.x_hotel_balance) > 0, amount: (r) => num(r.x_hotel_balance) },
  { id: 'B_hotel_no_canceladas_total_menos_cobrado', hypothesis: 'H5: amount_total - x_hotel_paid (formula de financial-model.accounts_receivable)', filter: (r) => isHotel(r) && !DEAD.includes(status(r)) && totalMinusPaid(r) > 0, amount: totalMinusPaid },
  { id: 'C_hotel_vendidas_balance', hypothesis: 'saldo operativo V2: solo VENDIDAS (excluye pipeline) -- definicion recomendada', filter: (r) => isHotel(r) && SOLD.includes(status(r)) && num(r.x_hotel_balance) > 0, amount: (r) => num(r.x_hotel_balance) },
  { id: 'D_hotel_con_canceladas_balance', hypothesis: 'H4: incluye canceladas y no-show', filter: (r) => isHotel(r) && num(r.x_hotel_balance) > 0, amount: (r) => num(r.x_hotel_balance) },
  { id: 'E_hotel_pipeline_balance', hypothesis: 'H2: solo HOLD/opcion/consulta', filter: (r) => isHotel(r) && ['hold', 'opcion', 'draft'].includes(status(r)) && num(r.x_hotel_balance) > 0, amount: (r) => num(r.x_hotel_balance) },
  { id: 'F_hotel_terminadas_balance', hypothesis: 'H3: solo checked_out / closed con saldo', filter: (r) => isHotel(r) && ['checked_out', 'closed'].includes(status(r)) && num(r.x_hotel_balance) > 0, amount: (r) => num(r.x_hotel_balance) },
  { id: 'G_todo_sale_order_confirmado_no_facturado', hypothesis: 'H1: todo sale.order en estado sale con invoice_status distinto de invoiced (mezcla con otras lineas)', filter: (r) => r.state === 'sale' && r.invoice_status !== 'invoiced' && num(r.amount_total) > 0, amount: (r) => num(r.amount_total) },
  { id: 'H_todo_sale_order_por_facturar', hypothesis: 'H1: todo sale.order con invoice_status = to invoice', filter: (r) => r.invoice_status === 'to invoice' && num(r.amount_total) > 0, amount: (r) => num(r.amount_total) },
  { id: 'I_todo_sale_order_activo', hypothesis: 'H1: todo sale.order draft/sent/sale (ventas+cotizaciones, hotel o no)', filter: (r) => ['draft', 'sent', 'sale'].includes(r.state) && num(r.amount_total) > 0, amount: (r) => num(r.amount_total) },
]);

/**
 * @param {Array} rows filas de sale.order (campos de SALDOS_AUDIT_FIELDS)
 * @param {{count?: number, amount?: number, tolerance?: number}} [target] el numero del tablero a explicar
 */
export function auditSaldos(rows, target = {}) {
  const tolerance = target.tolerance ?? 1;
  const hotelRows = rows.filter(isHotel);
  const results = CANDIDATES.map((c) => {
    const picked = rows.filter(c.filter);
    const amount = Math.round(picked.reduce((a, r) => a + c.amount(r), 0) * 100) / 100;
    const matchCount = target.count != null ? picked.length === target.count : null;
    const matchAmount = target.amount != null ? Math.abs(amount - target.amount) <= tolerance : null;
    return {
      id: c.id,
      hypothesis: c.hypothesis,
      count: picked.length,
      amount,
      match_count: matchCount,
      match_amount: matchAmount,
      reproduces_target: matchCount === true && matchAmount === true,
    };
  });

  const byStatus = {};
  for (const r of hotelRows) {
    const k = status(r) ?? 'sin_estado';
    byStatus[k] ??= { count: 0, with_balance: 0, balance: 0 };
    byStatus[k].count += 1;
    if (num(r.x_hotel_balance) > 0) {
      byStatus[k].with_balance += 1;
      byStatus[k].balance += num(r.x_hotel_balance);
    }
  }
  const mismatch = hotelRows.filter((r) => Math.abs(num(r.x_hotel_balance) - totalMinusPaid(r)) > 1 && !DEAD.includes(status(r))).length;

  const reproducing = results.filter((r) => r.reproduces_target);
  return {
    rows_read: rows.length,
    hotel_rows: hotelRows.length,
    non_hotel_rows: rows.length - hotelRows.length,
    target: target.count != null || target.amount != null ? { count: target.count ?? null, amount: target.amount ?? null } : null,
    candidates: results,
    hotel_by_status: byStatus,
    balance_vs_total_minus_paid_mismatches: mismatch,
    verdict: target.count == null && target.amount == null
      ? 'SIN_OBJETIVO: pasa count y amount del tablero para identificar el origen'
      : reproducing.length > 0
        ? `ORIGEN_DEMOSTRADO: ${reproducing.map((r) => r.id).join(', ')}`
        : 'ORIGEN_NO_REPRODUCIDO: ninguna definicion candidata coincide; el KPI del tablero usa una fuente/filtro no cubierto (revisar el dominio de la vista en Odoo)',
  };
}
