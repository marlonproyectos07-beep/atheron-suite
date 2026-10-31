import { ConnectorError } from './errors.mjs';
import { PRODUCT_BY_UNIT, CASA_PRODUCT, CASA_MIN_PERSONS } from './sync-intent.mjs';

/**
 * ATH-DEV-116 — Lista blanca de ESCRITURAS de la sincronizacion Smoobu -> Odoo. Pura: valida, no envia.
 *
 * Es la unica definicion de lo que la sincronizacion podria escribir. Todo lo que no esta aqui se rechaza ANTES de la red:
 *  - nunca `unlink` (ningun modelo), nunca `account.*` (pagos, facturas, asientos), nunca `planning.slot`
 *    (los turnos los crean, mueven y borran las automatizaciones 151/165/166 de Odoo, no el conector);
 *  - `price_unit` solo al CREAR la linea de un pedido nuevo; jamas en `write`;
 *  - `x_pms_reference` en `write` solo si el pedido no tenia referencia (lo comprueba la prevalidacion);
 *  - productos de linea: los cinco de habitacion o el producto existente de Casa Completa (CASA-MAGIA); UNA sola linea;
 *  - contactos: nombre obligatorio, `ref` = SMOOBU-<id> obligatorio (idempotencia), correo y telefono opcionales.
 */
const ROOM_PRODUCTS = new Set([...Object.values(PRODUCT_BY_UNIT), CASA_PRODUCT]);
const ORDER_CREATE = new Set(['partner_id', 'client_order_ref', 'x_pms_reference', 'x_booking_source', 'x_checkin', 'x_checkout', 'rental_start_date', 'rental_return_date', 'order_line']);
const ORDER_WRITE = new Set(['client_order_ref', 'x_pms_reference', 'x_booking_source', 'x_checkin', 'x_checkout', 'rental_start_date', 'rental_return_date']);
const LINE_CREATE = new Set(['product_id', 'product_uom_qty', 'price_unit', 'x_precio_manual', 'tax_ids', 'x_personas']);
const PARTNER_CREATE = new Set(['name', 'email', 'phone', 'ref']);

export const WRITE_ALLOWLIST = Object.freeze({
  'res.partner': Object.freeze(['create']),
  'sale.order': Object.freeze(['create', 'write', 'action_confirm', 'action_cancel', 'message_post']),
  'sale.order.line': Object.freeze(['write']),
});

const fail = (code) => { throw new ConnectorError(code); };
const onlyKeys = (obj, allowed, code) => { for (const k of Object.keys(obj ?? {})) if (!allowed.has(k)) fail(code); };
const oneId = (ids) => { if (!Array.isArray(ids) || ids.length !== 1 || !Number.isInteger(ids[0])) fail('SYNC_WRITE_ONE_RECORD_ONLY'); };

function validateLineCommand(cmd) {
  // solo [0, 0, {...}] (crear linea dentro del pedido nuevo)
  if (!Array.isArray(cmd) || cmd.length !== 3 || cmd[0] !== 0 || cmd[1] !== 0) fail('SYNC_WRITE_LINE_COMMAND_FORBIDDEN');
  const v = cmd[2];
  onlyKeys(v, LINE_CREATE, 'SYNC_WRITE_LINE_FIELD_FORBIDDEN');
  if (!ROOM_PRODUCTS.has(v.product_id)) fail('SYNC_WRITE_PRODUCT_NOT_ALLOWED');
  if (v.product_uom_qty !== 1) fail('SYNC_WRITE_QTY_NOT_ONE');
  if (!(typeof v.price_unit === 'number' && v.price_unit >= 0)) fail('SYNC_WRITE_PRICE_INVALID');
  if (v.x_precio_manual !== v.price_unit) fail('SYNC_WRITE_MANUAL_PRICE_MISMATCH');
  if (JSON.stringify(v.tax_ids) !== JSON.stringify([[6, 0, []]])) fail('SYNC_WRITE_TAXES_NOT_ALLOWED'); // impuestos: politica pendiente
  if (v.product_id === CASA_PRODUCT) { if (!(Number.isInteger(v.x_personas) && v.x_personas >= CASA_MIN_PERSONS)) fail('SYNC_WRITE_CASA_PERSONAS'); }
  else if ('x_personas' in v) fail('SYNC_WRITE_LINE_FIELD_FORBIDDEN');
}

/** Lanza ConnectorError si la escritura no esta permitida. Devuelve true si lo esta. */
/** ATH-DEV-120: modelos PROHIBIDOS de forma explicita (ademas de no estar en la lista blanca): pagos, facturas, asientos y banca. */
export const FORBIDDEN_MODELS = /^(account\.|payment\.|res\.partner\.bank$|res\.bank$|account_)/;

export function validateWrite(model, method, params) {
  if (FORBIDDEN_MODELS.test(String(model))) fail('SYNC_WRITE_FINANCIAL_MODEL_FORBIDDEN');
  const methods = WRITE_ALLOWLIST[model];
  if (!methods || !methods.includes(method)) fail('SYNC_WRITE_NOT_ALLOWED');
  if (method === 'create') {
    const list = params?.vals_list;
    if (!Array.isArray(list) || list.length !== 1) fail('SYNC_WRITE_ONE_RECORD_ONLY');
    const v = list[0];
    if (model === 'res.partner') { onlyKeys(v, PARTNER_CREATE, 'SYNC_WRITE_FIELD_FORBIDDEN'); if (!v.name) fail('SYNC_WRITE_PARTNER_NAME_REQUIRED'); if (!/^SMOOBU-\d+$/.test(String(v.ref ?? ''))) fail('SYNC_WRITE_PARTNER_REF_REQUIRED'); }
    if (model === 'sale.order') {
      onlyKeys(v, ORDER_CREATE, 'SYNC_WRITE_FIELD_FORBIDDEN');
      if (!/^SMOOBU-\d+( \/ (Booking|Airbnb) \S+)?$/.test(String(v.x_pms_reference ?? ''))) fail('SYNC_WRITE_REFERENCE_INVALID');
      if (!Number.isInteger(v.partner_id)) fail('SYNC_WRITE_PARTNER_REQUIRED');
      if (!Array.isArray(v.order_line) || v.order_line.length !== 1) fail('SYNC_WRITE_LINE_COMMAND_FORBIDDEN'); // una reserva = una linea
      v.order_line.forEach(validateLineCommand);
    }
    return true;
  }
  if (method === 'write') {
    oneId(params?.ids);
    if (model === 'sale.order') { onlyKeys(params.vals, ORDER_WRITE, 'SYNC_WRITE_FIELD_FORBIDDEN'); if (!Object.keys(params.vals ?? {}).length) fail('SYNC_WRITE_EMPTY'); }
    if (model === 'sale.order.line') {
      onlyKeys(params.vals, new Set(['x_precio_manual']), 'SYNC_WRITE_FIELD_FORBIDDEN');
      if (!(typeof params.vals.x_precio_manual === 'number' && params.vals.x_precio_manual > 0)) fail('SYNC_WRITE_PRICE_INVALID');
    }
    return true;
  }
  if (method === 'action_confirm' || method === 'action_cancel') { oneId(params?.ids); onlyKeys(params, new Set(['ids', 'context']), 'SYNC_WRITE_FIELD_FORBIDDEN'); return true; }
  if (method === 'message_post') {
    oneId(params?.ids);
    onlyKeys(params, new Set(['ids', 'body', 'message_type', 'subtype_xmlid']), 'SYNC_WRITE_FIELD_FORBIDDEN');
    if (params.message_type !== 'comment' || params.subtype_xmlid !== 'mail.mt_note') fail('SYNC_WRITE_ONLY_INTERNAL_NOTES');
    if (!/^ATH-SYNC \| /.test(String(params.body ?? ''))) fail('SYNC_WRITE_NOTE_FORMAT');
    return true;
  }
  return fail('SYNC_WRITE_NOT_ALLOWED');
}
