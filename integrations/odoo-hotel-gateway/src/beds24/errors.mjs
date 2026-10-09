/** Codes only: upstream response bodies can contain guest data or credentials. */
export class Beds24Error extends Error {
  constructor(code, { retryable = false, status = null } = {}) {
    super(code);
    this.name = 'Beds24Error';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export function classifyRetry(error) {
  const status = Number(error?.status);
  if (status === 429) return { code: 'BEDS24_RATE_LIMITED', retryable: true };
  if (status >= 500 && status <= 599) return { code: 'BEDS24_UPSTREAM_UNAVAILABLE', retryable: true };
  if (error?.name === 'AbortError' || ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'TIMEOUT'].includes(error?.code)) {
    return { code: 'BEDS24_TIMEOUT', retryable: true };
  }
  return { code: error instanceof Beds24Error ? error.code : 'BEDS24_CONTRACT_ERROR', retryable: false };
}

export function safeBeds24Error(error) {
  if (error instanceof Beds24Error) return error;
  const classification = classifyRetry(error);
  return new Beds24Error(classification.code, {
    retryable: classification.retryable,
    status: Number.isInteger(error?.status) ? error.status : null,
  });
}
