/**
 * Transporte Odoo simulado/injectable para probar el pipeline LIVE completo
 * (gateway -> adapter -> "borde Odoo") sin red, sin credenciales reales y
 * sin conectar ningun Odoo real. Implementa la misma interfaz que
 * `HttpOdooTransport` (`call(service, method, args)`), asi que
 * `OdooHotelAdapter` no puede distinguir uno del otro.
 */
export class FakeOdooTransport {
  /**
   * @param {Array} [options.results] - una respuesta distinta por cada
   *   llamada sucesiva a execute_kw (en orden), para simular secuencias
   *   como el fallback de `status` (primer intento hold_id, segundo
   *   quote_id). Si se agotan, se reusa `result` como valor por defecto.
   */
  constructor({ uid = 7, result = { ok: true, mocked_by: 'FakeOdooTransport' }, results = null } = {}) {
    this.uid = uid;
    this.result = result;
    this.results = results;
    this.calls = [];
  }

  async call(service, method, args) {
    this.calls.push({ service, method, args });
    if (service === 'common' && method === 'login') {
      return this.uid;
    }
    if (service === 'object' && method === 'execute_kw') {
      if (this.results) {
        const index = this.executeKwCalls.length - 1;
        if (index < this.results.length) return this.results[index];
      }
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
