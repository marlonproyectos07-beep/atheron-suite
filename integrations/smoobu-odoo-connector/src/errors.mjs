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
