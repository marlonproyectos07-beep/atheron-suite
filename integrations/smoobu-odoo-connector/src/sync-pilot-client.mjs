import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';
import { validateWrite } from './sync-write-guard.mjs';
import { EXPECTED_TARGET } from './sync-write-client.mjs';
import { PILOT_REQUIRED_WRITES } from './sync-pilot.mjs';
import { assessGuestName, normalizeEmail } from './sync-contact.mjs';

/**
 * ATH-DEV-122 — Cliente de escritura EXCLUSIVO del piloto. Independiente de WRITES_ENABLED/RELEASE_UNLOCKED (que siguen en
 * false para todo lo demas). Armado solo si, a la vez:
 *   1. `PILOT_ARMED === true` (constante; hoy false; la cambia el PR de activacion con orden de gerencia),
 *   2. la fecha actual no supera `PILOT_NOT_AFTER` (se desactiva solo al caducar; hoy null = nunca armado),
 *   3. `arm === PILOT_ARM_PHRASE`,
 *   4. destino atheron1 / atheron1.
 * Atado a UNA operacion (`op`): solo puede crear el contacto con ref SMOOBU-<id> de esa reserva, el pedido con EXACTAMENTE
 * la referencia y lineas del plan, y la nota sobre el pedido que el mismo creo. Tope: 3 escrituras.
 * Al terminar (nota escrita) o ante cualquier error queda CONSUMIDO: no acepta ninguna escritura mas.
 */
export const PILOT_ARMED = true;
/** Ventana de activacion (UTC). El PR de activacion fija ambas; la ventana no puede superar PILOT_MAX_WINDOW_MINUTES. */
export const PILOT_NOT_BEFORE = '2026-10-31T02:29:05Z';
export const PILOT_NOT_AFTER = '2026-10-31T02:43:05Z';
export const PILOT_MAX_WINDOW_MINUTES = 15;
export const PILOT_ARM_PHRASE = 'EJECUTAR PILOTO SMOOBU ODOO UNA RESERVA CON DOBLE APROBACION';

export function pilotArmedBy({ armed, notBefore, notAfter, arm, now }) {
  if (armed !== true || typeof notBefore !== 'string' || typeof notAfter !== 'string' || arm !== PILOT_ARM_PHRASE) return false;
  const from = Date.parse(notBefore); const to = Date.parse(notAfter);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false;
  if (to - from > PILOT_MAX_WINDOW_MINUTES * 60000) return false; // ventana demasiado larga = desarmado
  return now.getTime() >= from && now.getTime() <= to;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class PilotWriteClient extends OdooJson2Client {
  constructor({ op, arm = null, clock = () => new Date(), ...opts }) {
    super(opts);
    if (!op || op.op !== 'CREATE_ORDER') throw new ConnectorError('PILOT_CLIENT_OP_REQUIRED');
    // ATH-DEV-124: la ventana se evalua en CADA escritura (no solo al crear el cliente)
    this.armCheck = () => pilotArmedBy({ armed: PILOT_ARMED, notBefore: PILOT_NOT_BEFORE, notAfter: PILOT_NOT_AFTER, arm, now: clock() });
    let host = ''; try { host = new URL(this.baseUrl).hostname; } catch { /* invalido */ }
    this.targetOk = host === EXPECTED_TARGET.host && this.database === EXPECTED_TARGET.database;
    this.op = op; this.maxWrites = PILOT_REQUIRED_WRITES; this.writes = 0; this.orderId = null; this.partnerCreated = false; this.spent = false;
  }

  get armed() { return this.armCheck(); }

  assertInScope(model, method, params) {
    const op = this.op;
    if (model === 'res.partner' && method === 'create') {
      const v = params.vals_list[0]; const g = op.payload.partner?.guest ?? {};
      // solo el contacto de ESTA reserva, con los datos que trae Smoobu (ni otro nombre, ni otro correo o telefono)
      const okName = v.name === assessGuestName(g.name).name;
      const okEmail = v.email == null || v.email === normalizeEmail(g.email);
      const okPhone = v.phone == null || v.phone === String(g.phone ?? '').trim();
      if (this.partnerCreated || this.orderId != null || v.ref !== `SMOOBU-${op.smoobuId}` || !okName || !okEmail || !okPhone) throw new ConnectorError('PILOT_WRITE_OUTSIDE_SCOPE');
      return;
    }
    if (model === 'sale.order' && method === 'create') {
      const v = params.vals_list[0];
      const lines = op.payload.lines.map((l) => [0, 0, { ...l, tax_ids: [[6, 0, []]] }]);
      if (this.orderId != null || v.x_pms_reference !== op.payload.order.x_pms_reference || !same(v.order_line, lines)) throw new ConnectorError('PILOT_WRITE_OUTSIDE_SCOPE');
      for (const [k, val] of Object.entries(op.payload.order)) if (!same(v[k], val)) throw new ConnectorError('PILOT_WRITE_OUTSIDE_SCOPE');
      return;
    }
    if (model === 'sale.order' && method === 'message_post') {
      if (this.orderId == null || params.ids[0] !== this.orderId) throw new ConnectorError('PILOT_WRITE_OUTSIDE_SCOPE');
      return;
    }
    throw new ConnectorError('PILOT_WRITE_OUTSIDE_SCOPE');
  }

  async execute(model, method, params) {
    if (this.spent) throw new ConnectorError('PILOT_CONSUMED');
    if (!this.targetOk) throw new ConnectorError('SYNC_TARGET_NOT_AUTHORIZED');
    if (!this.armCheck()) {
      // fuera de la ventana: si ya se escribio algo, el cliente queda consumido (la recuperacion se hace por lectura)
      if (this.writes > 0) { this.spent = true; throw new ConnectorError('SYNC_WRITE_WINDOW_CLOSED'); }
      throw new ConnectorError('SYNC_WRITES_DISABLED');
    }
    validateWrite(model, method, params);
    this.assertInScope(model, method, params);
    if (this.writes >= this.maxWrites) throw new ConnectorError('SYNC_WRITE_PILOT_BUDGET');
    this.writes += 1;
    let r;
    try { r = await this._request(model, method, params); } catch (e) { this.spent = true; throw e; }
    if (model === 'res.partner') this.partnerCreated = true;
    if (model === 'sale.order' && method === 'create') {
      const id = Array.isArray(r) ? r[0] : null;
      if (!Number.isInteger(id)) { this.spent = true; throw new ConnectorError('PILOT_CREATE_RESULT_UNEXPECTED'); }
      this.orderId = id;
    }
    if (method === 'message_post') this.spent = true; // operacion completa: el cliente se desactiva
    return r;
  }
}
