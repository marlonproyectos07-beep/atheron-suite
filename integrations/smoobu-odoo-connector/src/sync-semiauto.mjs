import { ConnectorError } from './errors.mjs';
import { OPS, STATUS } from './sync-intent.mjs';
import { applyPlan } from './sync-apply.mjs';
import { maskSmoobu } from './public-report.mjs';

/**
 * ATH-DEV-120 — MODO SEMIAUTOMATICO.
 *  - Automatico: SOLO crear contacto y pedido en BORRADOR (CREATE_ORDER en LISTO y dentro de los limites de importe/noches).
 *  - Con aprobacion gerencial POR OPERACION (token ligado a la clave): confirmar, cancelar, cambiar fechas, rellenar
 *    pedidos existentes y cualquier excepcion de precio (fuera de limites).
 *  - Nunca: pagos, facturas, asientos, banca (lista blanca + FORBIDDEN_MODELS en sync-write-guard.mjs).
 *  - Apagado: sin `SYNC_ENABLED=true` no arranca; `SYNC_KILL=1` (o el archivo de parada) lo detiene antes de cada operacion.
 */
export const DEFAULT_LIMITS = Object.freeze({ minAmount: 1, maxAmount: 1500000, maxNights: 14 });
export const SEMIAUTO_GUARDS = Object.freeze({ IMPORTE_FUERA_DE_LIMITE: 'IMPORTE_FUERA_DE_LIMITE', ESTANCIA_LARGA: 'ESTANCIA_LARGA', SOLO_BORRADORES_AUTOMATICOS: 'SOLO_BORRADORES_AUTOMATICOS' });

/** Token de aprobacion: operacion + clave (hash de la operacion). No contiene IDs ni datos personales: se puede publicar. */
export const approvalToken = (op) => `APROBADO-${op.op}-${op.key}`;
export const parseApprovals = (text) => new Set(String(text ?? '').split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean));

/** Limites desde el entorno; valores invalidos = error de configuracion (nunca se relajan en silencio). */
export function limitsFromEnv(env = {}) {
  const pick = (k, d) => { if (env[k] == null || env[k] === '') return d; const n = Number(env[k]); if (!Number.isFinite(n) || n < 0) throw new ConnectorError('SYNC_LIMIT_INVALID'); return n; };
  const l = { minAmount: pick('SYNC_MIN_AMOUNT', DEFAULT_LIMITS.minAmount), maxAmount: pick('SYNC_MAX_AMOUNT', DEFAULT_LIMITS.maxAmount), maxNights: pick('SYNC_MAX_NIGHTS', DEFAULT_LIMITS.maxNights) };
  if (l.minAmount > l.maxAmount) throw new ConnectorError('SYNC_LIMIT_INVALID');
  return l;
}

const nightsOf = (a, d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const amountOf = (op) => (op.payload?.lines ?? []).reduce((acc, l) => acc + (typeof l.price_unit === 'number' ? l.price_unit : 0), 0) || (op.snapshot?.price ?? null);

/** Reclasifica un plan para el modo semiautomatico. Puro. */
export function semiautoPlan(plan, { limits = DEFAULT_LIMITS } = {}) {
  const ops = plan.ops.map((op) => {
    if (op.status === STATUS.BLOQUEADO || op.status === STATUS.SIN_CAMBIOS) return op;
    const extra = [];
    if (op.op === OPS.CREATE_ORDER) {
      const amount = amountOf(op);
      if (amount == null || amount < limits.minAmount || amount > limits.maxAmount) extra.push(SEMIAUTO_GUARDS.IMPORTE_FUERA_DE_LIMITE);
      if (nightsOf(op.arrival, op.departure) > limits.maxNights) extra.push(SEMIAUTO_GUARDS.ESTANCIA_LARGA);
    } else if (op.status === STATUS.LISTO) extra.push(SEMIAUTO_GUARDS.SOLO_BORRADORES_AUTOMATICOS);
    if (!extra.length) return op;
    return { ...op, status: STATUS.REQUIERE_APROBACION, guards: [...new Set([...op.guards, ...extra])] };
  });
  return { ...plan, ops };
}

/** Interruptores de encendido/apagado. */
export function killState(env = {}, { killFileExists = false } = {}) {
  if (env.SYNC_ENABLED !== 'true') return 'APAGADO_NO_HABILITADO';
  if (env.SYNC_KILL === '1' || killFileExists) return 'APAGADO_INMEDIATO';
  return null;
}

export async function runSemiauto({ plan, env = {}, isKilled = () => false, reader, writer, smoobu, journal, lock, today, maxOps = 5 }) {
  const off = killState(env);
  if (off) return { halted: off, results: [], writes: 0, approvalsPending: [] };
  const limits = limitsFromEnv(env);
  const semi = semiautoPlan(plan, { limits });
  const tokens = parseApprovals(env.SYNC_APPROVALS);
  const approvals = new Set(semi.ops.filter((o) => o.status === STATUS.REQUIERE_APROBACION && tokens.has(approvalToken(o))).map((o) => o.key));
  const res = await applyPlan({ plan: semi, reader, writer, smoobu, journal, lock, approvals, maxOps, today, shouldStop: isKilled });
  const approvalsPending = semi.ops.filter((o) => o.status === STATUS.REQUIERE_APROBACION && !approvals.has(o.key))
    .map((o) => ({ ref: maskSmoobu(o.smoobuId), op: o.op, unit: o.unit, arrival: o.arrival, guards: o.guards, token: approvalToken(o) }));
  return { ...res, limits, approvalsPending, plan: semi };
}
