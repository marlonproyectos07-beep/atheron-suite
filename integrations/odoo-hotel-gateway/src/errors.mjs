/**
 * Catalogo minimo de errores (Fase 10 de ATH-ODOO-HOTEL-007) y su mapeo a
 * status HTTP. No se exponen stack traces en ningun caso.
 *
 * Nota de nomenclatura: el validador de contrato (src/contract.mjs), ya
 * aprobado en el scaffold original (PR #57), distingue a nivel de campo entre
 * FORBIDDEN_FIELD y UNKNOWN_FIELD. Son la variante fina de FORBIDDEN_PARAM y
 * UNKNOWN_PARAM del catalogo minimo pedido por el CEO. Se mantienen ambos
 * nombres a proposito (no se colapsan) para no romper el contrato ya
 * revisado; este catalogo declara la equivalencia explicitamente.
 */

export const ERROR_CODES = Object.freeze({
  UNKNOWN_OP: 'UNKNOWN_OP',
  FORBIDDEN_PARAM: 'FORBIDDEN_FIELD',
  UNKNOWN_PARAM: 'UNKNOWN_FIELD',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  NOT_FOUND: 'NOT_FOUND',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  NOT_QUOTED: 'NOT_QUOTED',
  UNAVAILABLE: 'UNAVAILABLE',
  INSUFFICIENT_CAPACITY: 'INSUFFICIENT_CAPACITY',
  REQUIRES_MANUAL_CONFIRMATION: 'REQUIRES_MANUAL_CONFIRMATION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Codigos adicionales, mas finos, usados por el validador de contrato.
  INVALID_REQUEST: 'INVALID_REQUEST',
  FORBIDDEN_FIELD: 'FORBIDDEN_FIELD',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
});

const HTTP_STATUS_BY_CODE = Object.freeze({
  UNKNOWN_OP: 404,
  OPERATION_NOT_ALLOWED: 404,
  FORBIDDEN_FIELD: 400,
  UNKNOWN_FIELD: 400,
  INVALID_REQUEST: 400,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  NOT_FOUND: 404,
  QUOTE_EXPIRED: 410,
  NOT_QUOTED: 409,
  UNAVAILABLE: 409,
  INSUFFICIENT_CAPACITY: 409,
  REQUIRES_MANUAL_CONFIRMATION: 409,
  INTERNAL_ERROR: 500,
});

export function httpStatusForCode(code) {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}
