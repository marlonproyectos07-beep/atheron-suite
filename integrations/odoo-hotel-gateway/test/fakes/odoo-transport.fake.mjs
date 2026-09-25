/**
 * Transporte Odoo simulado/injectable para probar el pipeline LIVE completo
 * (gateway -> adapter -> "borde Odoo") sin red, sin credenciales reales y
 * sin conectar ningun Odoo real. Implementa la misma interfaz que
 * `HttpOdooTransport` (`call(service, method, args)`), asi que
 * `OdooHotelAdapter` no puede distinguir uno del otro.
 */
export class FakeOdooTransport {
  constructor({ uid = 7, result = { ok: true, mocked_by: 'FakeOdooTransport' } } = {}) {
    this.uid = uid;
    this.result = result;
    this.calls = [];
  }

  async call(service, method, args) {
    this.calls.push({ service, method, args });
    if (service === 'common' && method === 'login') {
      return this.uid;
    }
    if (service === 'object' && method === 'execute_kw') {
      return this.result;
    }
    throw new Error(`FakeOdooTransport: llamada inesperada ${service}.${method}`);
  }

  get loginCalls() {
    return this.calls.filter((c) => c.service === 'common' && c.method === 'login');
  }

  get executeKwCalls() {
    return this.calls.filter((c) => c.service === 'object' && c.method === 'execute_kw');
  }
}
