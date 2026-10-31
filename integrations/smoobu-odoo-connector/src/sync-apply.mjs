import { ConnectorError } from './errors.mjs';
import { OPS, STATUS, GUARDS, CASA_UNITS } from './sync-intent.mjs';
import { parseReferences } from './reference-parse.mjs';
import { unitForName, unitForSmoobuApartment } from './unit-map.mjs';
import { PHASES } from './sync-journal.mjs';
import { resolveContact, contactQueries } from './sync-contact.mjs';
import { assessBookingAmounts, sameAmounts, amountsNote, BOOKING_SOURCE } from './booking-amounts.mjs';

/**
 * ATH-DEV-116 — EJECUTOR de un plan de sincronizacion. Orden fijo por operacion:
 *   1. elegibilidad (LISTO, o REQUIERE_APROBACION con la clave aprobada; nunca BLOQUEADO)
 *   2. idempotencia (diario: clave ya aplicada -> se salta)
 *   3. PREVALIDACION con lecturas frescas de Smoobu y Odoo (si algo cambio desde el plan, no se escribe)
 *   4. diario INTENT -> escrituras por la lista blanca -> POSTVALIDACION por lectura -> diario DONE
 * Paradas: cerrojo ocupado, interruptor de parada, operacion incompleta sin resolver, resultado ambiguo (red caida
 * durante una escritura) o postvalidacion fallida. Un fallo de PREvalidacion solo salta esa operacion.
 * Recuperacion: al empezar, cada entrada INTENT/AMBIGUOUS/VERIFY_FAILED del diario se resuelve LEYENDO Odoo; si no se puede
 * decidir (o hay duplicados), la ejecucion se detiene y pide revision manual. Nunca borra nada para "deshacer".
 */
export const RESULT = Object.freeze({ APLICADA: 'APLICADA', SIMULADA: 'SIMULADA', YA_APLICADA: 'YA_APLICADA', NO_ELEGIBLE: 'NO_ELEGIBLE', PRECONDICION_FALLIDA: 'PRECONDICION_FALLIDA', RECHAZADA_POR_ODOO: 'RECHAZADA_POR_ODOO', AMBIGUA: 'AMBIGUA', VERIFICACION_FALLIDA: 'VERIFICACION_FALLIDA', NO_PROCESADA: 'NO_PROCESADA' });
export const DEFAULT_MAX_OPS = 3;
const SLOT_START = '20:00:00'; const SLOT_END = '16:00:00';
const m2oId = (v) => (Array.isArray(v) ? v[0] : (v ?? null));
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1;
class Precondition extends Error { constructor(code) { super(code); this.code = code; } }
const need = (cond, code) => { if (!cond) throw new Precondition(code); };
const rolesFor = (unit) => (unit === 'CASA' ? [...CASA_UNITS, 'CASA'] : [unit]).map((u) => unitForName(u).odooRoleId);
const note = (op, extra = '') => `ATH-SYNC | clave ${op.key} | SMOOBU-${op.smoobuId} | ${op.op}${extra}`;

export async function ordersWithRef(reader, smoobuId) {
  const rows = await reader.searchRead('sale.order', [['x_pms_reference', 'ilike', `SMOOBU-${smoobuId}`]], ['id', 'state', 'x_pms_reference'], { limit: 20 });
  return rows.filter((o) => parseReferences(o.x_pms_reference).smoobu.includes(String(smoobuId)));
}
async function readOrder(reader, id) {
  const [o] = await reader.searchRead('sale.order', [['id', '=', id]], ['id', 'state', 'write_date', 'partner_id', 'x_pms_reference', 'client_order_ref', 'x_booking_source', 'x_checkin', 'x_checkout', 'rental_start_date', 'rental_return_date', 'invoice_ids', 'order_line'], { limit: 1 });
  if (!o) throw new Precondition('PEDIDO_NO_ENCONTRADO');
  const lines = await reader.searchRead('sale.order.line', [['order_id', '=', id]], ['id', 'product_id', 'price_unit', 'x_precio_manual', 'qty_invoiced', 'tax_ids'], { limit: 20 });
  const invoices = (o.invoice_ids ?? []).length ? await reader.searchRead('account.move', [['id', 'in', o.invoice_ids]], ['id', 'state'], { limit: 50 }) : [];
  return { ...o, lines, invoices };
}
const invoiced = (o) => o.invoices.some((i) => i.state === 'posted') || o.lines.some((l) => Number(l.qty_invoiced) > 0);
export async function nightsFree(reader, unit, arrival, departure, excludeLineIds = []) {
  const domain = [['role_id', 'in', rolesFor(unit)], ['start_datetime', '<', `${departure} ${SLOT_END}`], ['end_datetime', '>', `${arrival} ${SLOT_START}`]];
  const slots = await reader.searchRead('planning.slot', domain, ['id', 'sale_line_id'], { limit: 50 });
  return slots.filter((s) => !excludeLineIds.includes(m2oId(s.sale_line_id))).length === 0;
}
async function smoobuStillMatches(smoobu, op, { expectCancelled = false } = {}) {
  const b = await smoobu.getReservation(op.smoobuId);
  const cancelled = b?.type === 'cancellation';
  if (expectCancelled) return need(cancelled, 'RESERVA_YA_NO_ESTA_CANCELADA_EN_SMOOBU');
  need(!cancelled, 'RESERVA_CANCELADA_EN_SMOOBU');
  // ATH-DEV-128: solo reservas vigentes de huesped; sobreventa, bloqueo de calendario o tipo desconocido = no se escribe
  need(['reservation', 'modification of booking'].includes(b?.type) && b?.['is-blocked-booking'] !== true, 'ESTADO_NO_VALIDO_EN_SMOOBU');
  if (op.channelId != null && b?.channel?.id != null) need(Number(b.channel.id) === Number(op.channelId), 'CANAL_CAMBIO_EN_SMOOBU');
  const guestName = op.payload?.partner?.guest?.name;
  if (guestName != null && b?.['guest-name'] != null) need(String(b['guest-name']).trim() === String(guestName).trim(), 'HUESPED_CAMBIO_EN_SMOOBU');
  need(unitForSmoobuApartment(b?.apartment?.id)?.unit === op.unit, 'HABITACION_CAMBIO_EN_SMOOBU');
  need(String(b?.arrival).slice(0, 10) === op.arrival && String(b?.departure).slice(0, 10) === op.departure, 'FECHAS_CAMBIARON_EN_SMOOBU');
  return b;
}

/* ---------------- operaciones ---------------- */

const HANDLERS = {
  async [OPS.CREATE_ORDER]({ op, reader, writer, smoobu, approved }) {
    const steps = [];
    const prevalidate = async () => {
      need(!(await ordersWithRef(reader, op.smoobuId)).some((o) => o.state !== 'cancel'), 'PEDIDO_YA_EXISTE');
      const b = await smoobuStillMatches(smoobu, op);
      const total = op.payload.lines.reduce((a, l) => a + (l.price_unit ?? NaN), 0);
      need(op.payload.lines.every((l) => typeof l.price_unit === 'number' && l.price_unit > 0), 'PRECIO_DE_LINEA_SIN_DEFINIR');
      if (op.payload.order?.x_booking_source === BOOKING_SOURCE || op.payload.amounts) {
        // ATH-DEV-137: Booking = TOTAL aceptado por el huesped. Se vuelve a leer el desglose y debe ser IDENTICO al planificado.
        need(!!op.payload.amounts, 'TOTAL_NO_FIABLE');
        const elements = typeof smoobu.getPriceElements === 'function' ? await smoobu.getPriceElements(op.smoobuId) : null;
        const fresh = assessBookingAmounts({ booking: b, elements });
        need(fresh.ok, fresh.block ?? 'TOTAL_NO_FIABLE');
        need(sameAmounts(fresh, { ok: true, ...op.payload.amounts }), 'IMPORTES_CAMBIARON_EN_SMOOBU');
        need(Math.abs(fresh.total - total) < 0.005, 'PRECIO_CAMBIO_EN_SMOOBU');
      } else {
        need(Math.abs(Number(b.price) - total) < 0.005, 'PRECIO_CAMBIO_EN_SMOOBU'); // ATH-DEV-128: precio EXACTO
      }
      need(await nightsFree(reader, op.unit, op.arrival, op.departure), 'NOCHES_OCUPADAS_EN_ODOO');
      // contactos: lecturas frescas por ref de Smoobu, correo, telefono y nombre; nunca se adivina una identidad
      const q = contactQueries({ smoobuId: op.smoobuId, guest: op.payload.partner.guest });
      const LIMIT = 200;
      const read = async (domain) => {
        if (!domain) return [];
        const rows = await reader.searchRead('res.partner', domain, ['id', 'name', 'email', 'phone', 'ref'], { limit: LIMIT });
        need(rows.length < LIMIT, 'CONTACTO_BUSQUEDA_INCOMPLETA'); // lectura truncada = no se puede descartar un duplicado
        return rows;
      };
      const candidates = { byRef: await read(q.byRef), byEmail: await read(q.byEmail), byPhone: await read(q.byPhone), byName: await read(q.byName) };
      const c = resolveContact({ smoobuId: op.smoobuId, guest: op.payload.partner.guest, candidates });
      need(!c.block, c.block);
      return c.action === 'REUSE' ? { partnerId: c.partnerId } : { partnerId: null, createVals: c.vals };
    };
    const execute = async ({ partnerId, createVals }) => {
      let pid = partnerId;
      if (!pid) { [pid] = await writer.execute('res.partner', 'create', { vals_list: [createVals] }); steps.push('partner.create'); }
      const vals = { partner_id: pid, ...op.payload.order, order_line: op.payload.lines.map((l) => [0, 0, { ...l, tax_ids: [[6, 0, []]] }]) };
      const [orderId] = await writer.execute('sale.order', 'create', { vals_list: [vals] }); steps.push('sale.order.create');
      await writer.execute('sale.order', 'message_post', { ids: [orderId], body: note(op, op.payload.amounts ? amountsNote(op.payload.amounts) : ''), message_type: 'comment', subtype_xmlid: 'mail.mt_note' }); steps.push('note');
      return { orderId, partnerId: pid, steps };
    };
    const verify = async ({ orderId }) => {
      const same = await ordersWithRef(reader, op.smoobuId);
      need(same.filter((o) => o.state !== 'cancel').length === 1 && same[0].id === orderId, 'VERIFICACION_DUPLICADO_O_AUSENTE');
      const o = await readOrder(reader, orderId);
      need(o.state === 'draft', 'VERIFICACION_ESTADO');
      need(o.lines.length === op.payload.lines.length, 'VERIFICACION_LINEAS');
      for (const exp of op.payload.lines) {
        const l = o.lines.find((x) => m2oId(x.product_id) === exp.product_id);
        need(l && near(l.price_unit, exp.price_unit) && near(l.x_precio_manual, exp.price_unit) && (l.tax_ids ?? []).length === 0, 'VERIFICACION_PRECIO_O_IMPUESTO');
      }
    };
    return { prevalidate, execute, verify, steps };
  },

  async [OPS.UPDATE_ORDER]({ op, reader, writer }) {
    const steps = [];
    const prevalidate = async () => {
      const o = await readOrder(reader, op.orderId);
      need(!op.snapshot?.writeDate || o.write_date === op.snapshot.writeDate, 'PEDIDO_MODIFICADO_DESDE_EL_PLAN');
      need(o.state !== 'cancel', 'PEDIDO_CANCELADO');
      need(!invoiced(o), 'PEDIDO_FACTURADO');
      if (op.payload.order?.x_pms_reference) need(!o.x_pms_reference, 'REFERENCIA_YA_ESCRITA');
      if (op.payload.order?.x_checkin) need(await nightsFree(reader, op.unit, op.payload.order.x_checkin, op.payload.order.x_checkout, o.lines.map((l) => l.id)), 'NOCHES_OCUPADAS_EN_ODOO');
      if (op.payload.line) { const l = o.lines.find((x) => x.id === op.payload.line.lineId); need(l && near(l.price_unit, op.payload.line.x_precio_manual) && !(l.x_precio_manual > 0), 'PRECIO_DE_LINEA_CAMBIO'); }
      return { prices: o.lines.map((l) => [l.id, l.price_unit]) };
    };
    const execute = async (pre) => {
      if (op.payload.order && Object.keys(op.payload.order).length) { await writer.execute('sale.order', 'write', { ids: [op.orderId], vals: op.payload.order }); steps.push('sale.order.write'); }
      if (op.payload.line) { await writer.execute('sale.order.line', 'write', { ids: [op.payload.line.lineId], vals: { x_precio_manual: op.payload.line.x_precio_manual } }); steps.push('sale.order.line.write'); }
      await writer.execute('sale.order', 'message_post', { ids: [op.orderId], body: note(op, ` | campos ${op.changes.join(',')}`), message_type: 'comment', subtype_xmlid: 'mail.mt_note' }); steps.push('note');
      return { orderId: op.orderId, prices: pre.prices, steps };
    };
    const verify = async ({ prices }) => {
      const o = await readOrder(reader, op.orderId);
      for (const [k, v] of Object.entries(op.payload.order ?? {})) need(String(o[k] ?? '').slice(0, 19) === String(v).slice(0, 19), 'VERIFICACION_CAMPO');
      for (const [id, p] of prices) need(near(o.lines.find((l) => l.id === id)?.price_unit, p), 'VERIFICACION_PRECIO_ALTERADO');
      if (op.payload.line) need(near(o.lines.find((l) => l.id === op.payload.line.lineId)?.x_precio_manual, op.payload.line.x_precio_manual), 'VERIFICACION_PRECIO_MANUAL');
    };
    return { prevalidate, execute, verify, steps };
  },

  async [OPS.CONFIRM_ORDER]({ op, reader, writer }) {
    const steps = [];
    const prevalidate = async () => {
      need(!op.guards.includes(GUARDS.IMPUESTO_PENDIENTE), 'IVA_NO_VALIDADO');
      const o = await readOrder(reader, op.orderId);
      need(o.state === 'draft' || o.state === 'sent', 'PEDIDO_NO_ESTA_EN_BORRADOR');
      need(!op.snapshot?.writeDate || o.write_date === op.snapshot.writeDate, 'PEDIDO_MODIFICADO_DESDE_EL_PLAN');
      need(o.lines.length && o.lines.every((l) => l.x_precio_manual > 0 && near(l.x_precio_manual, l.price_unit)), 'PRECIO_MANUAL_NO_PROTEGIDO');
      need(await nightsFree(reader, op.unit, op.arrival, op.departure, o.lines.map((l) => l.id)), 'NOCHES_OCUPADAS_EN_ODOO');
      return { prices: o.lines.map((l) => [l.id, l.price_unit]) };
    };
    const execute = async (pre) => {
      await writer.execute('sale.order', 'action_confirm', { ids: [op.orderId] }); steps.push('action_confirm');
      await writer.execute('sale.order', 'message_post', { ids: [op.orderId], body: note(op), message_type: 'comment', subtype_xmlid: 'mail.mt_note' }); steps.push('note');
      return { orderId: op.orderId, prices: pre.prices, steps };
    };
    const verify = async ({ prices }) => {
      const o = await readOrder(reader, op.orderId);
      need(o.state === 'sale', 'VERIFICACION_ESTADO');
      for (const [id, p] of prices) need(near(o.lines.find((l) => l.id === id)?.price_unit, p), 'VERIFICACION_TARIFA_SOBRESCRITA');
      const slots = await reader.searchRead('planning.slot', [['sale_line_id', 'in', o.lines.map((l) => l.id)]], ['id'], { limit: 50 });
      need(slots.length >= 1, 'VERIFICACION_SIN_TURNO');
      if (op.unit === 'CASA') {
        // Casa Completa: Odoo debe haber bloqueado las cinco habitaciones fisicas a partir del turno de Casa (automatizacion 167)
        const rooms = CASA_UNITS.map((u) => unitForName(u).odooRoleId);
        const blocks = await reader.searchRead('planning.slot', [['role_id', 'in', rooms], ['x_bloqueo_ref', 'in', slots.map((s) => String(s.id))]], ['id', 'role_id'], { limit: 50 });
        need(new Set(blocks.map((b) => m2oId(b.role_id))).size === rooms.length, 'VERIFICACION_HABITACIONES_NO_BLOQUEADAS');
      }
    };
    return { prevalidate, execute, verify, steps };
  },

  async [OPS.CANCEL_ORDER]({ op, reader, writer, smoobu, today }) {
    const steps = [];
    const prevalidate = async () => {
      need(op.arrival > today, 'ESTANCIA_INICIADA');
      await smoobuStillMatches(smoobu, op, { expectCancelled: true });
      const o = await readOrder(reader, op.orderId);
      need(o.state === 'sale' || o.state === 'draft' || o.state === 'sent', 'PEDIDO_NO_CANCELABLE');
      need(!op.snapshot?.writeDate || o.write_date === op.snapshot.writeDate, 'PEDIDO_MODIFICADO_DESDE_EL_PLAN');
      need(!invoiced(o), 'PEDIDO_FACTURADO');
      const pays = await reader.searchCount('account.payment', [['partner_id', '=', m2oId(o.partner_id)], ['state', 'not in', ['canceled', 'cancel', 'rejected']]]);
      need(pays === 0, 'PAGOS_EXISTENTES');
      return {};
    };
    const execute = async () => {
      await writer.execute('sale.order', 'message_post', { ids: [op.orderId], body: note(op, ' | cancelada en Smoobu'), message_type: 'comment', subtype_xmlid: 'mail.mt_note' }); steps.push('note');
      await writer.execute('sale.order', 'action_cancel', { ids: [op.orderId], context: { disable_cancel_warning: true } }); steps.push('action_cancel');
      return { orderId: op.orderId, steps };
    };
    const verify = async () => {
      const o = await readOrder(reader, op.orderId);
      need(o.state === 'cancel', 'VERIFICACION_ESTADO');
      const slots = await reader.searchRead('planning.slot', [['sale_line_id', 'in', o.lines.map((l) => l.id)]], ['id'], { limit: 50 });
      need(slots.length === 0, 'VERIFICACION_TURNOS_NO_LIBERADOS');
    };
    return { prevalidate, execute, verify, steps };
  },
};

/* ---------------- recuperacion ---------------- */

async function recover(entry, { reader, plan }) {
  const op = plan.ops.find((o) => o.key === entry.key) ?? null;
  if (entry.op === OPS.CREATE_ORDER) {
    const live = (await ordersWithRef(reader, entry.smoobuId)).filter((o) => o.state !== 'cancel');
    if (live.length > 1) return { halt: 'RECUPERACION_DUPLICADO_DETECTADO' };
    if (live.length === 1) return { phase: PHASES.RECOVERED_DONE, orderId: live[0].id };
    const contact = entry.partnerId || (entry.steps ?? []).includes('partner.create');
    // el contacto creado lleva ref SMOOBU-<id>: el siguiente intento lo reutiliza en vez de duplicarlo
    return { phase: PHASES.RECOVERED_NOT_APPLIED, ...(contact ? { partnerId: entry.partnerId ?? null, code: 'CONTACTO_CREADO_SE_REUTILIZA_POR_REF' } : {}) };
  }
  if (!entry.orderId) return { halt: 'RECUPERACION_SIN_PEDIDO' };
  const o = await readOrder(reader, entry.orderId);
  if (entry.op === OPS.CONFIRM_ORDER) return o.state === 'sale' ? { phase: PHASES.RECOVERED_DONE } : (o.state === 'draft' ? { phase: PHASES.RECOVERED_NOT_APPLIED } : { halt: 'RECUPERACION_ESTADO_INESPERADO' });
  if (entry.op === OPS.CANCEL_ORDER) return o.state === 'cancel' ? { phase: PHASES.RECOVERED_DONE } : { phase: PHASES.RECOVERED_NOT_APPLIED };
  if (entry.op === OPS.UPDATE_ORDER) {
    if (!op) return { halt: 'RECUPERACION_REQUIERE_REVISION_MANUAL' };
    const all = Object.entries(op.payload.order ?? {}).every(([k, v]) => String(o[k] ?? '').slice(0, 19) === String(v).slice(0, 19));
    const none = Object.entries(op.payload.order ?? {}).every(([k, v]) => String(o[k] ?? '').slice(0, 19) !== String(v).slice(0, 19));
    if (all) return { phase: PHASES.RECOVERED_DONE };
    if (none) return { phase: PHASES.RECOVERED_NOT_APPLIED };
    return { halt: 'RECUPERACION_ACTUALIZACION_PARCIAL' };
  }
  return { halt: 'RECUPERACION_OPERACION_DESCONOCIDA' };
}

/* ---------------- orquestacion ---------------- */

/**
 * @param {object} p
 * @param {object} p.plan         salida de planSync
 * @param {object} p.reader       cliente de LECTURA (OdooJson2Client)
 * @param {object} p.writer       SyncWriteClient (real, desarmado por defecto) o RecordingWriter (simulacion)
 * @param {object} p.smoobu       cliente Smoobu (solo getReservation, GET)
 * @param {Journal} p.journal
 * @param {object} p.lock         FileLock/MemoryLock
 * @param {Set<string>} [p.approvals] claves de operaciones REQUIERE_APROBACION aprobadas por gerencia
 * @param {boolean} [p.preconditionUsesSlot] si una precondicion fallida consume el cupo de la ejecucion (por defecto si)
 * @param {(code:string)=>string|null} [p.haltOnPrecondition] codigo de parada para precondiciones graves (ATH-DEV-129)
 */
export async function applyPlan({ plan, reader, writer, smoobu, journal, lock, approvals = new Set(), maxOps = DEFAULT_MAX_OPS, today, halt = false, shouldStop = () => false, preconditionUsesSlot = true, haltOnPrecondition = () => null }) {
  const shadow = writer?.simulated === true;
  const out = { mode: shadow ? 'SIMULACION' : 'REAL', halted: null, recovered: [], results: [], writes: 0 };
  if (halt) { out.halted = 'PARADA_MANUAL'; return out; }
  if (shouldStop()) { out.halted = 'APAGADO_INMEDIATO'; return out; }
  try { lock.acquire(); } catch (e) { out.halted = e.code ?? 'SYNC_LOCKED'; return out; }
  try {
    for (const entry of journal.incomplete()) {
      const r = await recover(entry, { reader, plan });
      if (r.halt) { out.halted = r.halt; out.recovered.push({ key: entry.key, op: entry.op, halt: r.halt }); return out; }
      journal.record({ key: entry.key, smoobuId: entry.smoobuId, op: entry.op, phase: r.phase, ...(r.orderId ? { orderId: r.orderId } : {}), ...(r.code ? { code: r.code, partnerId: r.partnerId } : {}) });
      out.recovered.push({ key: entry.key, op: entry.op, phase: r.phase, code: r.code ?? null });
    }
    let processed = 0;
    for (const op of plan.ops) {
      // apagado inmediato: se consulta antes de CADA operacion (no interrumpe una escritura ya enviada)
      if (shouldStop()) { out.halted = 'APAGADO_INMEDIATO'; return out; }
      const base = { key: op.key, smoobuId: op.smoobuId, unit: op.unit, arrival: op.arrival, departure: op.departure, op: op.op, status: op.status };
      const approved = approvals.has(op.key);
      const eligible = HANDLERS[op.op] && (op.status === STATUS.LISTO || (op.status === STATUS.REQUIERE_APROBACION && approved));
      if (!eligible) { if (HANDLERS[op.op]) out.results.push({ ...base, result: RESULT.NO_ELEGIBLE }); continue; }
      if (journal.isDone(op.key)) { out.results.push({ ...base, result: RESULT.YA_APLICADA }); continue; }
      if (processed >= maxOps) { out.results.push({ ...base, result: RESULT.NO_PROCESADA, code: 'TOPE_POR_EJECUCION' }); continue; }
      const h = await HANDLERS[op.op]({ op, reader, writer, smoobu, today, approved });
      let pre;
      try { pre = await h.prevalidate(); } catch (e) {
        if (e instanceof Precondition) {
          out.results.push({ ...base, result: RESULT.PRECONDICION_FALLIDA, code: e.code });
          // ATH-DEV-129: un cambio inesperado o un duplicado detiene TODA la ejecucion (sin escribir nada mas)
          const stop = haltOnPrecondition(e.code); if (stop) { out.halted = stop; return out; }
          if (preconditionUsesSlot) processed += 1;
          continue;
        }
        out.halted = e.code ?? 'LECTURA_FALLIDA'; out.results.push({ ...base, result: RESULT.NO_PROCESADA, code: out.halted }); return out;
      }
      processed += 1;
      journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: PHASES.INTENT });
      let res;
      try { res = await h.execute(pre); } catch (e) {
        const steps = [...h.steps];
        if (e.code && /^SYNC_WRITE/.test(e.code)) { journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: PHASES.FAILED, code: e.code, steps }); out.results.push({ ...base, result: RESULT.RECHAZADA_POR_ODOO, code: e.code }); out.halted = e.code; return out; }
        if (e.retryable || !e.status) {
          // red caida o timeout DURANTE una escritura: no se sabe si se aplico. Se para y la recuperacion decide leyendo.
          journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: PHASES.AMBIGUOUS, code: e.code ?? 'ERROR_DE_RED', steps, ...(op.orderId ? { orderId: op.orderId } : {}) });
          out.results.push({ ...base, result: RESULT.AMBIGUA, code: e.code ?? 'ERROR_DE_RED', steps }); out.halted = 'RESULTADO_AMBIGUO'; return out;
        }
        // Odoo rechazo la llamada (4xx, p. ej. CHOQUE DE RESERVA): esa llamada no se aplico; si hubo pasos previos, quedan anotados
        journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: steps.length ? PHASES.AMBIGUOUS : PHASES.FAILED, code: e.code ?? 'ODOO_RECHAZO', steps, ...(op.orderId ? { orderId: op.orderId } : {}) });
        out.results.push({ ...base, result: RESULT.RECHAZADA_POR_ODOO, code: e.code ?? 'ODOO_RECHAZO', steps });
        if (steps.length) { out.halted = 'FALLO_PARCIAL'; return out; }
        continue;
      }
      if (shadow) {
        journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: PHASES.DONE, code: 'SIMULADA', steps: res.steps });
        out.results.push({ ...base, result: RESULT.SIMULADA, steps: res.steps }); continue;
      }
      try { await h.verify(res); } catch (e) {
        journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: PHASES.VERIFY_FAILED, code: e.code ?? 'VERIFICACION', orderId: res.orderId ?? null });
        out.results.push({ ...base, result: RESULT.VERIFICACION_FALLIDA, code: e.code ?? 'VERIFICACION' }); out.halted = 'VERIFICACION_FALLIDA'; return out;
      }
      journal.record({ key: op.key, smoobuId: op.smoobuId, op: op.op, phase: PHASES.DONE, orderId: res.orderId ?? null, ...(res.partnerId ? { partnerId: res.partnerId } : {}), steps: res.steps });
      out.results.push({ ...base, result: RESULT.APLICADA, steps: res.steps });
    }
    return out;
  } finally {
    out.writes = writer?.writes ?? 0;
    lock.release();
  }
}
