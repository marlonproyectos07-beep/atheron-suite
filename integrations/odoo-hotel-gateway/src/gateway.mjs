import { randomUUID } from 'node:crypto';
import { ContractError, validateRequest, successEnvelope, errorEnvelope } from './contract.mjs';

const IDEMPOTENT_OPERATIONS = new Set(['quote', 'hold']);

function extractResultIds(operation, data) {
  const ids = {};
  if (!data || typeof data !== 'object') return ids;
  if (data.query_id) ids.query_id = data.query_id;
  if (data.quote_id) ids.quote_id = data.quote_id;
  if (data.hold_id) ids.hold_id = data.hold_id;
  if (data.order_id) ids.order_id = data.order_id;
  if (data.property_id) ids.property_id = data.property_id;
  if (Array.isArray(data.units) && data.units[0]?.unit_id) ids.unit_id = data.units[0].unit_id;
  if (data.unit_id) ids.unit_id = data.unit_id;
  return ids;
}

/**
 * HotelGateway: orquesta autenticacion -> rate limit -> validacion de
 * contrato -> idempotencia -> adapter Odoo -> auditoria, para las 4
 * operaciones aprobadas. Este es el unico punto de entrada que usan tanto
 * el servidor HTTP como los tests de integracion/relevo, para garantizar
 * que todos los agentes pasan por exactamente el mismo camino (Fase 5:
 * "ningun agente tiene privilegios especiales").
 */
export class HotelGateway {
  constructor({ identityStore, rateLimiter, idempotencyStore, adapter, auditLog, clock = () => Date.now() }) {
    this.identityStore = identityStore;
    this.rateLimiter = rateLimiter;
    this.idempotencyStore = idempotencyStore;
    this.adapter = adapter;
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async handle({ operation, agentId, rawKey, body }) {
    const startedAt = this.clock();
    const requestId = randomUUID();
    const correlationId = (body && typeof body.correlation_id === 'string' && body.correlation_id.trim() !== '')
      ? body.correlation_id
      : randomUUID();

    let identity = null;
    try {
      identity = this.identityStore.authenticate(agentId, rawKey);
      this.rateLimiter.consume(identity.agentId);

      const validated = validateRequest(operation, { ...body, correlation_id: correlationId });

      let data;
      if (IDEMPOTENT_OPERATIONS.has(operation)) {
        data = await this.idempotencyStore.run(validated.idempotency_key, validated, () =>
          this.adapter[operation](validated)
        );
      } else {
        data = await this.adapter[operation](validated);
      }

      this.#audit({
        requestId,
        correlationId,
        identity,
        operation,
        body: validated,
        startedAt,
        result: 'success',
        data,
      });

      return {
        status: 200,
        envelope: successEnvelope({ correlation_id: correlationId, query_id: data?.query_id ?? null, data }),
      };
    } catch (error) {
      const contractError = error instanceof ContractError
        ? error
        : new ContractError('INTERNAL_ERROR', 'Internal gateway error');

      this.#audit({
        requestId,
        correlationId,
        identity,
        operation,
        body,
        startedAt,
        result: 'error',
        errorCode: contractError.code,
      });

      return {
        status: null, // el status HTTP lo decide server.mjs via errors.mjs
        code: contractError.code,
        envelope: errorEnvelope(contractError, correlationId),
      };
    }
  }

  #audit({ requestId, correlationId, identity, operation, body, startedAt, result, data, errorCode }) {
    const ids = extractResultIds(operation, data);
    this.auditLog.record({
      request_id: requestId,
      correlation_id: correlationId,
      actor: identity?.actor ?? 'unknown',
      agent_id: identity?.agentId ?? 'unknown',
      operation,
      timestamp: new Date(startedAt).toISOString(),
      source_channel: 'sofia',
      idempotency_key: body?.idempotency_key,
      property_id: body?.property_id,
      ...ids,
      result,
      error_code: errorCode,
      latency_ms: this.clock() - startedAt,
    });
  }
}
