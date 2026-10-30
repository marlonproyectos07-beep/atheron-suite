import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';
import { validateWrite } from './sync-write-guard.mjs';
import { WRITES_ENABLED } from './live-reconcile.mjs';
import { RELEASE_UNLOCKED } from './odoo-facts.mjs';

/**
 * ATH-DEV-116 — Cliente de ESCRITURA de la sincronizacion. DESARMADO por defecto.
 *
 * Para enviar una sola escritura hacen falta TRES llaves a la vez:
 *   1. `WRITES_ENABLED === true`  (constante en codigo; hoy false; solo cambia en un PR con orden de gerencia),
 *   2. `RELEASE_UNLOCKED === true` (idem),
 *   3. `arm === SYNC_ARM_PHRASE` (frase de armado que la ejecucion recibe por variable; no es un secreto, es una orden).
 * Y ademas: base de datos y host esperados, tope de escrituras por ejecucion y lista blanca de `sync-write-guard.mjs`.
 * Con cualquier llave ausente, CADA metodo lanza `SYNC_WRITES_DISABLED` antes de tocar la red.
 * Las lecturas siguen pasando por la lista de solo lectura del cliente base.
 */
export const SYNC_ARM_PHRASE = 'ARMAR SINCRONIZACION SMOOBU ODOO CON AUTORIZACION DE GERENCIA';
export const EXPECTED_TARGET = Object.freeze({ host: 'atheron1.odoo.com', database: 'atheron1' });
export const DEFAULT_MAX_WRITES = 20;

/** Regla de armado (pura, para probar la tabla de verdad). El cliente la evalua SIEMPRE con las constantes del codigo. */
export function armedBy({ writesEnabled, releaseUnlocked, arm }) {
  return writesEnabled === true && releaseUnlocked === true && arm === SYNC_ARM_PHRASE;
}

export class SyncWriteClient extends OdooJson2Client {
  constructor({ arm = null, maxWrites = DEFAULT_MAX_WRITES, ...opts }) {
    super(opts);
    // sin parametro para sustituir los interruptores: solo las constantes del codigo pueden armar el cliente
    this.armed = armedBy({ writesEnabled: WRITES_ENABLED, releaseUnlocked: RELEASE_UNLOCKED, arm });
    const target = EXPECTED_TARGET;
    let host = ''; try { host = new URL(this.baseUrl).hostname; } catch { /* invalido */ }
    this.targetOk = host === target.host && this.database === target.database;
    this.maxWrites = maxWrites; this.writes = 0; this.log = [];
  }

  /** Unica puerta de escritura. */
  async execute(model, method, params) {
    if (!this.armed) throw new ConnectorError('SYNC_WRITES_DISABLED');
    if (!this.targetOk) throw new ConnectorError('SYNC_TARGET_NOT_AUTHORIZED');
    validateWrite(model, method, params);
    if (this.writes >= this.maxWrites) throw new ConnectorError('SYNC_WRITE_BUDGET_EXHAUSTED');
    this.writes += 1; // se cuenta ANTES de enviar: un fallo ambiguo no autoriza reintentar en esta ejecucion
    this.log.push({ model, method, ids: params?.ids ?? null });
    return this._request(model, method, params);
  }
}

/**
 * Escritor de SIMULACION: aplica la MISMA lista blanca y el mismo tope, pero no envia nada.
 * Devuelve ids ficticios negativos para que el resto del flujo pueda seguir. Se usa en la ejecucion real de diagnostico.
 */
export class RecordingWriter {
  constructor({ maxWrites = DEFAULT_MAX_WRITES } = {}) { this.maxWrites = maxWrites; this.writes = 0; this.log = []; this.nextId = -1; this.simulated = true; }
  async execute(model, method, params) {
    validateWrite(model, method, params);
    if (this.writes >= this.maxWrites) throw new ConnectorError('SYNC_WRITE_BUDGET_EXHAUSTED');
    this.writes += 1;
    this.log.push({ model, method, fields: method === 'create' ? Object.keys(params.vals_list[0]) : Object.keys(params.vals ?? {}) });
    if (method === 'create') { const id = this.nextId; this.nextId -= 1; return [id]; }
    return true;
  }
}
