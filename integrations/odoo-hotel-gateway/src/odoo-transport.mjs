/**
 * Transporte JSON-RPC hacia Odoo, aislado del adapter para poder inyectar un
 * transporte simulado en tests (Fase 13/regresion LIVE) sin red ni
 * credenciales reales. `OdooHotelAdapter` solo conoce la interfaz
 * `call(service, method, args) -> Promise<result>`; de donde venga esa
 * implementacion (HTTP real o un fake de test) le es indiferente.
 */
export class HttpOdooTransport {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl;
  }

  async call(service, method, args) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/jsonrpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
      }),
    });
    const json = await response.json();
    if (json.error) {
      throw new Error('ODOO_UPSTREAM_ERROR');
    }
    return json.result;
  }
}
