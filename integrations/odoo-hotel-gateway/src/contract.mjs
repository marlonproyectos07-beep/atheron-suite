/**
 * Campos que el CLIENTE nunca puede enviar (Fase 7). `source_channel` vive
 * aqui a proposito: ningun cliente puede setearlo. El propio gateway lo
 * fuerza a 'sofia' mas abajo, en `validateRequest`, DESPUES de que este
 * chequeo ya paso -- por eso un valor de cliente en source_channel sigue
 * cayendo aqui con FORBIDDEN_FIELD, mientras que el valor forzado
 * internamente nunca llega a esta lista de entrada.
 */
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
  'allow_preview',
  'mode',
  'channel',
  'source_channel',
  'admin',
  'sudo',
  // Defensa en profundidad: HOTEL-007 no expone confirm/cancel/Planning/Master
  // Data aunque hoy ningun operation los declare como campo permitido.
  'confirm',
  'cancel',
  'planning',
  'planning_write',
  'master_data',
  'master_data_write',
  'rate_approval',
  'extra_capacity_approval',
]);

/**
 * Campos que jamas deben reenviarse aguas arriba (a Odoo), como defensa en
 * profundidad si algo llamara al adapter sin pasar por `validateRequest`.
 *
 * BUG CORREGIDO (auditoria ChatGPT sobre PR #57, comentario
 * https://github.com/marlonproyectos07-beep/atheron-suite/pull/57#issuecomment-5826163139):
 * este set usaba COMMON_FORBIDDEN tal cual, y como `source_channel` esta en
 * COMMON_FORBIDDEN, CUALQUIER payload valido (que siempre trae
 * source_channel='sofia' forzado por el gateway) quedaba rechazado con
 * FORBIDDEN_FIELD antes de llegar a la accion 1967. Eso bloqueaba TODO el
 * camino LIVE, siempre, sin excepcion.
 *
 * La correccion distingue dos cosas que antes se confundian en un solo set:
 *   - "el cliente no puede ENVIAR esto"      -> COMMON_FORBIDDEN (sin cambios)
 *   - "esto no debe REENVIARSE a Odoo"       -> UPSTREAM_FORBIDDEN (nuevo)
 * `source_channel` pertenece al primero pero no al segundo: el cliente
 * jamas puede setearlo (sigue bloqueado, sin relajar nada), pero el valor
 * 'sofia' que el propio gateway fuerza SI debe llegar al adapter/upstream,
 * porque Odoo necesita saber que canal esta llamando (HOTEL-006).
 */
const UPSTREAM_FORBIDDEN = new Set([...COMMON_FORBIDDEN].filter((field) => field !== 'source_channel'));

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
    'unit_id',
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

function requireIdentifier(body, key) {
  const value = body[key];
  const validString = typeof value === 'string' && value.trim() !== '';
  const validInteger = Number.isInteger(value) && value > 0;
  if (!validString && !validInteger) {
    throw new ContractError('INVALID_REQUEST', `${key} must be a non-empty string or positive integer`);
  }
}

function requireIdempotencyKey(body) {
  if (typeof body.idempotency_key !== 'string' || body.idempotency_key.trim() === '') {
    throw new ContractError('IDEMPOTENCY_KEY_REQUIRED', 'idempotency_key is required for this operation');
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
    requireIdempotencyKey(body);
  }

  if (operation === 'hold') {
    requireIdentifier(body, 'quote_id');
    requireIdentifier(body, 'unit_id');
    requireIdempotencyKey(body);
  }

  if (operation === 'status') {
    requireIdentifier(body, 'operation_id');
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
  for (const key of UPSTREAM_FORBIDDEN) {
    if (key in payload) {
      throw new ContractError('FORBIDDEN_FIELD', `Gateway cannot forward field: ${key}`, { field: key });
    }
  }
  // Fail closed en la otra direccion: si por lo que sea el payload que llega
  // aqui NO trae source_channel='sofia' ya forzado, es una senal de que
  // alguien esta llamando al adapter sin pasar por validateRequest. Mejor
  // frenar aqui que dejar que Odoo reciba un canal indefinido o distinto.
  if (payload.source_channel !== 'sofia') {
    throw new ContractError(
      'INTERNAL_ERROR',
      'source_channel must be forced to sofia by the gateway before reaching upstream Odoo'
    );
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
  upstream_forbidden_fields: [...UPSTREAM_FORBIDDEN],
});
