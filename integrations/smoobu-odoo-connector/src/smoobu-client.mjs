import { ConnectorError, httpError } from './errors.mjs';
import { canonicalQuery, hmacHeaders } from './smoobu-hmac.mjs';

/**
 * Cliente Smoobu de SOLO LECTURA. Solo emite GET; no existe ningun metodo de
 * escritura. Autenticacion solo HMAC (la cabecera Api-Key sola esta retirada).
 */
export class SmoobuClient {
  constructor({ baseUrl = 'https://login.smoobu.com', apiKey, apiSecret, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 15000 }) {
    if (!baseUrl || !apiKey || !apiSecret) throw new ConnectorError('SMOOBU_CONFIG_INVALID');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.fetch = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  async get(path, query = {}) {
    const headers = { accept: 'application/json',
      ...hmacHeaders({ apiKey: this.apiKey, apiSecret: this.apiSecret, method: 'GET', path, query, now: this.now() }) };
    const qs = canonicalQuery(query); // misma cadena que se firma
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ''}`, {
        method: 'GET', headers, signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ConnectorError(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'SMOOBU_TIMEOUT' : 'SMOOBU_NETWORK_ERROR', { retryable: true });
    }
    if (!res.ok) throw httpError('SMOOBU', res.status);
    try { return await res.json(); } catch { throw new ConnectorError('SMOOBU_RESPONSE_INVALID'); }
  }

  async listProperties() {
    const data = await this.get('/api/apartments');
    if (!Array.isArray(data?.apartments)) throw new ConnectorError('SMOOBU_RESPONSE_INVALID');
    return data.apartments; // [{id, name}]
  }

  /** Una pagina. Smoobu pagina con page/pageSize y devuelve page_count. */
  async listReservationsPage({ from, to, apartmentId, page = 1, pageSize = 100, includeCancelled = true } = {}) {
    const data = await this.get('/api/reservations', {
      from, to, apartmentId, page, pageSize, showCancellation: includeCancelled ? 'true' : undefined,
    });
    if (!Array.isArray(data?.bookings)) throw new ConnectorError('SMOOBU_RESPONSE_INVALID');
    return data;
  }

  async listReservations(opts = {}, { maxPages = 50 } = {}) {
    const out = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const data = await this.listReservationsPage({ ...opts, page });
      out.push(...data.bookings);
      if (page >= (data.page_count ?? 1)) return out;
    }
    throw new ConnectorError('SMOOBU_PAGINATION_LIMIT');
  }

  async getReservation(id) {
    if (!Number.isInteger(Number(id))) throw new ConnectorError('SMOOBU_INVALID_ID');
    return this.get(`/api/reservations/${Number(id)}`);
  }
}
