/**
 * ATH-DEV-137 — IMPORTES DE RESERVAS DE BOOKING (regla autorizada por gerencia).
 *
 * El pedido interno de Odoo se registra por el TOTAL que acepto el huesped en Booking (tarifa base + impuestos que muestra
 * Booking), SIN anadir un impuesto de Odoo encima (evita duplicar el IVA). El desglose se conserva por separado en la nota
 * interna del pedido. La comision de Booking NUNCA forma parte del total.
 *
 * Fuente: GET /api/reservations/<id> (campo `price` = tarifa base) y GET /api/reservations/<id>/price-elements.
 * Solo se acepta un total si es FIABLE; si no, la reserva se BLOQUEA para revision humana. Nunca se calcula ni se inventa
 * un importe (no se aplica un 19 % por cuenta propia: el impuesto tiene que venir de Smoobu/Booking).
 *
 * Fiable =
 *  - hay elementos de precio, todos en COP, con importes numericos >= 0 y como mucho 2 decimales;
 *  - solo tipos conocidos: `basePrice` (tarifa) y `addon` cuyo nombre es un impuesto (IVA / VAT / impuesto / tax);
 *    cualquier otro (limpieza, descuentos, cupones, otros extras) se bloquea en esta fase;
 *  - cantidad vacia o 1;
 *  - la suma de las tarifas base coincide EXACTAMENTE con `price` de la reserva (dos fuentes de Smoobu de acuerdo);
 *  - los impuestos son o todos ADICIONALES (`priceIncludedInId` vacio) o todos INCLUIDOS en una tarifa base existente.
 */
export const BOOKING_SOURCE = 'booking_com';
export const AMOUNT_BLOCKS = Object.freeze({
  TOTAL_DESCONOCIDO: 'TOTAL_DESCONOCIDO', MONEDA_NO_COP: 'MONEDA_NO_COP', IMPORTE_INVALIDO: 'IMPORTE_INVALIDO',
  ELEMENTO_NO_SOPORTADO: 'ELEMENTO_NO_SOPORTADO', CANTIDAD_NO_SOPORTADA: 'CANTIDAD_NO_SOPORTADA', BASE_NO_COINCIDE: 'BASE_NO_COINCIDE',
  IMPUESTO_MIXTO: 'IMPUESTO_MIXTO',
});
export const TAX_MODES = Object.freeze({ ADICIONAL: 'ADICIONAL', INCLUIDO: 'INCLUIDO', SIN_IMPUESTO: 'SIN_IMPUESTO' });
const TAX_NAME = /^\s*(iva|vat|impuesto|impuestos|tax|taxes)\b/i;
const cents = (n) => Math.round(n * 100);
const money = (n) => cents(n) / 100;
const isMoney = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const block = (code) => ({ ok: false, block: code });

/**
 * @param {object} p
 * @param {object} p.booking   reserva cruda de Smoobu (se usan `price` y, si existe, `commission-included`)
 * @param {object[]|null} p.elements  `priceElements` de Smoobu (null = no se pudieron leer)
 * @returns {{ok:true, base:number, tax:number, total:number, taxMode:string, commission:number|null, currency:'COP'} | {ok:false, block:string}}
 */
export function assessBookingAmounts({ booking, elements }) {
  if (!Array.isArray(elements) || elements.length === 0) return block(AMOUNT_BLOCKS.TOTAL_DESCONOCIDO);
  const bases = []; const taxes = [];
  for (const e of elements) {
    if (!e || typeof e !== 'object') return block(AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO);
    if (e.currencyCode !== 'COP') return block(AMOUNT_BLOCKS.MONEDA_NO_COP);
    if (!isMoney(e.amount)) return block(AMOUNT_BLOCKS.IMPORTE_INVALIDO);
    if (!(e.quantity == null || e.quantity === 1)) return block(AMOUNT_BLOCKS.CANTIDAD_NO_SOPORTADA);
    if (e.type === 'basePrice') bases.push(e);
    else if (e.type === 'addon' && TAX_NAME.test(String(e.name ?? ''))) taxes.push(e);
    else return block(AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO);
  }
  if (!bases.length) return block(AMOUNT_BLOCKS.TOTAL_DESCONOCIDO);
  const base = money(bases.reduce((a, e) => a + e.amount, 0));
  const price = num(booking?.price);
  if (price == null || cents(price) !== cents(base)) return block(AMOUNT_BLOCKS.BASE_NO_COINCIDE);
  const baseIds = new Set(bases.map((e) => e.id));
  const included = taxes.filter((e) => e.priceIncludedInId != null && e.priceIncludedInId !== 0);
  if (included.some((e) => !baseIds.has(e.priceIncludedInId))) return block(AMOUNT_BLOCKS.ELEMENTO_NO_SOPORTADO);
  if (included.length && included.length !== taxes.length) return block(AMOUNT_BLOCKS.IMPUESTO_MIXTO);
  const tax = money(taxes.reduce((a, e) => a + e.amount, 0));
  const taxMode = !taxes.length || tax === 0 ? TAX_MODES.SIN_IMPUESTO : (included.length ? TAX_MODES.INCLUIDO : TAX_MODES.ADICIONAL);
  const total = taxMode === TAX_MODES.ADICIONAL ? money(base + tax) : base;
  if (!(total > 0)) return block(AMOUNT_BLOCKS.IMPORTE_INVALIDO);
  if (taxMode === TAX_MODES.INCLUIDO && !(tax < base)) return block(AMOUNT_BLOCKS.IMPORTE_INVALIDO);
  const c = num(booking?.['commission-included']);
  return { ok: true, base, tax, total, taxMode, commission: c != null && c > 0 ? money(c) : null, currency: 'COP' };
}

/** Texto de trazabilidad para la nota interna (sin datos personales). */
export function amountsNote(a) {
  const mode = { ADICIONAL: 'adicional a la tarifa', INCLUIDO: 'incluido en la tarifa', SIN_IMPUESTO: 'sin impuesto' }[a.taxMode] ?? a.taxMode;
  return ` | importes Booking ${a.currency}: tarifa base ${a.base} ; impuestos ${a.tax} (${mode}) ; total huesped ${a.total} ; comision Booking ${a.commission ?? 'no disponible'} (no incluida en el total) ; sin impuesto de Odoo para no duplicar IVA`;
}

/** Mismos importes (base, impuestos, total y modo). */
export const sameAmounts = (a, b) => !!a && !!b && a.ok && b.ok && cents(a.base) === cents(b.base) && cents(a.tax) === cents(b.tax) && cents(a.total) === cents(b.total) && a.taxMode === b.taxMode;
/** Solo lo que viaja en el plan (y entra en la clave de la operacion). */
export const planAmounts = (a) => ({ base: a.base, tax: a.tax, total: a.total, taxMode: a.taxMode, commission: a.commission, currency: a.currency });
