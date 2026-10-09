import { Beds24Error, safeBeds24Error } from './errors.mjs';

/** No URL, fetch, authentication or credential loader exists in this phase. */
export class Beds24Client {
  constructor({ transport } = {}) {
    if (transport?.synthetic !== true || typeof transport.request !== 'function') {
      throw new Beds24Error('SYNTHETIC_TRANSPORT_REQUIRED');
    }
    this.transport = transport;
  }

  async request(operation, payload) {
    let response;
    try {
      response = await this.transport.request({ operation, payload });
    } catch (error) {
      throw safeBeds24Error(error);
    }
    const status = response?.status;
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new Beds24Error('BEDS24_RESPONSE_INVALID');
    }
    if (status < 200 || status >= 300) {
      throw safeBeds24Error({ status });
    }
    if (response.data === null || typeof response.data !== 'object') {
      throw new Beds24Error('BEDS24_RESPONSE_INVALID');
    }
    return response.data;
  }

  getAvailability(input) { return this.request('availability.read', input); }
  getInventory(input) { return this.request('inventory.read', input); }
  getReservation(input) { return this.request('reservations.get', input); }
  listReservations(input) { return this.request('reservations.list', input); }
  getRates(input) { return this.request('rates.read', input); }
}
