import { createHash } from 'node:crypto';
import { VERDICTS } from './id-reconcile.mjs';
import { parseReferences, normalizeOtaRef } from './reference-parse.mjs';
import { addDays } from './window.mjs';
import { maskSmoobu, maskOta } from './public-report.mjs';
import { unitForName } from './unit-map.mjs';
import { WRITES_ENABLED } from './live-reconcile.mjs';
import { RELEASE_UNLOCKED } from './odoo-facts.mjs';

/**
 * ATH-DEV-115 — PLAN de sincronizacion Smoobu -> Odoo por ID unico de Smoobu. PURO: no hace red ni escribe.
 *
 * Parte del resultado de `reconcileByIds` (veredictos ya probados en produccion por el conciliador diario) y decide, para
 * cada reserva, UNA operacion: CREATE_ORDER, UPDATE_ORDER, CONFIRM_ORDER, CANCEL_ORDER, NOOP o BLOCKED. Cada operacion lleva:
 *  - status: LISTO (podria aplicarse sin intervencion cuando se active), REQUIERE_APROBACION (siempre pasa por una persona)
 *    o BLOQUEADO (no se toca; lleva los codigos de bloqueo);
 *  - preconditions: lo que la fase de aplicacion DEBE volver a leer y comprobar justo antes de escribir (idempotencia);
 *  - payload: valores exactos que se escribirian (solo en memoria; el informe publico solo lista los NOMBRES de campos).
 *
 * Principios (ATH-CEO-PMS-075..114):
 *  1. Identidad = `SMOOBU-<id>` en `x_pms_reference`. Nunca se identifica por nombre, habitacion o fechas.
 *  2. Tarifas: nunca se cambia el `price_unit` de un pedido existente. Si el precio de Smoobu no cuadra, se BLOQUEA.
 *     En pedidos nuevos, precio = total de Smoobu y `x_precio_manual` = el mismo valor (protege de la tarifa 17 al confirmar).
 *  3. Impuestos: la politica por canal esta PENDIENTE del contador; mientras lo este, se crea el borrador sin impuesto y la
 *     confirmacion queda en REQUIERE_APROBACION.
 *  4. Cancelaciones: una cancelacion en Smoobu NO prueba que el huesped no se alojara (caso 302, 30/10). Nunca es LISTO:
 *     como mucho REQUIERE_APROBACION, y se BLOQUEA si la estancia ya empezo, si hay facturas o si hay pagos.
 *  5. Sobreventa, ambiguedad, cambio de habitacion, pedido facturado, Casa Completa sin producto: BLOQUEADO.
 */
export const OPS = Object.freeze({ CREATE_ORDER: 'CREATE_ORDER', UPDATE_ORDER: 'UPDATE_ORDER', CONFIRM_ORDER: 'CONFIRM_ORDER', CANCEL_ORDER: 'CANCEL_ORDER', NOOP: 'NOOP', BLOCKED: 'BLOCKED' });
export const STATUS = Object.freeze({ LISTO: 'LISTO', REQUIERE_APROBACION: 'REQUIERE_APROBACION', BLOQUEADO: 'BLOQUEADO', SIN_CAMBIOS: 'SIN_CAMBIOS' });
export const GUARDS = Object.freeze({
  SOBREVENTA: 'SOBREVENTA', REVISION_MANUAL: 'REVISION_MANUAL', AMBIGUA: 'AMBIGUA', PRECIO_FALTANTE: 'PRECIO_FALTANTE',
  PRODUCTO_NO_MAPEADO: 'PRODUCTO_NO_MAPEADO', CANAL_DESCONOCIDO: 'CANAL_DESCONOCIDO', TARIFA_DISTINTA: 'TARIFA_DISTINTA',
  CAMBIO_DE_HABITACION: 'CAMBIO_DE_HABITACION', PEDIDO_FACTURADO: 'PEDIDO_FACTURADO', PAGOS_EXISTENTES: 'PAGOS_EXISTENTES',
  ESTANCIA_INICIADA: 'ESTANCIA_INICIADA', NOCHES_OCUPADAS: 'NOCHES_OCUPADAS', IMPUESTO_PENDIENTE: 'IMPUESTO_PENDIENTE',
  CANCELADA_EN_ODOO_VIGENTE_EN_SMOOBU: 'CANCELADA_EN_ODOO_VIGENTE_EN_SMOOBU', ID_DISTINTO: 'ID_DISTINTO', SIN_TURNO: 'SIN_TURNO',
  USO_DIURNO: 'USO_DIURNO', DATOS_EXTRA_FALTANTES: 'DATOS_EXTRA_FALTANTES', PEDIDO_SIN_RESERVA_EN_SMOOBU: 'PEDIDO_SIN_RESERVA_EN_SMOOBU',
  VARIAS_LINEAS: 'VARIAS_LINEAS',
});

/** Producto de habitacion en Odoo (product.product) por unidad. Casa Completa no tiene producto de venta confirmado: se bloquea. */
export const PRODUCT_BY_UNIT = Object.freeze({ 201: 57846, 202: 57848, 203: 57849, 301: 57845, 302: 57847 });
/** Canal de Smoobu -> valor de `x_booking_source`. */
export const SOURCE_BY_CHANNEL = Object.freeze({ 7192171: 'direct', 7208046: 'booking_com', 7208051: 'airbnb' });
const OTA_LABEL = Object.freeze({ booking_com: 'Booking', airbnb: 'Airbnb' });
/** Politica de impuestos por canal. 'PENDIENTE' = sin impuesto en el borrador y confirmacion con aprobacion humana. */
export const TAX_POLICY = Object.freeze({ direct: 'PENDIENTE', booking_com: 'PENDIENTE', airbnb: 'PENDIENTE' });
/** Horario de entrega (15:00) y salida (11:00) de Bogota en UTC, igual que los pedidos creados a mano (03845, 03846). */
export const CHECKIN_UTC = '20:00:00';
export const CHECKOUT_UTC = '16:00:00';

const TOL = 1;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null));
const near = (a, b) => a != null && b != null && Math.abs(a - b) <= TOL;
const m2oId = (v) => (Array.isArray(v) ? v[0] : (v ?? null));
const dateOnly = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
const ACTIVE_ORDER = (o) => o && o.state !== 'cancel';

/** Referencia unica escrita en Odoo: `SMOOBU-<id>` y, si hay, `/ Booking <n>` o `/ Airbnb <n>` (formato de 03839/03845). */
export function referenceFor({ smoobuId, source, otaRef }) {
  const ota = otaRef && OTA_LABEL[source] ? ` / ${OTA_LABEL[source]} ${otaRef}` : '';
  return { x_pms_reference: `SMOOBU-${smoobuId}${ota}`, client_order_ref: `Smoobu ${smoobuId}${ota}` };
}

/** Clave idempotente de una operacion: misma reserva + misma operacion + mismos valores = misma clave. */
export const opKey = (smoobuId, op, payload) => createHash('sha256').update(JSON.stringify([smoobuId, op, payload ?? null])).digest('hex').slice(0, 16);

/** Valores exactos de un pedido NUEVO (borrador). Puro; no incluye impuestos mientras la politica este pendiente. */
export function buildCreatePayload({ smoobuId, unit, arrival, departure, source, otaRef, price, guest }) {
  const product = PRODUCT_BY_UNIT[unit];
  return {
    partner: guest?.email ? { match: 'email_exacto', email: guest.email, createIfMissing: { name: guest.name ?? null, email: guest.email, phone: guest.phone ?? null } }
      : { match: 'ninguno', createIfMissing: { name: guest?.name ?? null, email: null, phone: guest?.phone ?? null } },
    order: {
      ...referenceFor({ smoobuId, source, otaRef }),
      x_booking_source: source, x_checkin: arrival, x_checkout: departure,
      rental_start_date: `${arrival} ${CHECKIN_UTC}`, rental_return_date: `${departure} ${CHECKOUT_UTC}`,
    },
    line: { product_id: product, product_uom_qty: 1, price_unit: price, x_precio_manual: price, tax_ids: [] },
    state: 'draft',
  };
}

/**
 * @param {object} p
 * @param {object} p.report     salida de reconcileByIds (con IDs completos; uso interno)
 * @param {object[]} p.bookings registros crudos de Smoobu (se leen precio, canal, referencia OTA y datos del huesped SOLO para el payload)
 * @param {object[]} p.orders   pedidos leidos por readOdooWindow (con lineIds, lines, invoices)
 * @param {object}  p.extras    lecturas adicionales de readSyncExtras: { orderInfo: Map(id -> {...}), paymentsByOrder: Map(id -> n), lineInfo: Map(id -> {...}) }
 * @param {string}  p.today     fecha de hoy en Bogota (YYYY-MM-DD)
 * @param {object[]} [p.slots]  turnos de la ventana (para comprobar noches libres en cambios de fecha)
 */
export function planSync({ report, bookings, orders, extras, today, slots = [], taxPolicy = TAX_POLICY }) {
  const raw = new Map(bookings.map((b) => [Number(b?.id), b]));
  const orderById = new Map(orders.map((o) => [o.id, { ...o, refs: parseReferences(o.x_pms_reference) }]));
  const ops = [];
  const add = (r, op, status, { guards = [], changes = [], payload = null, preconditions = [], orderId = null } = {}) => {
    ops.push({ smoobuId: r.smoobuId, otaRef: r.otaRef ?? null, unit: r.unit, arrival: r.arrival, departure: r.departure, channelId: r.channelId ?? null,
      verdict: r.verdict, reason: r.reason, op, status, guards: [...new Set(guards)], changes, payload, preconditions, orderId, key: opKey(r.smoobuId, op, payload) });
  };
  const liveOrderOf = (r) => (r.odooOrders ?? []).map((x) => orderById.get(x.id)).filter(ACTIVE_ORDER);

  for (const r of report.perReservation ?? []) {
    const b = raw.get(r.smoobuId) ?? {};
    const source = SOURCE_BY_CHANNEL[r.channelId] ?? null;
    const price = num(b.price);
    const risky = [];
    if ((r.overbookingWith ?? []).length) risky.push(GUARDS.SOBREVENTA);
    if (r.manualReview) risky.push(GUARDS.REVISION_MANUAL);

    switch (r.verdict) {
      case VERDICTS.CANCELLED:
        add(r, OPS.NOOP, STATUS.SIN_CAMBIOS); break;
      case VERDICTS.DAYUSE_OK:
      case VERDICTS.ROOM_MOVED:
        add(r, OPS.NOOP, STATUS.SIN_CAMBIOS, { guards: r.verdict === VERDICTS.DAYUSE_OK ? [GUARDS.USO_DIURNO] : [GUARDS.CAMBIO_DE_HABITACION] }); break;
      case VERDICTS.AMBIGUOUS:
        add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [GUARDS.AMBIGUA, ...risky] }); break;

      case VERDICTS.MISSING_IN_ODOO: {
        const guards = [...risky];
        if (r.smoobuStatus !== 'ACTIVE') { add(r, OPS.NOOP, STATUS.SIN_CAMBIOS); break; }
        if (!PRODUCT_BY_UNIT[r.unit]) guards.push(GUARDS.PRODUCTO_NO_MAPEADO);
        if (!source) guards.push(GUARDS.CANAL_DESCONOCIDO);
        if (price == null || price <= 0) guards.push(GUARDS.PRECIO_FALTANTE);
        if (r.odooOccupancy !== 'NONE') guards.push(GUARDS.NOCHES_OCUPADAS);
        if (guards.length) { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards }); break; }
        const otaRef = normalizeOtaRef(b['reference-id']) ?? r.otaRef ?? null;
        const payload = buildCreatePayload({ smoobuId: r.smoobuId, unit: r.unit, arrival: r.arrival, departure: r.departure, source, otaRef, price,
          guest: { name: b['guest-name'] ?? null, email: b.email ?? null, phone: b.phone ?? null } });
        add(r, OPS.CREATE_ORDER, STATUS.LISTO, {
          changes: ['partner', ...Object.keys(payload.order), ...Object.keys(payload.line).map((k) => `line.${k}`)], payload,
          guards: taxPolicy[source] === 'PENDIENTE' ? [GUARDS.IMPUESTO_PENDIENTE] : [],
          preconditions: ['NINGUN_PEDIDO_CON_SMOOBU_ID', 'NOCHES_LIBRES_EN_LA_HABITACION_Y_CASA', 'RESERVA_SIGUE_VIGENTE_EN_SMOOBU', 'MISMO_PRECIO_Y_FECHAS_EN_SMOOBU'],
        });
        break;
      }

      case VERDICTS.MATCH:
      case VERDICTS.MATCH_DRAFT: {
        const [o] = liveOrderOf(r);
        const info = o ? extras?.orderInfo?.get(o.id) : null;
        if (!o || !info) { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [GUARDS.DATOS_EXTRA_FALTANTES] }); break; }
        const guards = [...risky];
        const invoiced = (o.invoices ?? []).some((i) => i.state === 'posted') || info.qtyInvoiced > 0;
        const lines = (o.lineIds ?? []).map((id) => extras.lineInfo?.get(id)).filter(Boolean);
        if (lines.length !== 1) guards.push(GUARDS.VARIAS_LINEAS);
        const total = num(o.amount_total); const untaxed = num(o.amount_untaxed);
        if (price != null && price > 0 && !near(price, total) && !near(price, untaxed)) guards.push(GUARDS.TARIFA_DISTINTA);
        // relleno de datos que faltan, sin tocar precio_unit, fechas ni habitacion
        const fill = {};
        const ref = referenceFor({ smoobuId: r.smoobuId, source, otaRef: r.otaRef });
        if (!o.refs.smoobu.includes(String(r.smoobuId))) fill.x_pms_reference = ref.x_pms_reference;
        if (!info.client_order_ref) fill.client_order_ref = ref.client_order_ref;
        if (!info.x_booking_source && source) fill.x_booking_source = source;
        if (!info.rental_start_date) fill.rental_start_date = `${r.arrival} ${CHECKIN_UTC}`;
        if (!info.rental_return_date) fill.rental_return_date = `${r.departure} ${CHECKOUT_UTC}`;
        const lineFill = lines.length === 1 && !(num(lines[0].x_precio_manual) > 0) && near(num(lines[0].price_unit), price) ? { lineId: lines[0].id, x_precio_manual: num(lines[0].price_unit) } : null;
        const blockingForFill = guards.filter((g) => g !== GUARDS.IMPUESTO_PENDIENTE);
        if (r.verdict === VERDICTS.MATCH_DRAFT && r.reason === 'CONFIRMADO_SIN_TURNO') { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [GUARDS.SIN_TURNO, ...guards], orderId: o.id }); break; }
        if (Object.keys(fill).length || lineFill) {
          if (blockingForFill.length || invoiced) { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [...guards, ...(invoiced ? [GUARDS.PEDIDO_FACTURADO] : [])], orderId: o.id }); break; }
          const payload = { order: fill, line: lineFill };
          add(r, OPS.UPDATE_ORDER, STATUS.LISTO, { orderId: o.id, payload, changes: [...Object.keys(fill), ...(lineFill ? ['line.x_precio_manual'] : [])],
            preconditions: ['PEDIDO_SIN_CAMBIOS_DESDE_LA_LECTURA (write_date)', 'PRECIO_UNITARIO_IGUAL_AL_DE_SMOOBU'] });
          break;
        }
        if (r.verdict === VERDICTS.MATCH_DRAFT) {
          const g = [...guards]; if (taxPolicy[source] === 'PENDIENTE' || !source) g.push(GUARDS.IMPUESTO_PENDIENTE);
          if (g.some((x) => x !== GUARDS.IMPUESTO_PENDIENTE)) { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: g, orderId: o.id }); break; }
          add(r, OPS.CONFIRM_ORDER, STATUS.REQUIERE_APROBACION, { guards: g, orderId: o.id, changes: ['state'], payload: { action: 'action_confirm' },
            preconditions: ['PRECIO_MANUAL_PROTEGIDO', 'NOCHES_LIBRES_EN_LA_HABITACION_Y_CASA', 'POLITICA_DE_IMPUESTOS_DEFINIDA_O_APROBADA'] });
          break;
        }
        add(r, OPS.NOOP, guards.length ? STATUS.BLOQUEADO : STATUS.SIN_CAMBIOS, { guards, orderId: o.id });
        break;
      }

      case VERDICTS.CONFLICT: {
        const guards = [...risky];
        const [o] = liveOrderOf(r);
        const info = o ? extras?.orderInfo?.get(o.id) : null;
        if (r.reason === 'CANCELADA_EN_SMOOBU_VIGENTE_EN_ODOO') {
          if (!o || !info) { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [GUARDS.DATOS_EXTRA_FALTANTES] }); break; }
          if (r.arrival <= today) guards.push(GUARDS.ESTANCIA_INICIADA);
          if ((o.invoices ?? []).some((i) => i.state === 'posted') || info.qtyInvoiced > 0) guards.push(GUARDS.PEDIDO_FACTURADO);
          if ((extras.paymentsByOrder?.get(o.id) ?? 0) > 0 || info.transactions > 0) guards.push(GUARDS.PAGOS_EXISTENTES);
          add(r, guards.length ? OPS.BLOCKED : OPS.CANCEL_ORDER, guards.length ? STATUS.BLOQUEADO : STATUS.REQUIERE_APROBACION, {
            guards, orderId: o.id, changes: guards.length ? [] : ['state'], payload: guards.length ? null : { action: 'action_cancel', note: 'Cancelada en Smoobu' },
            preconditions: ['RESERVA_SIGUE_CANCELADA_EN_SMOOBU', 'CONFIRMACION_HUMANA_DE_QUE_NO_SE_ALOJO', 'SIN_FACTURAS_NI_PAGOS'] });
          break;
        }
        const map = { HABITACION_DISTINTA: GUARDS.CAMBIO_DE_HABITACION, VIGENTE_EN_SMOOBU_CANCELADA_EN_ODOO: GUARDS.CANCELADA_EN_ODOO_VIGENTE_EN_SMOOBU, ID_SMOOBU_DISTINTO_EN_EL_PEDIDO: GUARDS.ID_DISTINTO, ID_OTA_DISTINTO_EN_EL_PEDIDO: GUARDS.ID_DISTINTO, USO_DIURNO_SIN_TURNO_DAYUSE: GUARDS.USO_DIURNO };
        if (map[r.reason]) { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [map[r.reason], ...guards], orderId: o?.id ?? null }); break; }
        if (r.reason === 'FECHAS_DISTINTAS') {
          if (!o || !info) { add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [GUARDS.DATOS_EXTRA_FALTANTES] }); break; }
          if ((o.invoices ?? []).some((i) => i.state === 'posted') || info.qtyInvoiced > 0) guards.push(GUARDS.PEDIDO_FACTURADO);
          if (dateOnly(o.x_checkin) <= today) guards.push(GUARDS.ESTANCIA_INICIADA);
          const total = num(o.amount_total); const untaxed = num(o.amount_untaxed);
          if (price == null || (!near(price, total) && !near(price, untaxed))) guards.push(GUARDS.TARIFA_DISTINTA);
          {
            // SIEMPRE: las noches nuevas solo pueden estar ocupadas por los turnos del PROPIO pedido
            // (la ocupacion FULL del conciliador no basta: puede deberse al turno de otra reserva)
            const own = new Set(o.lineIds ?? []);
            const foreign = slots.filter((s) => !own.has(m2oId(s.sale_line_id)));
            const probe = (d) => `${addDays(d, 1)} 03:00:00`;
            const nights = []; for (let d = r.arrival; d < r.departure; d = addDays(d, 1)) nights.push(d);
            const roleId = unitForName(r.unit)?.odooRoleId;
            if (roleId && nights.some((d) => foreign.some((s) => m2oId(s.role_id) === roleId && s.start_datetime <= probe(d) && s.end_datetime > probe(d)))) guards.push(GUARDS.NOCHES_OCUPADAS);
          }
          const payload = { order: { x_checkin: r.arrival, x_checkout: r.departure, rental_start_date: `${r.arrival} ${CHECKIN_UTC}`, rental_return_date: `${r.departure} ${CHECKOUT_UTC}` } };
          add(r, guards.length ? OPS.BLOCKED : OPS.UPDATE_ORDER, guards.length ? STATUS.BLOQUEADO : STATUS.REQUIERE_APROBACION, {
            guards, orderId: o.id, payload: guards.length ? null : payload, changes: guards.length ? [] : Object.keys(payload.order),
            preconditions: ['PEDIDO_SIN_CAMBIOS_DESDE_LA_LECTURA (write_date)', 'NOCHES_LIBRES_EN_LA_HABITACION_Y_CASA', 'EL_TURNO_SE_MUEVE_CON_EL_PEDIDO (automatizacion 165)'] });
          break;
        }
        add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [GUARDS.AMBIGUA, ...guards], orderId: o?.id ?? null });
        break;
      }
      default:
        add(r, OPS.BLOCKED, STATUS.BLOQUEADO, { guards: [GUARDS.AMBIGUA] });
    }
  }

  const orphanOrders = (report.ordersNotReturnedBySmoobu ?? []).map((o) => ({ op: OPS.BLOCKED, status: STATUS.BLOQUEADO, guards: [GUARDS.PEDIDO_SIN_RESERVA_EN_SMOOBU], refKinds: o.refKinds }));
  const count = (k) => Object.fromEntries([...new Set(ops.map((o) => o[k]))].sort().map((v) => [v, ops.filter((o) => o[k] === v).length]));
  const guardCounts = {}; for (const o of ops) for (const g of o.guards) guardCounts[g] = (guardCounts[g] ?? 0) + 1;
  return {
    ops, orphanOrders,
    totals: { byOp: count('op'), byStatus: count('status'), guards: guardCounts, orphanOrders: orphanOrders.length },
    safety: { writesEnabled: WRITES_ENABLED, releaseUnlocked: RELEASE_UNLOCKED, applied: 0, mode: 'PLAN_SOLO_LECTURA' },
  };
}

/** Vista PUBLICA del plan: IDs enmascarados, solo nombres de campos (nunca valores, importes, nombres ni contactos). */
export function toPublicPlan(plan) {
  return {
    privacy: { idsMasked: true, payloadValuesPrinted: false, amountsPrinted: false, namesPrinted: false },
    totals: plan.totals,
    ops: plan.ops.map((o) => ({ ref: maskSmoobu(o.smoobuId), ota: maskOta(o.otaRef), unit: o.unit, arrival: o.arrival, departure: o.departure, channelId: o.channelId,
      verdict: o.verdict, op: o.op, status: o.status, guards: o.guards, changes: o.changes, preconditions: o.preconditions, key: o.key })),
    orphanOrders: plan.orphanOrders,
    safety: plan.safety,
  };
}
