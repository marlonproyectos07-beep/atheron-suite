/**
 * ATH-ODOO-HOTEL-009, Gate 009-F (Prioridad 1, opcion "D" -- combinacion
 * segura) -- lector de SOLO LECTURA para el tablero gerencial/Angela,
 * conectado a datos reales de Odoo STAGING.
 *
 * Decision de arquitectura (documentada, no una operacion nueva del
 * contrato del Gateway): se investigaron 3 opciones.
 *
 *   A) Nueva operacion de lectura en el contrato HTTP del Gateway
 *      (expuesta a Sofia/web/WhatsApp). Descartada para ESTE uso: el
 *      tablero gerencial lo consume Marlon/Angela desde un contexto de
 *      confianza (recepcion/gerencia), no un canal de IA externo; abrir
 *      una operacion de lectura masiva de reservas al mismo nivel de
 *      privilegio que availability/quote/hold seria expandir la
 *      superficie de ataque sin necesidad real.
 *   B) XML-RPC directo (`search_read` sobre `sale.order`) con la MISMA
 *      credencial tecnica ya usada para accion 1967. Probado en modo
 *      SOLO LECTURA (ver scripts/diagnostico-permisos-xmlrpc.mjs): el
 *      usuario tecnico SI tiene permiso (`ALLOWED` en `sale.order`,
 *      `x_hotel_unit`, `x_hotel_property`). Riesgo real encontrado:
 *      `sale.order` es compartido con OTRAS lineas de negocio de
 *      ATHERON S.A.S (CCTV/Syscom, ver `x_modo_syscom`/
 *      `x_is_mixed_rama` en el propio modelo) -- leer sin filtrar
 *      expondria datos ajenos al hotel.
 *   D) B, pero SIEMPRE filtrado por `x_order_involves_room = true`
 *      (campo real que Odoo ya usa para distinguir "esta orden es una
 *      reserva de hotel"), con una lista fija de campos (nunca
 *      `fields=[]` sin restriccion), y SOLO como modulo local/de
 *      reporteria (scripts de Marlon con la credencial tecnica ya
 *      existente) -- NUNCA expuesto como operacion HTTP nueva del
 *      Gateway. Esta es la opcion implementada aqui.
 *
 * Campos tecnicos reales confirmados via `fields_get`
 * (scripts/diagnostico-campos-hotel.mjs / diagnostico-selecciones.mjs,
 * 2026-09-30): `x_reservation_status` (10 valores reales, incluye
 * `no_show` -- estado que nuestro diseno de Angela no habia
 * contemplado), `x_booking_source`, `x_hold_origin`, `x_hotel_paid`,
 * `x_hotel_balance`, etc. Nunca se adivino un nombre de campo.
 */

export const HOTEL_ORDER_DOMAIN = Object.freeze([
  ['x_order_involves_room', '=', true],
  ['x_reservation_status', 'not in', ['cancelled', 'no_show']],
]);

export const HOTEL_ORDER_FIELDS = Object.freeze([
  'id',
  'name',
  'create_date',
  'x_hotel_property_id',
  'x_hotel_unit_id',
  'x_nombre_cliente',
  'x_telf_cliente',
  'x_checkin',
  'x_checkout',
  'x_num_adults',
  'x_num_children',
  'x_reservation_status',
  'x_booking_source',
  'x_hold_origin',
  'amount_total',
  'x_hotel_paid',
  'x_hotel_balance',
  'x_hotel_deposit_required',
  'x_hold_expires',
  'x_hold_expired',
]);

/** x_booking_source (codigo Odoo) -> canal, mismo vocabulario que financial-model.mjs. */
const CHANNEL_MAP = Object.freeze({
  booking_com: 'BOOKING',
  airbnb: 'AIRBNB',
  whatsapp: 'WHATSAPP',
  direct: 'DIRECTO',
  phone: 'TELEFONO',
  agencia: 'AGENCIA',
  otro: 'OTRO',
});

function many2oneName(value) {
  return Array.isArray(value) && value.length === 2 ? value[1] : null;
}

function dateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

/**
 * Traduce una fila real de `sale.order` a la MISMA forma de
 * `Reservation` que ya consumen `operational-read-model.mjs` y
 * `financial-model.mjs` (probados contra fixtures) -- para que esos
 * modulos lean datos reales sin ningun cambio de logica propia.
 *
 * `explicit_status` SOLO se fuerza para `hold` (mapea 1:1 al `HOLD` ya
 * probado en `holds()`); para el resto de estados reales se deja sin
 * forzar, para que `deriveStatus()` siga calculando OCUPADA/RESERVADA/
 * etc a partir de fechas reales de checkin/checkout -- ya probado y mas
 * simple que mapear los 10 estados reales de Odoo uno a uno.
 */
export function mapSaleOrderToReservation(row) {
  return {
    external_reference: row.name ?? null,
    guest: row.x_nombre_cliente || null,
    phone: row.x_telf_cliente || null,
    channel: CHANNEL_MAP[row.x_booking_source] ?? null,
    unit: many2oneName(row.x_hotel_unit_id),
    property: many2oneName(row.x_hotel_property_id),
    reservation_date: dateOnly(row.create_date),
    checkin: dateOnly(row.x_checkin),
    checkout: dateOnly(row.x_checkout),
    guests: (Number(row.x_num_adults) || 0) + (Number(row.x_num_children) || 0) || null,
    gross_sale: row.amount_total ?? null,
    collected: row.x_hotel_paid ?? 0,
    balance: row.x_hotel_balance ?? null,
    explicit_status: row.x_reservation_status === 'hold' ? 'HOLD' : undefined,
    hold_expires: row.x_hold_expires || null,
    hold_expired: row.x_hold_expired ?? null,
    odoo_status_raw: row.x_reservation_status ?? null,
    odoo_id: row.id,
  };
}

/**
 * @param {{call: Function}} transport - HttpOdooTransport ya autenticado (o un fake)
 * @param {{database, uid, technicalSecret, limit?, domain?, fields?}} options
 */
export async function fetchHotelReservations(transport, { database, uid, technicalSecret, limit = 300, domain = HOTEL_ORDER_DOMAIN, fields = HOTEL_ORDER_FIELDS }) {
  const rows = await transport.call('object', 'execute_kw', [
    database,
    uid,
    technicalSecret,
    'sale.order',
    'search_read',
    [domain],
    { fields, limit },
  ]);
  return rows.map(mapSaleOrderToReservation);
}

/**
 * ATH-ODOO-HOTEL-009, Prioridad 4 (turno de cierre) -- respuesta real a
 * "COBROS HOY": existe una fuente transaccional real, `account.payment`
 * (el modelo contable estandar de Odoo), con un campo real
 * `x_hotel_sale_order_id` (confirmado via fields_get, ver
 * scripts/diagnostico-pagos.mjs) que ya vincula pago -> reserva.
 * Confirmado con 2 pagos reales existentes (scripts/diagnostico-pagos-
 * reales.mjs): `date`, `amount`, `x_hotel_sale_order_id`, `state`.
 *
 * Domain por defecto: solo pagos vinculados a una reserva de hotel
 * (`x_hotel_sale_order_id != false`) y confirmados (`state = 'paid'`,
 * nunca cuenta un pago cancelado o en borrador como cobrado).
 */
export const HOTEL_PAYMENT_DOMAIN = Object.freeze([
  ['x_hotel_sale_order_id', '!=', false],
  ['state', '=', 'paid'],
]);

export const HOTEL_PAYMENT_FIELDS = Object.freeze(['id', 'date', 'amount', 'x_hotel_sale_order_id', 'payment_type', 'journal_id']);

export function mapAccountPaymentToCollection(row) {
  return {
    odoo_payment_id: row.id,
    collected_date: row.date ?? null,
    amount: row.amount ?? null,
    external_reference: many2oneName(row.x_hotel_sale_order_id),
    payment_type: row.payment_type ?? null,
    journal: many2oneName(row.journal_id),
  };
}

export async function fetchHotelPayments(transport, { database, uid, technicalSecret, limit = 300, domain = HOTEL_PAYMENT_DOMAIN, fields = HOTEL_PAYMENT_FIELDS }) {
  const rows = await transport.call('object', 'execute_kw', [
    database,
    uid,
    technicalSecret,
    'account.payment',
    'search_read',
    [domain],
    { fields, limit },
  ]);
  return rows.map(mapAccountPaymentToCollection);
}
