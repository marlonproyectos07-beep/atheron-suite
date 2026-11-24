/**
 * Recorrido del emisor TRA (lo que ejecuta scripts/tra-emit.mjs), sin red propia: Odoo y la API TRA se inyectan.
 *
 * Dos disparos con autorizaciones independientes:
 *  - manual (workflow_dispatch o ejecucion local): SIEMPRE exige un pedido explicito (TRA_ONLY_ORDER), tanto en
 *    la comprobacion (sin --send) como en el envio real. Vacio, mal escrito o fuera de rango: error sin tocar Odoo.
 *    Sin --send hace la COMPROBACION COMPLETA de la estancia (checkStay): todos los campos del payload y todos los
 *    bloqueos (pedido, fichas, llegada, importe confirmado, nombre TRA, motivo, puertas). Termina en error si el
 *    pedido no tiene TRA pendiente o si algun dato bloquea. Nunca escribe ni contacta al MinCIT.
 *  - programado (schedule): envia solo con TRA_AUTO_SEND=yes; si no, solo lista ids. No admite pedido. Solo lista
 *    estancias con salida real registrada (MinCIT 2-2026-039958: el envio se hace al check-out).
 * El envio real repite la comprobacion completa y no envia nada si algo bloquea; ademas pasa por emissionGates.
 * Se detiene en la primera estancia con una peticion real fallida (rechazada o incierta): no se encadenan fallos.
 * Las salidas solo llevan ids y codigos: nunca datos de huespedes ni importes.
 */
import { bogotaToday, checkStay, emitStay } from './tra-emitter.mjs';

/** Los ids de Odoo son enteros de PostgreSQL (integer, 32 bits con signo). */
export const ODOO_MAX_ID = 2147483647;

export function parseOrderId(value) {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  if (raw === '') return { ok: false, code: 'PEDIDO_VACIO' };
  if (!/^[1-9]\d*$/.test(raw)) return { ok: false, code: 'PEDIDO_INVALIDO' };
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id > ODOO_MAX_ID) return { ok: false, code: 'PEDIDO_FUERA_DE_RANGO' };
  return { ok: true, id };
}

export function triggerOf(env = {}) {
  return env.TRA_TRIGGER === 'schedule' ? 'schedule' : 'manual';
}

const fail = (out) => ({ exitCode: 1, out: { ok: false, ...out } });
/** Hubo al menos una peticion real y alguna ficha no quedo aceptada. */
export const failedRequest = (r) => (r?.sent || 0) > 0 && [r.main, ...(r.companions || [])].some((x) => x && x.result !== 'aceptado');
/** Copia publicable de la comprobacion (sin el registro del establecimiento). */
const publicCheck = ({ est, ...rest }) => rest;

/**
 * @param {object} p
 * @param {boolean} p.send   true = envio real (--send)
 * @param {object}  p.env    variables (TRA_TRIGGER, TRA_ONLY_ORDER, TRA_AUTO_SEND, TRA_ENABLED, TRA_TOKEN)
 * @param {object}  p.catalog
 * @param {object}  p.odoo   searchRead, create (solo x_report_attempt), claim
 * @param {Function} p.makeTra  crea el cliente TRA; solo se invoca si una estancia pasa todo
 */
export async function runEmitter({ send, env = {}, catalog, odoo, makeTra, log = () => {}, now = Date.now }) {
  const trigger = triggerOf(env);
  const mode = send ? 'real' : 'dry-run';
  const today = bogotaToday(now());
  let orders;

  if (trigger === 'manual') {
    const parsed = parseOrderId(env.TRA_ONLY_ORDER);
    if (!parsed.ok) return fail({ mode, trigger, code: parsed.code });
    const check = await checkStay({ odoo, orderId: parsed.id, catalog, env, today });
    if (check.pending === 0) return fail({ mode, trigger, order: parsed.id, code: 'PEDIDO_SIN_TRA_PENDIENTE', check: publicCheck(check) });
    if (!check.ready_data) return fail({ mode, trigger, order: parsed.id, code: 'DATOS_NO_LISTOS', check: publicCheck(check) });
    if (!send) return { exitCode: 0, out: { ok: true, mode, trigger, order: parsed.id, check: publicCheck(check) } };
    if (!check.ready_to_send) return fail({ mode, trigger, order: parsed.id, code: 'PUERTAS_CERRADAS', check: publicCheck(check) });
    orders = [{ orderId: parsed.id, check }];
  } else {
    if (env.TRA_ONLY_ORDER !== undefined && String(env.TRA_ONLY_ORDER).trim() !== '') return fail({ mode, trigger, code: 'PEDIDO_NO_ADMITIDO_EN_PROGRAMADO' });
    if (send && env.TRA_AUTO_SEND !== 'yes') return fail({ mode, trigger, code: 'ENVIO_PROGRAMADO_NO_AUTORIZADO' });
    const pending = await odoo.searchRead('x_guests_line', [['x_tra_state', '=', 'pendiente'], ['x_arrived_at', '!=', false], ['x_departed_at', '!=', false]], ['x_sale_order_id']);
    const ids = [...new Set(pending.map((l) => l.x_sale_order_id && l.x_sale_order_id[0]).filter(Boolean))];
    if (!send) return { exitCode: 0, out: { ok: true, mode, trigger, orders_with_pending_tra: ids } };
    orders = [];
    for (const orderId of ids) orders.push({ orderId, check: await checkStay({ odoo, orderId, catalog, env, today }) });
  }

  const runRef = `gha-${env.GITHUB_RUN_ID || 'local'}-${now()}`;
  let client = null;
  const tra = { post: (kind, payload) => { client ??= makeTra(); return client.post(kind, payload); } };
  const results = [];
  let halted = null;
  for (const { orderId, check } of orders) {
    if (!check.ready_to_send) { results.push({ orderId, stop: check.ready_data ? 'BLOQUEADO' : 'DATOS_NO_LISTOS', reasons: check.ready_data ? check.gates : [...check.blocks, ...check.lines.flatMap((l) => l.codes)] }); continue; }
    const r = await emitStay({ odoo, tra, orderId, est: check.est, catalog, mode: 'real', runRef, env, log, today });
    results.push(r);
    if (failedRequest(r)) { halted = { orderId, code: 'DETENIDO_TRAS_FALLO' }; break; }
  }
  return { exitCode: 0, out: { ok: true, mode, trigger, runRef, results, ...(halted ? { halted } : {}) } };
}
