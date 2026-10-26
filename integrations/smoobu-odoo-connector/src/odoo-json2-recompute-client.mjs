import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';

/**
 * ATH-DEV-020: cliente con UNA sola escritura posible: ejecutar la accion de servidor 1493 ("Update Availabilities"),
 * que solo recalcula filas x_availability con x_to_recompute=true. No escribe campos directamente, no ejecuta
 * ningun cron. Exige la frase y el destino exacto; una sola llamada por instancia (se cuenta ANTES de enviar).
 */
export const RECOMPUTE_PHRASE = 'ATH-DEV-020-RECALCULO-SOLO-1171-1172';
export const RECOMPUTE_ACTION_ID = 1493;
export const RECOMPUTE_ROW_IDS = Object.freeze([1171, 1172]);
const PROD = Object.freeze({ host: 'atheron1.odoo.com', database: 'atheron1' });

export class RecomputeWriteClient extends OdooJson2Client {
  constructor({ authorization, ...opts }) {
    super(opts);
    if (authorization !== RECOMPUTE_PHRASE) throw new ConnectorError('RECOMPUTE_NOT_AUTHORIZED');
    let host = '';
    try { host = new URL(this.baseUrl).hostname; } catch { throw new ConnectorError('RECOMPUTE_BASE_URL_INVALID'); }
    if (host !== PROD.host || this.database !== PROD.database) throw new ConnectorError('RECOMPUTE_TARGET_NOT_AUTHORIZED');
    this.runCalls = 0;
  }

  async runUpdateAvailabilitiesOnce() {
    if (this.runCalls >= 1) throw new ConnectorError('RECOMPUTE_ONLY_ONCE');
    this.runCalls += 1;
    return this._request('ir.actions.server', 'run', { ids: [RECOMPUTE_ACTION_ID], context: { active_model: 'x_availability', active_ids: [...RECOMPUTE_ROW_IDS], active_id: RECOMPUTE_ROW_IDS[0] } });
  }
}
