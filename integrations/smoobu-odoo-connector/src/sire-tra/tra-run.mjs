/**
 * Recorrido del emisor TRA (lo que ejecuta scripts/tra-emit.mjs), sin red propia: Odoo y la API TRA se inyectan.
 *
 * Dos disparos con autorizaciones independientes:
 *  - manual (workflow_dispatch o ejecucion local): SIEMPRE exige un pedido explicito (TRA_ONLY_ORDER), tanto en
 *    simulacion como en envio real. Vacio, mal escrito, fuera de rango o sin TRA pendiente: error, cero llamadas a
 *    la API TRA y cero escrituras en Odoo. Nunca procesa huespedes de otra estancia.
 *  - programado (schedule): envia solo con TRA_AUTO_SEND=yes; si no, solo lista ids. No admite pedido.
 * En ambos, el envio real pasa ademas por las puertas de emissionGates (TRA_ENABLED=yes-real, token, catalogo
 * verificado, establecimiento API verificado). Las salidas solo llevan ids y codigos: nunca datos de huespedes.
 */
import { emissionGates, emitStay } from './tra-emitter.mjs';

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

/**
 * @param {object} p
 * @param {boolean} p.send   true = envio real (--send)
 * @param {object}  p.env    variables (TRA_TRIGGER, TRA_ONLY_ORDER, TRA_AUTO_SEND, TRA_ENABLED, TRA_TOKEN)
 * @param {object}  p.catalog
 * @param {object}  p.odoo   searchRead, create (solo x_report_attempt), claim
 * @param {Function} p.makeTra  crea el cliente TRA; solo se invoca si una estancia pasa todas las puertas
 */
export async function runEmitter({ send, env = {}, catalog, odoo, makeTra, log = () => {}, now = Date.now }) {
  const trigger = triggerOf(env);
  const mode = send ? 'real' : 'dry-run';
  let orders;
  let pending;

  if (trigger === 'manual') {
    const parsed = parseOrderId(env.TRA_ONLY_ORDER);
    if (!parsed.ok) return fail({ mode, trigger, code: parsed.code });
    pending = await odoo.searchRead('x_guests_line', [['x_sale_order_id', '=', parsed.id], ['x_tra_state', '=', 'pendiente'], ['x_arrived_at', '!=', false]], ['x_sale_order_id', 'x_establishment_id']);
    pending = pending.filter((l) => Array.isArray(l.x_sale_order_id) && l.x_sale_order_id[0] === parsed.id);
    if (!pending.length) return fail({ mode, trigger, order: parsed.id, code: 'PEDIDO_SIN_TRA_PENDIENTE' });
    if (!send) return { exitCode: 0, out: { ok: true, mode, trigger, order: parsed.id, pending_lines: pending.length } };
    orders = [parsed.id];
  } else {
    if (env.TRA_ONLY_ORDER !== undefined && String(env.TRA_ONLY_ORDER).trim() !== '') return fail({ mode, trigger, code: 'PEDIDO_NO_ADMITIDO_EN_PROGRAMADO' });
    if (send && env.TRA_AUTO_SEND !== 'yes') return fail({ mode, trigger, code: 'ENVIO_PROGRAMADO_NO_AUTORIZADO' });
    pending = await odoo.searchRead('x_guests_line', [['x_tra_state', '=', 'pendiente'], ['x_arrived_at', '!=', false]], ['x_sale_order_id', 'x_establishment_id']);
    orders = [...new Set(pending.map((l) => l.x_sale_order_id && l.x_sale_order_id[0]).filter(Boolean))];
    if (!send) return { exitCode: 0, out: { ok: true, mode, trigger, orders_with_pending_tra: orders } };
  }

  const runRef = `gha-${env.GITHUB_RUN_ID || 'local'}-${now()}`;
  let client = null;
  const tra = { post: (kind, payload) => { client ??= makeTra(); return client.post(kind, payload); } };
  const results = [];
  for (const orderId of orders) {
    const estId = pending.find((l) => l.x_sale_order_id[0] === orderId)?.x_establishment_id?.[0];
    const [est] = estId ? await odoo.searchRead('x_establishment', [['id', '=', estId]], ['x_name', 'x_rnt_number', 'x_tra_mode', 'x_tra_config_verified', 'x_tra_accommodation_type', 'x_tra_cost_basis']) : [];
    const gate = emissionGates({ mode: 'real', env, catalog, est });
    if (!gate.ok) { results.push({ orderId, stop: 'BLOQUEADO', reasons: gate.reasons }); continue; }
    results.push(await emitStay({ odoo, tra, orderId, est, catalog, mode: 'real', runRef, env, log }));
  }
  // Un envio manual que no llega a enviar por puertas cerradas termina en error visible.
  if (trigger === 'manual' && results.every((r) => r.stop === 'BLOQUEADO')) return fail({ mode, trigger, order: orders[0], code: 'PUERTAS_CERRADAS', results });
  return { exitCode: 0, out: { ok: true, mode, trigger, runRef, results } };
}
