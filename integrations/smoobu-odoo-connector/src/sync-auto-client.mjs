import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';
import { validateWrite } from './sync-write-guard.mjs';
import { EXPECTED_TARGET } from './sync-write-client.mjs';
import { AUTO_METHODS } from './sync-auto.mjs';

/**
 * ATH-DEV-125 — Cliente de escritura de la SINCRONIZACION PROGRAMADA, con interruptor PROPIO.
 * No usa WRITES_ENABLED/RELEASE_UNLOCKED: esos interruptores globales deben seguir en false porque el conciliador diario
 * (src/daily-run.mjs) se niega a correr si no lo estan. Armado solo si `AUTO_ARMED === true` (constante; hoy false; la cambia
 * un PR de activacion con orden de gerencia) y `arm === AUTO_ARM_PHRASE` (variable SYNC_ARM). Solo crear contacto, crear
 * pedido y nota interna (ademas de la lista blanca general); destino atheron1.
 */
export const AUTO_ARMED = false;
export const AUTO_ARM_PHRASE = 'ACTIVAR SINCRONIZACION PROGRAMADA SMOOBU ODOO SOLO BORRADORES';
export const autoArmedBy = ({ armed, arm }) => armed === true && arm === AUTO_ARM_PHRASE;

export class AutoWriteClient extends OdooJson2Client {
  constructor({ arm = null, maxWrites = 30, ...opts }) {
    super(opts);
    this.armed = autoArmedBy({ armed: AUTO_ARMED, arm });
    let host = ''; try { host = new URL(this.baseUrl).hostname; } catch { /* invalido */ }
    this.targetOk = host === EXPECTED_TARGET.host && this.database === EXPECTED_TARGET.database;
    this.maxWrites = maxWrites; this.writes = 0;
  }
  async execute(model, method, params) {
    if (!this.armed) throw new ConnectorError('SYNC_WRITES_DISABLED');
    if (!this.targetOk) throw new ConnectorError('SYNC_TARGET_NOT_AUTHORIZED');
    if (!AUTO_METHODS.has(`${model}.${method}`)) throw new ConnectorError('SYNC_WRITE_AUTO_METHOD_FORBIDDEN');
    validateWrite(model, method, params);
    if (this.writes >= this.maxWrites) throw new ConnectorError('SYNC_WRITE_AUTO_BUDGET');
    this.writes += 1; // se cuenta antes de enviar
    return this._request(model, method, params);
  }
}
