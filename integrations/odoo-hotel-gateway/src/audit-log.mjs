/**
 * Auditoria del gateway (Fase 9). Complementa, no reemplaza, a
 * `x_hotel_api_log` en Odoo (auditoria ya aprobada en HOTEL-006 para lo que
 * ocurre dentro de Odoo). Esta bitacora cubre la capa de gateway: quien
 * llamo, con que identidad tecnica, que operacion y que resultado.
 *
 * Campos registrados (lista cerrada, Fase 9):
 *   request_id, correlation_id, actor, agent_id, operation, timestamp,
 *   source_channel, idempotency_key, query_id, quote_id, hold_id, order_id,
 *   property_id, unit_id, result, error_code, latency_ms.
 *
 * Nunca se registra: password, token, cookie, secret, prompt completo u
 * otros datos sensibles innecesarios. `record()` solo copia campos de la
 * lista permitida; cualquier otra cosa se descarta silenciosamente.
 */

const ALLOWED_FIELDS = [
  'request_id',
  'correlation_id',
  'actor',
  'agent_id',
  'operation',
  'timestamp',
  'source_channel',
  'idempotency_key',
  'query_id',
  'quote_id',
  'hold_id',
  'order_id',
  'property_id',
  'unit_id',
  'result',
  'error_code',
  'latency_ms',
];

export class AuditLog {
  #entries = [];

  record(entry) {
    const sanitized = {};
    for (const field of ALLOWED_FIELDS) {
      if (entry[field] !== undefined) sanitized[field] = entry[field];
    }
    this.#entries.push(Object.freeze(sanitized));
    return sanitized;
  }

  list() {
    return [...this.#entries];
  }

  clear() {
    this.#entries = [];
  }
}
