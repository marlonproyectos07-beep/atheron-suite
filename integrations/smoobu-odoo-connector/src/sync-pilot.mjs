import { createHash } from 'node:crypto';
import { ConnectorError } from './errors.mjs';
import { OPS, STATUS } from './sync-intent.mjs';
import { applyPlan, ordersWithRef, nightsFree } from './sync-apply.mjs';
import { resolveContact, contactQueries } from './sync-contact.mjs';
import { unitForSmoobuApartment } from './unit-map.mjs';
import { validateWrite } from './sync-write-guard.mjs';

/**
 * ATH-DEV-118 — PILOTO controlado: UNA reserva, crear contacto (si hace falta) y pedido en BORRADOR. Nada mas.
 *  - Seleccion: exactamente una operacion CREATE_ORDER, en estado LISTO, del ID de Smoobu indicado y con la clave aprobada.
 *  - Escritor del piloto: solo `res.partner.create`, `sale.order.create` y la nota interna; tope de 3 escrituras.
 *    Nunca confirma, cancela, modifica, factura ni cobra (ademas de la lista blanca general).
 *  - Administrador: si la clave con la que se ejecuta pertenece a un usuario con "Administrador del sistema", el piloto
 *    exige una SEGUNDA aprobacion ligada a esa operacion (`PILOT_ADMIN_APPROVAL` = adminApprovalToken(op)).
 * Las escrituras siguen desactivadas: sin las tres llaves del cliente real, el piloto solo puede ejecutarse con el escritor
 * de simulacion.
 */
export const PILOT_METHODS = Object.freeze(new Set(['res.partner.create', 'sale.order.create', 'sale.order.message_post']));
export const PILOT_MAX_WRITES = 3;
/**
 * ATH-DEV-122 — Huella del ESTADO ACTUAL de la reserva en Smoobu (lectura fresca). Cualquier cambio en tipo, habitacion,
 * fechas, precio, personas, canal, referencia OTA, datos del huesped o fecha de modificacion la cambia.
 */
export function stateFingerprint(b) {
  const pick = ['id', 'type', 'arrival', 'departure', 'price', 'adults', 'children', 'reference-id', 'guest-name', 'email', 'phone', 'modifiedAt', 'modified-at', 'updated-at'];
  const v = Object.fromEntries(pick.map((k) => [k, b?.[k] ?? null]));
  v.apartment = b?.apartment?.id ?? null; v.channel = b?.channel?.id ?? null;
  return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12);
}
/** Tokens del piloto: operacion (clave del plan) + estado actual de la reserva. Sin IDs ni datos personales. */
export const pilotApprovalToken = (op, fp) => `APROBADO-PILOTO-${op.key}-${fp}`;
export const adminApprovalToken = (op, fp) => `APROBADO-ADMIN-${op.key}-${fp}`;
/** Escrituras que necesita UNA creacion completa: contacto (si no existe) + pedido + nota. */
export const PILOT_REQUIRED_WRITES = 3;
/** Reserva piloto acordada (ATH-DEV-121): Airbnb, habitacion 302, 14/01/2027. Se identifica por sufijo + habitacion + fecha. */
export const PILOT_TARGET = Object.freeze({ suffix: '7631', unit: '302', arrival: '2027-01-14', departure: '2027-01-15', channelId: 7208051 });

/** Localiza la reserva piloto en el plan SIN pasar el ID completo por la ejecucion (repositorio publico). Debe ser unica. */
export function findPilotTarget(plan, t = PILOT_TARGET) {
  const hits = plan.ops.filter((o) => String(o.smoobuId).endsWith(t.suffix) && o.unit === t.unit && o.arrival === t.arrival && o.departure === t.departure && (t.channelId == null || o.channelId === t.channelId));
  if (hits.length !== 1) throw new ConnectorError('PILOTO_RESERVA_NO_UNICA');
  return hits[0];
}

export function selectPilotOp(plan, { smoobuId, approvedKey }) {
  const candidates = plan.ops.filter((o) => o.smoobuId === Number(smoobuId));
  if (candidates.length !== 1) throw new ConnectorError('PILOTO_RESERVA_NO_UNICA');
  const op = candidates[0];
  if (op.op !== OPS.CREATE_ORDER) throw new ConnectorError('PILOTO_SOLO_CREAR');
  if (op.status !== STATUS.LISTO) throw new ConnectorError('PILOTO_OPERACION_NO_LISTA');
  if (approvedKey !== op.key) throw new ConnectorError('PILOTO_CLAVE_NO_APROBADA');
  return op;
}

/** Envuelve el escritor: solo los tres metodos del piloto y como mucho 3 escrituras. */
export function pilotWriter(inner) {
  let n = 0;
  return {
    get writes() { return inner.writes ?? n; }, simulated: inner.simulated === true,
    async execute(model, method, params) {
      if (!PILOT_METHODS.has(`${model}.${method}`)) throw new ConnectorError('SYNC_WRITE_PILOT_METHOD_FORBIDDEN');
      validateWrite(model, method, params);
      if (n >= PILOT_MAX_WRITES) throw new ConnectorError('SYNC_WRITE_PILOT_BUDGET');
      n += 1;
      return inner.execute(model, method, params);
    },
  };
}

/** ¿La clave de API pertenece a un administrador del sistema? Solo lecturas (context_get, ir.model.data, res.users). */
export async function isAdminKey(reader) {
  const ctx = await reader.call('res.users', 'context_get', {});
  const uid = ctx?.uid;
  if (!Number.isInteger(uid)) throw new ConnectorError('PILOTO_USUARIO_DESCONOCIDO');
  const [xml] = await reader.searchRead('ir.model.data', [['module', '=', 'base'], ['name', '=', 'group_system'], ['model', '=', 'res.groups']], ['res_id'], { limit: 1 });
  if (!xml) throw new ConnectorError('PILOTO_GRUPO_ADMIN_DESCONOCIDO');
  const f = await reader.fieldsGet('res.users', ['type']);
  const groupField = f.group_ids ? 'group_ids' : (f.groups_id ? 'groups_id' : null); // Odoo 19 renombro groups_id
  if (!groupField) return true; // sin poder comprobarlo, se trata como administrador (lo mas restrictivo)
  const [u] = await reader.searchRead('res.users', [['id', '=', uid]], [groupField], { limit: 1 });
  return { admin: !u || (u[groupField] ?? []).includes(xml.res_id), uid };
}

/**
 * Ejecuta el piloto. Orden: estado fresco de la reserva -> token de gerencia ligado a ese estado -> si la clave es de
 * administrador, segundo token ligado al mismo estado -> presupuesto suficiente para la operacion COMPLETA -> applyPlan.
 */
/** Nota que deja la sincronizacion en cada pedido que crea; su existencia en Odoo significa "piloto ya ejecutado". */
export const SYNC_NOTE_MARK = 'ATH-SYNC | clave';

/**
 * ATH-DEV-123 — Lista de verificacion previa a escribir, SOLO LECTURAS. Cada control devuelve ok/codigo.
 * Se usa en la simulacion (se publica) y dentro de runPilot (cualquier control fallido = no se escribe).
 */
export async function pilotPreflight({ op, fresh, fp, approval, adminApproval, admin, reader, writer }) {
  const checks = [];
  const add = (name, ok, code = null) => checks.push({ name, ok: !!ok, code: ok ? null : code });
  add('TOKEN_GERENCIA_ESTADO_ACTUAL', approval === pilotApprovalToken(op, fp), 'TOKEN_NO_CORRESPONDE');
  add('TOKEN_ADMINISTRADOR', !admin || adminApproval === adminApprovalToken(op, fp), 'FALTA_TOKEN_ADMIN');
  add('RESERVA_VIGENTE', fresh?.type !== 'cancellation' && fresh?.type !== 'OverBooking', 'RESERVA_NO_VIGENTE');
  add('HABITACION', unitForSmoobuApartment(fresh?.apartment?.id)?.unit === op.unit, 'HABITACION_DISTINTA');
  add('FECHAS', String(fresh?.arrival).slice(0, 10) === op.arrival && String(fresh?.departure).slice(0, 10) === op.departure, 'FECHAS_DISTINTAS');
  const total = op.payload.lines.reduce((a, l) => a + (l.price_unit ?? NaN), 0);
  add('PRECIO_EXACTO', Math.abs(Number(fresh?.price) - total) <= 1 && op.payload.lines.every((l) => l.price_unit === l.x_precio_manual), 'PRECIO_DISTINTO');
  const dup = (await ordersWithRef(reader, op.smoobuId)).filter((o) => o.state !== 'cancel');
  add('SIN_PEDIDO_DUPLICADO', dup.length === 0, 'PEDIDO_YA_EXISTE');
  const marks = await reader.searchRead('mail.message', [['model', '=', 'sale.order'], ['body', 'ilike', SYNC_NOTE_MARK]], ['id'], { limit: 1 });
  add('PILOTO_NO_EJECUTADO_ANTES', marks.length === 0, 'PILOTO_YA_EJECUTADO');
  add('DISPONIBILIDAD', await nightsFree(reader, op.unit, op.arrival, op.departure), 'NOCHES_OCUPADAS');
  const q = contactQueries({ smoobuId: op.smoobuId, guest: op.payload.partner.guest });
  const read = async (d) => (d ? reader.searchRead('res.partner', d, ['id', 'name', 'email', 'phone', 'ref'], { limit: 200 }) : []);
  const c = resolveContact({ smoobuId: op.smoobuId, guest: op.payload.partner.guest, candidates: { byRef: await read(q.byRef), byEmail: await read(q.byEmail), byPhone: await read(q.byPhone), byName: await read(q.byName) } });
  add('IDENTIDAD_CONTACTO', !c.block, c.block);
  const remaining = (writer?.maxWrites ?? Infinity) - (writer?.writes ?? 0);
  add('LIMITE_3_ESCRITURAS', remaining >= PILOT_REQUIRED_WRITES && (writer?.maxWrites ?? PILOT_REQUIRED_WRITES) <= PILOT_REQUIRED_WRITES, 'PRESUPUESTO_INCORRECTO');
  return { ok: checks.every((x) => x.ok), checks, contact: c.action ?? null };
}

/** Recuperacion por LECTURA: si el pedido ya existe (p. ej. tras un fallo parcial), se verifica y se informa; nunca se recrea. */
export async function pilotRecoveryRead({ op, reader }) {
  const live = (await ordersWithRef(reader, op.smoobuId)).filter((o) => o.state !== 'cancel');
  if (live.length !== 1) return { found: live.length };
  const [o] = live;
  const lines = await reader.searchRead('sale.order.line', [['order_id', '=', o.id]], ['product_id', 'price_unit', 'x_precio_manual', 'tax_ids'], { limit: 10 });
  const exp = op.payload.lines[0];
  const linesOk = lines.length === 1 && (Array.isArray(lines[0].product_id) ? lines[0].product_id[0] : lines[0].product_id) === exp.product_id
    && lines[0].price_unit === exp.price_unit && lines[0].x_precio_manual === exp.price_unit && (lines[0].tax_ids ?? []).length === 0;
  const note = await reader.searchRead('mail.message', [['model', '=', 'sale.order'], ['res_id', '=', o.id], ['body', 'ilike', SYNC_NOTE_MARK]], ['id'], { limit: 1 });
  return { found: 1, state: o.state, linesOk, noteOk: note.length === 1 };
}

export async function runPilot({ plan, smoobuId, approval, adminApproval = null, reader, writer, smoobu, journal, lock, today }) {
  // cliente real desarmado: se para ANTES de cualquier lectura o anotacion en la bitacora
  if (writer?.armed === false) return { halted: 'PILOTO_DESACTIVADO', results: [], writes: 0 };
  const fresh = await smoobu.getReservation(Number(smoobuId));
  const fp = stateFingerprint(fresh);
  const halt = (code, extra = {}) => ({ halted: code, results: [], writes: 0, fingerprint: fp, ...extra });
  const candidate = plan.ops.find((o) => o.smoobuId === Number(smoobuId));
  if (!candidate || approval !== pilotApprovalToken(candidate, fp)) return halt('PILOTO_TOKEN_NO_CORRESPONDE_AL_ESTADO_ACTUAL');
  const op = selectPilotOp(plan, { smoobuId, approvedKey: candidate.key });
  const who = await isAdminKey(reader);
  const admin = who === true || who.admin;
  if (admin && adminApproval !== adminApprovalToken(op, fp)) return halt('PILOTO_REQUIERE_APROBACION_ADMIN', { admin: true });
  // presupuesto: nunca empezar una operacion que no se pueda terminar (contacto + pedido + nota)
  const remaining = (writer.maxWrites ?? Infinity) - (writer.writes ?? 0);
  if (remaining < PILOT_REQUIRED_WRITES) return halt('PILOTO_PRESUPUESTO_INSUFICIENTE', { admin });
  // si el pedido ya existe: recuperacion por lectura, sin escribir (cubre un fallo parcial de una ejecucion anterior)
  const prior = await pilotRecoveryRead({ op, reader });
  if (prior.found >= 1) return halt(prior.found === 1 ? 'PILOTO_YA_APLICADO_VERIFICADO_POR_LECTURA' : 'PILOTO_DUPLICADO_DETECTADO', { admin, recovery: prior });
  const pre = await pilotPreflight({ op, fresh, fp, approval, adminApproval, admin, reader, writer });
  if (!pre.ok) return halt('PILOTO_VERIFICACION_PREVIA_FALLIDA', { admin, checks: pre.checks });
  const res = await applyPlan({ plan: { ops: [op] }, reader, writer: pilotWriter(writer), smoobu, journal, lock, approvals: new Set([op.key]), maxOps: 1, today });
  return { ...res, admin, fingerprint: fp };
}
