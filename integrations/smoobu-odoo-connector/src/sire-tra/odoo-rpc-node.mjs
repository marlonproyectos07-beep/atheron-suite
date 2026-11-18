import { ConnectorError } from '../errors.mjs';
import { OdooJson2Client } from '../odoo-json2-client.mjs';
import { NS, WRITABLE_MODELS } from './manifest.mjs';

/**
 * Unico modulo de SIRE/TRA con capacidad de escritura por red (lista WRITE_CAPABLE de test/p0.test.mjs).
 * Aplicador: escribe solo modelos tecnicos de WRITABLE_MODELS. Emisor: solo crea x_report_attempt
 * y ejecuta la accion de reclamo sa_claim. Las lecturas pasan por la lista blanca del cliente base.
 */
const EMITTER_CREATE = new Set(['x_report_attempt']);

class Base extends OdooJson2Client {
  searchRead(model, domain, fields, opts = {}) { return this.call(model, 'search_read', { domain, fields, ...opts }); }
  count(model, domain) { return this.call(model, 'search_count', { domain }); }
}

export class ApplierRpc extends Base {
  _check(model) { if (!WRITABLE_MODELS.includes(model)) throw new ConnectorError('SIRE_TRA_MODEL_NOT_WRITABLE'); }
  async create(model, vals) { this._check(model); const r = await this._request(model, 'create', { vals_list: [vals] }); return Array.isArray(r) ? r[0] : r; }
  write(model, ids, vals) { this._check(model); return this._request(model, 'write', { ids, vals }); }
  unlink(model, ids) { this._check(model); return this._request(model, 'unlink', { ids }); }
}

export class EmitterRpc extends Base {
  async create(model, vals) {
    if (!EMITTER_CREATE.has(model)) throw new ConnectorError('SIRE_TRA_EMITTER_CREATE_NOT_ALLOWED');
    const r = await this._request(model, 'create', { vals_list: [vals] });
    return Array.isArray(r) ? r[0] : r;
  }
  async claim(lineIds, system, runRef) {
    const d = await this.searchRead('ir.model.data', [['module', '=', NS], ['name', '=', 'sa_claim']], ['res_id']);
    if (!d.length) throw new ConnectorError('SIRE_TRA_CLAIM_ACTION_MISSING');
    const r = await this._request('ir.actions.server', 'run', { ids: [d[0].res_id], context: { active_model: 'x_guests_line', active_ids: lineIds, active_id: lineIds[0], ath_system: system, ath_run_ref: runRef } });
    return Array.isArray(r?.claimed) ? r.claimed : [];
  }
}
