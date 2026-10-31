import { ConnectorError } from './errors.mjs';
import { OPS, STATUS } from './sync-intent.mjs';
import { applyPlan } from './sync-apply.mjs';
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
export const adminApprovalToken = (op) => `APROBADO-ADMIN-SMOOBU-${op.smoobuId}-${op.key}`;

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

export async function runPilot({ plan, smoobuId, approvedKey, adminApproval = null, reader, writer, smoobu, journal, lock, today }) {
  const op = selectPilotOp(plan, { smoobuId, approvedKey });
  const who = await isAdminKey(reader);
  const admin = who === true || who.admin;
  if (admin && adminApproval !== adminApprovalToken(op)) return { halted: 'PILOTO_REQUIERE_APROBACION_ADMIN', admin: true, results: [], writes: 0 };
  const res = await applyPlan({ plan: { ops: [op] }, reader, writer: pilotWriter(writer), smoobu, journal, lock, approvals: new Set([op.key]), maxOps: 1, today });
  return { ...res, admin };
}
