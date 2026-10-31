import { assessBookingAmounts, amountsNote, BOOKING_SOURCE, TAX_MODES } from './booking-amounts.mjs';
import { PRODUCT_BY_UNIT, CASA_PRODUCT } from './sync-intent.mjs';
import { parseReferences } from './reference-parse.mjs';

/**
 * ATH-DEV-137 — CORRECCION PREPARADA (no ejecutada) del piloto COT/2026/03848: llevar la linea del pedido al TOTAL que
 * acepto el huesped en Booking, sin anadir impuesto de Odoo y dejando el desglose en una nota interna.
 *
 * Este modulo SOLO planifica y valida. No hay cliente que lo ejecute: ejecutarlo exigira un PR aparte y una autorizacion
 * especifica de gerencia. Por eso la lista blanca general (`sync-write-guard`) sigue prohibiendo `price_unit` en `write`.
 *
 * Condiciones (todas o se bloquea):
 *  - pedido en BORRADOR, sin facturas y con 0 facturado; UNA linea de habitacion, sin impuestos;
 *  - canal Booking y referencia SMOOBU-<id> igual a la reserva leida;
 *  - total de Smoobu FIABLE (booking-amounts);
 *  - la linea esta hoy en la tarifa base (precio unitario = precio manual = tarifa base). Si ya esta en el total: nada que hacer.
 */
export const CORRECTION_TARGET = Object.freeze({ orderName: 'COT/2026/03848', orderId: 22193 });
export const CORRECTION_BLOCKS = Object.freeze({
  PEDIDO_NO_BORRADOR: 'PEDIDO_NO_BORRADOR', PEDIDO_FACTURADO: 'PEDIDO_FACTURADO', VARIAS_LINEAS: 'VARIAS_LINEAS',
  PRODUCTO_NO_HABITACION: 'PRODUCTO_NO_HABITACION', LINEA_CON_IMPUESTOS: 'LINEA_CON_IMPUESTOS', NO_ES_BOOKING: 'NO_ES_BOOKING',
  REFERENCIA_NO_COINCIDE: 'REFERENCIA_NO_COINCIDE', IMPORTE_ACTUAL_INESPERADO: 'IMPORTE_ACTUAL_INESPERADO',
});
const ROOMS = new Set([...Object.values(PRODUCT_BY_UNIT), CASA_PRODUCT]);
const m2oId = (v) => (Array.isArray(v) ? v[0] : (v ?? null));
const eq = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.round(a * 100) === Math.round(b * 100);
const block = (code, extra = {}) => ({ ok: false, block: code, writes: [], ...extra });

/**
 * @param {object} p
 * @param {object} p.order    sale.order (id, name, state, x_booking_source, x_pms_reference, invoice_ids)
 * @param {object[]} p.lines  sale.order.line (id, product_id, price_unit, x_precio_manual, tax_ids, qty_invoiced)
 * @param {object} p.booking  reserva de Smoobu
 * @param {object[]|null} p.elements elementos de precio de Smoobu
 */
export function planTotalCorrection({ order, lines, booking, elements }) {
  if (order?.state !== 'draft') return block(CORRECTION_BLOCKS.PEDIDO_NO_BORRADOR);
  if ((order.invoice_ids ?? []).length || (lines ?? []).some((l) => Number(l.qty_invoiced) > 0)) return block(CORRECTION_BLOCKS.PEDIDO_FACTURADO);
  if ((lines ?? []).length !== 1) return block(CORRECTION_BLOCKS.VARIAS_LINEAS);
  const [l] = lines;
  if (!ROOMS.has(m2oId(l.product_id))) return block(CORRECTION_BLOCKS.PRODUCTO_NO_HABITACION);
  if ((l.tax_ids ?? []).length) return block(CORRECTION_BLOCKS.LINEA_CON_IMPUESTOS);
  if (order.x_booking_source !== BOOKING_SOURCE) return block(CORRECTION_BLOCKS.NO_ES_BOOKING);
  if (!parseReferences(order.x_pms_reference).smoobu.includes(String(booking?.id))) return block(CORRECTION_BLOCKS.REFERENCIA_NO_COINCIDE);
  const a = assessBookingAmounts({ booking, elements });
  if (!a.ok) return block(a.block);
  const before = { price_unit: l.price_unit, x_precio_manual: l.x_precio_manual };
  if (eq(l.price_unit, a.total) && eq(l.x_precio_manual, a.total)) return { ok: true, noop: true, code: 'YA_CORREGIDO', amounts: a, before, after: before, writes: [] };
  if (!(eq(l.price_unit, a.base) && eq(l.x_precio_manual, a.base))) return block(CORRECTION_BLOCKS.IMPORTE_ACTUAL_INESPERADO, { amounts: a, before });
  const after = { price_unit: a.total, x_precio_manual: a.total };
  const body = `ATH-SYNC | correccion total Booking | SMOOBU-${booking.id} | UPDATE_LINE_TOTAL | antes ${a.base} -> despues ${a.total}${amountsNote(a)}`;
  return {
    ok: true, noop: false, amounts: a, before, after,
    // impuesto de Odoo: ninguno (el total ya trae el IVA de Booking cuando es ADICIONAL o INCLUIDO)
    odooTaxes: [], taxModeNote: a.taxMode === TAX_MODES.SIN_IMPUESTO ? 'SIN_IMPUESTO' : 'IVA_DE_BOOKING_DENTRO_DEL_TOTAL',
    writes: [
      ['sale.order.line', 'write', { ids: [l.id], vals: { price_unit: a.total, x_precio_manual: a.total } }],
      ['sale.order', 'message_post', { ids: [order.id], body, message_type: 'comment', subtype_xmlid: 'mail.mt_note' }],
    ],
  };
}

/** Validador PROPIO de la correccion (exactamente esas dos escrituras). No amplia la lista blanca general. */
export function validateCorrection(plan, { orderId, lineId }) {
  const w = plan?.writes ?? [];
  if (w.length !== 2) return false;
  const [[m1, f1, p1], [m2, f2, p2]] = w;
  const okLine = m1 === 'sale.order.line' && f1 === 'write' && JSON.stringify(p1.ids) === JSON.stringify([lineId])
    && JSON.stringify(Object.keys(p1.vals).sort()) === JSON.stringify(['price_unit', 'x_precio_manual']) && p1.vals.price_unit > 0 && p1.vals.price_unit === p1.vals.x_precio_manual;
  const okNote = m2 === 'sale.order' && f2 === 'message_post' && JSON.stringify(p2.ids) === JSON.stringify([orderId]) && p2.subtype_xmlid === 'mail.mt_note' && /^ATH-SYNC \| /.test(p2.body);
  return okLine && okNote;
}
