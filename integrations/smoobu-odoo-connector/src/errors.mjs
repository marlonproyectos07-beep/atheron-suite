/** Solo codigos: los cuerpos upstream pueden traer datos de huespedes o credenciales. */
export class ConnectorError extends Error {
  constructor(code, { status = null, retryable = false } = {}) {
    super(code);
    this.name = 'ConnectorError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function httpError(prefix, status) {
  const retryable = status === 429 || (status >= 500 && status <= 599);
  const code = status === 401 || status === 403 ? `${prefix}_AUTH_REJECTED`
    : status === 404 ? `${prefix}_NOT_FOUND`
    : retryable ? `${prefix}_UPSTREAM_UNAVAILABLE`
    : `${prefix}_HTTP_ERROR`;
  return new ConnectorError(code, { status, retryable });
}

/**
 * Mensaje upstream de un 401/403 de autenticacion, saneado: sin caracteres de control,
 * con las credenciales redactadas y truncado. Solo se usa en errores de autenticacion
 * (no llevan datos de huespedes) para distinguir firma, marca de tiempo o cabecera.
 */
export function sanitizeDetail(text, secrets = [], max = 160) {
  let out = String(text ?? '');
  for (const secret of secrets) if (typeof secret === 'string' && secret.length > 3) out = out.split(secret).join('[redacted]');
  return out.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/https?:\/\/\S+/g, '[url]').replace(/\s+/g, ' ').trim().slice(0, max);
}
