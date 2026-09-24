const COMMON_FORBIDDEN = new Set([
  'price',
  'precio',
  'discount',
  'descuento',
  'tax',
  'impuesto',
  'approved',
  'confirmed',
  'extra_approved',
  'inventory_override',
  'preview',
  'channel',
  'source_channel',
  'admin',
  'sudo',
]);

const OPERATIONS = Object.freeze({
  availability: new Set([
    'check_in',
    'check_out',
    'guests',
    'property_id',
    'correlation_id',
  ]),
  quote: new Set([
    'check_in',
    'check_out',
    'guests',
    'property_id',
    'correlation_id',
    'idempotency_key',
  ]),
  hold: new Set([
    'quote_id',
    'idempotency_key',
    'correlation_id',
  ]),
  status: new Set([
    'operation_id',
    'correlation_id',
  ]),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(body, key) {
  if (typeof body[key] !== 'string' || body[key].trim() === '') {
    throw new ContractError('INVALID_REQUEST', `${key} is required`);
  }
}

export class ContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.details = details;
  }
}

export function validateRequest(operation, body) {
  if (!(operation in OPERATIONS)) {
    throw new ContractError('OPERATION_NOT_ALLOWED', `Unsupported operation: ${operation}`);
  }
  if (!isPlainObject(body)) {
    throw new ContractError('INVALID_REQUEST', 'Request body must be a JSON object');
  }

  for (const key of Object.keys(body)) {
    if (COMMON_FORBIDDEN.has(key)) {
      throw new ContractError('FORBIDDEN_FIELD', `Field is not accepted: ${key}`, { field: key });
    }
    if (!OPERATIONS[operation].has(key)) {
      throw new ContractError('UNKNOWN_FIELD', `Unknown field for ${operation}: ${key}`, { field: key });
    }
  }

  if (operation === 'availability' || operation === 'quote') {
    requireString(body, 'check_in');
    requireString(body, 'check_out');
    if (!Number.isInteger(body.guests) || body.guests < 1) {
      throw new ContractError('INVALID_REQUEST', 'guests must be a positive integer');
    }
  }

  if (operation === 'quote') {
    requireString(body, 'idempotency_key');
  }

  if (operation === 'hold') {
    requireString(body, 'quote_id');
    requireString(body, 'idempotency_key');
  }

  if (operation === 'status') {
    requireString(body, 'operation_id');
  }

  return Object.freeze({
    operation,
    source_channel: 'sofia',
    ...body,
  });
}

export function assertSafeUpstreamPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new ContractError('INVALID_UPSTREAM_PAYLOAD', 'Upstream payload must be an object');
  }
  for (const key of COMMON_FORBIDDEN) {
    if (key in payload) {
      throw new ContractError('FORBIDDEN_FIELD', `Gateway cannot forward field: ${key}`, { field: key });
    }
  }
  return true;
}

export function successEnvelope({ correlation_id, query_id = null, data }) {
  return {
    ok: true,
    correlation_id: correlation_id ?? null,
    query_id,
    data,
  };
}

export function errorEnvelope(error, correlation_id = null) {
  const code = error instanceof ContractError ? error.code : 'INTERNAL_ERROR';
  return {
    ok: false,
    correlation_id,
    error: {
      code,
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(error instanceof ContractError && error.details ? { details: error.details } : {}),
    },
  };
}

export const contract = Object.freeze({
  operations: Object.keys(OPERATIONS),
  forced_source_channel: 'sofia',
  forbidden_fields: [...COMMON_FORBIDDEN],
});
