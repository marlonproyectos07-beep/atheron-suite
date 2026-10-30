import { ConnectorError } from './errors.mjs';
import { UNITS, unitForOdooRole } from './unit-map.mjs';
import { reconcileByIds } from './id-reconcile.mjs';
import { readWatchlist } from './overbooking-watch.mjs';

/**
 * ATH-DEV-041 — Orquestacion de la conciliacion por identificadores. SOLO LECTURA:
 *  - Smoobu: GET /api/reservations paginado (SmoobuClient solo emite GET).
 *  - Odoo: fields_get y search_read (OdooJson2Client rechaza cualquier otro metodo antes de la red).
 * Si una lectura llega al tope de resultados o la paginacion no termina, se DETIENE (resultado incompleto = no hay informe).
 */
export const LIMITS = Object.freeze({ smoobuPageSize: 100, smoobuMaxPages: 10, odooSlots: 5000, odooOrders: 2000, odooLines: 5000, odooTemplates: 500, odooInvoices: 2000, odooDayuseSlots: 500 });

/** Codigos internos de producto de La Magia -> unidad (respaldo si el producto no trae `planning_role_id`). */
const UNIT_BY_CODE = Object.freeze({ 'MAGIA-201': '201', 'MAGIA-202': '202', 'MAGIA-203': '203', 'MAGIA-301': '301', 'MAGIA-302': '302', 'CASA-MAGIA': 'CASA' });

const m2oId = (v) => (Array.isArray(v) ? v[0] : (v ?? null));

export async function readSmoobuWindow(smoobu, window, { pageSize = LIMITS.smoobuPageSize, maxPages = LIMITS.smoobuMaxPages } = {}) {
  const byId = new Map();
  let requests = 0; let pageCount = null; let totalItems = null; let rawCount = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await smoobu.listReservationsPage({ ...window.smoobuQuery, page, pageSize, includeCancelled: true });
    requests += 1;
    if (!Number.isInteger(data.page_count) || data.page_count < 1 || !Number.isInteger(data.total_items) || data.total_items < 0 || (data.page != null && data.page !== page)) throw new ConnectorError('SMOOBU_PAGINATION_INVALID');
    if (pageCount == null) { pageCount = data.page_count; totalItems = data.total_items; }
    else if (pageCount !== data.page_count || totalItems !== data.total_items) throw new ConnectorError('SMOOBU_PAGINATION_INVALID');
    rawCount += data.bookings.length;
    for (const b of data.bookings) {
      const id = Number(b?.id);
      if (!Number.isSafeInteger(id) || byId.has(id)) throw new ConnectorError('SMOOBU_PAGINATION_INVALID');
      byId.set(id, b);
    }
    if (page >= pageCount) {
      return { bookings: [...byId.values()], requests, pageCount, totalItems, rawCount, complete: totalItems === rawCount };
    }
  }
  throw new ConnectorError('SMOOBU_PAGINATION_LIMIT');
}

export async function readOdooWindow(odoo, window, limits = LIMITS) {
  let calls = 0;
  const call = async (fn) => { calls += 1; return fn(); };
  const have = async (model, wanted) => { const f = await call(() => odoo.fieldsGet(model, ['type'])); return wanted.filter((k) => f[k]); };
  const capped = (rows, limit, code) => { if (!Array.isArray(rows)) throw new ConnectorError('ODOO_RESPONSE_INVALID'); if (rows.length >= limit) throw new ConnectorError(code); return rows; };

  const roleIds = UNITS.map((u) => u.odooRoleId);
  const slotFields = await have('planning.slot', ['id', 'role_id', 'start_datetime', 'end_datetime', 'state', 'x_bloqueo_ref', 'sale_line_id']);
  for (const required of ['role_id', 'start_datetime', 'end_datetime']) if (!slotFields.includes(required)) throw new ConnectorError('ODOO_FIELDS_MISSING');
  const slots = capped(await call(() => odoo.searchRead('planning.slot',
    [['role_id', 'in', roleIds], ['start_datetime', '<', window.odooSlotRange.end], ['end_datetime', '>', window.odooSlotRange.start]],
    slotFields, { limit: limits.odooSlots, order: 'start_datetime' })), limits.odooSlots, 'ODOO_SLOT_LIMIT');

  // ATH-CEO-PMS-100: turnos de uso diurno (nota DAYUSE..., cualquier rol) en la ventana; la nota solo se usa en memoria
  const dayuseFields = slotFields.includes('id') ? await have('planning.slot', ['id', 'name', 'role_id', 'resource_id', 'start_datetime', 'end_datetime', 'state']) : [];
  const dayuseSlots = dayuseFields.includes('name') ? capped(await call(() => odoo.searchRead('planning.slot',
    [['name', '=ilike', 'DAYUSE%'], ['start_datetime', '<', window.odooSlotRange.end], ['end_datetime', '>', window.odooSlotRange.start]],
    dayuseFields, { limit: limits.odooDayuseSlots, order: 'start_datetime' })), limits.odooDayuseSlots, 'ODOO_DAYUSE_SLOT_LIMIT') : [];

  const orderFields = await have('sale.order', ['id', 'state', 'x_pms_reference', 'x_booking_source', 'x_checkin', 'x_checkout', 'x_reservation_status', 'amount_untaxed', 'amount_tax', 'amount_total', 'invoice_ids']);
  for (const required of ['x_pms_reference', 'x_checkin', 'x_checkout']) if (!orderFields.includes(required)) throw new ConnectorError('ODOO_FIELDS_MISSING');
  const { checkinOnOrBefore, checkoutAfter } = window.orderRange;
  // todos los pedidos con referencia escrita (son pocos) + los pedidos cuyas fechas tocan la ventana
  const orders = capped(await call(() => odoo.searchRead('sale.order',
    ['|', ['x_pms_reference', '!=', false], '&', ['x_checkin', '<=', checkinOnOrBefore], ['x_checkout', '>', checkoutAfter]],
    orderFields, { limit: limits.odooOrders, order: 'id' })), limits.odooOrders, 'ODOO_ORDER_LIMIT');

  let lines = []; let templates = []; let invoices = [];
  if (orders.length) {
    const lineFields = await have('sale.order.line', ['id', 'order_id', 'product_template_id', 'price_unit', 'x_precio_manual']);
    if (lineFields.includes('product_template_id')) {
      lines = capped(await call(() => odoo.searchRead('sale.order.line', [['order_id', 'in', orders.map((o) => o.id)]], lineFields, { limit: limits.odooLines })), limits.odooLines, 'ODOO_LINE_LIMIT');
      const tmplIds = [...new Set(lines.map((l) => m2oId(l.product_template_id)).filter(Boolean))];
      if (tmplIds.length) {
        const tmplFields = await have('product.template', ['id', 'default_code', 'planning_role_id']);
        templates = capped(await call(() => odoo.searchRead('product.template', [['id', 'in', tmplIds]], tmplFields, { limit: limits.odooTemplates })), limits.odooTemplates, 'ODOO_TEMPLATE_LIMIT');
      }
    }
    // ATH-CEO-PMS-100: facturas de esos pedidos (solo estado, tipo y total) para el aviso INVOICE_DIFF
    const invIds = [...new Set(orders.flatMap((o) => (Array.isArray(o.invoice_ids) ? o.invoice_ids : [])))];
    if (invIds.length) {
      const invFields = await have('account.move', ['id', 'state', 'move_type', 'amount_total']);
      invoices = capped(await call(() => odoo.searchRead('account.move', [['id', 'in', invIds]], invFields, { limit: limits.odooInvoices })), limits.odooInvoices, 'ODOO_INVOICE_LIMIT');
    }
  }
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const linesOfOrder = new Map();
  for (const l of lines) { const oid = m2oId(l.order_id); linesOfOrder.set(oid, [...(linesOfOrder.get(oid) ?? []), l]); }
  const unitOfTemplate = new Map(templates.map((t) => [t.id, unitForOdooRole(m2oId(t.planning_role_id))?.unit ?? UNIT_BY_CODE[t.default_code] ?? null]));
  const unitsOfOrder = new Map();
  for (const l of lines) {
    const u = unitOfTemplate.get(m2oId(l.product_template_id));
    if (!u) continue;
    const oid = m2oId(l.order_id);
    unitsOfOrder.set(oid, [...new Set([...(unitsOfOrder.get(oid) ?? []), u])]);
  }
  const ordersWithUnits = orders.map((o) => {
    const own = linesOfOrder.get(o.id) ?? [];
    return {
      ...o, units: unitsOfOrder.get(o.id) ?? [],
      lineIds: own.map((l) => l.id),
      lines: own.map((l) => ({ price_unit: l.price_unit ?? null, x_precio_manual: l.x_precio_manual ?? null })),
      invoices: (Array.isArray(o.invoice_ids) ? o.invoice_ids : []).map((id) => invoiceById.get(id)).filter(Boolean),
    };
  });
  return { slots, dayuseSlots, orders: ordersWithUnits, calls, counts: { slotsRead: slots.length, dayuseSlotsRead: dayuseSlots.length, ordersRead: orders.length, linesRead: lines.length, templatesRead: templates.length, invoicesRead: invoices.length } };
}

/** Ejecuta la conciliacion completa y devuelve un informe sin datos personales. */
export async function runReconcileIds({ smoobu, odoo, window, watchIds = [] }) {
  const s = await readSmoobuWindow(smoobu, window);
  if (!s.complete) throw new ConnectorError('SMOOBU_INCOMPLETE_READ');
  // ATH-DEV-053: el listado no devuelve las sobreventas; los ids vigilados se leen uno a uno (GET, con tope, sin reintentos)
  const watch = await readWatchlist(smoobu, watchIds, { listed: new Map(s.bookings.map((b) => [Number(b?.id), b])) });
  const o = await readOdooWindow(odoo, window);
  const report = reconcileByIds({ bookings: s.bookings, window, orders: o.orders, slots: o.slots, dayuseSlots: o.dayuseSlots });
  return {
    reads: {
      smoobuWatch: { endpoint: 'GET /api/reservations/{id}', requests: watch.requests, watched: watchIds.length },
      smoobu: { endpoint: 'GET /api/reservations', requests: s.requests, pageCount: s.pageCount, totalItems: s.totalItems, recordsRead: s.bookings.length, query: window.smoobuQuery },
      odoo: { calls: o.calls, methods: ['fields_get', 'search_read'], ...o.counts, writes: 0 },
    },
    ...report,
    overbookingWatch: watch,
  };
}
