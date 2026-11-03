import { ConnectorError } from './errors.mjs';
import { OPS, STATUS, PRODUCT_BY_UNIT, CASA_PRODUCT } from './sync-intent.mjs';
import { applyPlan, ordersWithRef, nightsFree } from './sync-apply.mjs';
import { resolveContact, contactQueries } from './sync-contact.mjs';
import { unitForSmoobuApartment } from './unit-map.mjs';
import { assessBookingAmounts, sameAmounts } from './booking-amounts.mjs';
import { normalizePhoneE164, planGuestContact } from './guest-contact.mjs';
import { RecordingWriter } from './sync-write-client.mjs';
import { pilotWriter, isAdminKey, stateFingerprint, pilotRecoveryRead, selectPilotOp, PILOT_REQUIRED_WRITES } from './sync-pilot.mjs';

/**
 * ATH-DEV-140 — PILOTO AISLADO de contacto asistido por WhatsApp (una reserva elegida por ID). Sin escrituras por defecto.
 *
 * Es independiente de ATH-DEV-118/122 (ese piloto ya se ejecuto el 31/10 y su verificacion «no ejecutado antes» no admite un
 * segundo uso) y de la sincronizacion programada (no lee ni cambia SYNC_ARM, SYNC_DESBLOQUEO ni el bloqueo #101).
 *
 * Reglas:
 *  - Se elige UNA reserva por ID de Smoobu. El plan debe contenerla exactamente una vez; cualquier otra operacion se ignora.
 *  - Antes de escribir (y en la simulacion) se valida: reserva vigente, telefono valido, sin pedido duplicado, llegada futura con
 *    margen (7 dias por defecto), habitacion/fechas/importe coherentes y sin conflicto con otras reservas ni con Casa Completa.
 *  - Los pedidos historicos (p. ej. COT/2026/03847 y 03848) no se tocan: el escritor del piloto solo CREA contacto, pedido y nota,
 *    y la nota solo en el pedido que el mismo creo.
 *  - Tokens propios («-WA-») ligados a la operacion Y al estado actual de la reserva: no sirven los del piloto anterior.
 */
export const PILOT_WA_MIN_LEAD_DAYS = 7;
export const pilotWaApprovalToken = (op, fp) => `APROBADO-PILOTO-WA-${op.key}-${fp}`;
export const pilotWaAdminToken = (op, fp) => `APROBADO-ADMIN-WA-${op.key}-${fp}`;

export function parsePilotSelection(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{6,12}$/.test(s)) throw new ConnectorError('PILOTO_ID_INVALIDO');
  return Number(s);
}

const DAY = 86400000;
export const daysUntil = (today, arrival) => Math.round((Date.parse(`${String(arrival).slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
const overlaps = (a, b) => a.arrival < b.departure && a.departure > b.arrival;
const unitsClash = (u, v) => u === v || u === 'CASA' || v === 'CASA'; // Casa Completa ocupa las cinco habitaciones

/** Otras operaciones del plan (reservas de Smoobu, con o sin pedido) que chocan con la elegida. Las canceladas no cuentan. */
export function planConflicts(plan, op) {
  return plan.ops.filter((o) => o !== op && o.smoobuId !== op.smoobuId && o.op !== OPS.CANCEL_ORDER && o.unit && o.arrival && o.departure
    && unitsClash(o.unit, op.unit) && overlaps(o, op));
}

/** Pedidos de Odoo que chocan con la elegida: misma habitacion, o Casa Completa (cualquier pedido si la elegida es Casa). Incluye borradores. */
export async function odooOrderConflicts(reader, op) {
  const LIMIT = 50;
  const orders = await reader.searchRead('sale.order', [['x_checkin', '<', op.departure], ['x_checkout', '>', op.arrival], ['state', '!=', 'cancel']], ['id', 'x_pms_reference'], { limit: LIMIT });
  if (orders.length >= LIMIT) throw new ConnectorError('PILOTO_CONFLICTOS_LECTURA_INCOMPLETA');
  if (!orders.length) return [];
  if (op.unit === 'CASA') return orders;
  const lines = await reader.searchRead('sale.order.line', [['order_id', 'in', orders.map((o) => o.id)]], ['order_id', 'product_id'], { limit: 200 });
  const pid = (l) => (Array.isArray(l.product_id) ? l.product_id[0] : l.product_id);
  const oid = (l) => (Array.isArray(l.order_id) ? l.order_id[0] : l.order_id);
  const bad = new Set(lines.filter((l) => pid(l) === CASA_PRODUCT || pid(l) === PRODUCT_BY_UNIT[op.unit]).map(oid));
  return orders.filter((o) => bad.has(o.id));
}

/**
 * Lista de verificacion previa, SOLO LECTURAS. Cada control devuelve ok/codigo; cualquiera fallido = no se escribe.
 * @returns {{ok:boolean, checks:{name:string,ok:boolean,code:string|null}[]}}
 */
export async function pilotWaPreflight({ plan, op, fresh, fp, approval, adminApproval, admin, reader, smoobu, selectedId, today, minLeadDays = PILOT_WA_MIN_LEAD_DAYS, writer }) {
  const checks = [];
  const add = (name, ok, code = null) => checks.push({ name, ok: !!ok, code: ok ? null : code });
  add('SELECCION_UNICA', op.smoobuId === selectedId && plan.ops.filter((o) => o.smoobuId === selectedId).length === 1, 'SELECCION_NO_UNICA');
  add('OPERACION_CREAR_LISTA', op.op === OPS.CREATE_ORDER && op.status === STATUS.LISTO, 'OPERACION_NO_LISTA');
  add('TOKEN_GERENCIA_ESTADO_ACTUAL', approval === pilotWaApprovalToken(op, fp), 'TOKEN_NO_CORRESPONDE');
  add('TOKEN_ADMINISTRADOR', !admin || adminApproval === pilotWaAdminToken(op, fp), 'FALTA_TOKEN_ADMIN');
  add('RESERVA_VIGENTE', ['reservation', 'modification of booking'].includes(fresh?.type) && fresh?.['is-blocked-booking'] !== true, 'RESERVA_NO_VIGENTE');
  // telefono: valido en la lectura fresca, igual al del plan, y con enlace de WhatsApp disponible
  const phone = normalizePhoneE164(fresh?.phone);
  const planPhone = normalizePhoneE164(op.payload?.partner?.guest?.phone);
  add('TELEFONO_VALIDO', phone.ok, phone.reason);
  add('TELEFONO_IGUAL_AL_PLAN', phone.ok && planPhone.ok && phone.e164 === planPhone.e164, 'TELEFONO_DISTINTO_AL_PLAN');
  add('ENLACE_WHATSAPP_DISPONIBLE', planGuestContact({ smoobuId: op.smoobuId, guest: op.payload?.partner?.guest, arrival: op.arrival, departure: op.departure }).whatsapp.available, 'SIN_ENLACE_WHATSAPP');
  const lead = daysUntil(today, op.arrival);
  const minLead = Number.isInteger(minLeadDays) && minLeadDays >= 1 ? minLeadDays : PILOT_WA_MIN_LEAD_DAYS;
  add('LLEGADA_FUTURA_CON_MARGEN', lead >= minLead, lead < 1 ? 'LLEGADA_NO_FUTURA' : 'LLEGADA_MENOR_AL_MARGEN');
  add('HABITACION', unitForSmoobuApartment(fresh?.apartment?.id)?.unit === op.unit, 'HABITACION_DISTINTA');
  add('FECHAS', String(fresh?.arrival).slice(0, 10) === op.arrival && String(fresh?.departure).slice(0, 10) === op.departure, 'FECHAS_DISTINTAS');
  const total = op.payload.lines.reduce((a, l) => a + (l.price_unit ?? NaN), 0);
  let amountOk = total > 0 && op.payload.lines.every((l) => l.price_unit === l.x_precio_manual);
  if (amountOk && op.payload.amounts) { // Booking: total del huesped (base + impuestos), releido y comparado con el plan
    const elements = typeof smoobu.getPriceElements === 'function' ? await smoobu.getPriceElements(op.smoobuId) : null;
    const a = assessBookingAmounts({ booking: fresh, elements });
    amountOk = a.ok && sameAmounts(a, { ok: true, ...op.payload.amounts }) && Math.abs(a.total - total) < 0.005;
  } else if (amountOk) amountOk = Math.abs(Number(fresh?.price) - total) <= 1;
  add('IMPORTE_COHERENTE', amountOk, 'IMPORTE_DISTINTO');
  add('SIN_PEDIDO_DUPLICADO', (await ordersWithRef(reader, op.smoobuId)).filter((o) => o.state !== 'cancel').length === 0, 'PEDIDO_YA_EXISTE');
  add('SIN_CONFLICTO_EN_EL_PLAN', planConflicts(plan, op).length === 0, 'CONFLICTO_CON_OTRA_RESERVA');
  add('SIN_CONFLICTO_EN_ODOO_NI_CASA', (await odooOrderConflicts(reader, op)).length === 0, 'CONFLICTO_CON_PEDIDO_O_CASA');
  add('DISPONIBILIDAD', await nightsFree(reader, op.unit, op.arrival, op.departure), 'NOCHES_OCUPADAS');
  const q = contactQueries({ smoobuId: op.smoobuId, guest: op.payload.partner.guest });
  const read = async (d) => (d ? reader.searchRead('res.partner', d, ['id', 'name', 'email', 'phone', 'ref'], { limit: 200 }) : []);
  const c = resolveContact({ smoobuId: op.smoobuId, guest: op.payload.partner.guest, candidates: { byRef: await read(q.byRef), byEmail: await read(q.byEmail), byPhone: await read(q.byPhone), byName: await read(q.byName) } });
  add('IDENTIDAD_CONTACTO', !c.block, c.block);
  const remaining = (writer?.maxWrites ?? Infinity) - (writer?.writes ?? 0);
  add('LIMITE_3_ESCRITURAS', remaining >= PILOT_REQUIRED_WRITES && (writer?.maxWrites ?? PILOT_REQUIRED_WRITES) <= PILOT_REQUIRED_WRITES, 'PRESUPUESTO_INCORRECTO');
  return { ok: checks.every((x) => x.ok), checks, contact: c.action ?? null };
}

/** Escritor de simulacion: como RecordingWriter, pero conserva EN MEMORIA la nota para comprobarla (nunca se imprime). */
export class ShadowWaWriter extends RecordingWriter {
  constructor(opts) { super(opts); this.noteBody = null; }
  async execute(model, method, params) {
    const r = await super.execute(model, method, params);
    if (model === 'sale.order' && method === 'message_post') this.noteBody = params.body;
    return r;
  }
  /** Hechos de la nota SIN datos personales: una ancla, host wa.me, coincidencia de cifras con el telefono esperado, HTML activado. */
  noteFacts(expectedPhone) {
    const body = String(this.noteBody ?? '');
    const anchors = [...body.matchAll(/<a href="(https:\/\/wa\.me\/(\d{8,15})\?text=[A-Za-z0-9%._~-]*)"/g)];
    return { present: !!this.noteBody, anchors: anchors.length, host: anchors.length ? 'wa.me' : null, phoneMatches: anchors.length === 1 && `+${anchors[0][2]}` === normalizePhoneE164(expectedPhone).e164, internalNote: /^ATH-SYNC \| clave /.test(body) };
  }
}

/**
 * Ejecuta el piloto aislado (simulacion con ShadowWaWriter, o real con PilotWaWriteClient, hoy desarmado).
 * Orden: estado fresco -> token ligado al estado -> aprobacion de administrador -> presupuesto -> recuperacion por lectura ->
 * verificacion previa completa -> applyPlan con UNA operacion y el escritor limitado al piloto.
 */
export async function runPilotWa({ plan, smoobuId, approval, adminApproval = null, reader, writer, smoobu, journal, lock, today, minLeadDays = PILOT_WA_MIN_LEAD_DAYS }) {
  const selectedId = parsePilotSelection(smoobuId);
  if (writer?.armed === false) return { halted: 'PILOTO_DESACTIVADO', results: [], writes: 0 };
  const fresh = await smoobu.getReservation(selectedId);
  const fp = stateFingerprint(fresh);
  const halt = (code, extra = {}) => ({ halted: code, results: [], writes: 0, fingerprint: fp, ...extra });
  const matches = plan.ops.filter((o) => o.smoobuId === selectedId);
  if (matches.length !== 1) return halt('PILOTO_RESERVA_NO_UNICA_EN_EL_PLAN');
  const candidate = matches[0];
  if (approval !== pilotWaApprovalToken(candidate, fp)) return halt('PILOTO_TOKEN_NO_CORRESPONDE_AL_ESTADO_ACTUAL');
  const op = selectPilotOp(plan, { smoobuId: selectedId, approvedKey: candidate.key });
  const who = await isAdminKey(reader);
  const admin = who === true || who.admin;
  if (admin && adminApproval !== pilotWaAdminToken(op, fp)) return halt('PILOTO_REQUIERE_APROBACION_ADMIN', { admin: true });
  if ((writer.maxWrites ?? Infinity) - (writer.writes ?? 0) < PILOT_REQUIRED_WRITES) return halt('PILOTO_PRESUPUESTO_INSUFICIENTE', { admin });
  const prior = await pilotRecoveryRead({ op, reader });
  if (prior.found >= 1) return halt(prior.found === 1 ? 'PILOTO_YA_APLICADO_VERIFICADO_POR_LECTURA' : 'PILOTO_DUPLICADO_DETECTADO', { admin, recovery: prior });
  const pre = await pilotWaPreflight({ plan, op, fresh, fp, approval, adminApproval, admin, reader, smoobu, selectedId, today, minLeadDays, writer });
  if (!pre.ok) return halt('PILOTO_VERIFICACION_PREVIA_FALLIDA', { admin, checks: pre.checks });
  const res = await applyPlan({ plan: { ops: [op] }, reader, writer: pilotWriter(writer), smoobu, journal, lock, approvals: new Set([op.key]), maxOps: 1, today });
  return { ...res, admin, fingerprint: fp, checks: pre.checks };
}
