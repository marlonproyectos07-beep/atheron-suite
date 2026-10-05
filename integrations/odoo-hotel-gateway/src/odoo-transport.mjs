/**
 * Transporte JSON-RPC hacia Odoo, aislado del adapter para poder inyectar un
 * transporte simulado en tests (Fase 13/regresion LIVE) sin red ni
 * credenciales reales. `OdooHotelAdapter` solo conoce la interfaz
 * `call(service, method, args) -> Promise<result>`; de donde venga esa
 * implementacion (HTTP real o un fake de test) le es indiferente.
 *
 * El mensaje del error sigue siendo `ODOO_UPSTREAM_ERROR` para no cambiar a
 * los llamadores. El detalle diagnostico va en `error.diagnostic` y nunca
 * contiene credenciales, URLs, dominios ni valores de registros.
 */

const MAX_MESSAGE_CHARS = 200;

/** Credenciales en posiciones fijas: login(db, user, secret) y execute_kw(db, uid, secret, ...). */
function secretArgs(service, method, args) {
  if (!Array.isArray(args)) return [];
  if (service === 'common' && method === 'login') return [args[1], args[2]];
  if (service === 'object' && method === 'execute_kw') return [args[2]];
  return [];
}

function redact(text, secrets) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) out = out.split(secret).join('[redacted]');
  }
  return out.replace(/https?:\/\/\S+/g, '[url]').slice(0, MAX_MESSAGE_CHARS);
}

/** Construye el diagnostico seguro de un error JSON-RPC de Odoo. */
export function rpcErrorDiagnostic({ service, method, args, status, json }) {
  const error = json?.error ?? {};
  const data = error.data ?? {};
  const secrets = secretArgs(service, method, args);
  const isExecute = service === 'object' && method === 'execute_kw';
  return {
    service,
    method,
    model: isExecute && typeof args?.[3] === 'string' ? args[3] : null,
    rpc_method: isExecute && typeof args?.[4] === 'string' ? args[4] : null,
    http_status: status ?? null,
    rpc_code: Number.isFinite(error.code) ? error.code : null,
    exception: typeof data.name === 'string' ? data.name.slice(0, 120) : null,
    message: redact(data.message || error.message, secrets),
  };
}

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
      const error = new Error('ODOO_UPSTREAM_ERROR');
      error.diagnostic = rpcErrorDiagnostic({ service, method, args, status: response.status, json });
      throw error;
    }
    return json.result;
  }
}
