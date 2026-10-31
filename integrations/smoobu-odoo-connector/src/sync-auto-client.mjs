import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';
import { validateWrite } from './sync-write-guard.mjs';
import { EXPECTED_TARGET } from './sync-write-client.mjs';
import { AUTO_METHODS } from './sync-auto.mjs';

/**
 * ATH-DEV-125 — Cliente de escritura de la SINCRONIZACION PROGRAMADA, con interruptor PROPIO.
 * No usa WRITES_ENABLED/RELEASE_UNLOCKED: esos interruptores globales deben seguir en false porque el conciliador diario
 * (src/daily-run.mjs) se niega a correr si no lo estan. Armado solo si `AUTO_ARMED === true` (constante; ATH-DEV-134 la pone en true
 * con orden de gerencia) y `arm === AUTO_ARM_PHRASE` (variable SYNC_ARM). Solo crear contacto, crear
 * pedido y nota interna (ademas de la lista blanca general); destino atheron1.
 */
export const AUTO_ARMED = true; // ATH-DEV-134: activacion controlada; sin la variable SYNC_ARM sigue sin escribir
export const AUTO_ARM_PHRASE = 'ACTIVAR SINCRONIZACION PROGRAMADA SMOOBU ODOO SOLO BORRADORES';
export const autoArmedBy = ({ armed, arm }) => armed === true && arm === AUTO_ARM_PHRASE;

export class AutoWriteClient extends OdooJson2Client {
  constructor({ arm = null, maxWrites = 30, ...opts }) {
    super(opts);
    this.armed = autoArmedBy({ armed: AUTO_ARMED, arm });
    let host = ''; try { host = new URL(this.baseUrl).hostname; } catch { /* invalido */ }
    this.targetOk = host === EXPECTED_TARGET.host && this.database === EXPECTED_TARGET.database;
    this.maxWrites = maxWrites; this.writes = 0; this.createdOrders = new Set(); this.createdRefs = new Set();
  }
  async execute(model, method, params) {
    if (!this.armed) throw new ConnectorError('SYNC_WRITES_DISABLED');
    if (!this.targetOk) throw new ConnectorError('SYNC_TARGET_NOT_AUTHORIZED');
    if (!AUTO_METHODS.has(`${model}.${method}`)) throw new ConnectorError('SYNC_WRITE_AUTO_METHOD_FORBIDDEN');
    validateWrite(model, method, params);
    // ATH-DEV-128: la nota solo en un pedido creado por ESTE cliente; nunca dos pedidos con la misma referencia
    if (method === 'message_post' && !this.createdOrders.has(params.ids[0])) throw new ConnectorError('SYNC_WRITE_AUTO_EXISTING_ORDER_FORBIDDEN');
    const ref = model === 'sale.order' && method === 'create' ? String(params.vals_list[0].x_pms_reference).split(' ')[0] : null;
    if (ref && this.createdRefs.has(ref)) throw new ConnectorError('SYNC_WRITE_AUTO_DUPLICATE_REF');
    if (this.writes >= this.maxWrites) throw new ConnectorError('SYNC_WRITE_AUTO_BUDGET');
    this.writes += 1; // se cuenta antes de enviar
    const r = await this._request(model, method, params);
    if (ref) { this.createdRefs.add(ref); if (Array.isArray(r) && Number.isInteger(r[0])) this.createdOrders.add(r[0]); }
    return r;
  }
}
