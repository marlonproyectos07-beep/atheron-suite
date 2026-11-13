import { ConnectorError } from '../../smoobu-odoo-connector/src/errors.mjs';

const ALLOWED_MODELS = new Set([
  'res.partner', 'res.users', 'account.move', 'account.move.line',
  'account.account', 'account.journal', 'ir.model.access', 'ir.model', 'ir.model.data'
]);
const READ_METHODS = new Set([
  'search_read', 'search_count', 'fields_get', 'read', 'context_get', 'check_access_rights'
]);

export class OdooReadonlyClient {
  constructor({ baseUrl, database, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
    if (!baseUrl || !database || !apiKey) throw new ConnectorError('ODOO_CONFIG_INVALID');
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'atheron1.odoo.com' ||
        (parsed.port && parsed.port !== '443') || parsed.username || parsed.password ||
        parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
      throw new ConnectorError('ODOO_TARGET_NOT_AUTHORIZED');
    }
    if (database !== 'atheron1') throw new ConnectorError('ODOO_DATABASE_NOT_AUTHORIZED');
    this.baseUrl = 'https://atheron1.odoo.com';
    this.database = database;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async call(model, method, params = {}) {
    if (!ALLOWED_MODELS.has(model) || !READ_METHODS.has(method)) {
      throw new ConnectorError('ODOO_READ_ONLY_VIOLATION');
    }
    let response;
    try {
      response = await this.fetch(this.baseUrl + '/json/2/' + model + '/' + method, {
        method: 'POST',
        headers: {
          authorization: 'bearer ' + this.apiKey,
          'x-odoo-database': this.database,
          'content-type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new ConnectorError(error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'ODOO_TIMEOUT' : 'ODOO_NETWORK_ERROR');
    }
    if (!response.ok) throw new ConnectorError('ODOO_HTTP_' + response.status);
    try {
      return await response.json();
    } catch {
      throw new ConnectorError('ODOO_RESPONSE_INVALID');
    }
  }

  searchRead(model, domain, fields, limit = 100) {
    return this.call(model, 'search_read', { domain, fields, limit });
  }

  searchCount(model, domain = []) {
    return this.call(model, 'search_count', { domain });
  }

  fieldsGet(model, attributes = ['string', 'type', 'relation', 'readonly', 'required']) {
    return this.call(model, 'fields_get', { attributes });
  }

  accessRight(model, operation) {
    if (!['read', 'create', 'write'].includes(operation)) throw new ConnectorError('ACL_OPERATION_INVALID');
    return this.call(model, 'check_access_rights', { operation, raise_exception: false });
  }
}
