import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';
import { P0_AUTH_PHRASE, P0_VALS, FORBIDDEN_FIELDS, PRODUCTION } from './p0-spec.mjs';

/**
 * Cliente con UNA escritura de creacion y UNA de borrado, ambas con guardias duras (ATH-DEV-018).
 * Es el unico lugar del conector con capacidad de escritura. No es reutilizable: la creacion exige los valores
 * EXACTOS de P0_VALS y el borrado solo acepta el id que ESTA instancia creo. Las lecturas siguen limitadas.
 */
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export class P0WriteClient extends OdooJson2Client {
  constructor({ authorization, ...opts }) {
    super(opts);
    if (authorization !== P0_AUTH_PHRASE) throw new ConnectorError('P0_NOT_AUTHORIZED');
    let host = '';
    try { host = new URL(this.baseUrl).hostname; } catch { throw new ConnectorError('P0_BASE_URL_INVALID'); }
    if (host !== PRODUCTION.host || this.database !== PRODUCTION.database) throw new ConnectorError('P0_TARGET_NOT_AUTHORIZED');
    this.createdIds = new Set(); this.createCalls = 0; this.unlinkCalls = 0;
  }

  /** Crea UN planning.slot con los valores exactos autorizados. Devuelve el resultado crudo saneado. */
  async createExactlyOne(vals) {
    if (this.createCalls >= 1) throw new ConnectorError('P0_ONLY_ONE_CREATE');
    if (!same(vals, P0_VALS)) throw new ConnectorError('P0_VALUES_MISMATCH');
    if (FORBIDDEN_FIELDS.some((f) => f in vals)) throw new ConnectorError('P0_FORBIDDEN_FIELD');
    this.createCalls += 1; // se cuenta ANTES de enviar: un fallo ambiguo no autoriza un segundo intento
    const raw = await this._request('planning.slot', 'create', { vals_list: [{ ...vals }] });
    const ids = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.ids) ? raw.ids : Number.isInteger(raw) ? [raw] : null);
    if (!ids || ids.length !== 1 || !Number.isInteger(ids[0])) { const e = new ConnectorError('P0_CREATE_RESULT_UNEXPECTED'); throw e; }
    this.createdIds.add(ids[0]);
    return ids[0];
  }

  /** Adopta un id hallado por lectura tras un resultado ambiguo (marcador exacto, un solo registro). */
  adoptCreatedId(id) { if (this.createCalls !== 1 || !Number.isInteger(id)) throw new ConnectorError('P0_ADOPT_NOT_ALLOWED'); this.createdIds.add(id); }

  /** Borra UN planning.slot: solo el creado/adoptado por esta instancia y una sola vez. */
  async unlinkOwn(id) {
    if (this.unlinkCalls >= 1) throw new ConnectorError('P0_ONLY_ONE_UNLINK');
    if (!Number.isInteger(id) || !this.createdIds.has(id)) throw new ConnectorError('P0_UNLINK_NOT_OWN_ID');
    this.unlinkCalls += 1;
    return this._request('planning.slot', 'unlink', { ids: [id] });
  }
}
