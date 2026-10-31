import { ConnectorError } from './errors.mjs';
import { readSmoobuWindow, readOdooWindow } from './reconcile-ids-run.mjs';
import { reconcileByIds, VERDICTS } from './id-reconcile.mjs';
import { readWatchlist } from './overbooking-watch.mjs';
import { planSync } from './sync-intent.mjs';
import { WRITES_ENABLED } from './live-reconcile.mjs';
import { RELEASE_UNLOCKED } from './odoo-facts.mjs';

/**
 * ATH-DEV-115 — Simulacion del plan de sincronizacion contra datos reales. SOLO LECTURA.
 * Reutiliza las mismas lecturas del conciliador diario (Smoobu GET; Odoo fields_get/search_read) y anade UNA tanda de
 * lecturas extra solo para los pedidos que el plan necesita evaluar. No existe aqui ningun camino de escritura.
 */
export const EXTRA_LIMITS = Object.freeze({ orders: 500, lines: 2000, payments: 2000 });
const m2oId = (v) => (Array.isArray(v) ? v[0] : (v ?? null));

export async function readSyncExtras(odoo, { orderIds, cancelOrderIds = [] }, limits = EXTRA_LIMITS) {
  let calls = 0;
  const call = async (fn) => { calls += 1; return fn(); };
  const have = async (model, wanted) => { const f = await call(() => odoo.fieldsGet(model, ['type'])); return wanted.filter((k) => f[k]); };
  const capped = (rows, limit, code) => { if (!Array.isArray(rows)) throw new ConnectorError('ODOO_RESPONSE_INVALID'); if (rows.length >= limit) throw new ConnectorError(code); return rows; };
  const orderInfo = new Map(); const lineInfo = new Map(); const paymentsByOrder = new Map();
  if (!orderIds.length) return { orderInfo, lineInfo, paymentsByOrder, calls };

  const of = await have('sale.order', ['id', 'name', 'partner_id', 'client_order_ref', 'x_booking_source', 'rental_start_date', 'rental_return_date', 'transaction_ids', 'write_date']);
  const orders = capped(await call(() => odoo.searchRead('sale.order', [['id', 'in', orderIds]], of, { limit: limits.orders })), limits.orders, 'ODOO_SYNC_ORDER_LIMIT');
  const lf = await have('sale.order.line', ['id', 'order_id', 'price_unit', 'x_precio_manual', 'qty_invoiced', 'tax_ids', 'display_type']);
  const lines = capped(await call(() => odoo.searchRead('sale.order.line', [['order_id', 'in', orderIds]], lf, { limit: limits.lines })), limits.lines, 'ODOO_SYNC_LINE_LIMIT');
  const qty = new Map();
  for (const l of lines) {
    if (l.display_type) continue; // secciones y notas no son lineas de venta
    lineInfo.set(l.id, { id: l.id, price_unit: l.price_unit ?? null, x_precio_manual: l.x_precio_manual ?? null, taxes: (l.tax_ids ?? []).length });
    const oid = m2oId(l.order_id); qty.set(oid, (qty.get(oid) ?? 0) + (Number(l.qty_invoiced) || 0));
  }
  for (const o of orders) {
    orderInfo.set(o.id, { client_order_ref: o.client_order_ref || null, x_booking_source: o.x_booking_source || null, rental_start_date: o.rental_start_date || null,
      rental_return_date: o.rental_return_date || null, transactions: (o.transaction_ids ?? []).length, qtyInvoiced: qty.get(o.id) ?? 0, writeDate: o.write_date ?? null });
  }
  // pagos: solo para pedidos candidatos a cancelacion. Conservador: cualquier pago no anulado del mismo cliente cuenta.
  const cancelOrders = orders.filter((o) => cancelOrderIds.includes(o.id));
  const partners = [...new Set(cancelOrders.map((o) => m2oId(o.partner_id)).filter(Boolean))];
  if (partners.length) {
    const pf = await have('account.payment', ['id', 'partner_id', 'state']);
    const pays = capped(await call(() => odoo.searchRead('account.payment', [['partner_id', 'in', partners], ['state', 'not in', ['canceled', 'cancel', 'rejected']]], pf, { limit: limits.payments })), limits.payments, 'ODOO_SYNC_PAYMENT_LIMIT');
    for (const o of cancelOrders) paymentsByOrder.set(o.id, pays.filter((p) => m2oId(p.partner_id) === m2oId(o.partner_id)).length);
  }
  return { orderInfo, lineInfo, paymentsByOrder, calls, counts: { orders: orders.length, lines: lines.length } };
}

/** Lee todo, concilia y planifica. Devuelve el plan interno (con valores) y las cifras de lectura. */
export async function runSyncDryRun({ smoobu, odoo, window, today, watchIds = [] }) {
  if (WRITES_ENABLED !== false || RELEASE_UNLOCKED !== false) throw new ConnectorError('WRITE_SWITCH_ON');
  const s = await readSmoobuWindow(smoobu, window);
  if (!s.complete) throw new ConnectorError('SMOOBU_INCOMPLETE_READ');
  const watch = await readWatchlist(smoobu, watchIds, { listed: new Map(s.bookings.map((b) => [Number(b?.id), b])) });
  const o = await readOdooWindow(odoo, window);
  const report = reconcileByIds({ bookings: s.bookings, window, orders: o.orders, slots: o.slots, dayuseSlots: o.dayuseSlots });
  // las alertas de la vigilancia de sobreventas cuentan como revision manual
  const alerted = new Set((watch.entries ?? []).filter((e) => e.status === 'OVERBOOKING_ALERT').map((e) => e.smoobuId));
  for (const r of report.perReservation) if (alerted.has(r.smoobuId)) r.manualReview = r.manualReview ?? 'ALERTA_SOBREVENTA_VIGILANCIA';
  const orderIds = [...new Set(report.perReservation.flatMap((r) => (r.odooOrders ?? []).map((x) => x.id)))];
  const cancelOrderIds = report.perReservation.filter((r) => r.verdict === VERDICTS.CONFLICT && r.reason === 'CANCELADA_EN_SMOOBU_VIGENTE_EN_ODOO').flatMap((r) => (r.odooOrders ?? []).map((x) => x.id));
  const extras = await readSyncExtras(odoo, { orderIds, cancelOrderIds });
  const watchAlerts = (watch.entries ?? []).filter((e) => e.status === 'OVERBOOKING_ALERT');
  const plan = planSync({ report, bookings: s.bookings, orders: o.orders, extras, today, slots: o.slots, watchAlerts });
  return {
    plan, report,
    reads: { smoobu: { requests: s.requests + watch.requests, recordsRead: s.bookings.length }, odoo: { calls: o.calls + extras.calls, methods: ['fields_get', 'search_read'], writes: 0 } },
  };
}
