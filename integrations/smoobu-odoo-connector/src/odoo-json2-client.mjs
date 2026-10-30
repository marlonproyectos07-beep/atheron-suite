import { ConnectorError, httpError, sanitizeDetail } from './errors.mjs';

/** Metodos permitidos: solo lectura. Cualquier otro se rechaza antes de la red. */
export const READ_METHODS = Object.freeze(new Set(['search_read', 'read', 'search', 'search_count', 'fields_get', 'name_search', 'context_get']));
// modelos estandar (con punto) y modelos propios de Studio (x_..., sin punto)
const MODEL_RE = /^(x_[a-z0-9_]+|[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+)$/;

/**
 * Cliente JSON-2 de Odoo 19 (POST /json/2/<modelo>/<metodo>, Bearer API key,
 * cabecera X-Odoo-Database). Solo lectura. JSON-2 depende del plan de Odoo
 * Online/Enterprise: si el plan no lo ofrece, la respuesta sera 404/403 y se
 * traduce a un codigo, sin inventar datos.
 */
export class OdooJson2Client {
  constructor({ baseUrl, database, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
    if (!baseUrl || !database || !apiKey) throw new ConnectorError('ODOO_CONFIG_INVALID');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.database = database;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async call(model, method, params = {}) {
    if (!MODEL_RE.test(model) || !READ_METHODS.has(method)) throw new ConnectorError('ODOO_READ_ONLY_VIOLATION');
    return this._request(model, method, params);
  }

  /** Peticion sin lista blanca: SOLO para subclases que imponen su propia guardia (P0WriteClient). */
  async _request(model, method, params = {}) {
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/json/2/${model}/${method}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `bearer ${this.apiKey}`,
          'x-odoo-database': this.database,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ConnectorError(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'ODOO_TIMEOUT' : 'ODOO_NETWORK_ERROR', { retryable: true });
    }
    if (!res.ok) {
      const err = httpError('ODOO', res.status);
      // ATH-DEV-030: solo en 401/403 (no llevan datos de negocio) se conserva el mensaje de Odoo, saneado y con la clave redactada
      if (res.status === 401 || res.status === 403) { try { err.detail = sanitizeDetail(await res.text(), [this.apiKey]); } catch { err.detail = null; } }
      throw err;
    }
    try { return await res.json(); } catch { throw new ConnectorError('ODOO_RESPONSE_INVALID'); }
  }

  searchRead(model, domain, fields, { limit, offset, order } = {}) {
    return this.call(model, 'search_read', { domain, fields, ...(limit != null && { limit }), ...(offset != null && { offset }), ...(order && { order }) });
  }
  searchCount(model, domain) { return this.call(model, 'search_count', { domain }); }
  fieldsGet(model, attributes = ['string', 'type', 'relation']) { return this.call(model, 'fields_get', { attributes }); }
  listRoles(fields = ['id', 'name']) { return this.searchRead('planning.role', [], fields); }
  listResources(fields = ['id', 'name', 'resource_type']) { return this.searchRead('resource.resource', [], fields); }
  listSlotsForRole(roleId, { from, to }, fields = ['id', 'role_id', 'resource_id', 'start_datetime', 'end_datetime', 'state']) {
    return this.searchRead('planning.slot', [['role_id', '=', roleId], ['start_datetime', '<', to], ['end_datetime', '>', from]], fields, { order: 'start_datetime' });
  }
}
