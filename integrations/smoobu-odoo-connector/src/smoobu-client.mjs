import { ConnectorError, httpError, sanitizeDetail } from './errors.mjs';
import { canonicalQuery, hmacHeaders } from './smoobu-hmac.mjs';

/**
 * Cliente Smoobu de SOLO LECTURA. Solo emite GET; no existe ningun metodo de
 * escritura. Autenticacion solo HMAC (la cabecera Api-Key sola esta retirada).
 */
export class SmoobuClient {
  constructor({ baseUrl = 'https://login.smoobu.com', apiKey, apiSecret, pathPrefix = '/api', fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 15000 }) {
    if (!baseUrl || !apiKey || !apiSecret) throw new ConnectorError('SMOOBU_CONFIG_INVALID');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.pathPrefix = pathPrefix; // '/api' o '/api/v1': entra tal cual en la firma
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.fetch = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  async get(resource, query = {}) {
    const path = `${this.pathPrefix}${resource}`;
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
    if (!res.ok) {
      const err = httpError('SMOOBU', res.status);
      err.serverDate = res.headers?.get?.('date') ?? null;
      if (res.status === 401 || res.status === 403) {
        try { err.detail = sanitizeDetail(await res.text(), [this.apiKey, this.apiSecret]); } catch { err.detail = null; }
      }
      throw err;
    }
    try { return await res.json(); } catch { throw new ConnectorError('SMOOBU_RESPONSE_INVALID'); }
  }

  async listProperties() {
    const data = await this.get('/apartments');
    if (!Array.isArray(data?.apartments)) throw new ConnectorError('SMOOBU_RESPONSE_INVALID');
    return data.apartments; // [{id, name}]
  }

  /** Tarifas y disponibilidad DIARIAS: solo GET. No confirma reserva ni precio final de venta. */
  async getRates({ startDate, endDate, apartmentIds }) {
    const { validateRatesInput } = await import('./rates-readonly.mjs');
    const { from, to, ids } = validateRatesInput({ startDate, endDate, apartmentIds });
    const data = await this.get('/rates', { 'apartments[]': ids, start_date: from, end_date: to });
    if (!data || typeof data.data !== 'object' || !data.data || Array.isArray(data.data)) {
      throw new ConnectorError('SMOOBU_RESPONSE_INVALID');
    }
    return data.data;
  }

  /** Identidad de la cuenta autenticada. Solo GET /api/me. */
  async getCurrentUser() {
    const data = await this.get('/me');
    if (!data || !Number.isSafeInteger(Number(data.id)) || Number(data.id) <= 0) throw new ConnectorError('SMOOBU_RESPONSE_INVALID');
    return { id: Number(data.id) };
  }

  /** Detalle de apartamento: solo GET /api/apartments/{id}; se usa para verificar capacidad y moneda. */
  async getApartmentDetails(id) {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) throw new ConnectorError('SMOOBU_INVALID_ID');
    const data = await this.get('/apartments/' + n);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ConnectorError('SMOOBU_RESPONSE_INVALID');
    return data;
  }

  /** Consulta oficial POST de solo lectura: disponibilidad, precio y restricciones. */
  async checkApartmentAvailability({ arrivalDate, departureDate, apartmentIds, customerId, guests }) {
    const { validateAvailabilityInput } = await import('./availability-readonly.mjs');
    const input = validateAvailabilityInput({ arrivalDate, departureDate, apartmentIds, customerId, guests });
    const path = '/booking/checkApartmentAvailability';
    const body = JSON.stringify({ arrivalDate: input.arrivalDate, departureDate: input.departureDate,
      apartments: input.apartmentIds, customerId: input.customerId, guests: input.guests });
    const headers = { accept: 'application/json', 'content-type': 'application/json',
      ...hmacHeaders({ apiKey: this.apiKey, apiSecret: this.apiSecret, method: 'POST', path, body, now: this.now() }) };
    let res;
    try { res = await this.fetch(this.baseUrl + path, { method: 'POST', headers, body, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch (e) { throw new ConnectorError(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'SMOOBU_TIMEOUT' : 'SMOOBU_NETWORK_ERROR', { retryable: true }); }
    if (!res.ok) { const err = httpError('SMOOBU', res.status); err.serverDate = res.headers?.get?.('date') ?? null; throw err; }
    try { const data = await res.json(); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; }
    catch { throw new ConnectorError('SMOOBU_RESPONSE_INVALID'); }
  }

  /** Una pagina. Smoobu pagina con page/pageSize y devuelve page_count. */
  async listReservationsPage({ from, to, apartmentId, page = 1, pageSize = 100, includeCancelled = true } = {}) {
    const data = await this.get('/reservations', {
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
    return this.get(`/reservations/${Number(id)}`);
  }

  /** ATH-DEV-137: elementos de precio de una reserva (tarifa base, impuestos, extras). Solo GET. */
  async getPriceElements(id) {
    if (!Number.isInteger(Number(id))) throw new ConnectorError('SMOOBU_INVALID_ID');
    const r = await this.get(`/reservations/${Number(id)}/price-elements`);
    return Array.isArray(r?.priceElements) ? r.priceElements : null;
  }
}
