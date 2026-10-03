/**
 * Contrato de interpretacion (esquema estricto y versionado).
 *
 * El LLM SOLO devuelve esta estructura. No hay texto libre operativo: toda
 * cadena es un valor de enumeracion o un dato validado (fecha ISO, entero).
 * Cualquier campo desconocido, tipo incorrecto o valor fuera de rango invalida
 * TODA la interpretacion (-> ESCALATE_HUMAN). El LLM no decide precios,
 * descuentos, disponibilidad, cupos, politicas, pagos, cancelaciones,
 * anticipos, reservas ni modificaciones OTA: solo dice QUE entendio.
 */
export const SCHEMA_VERSION = '1.0';

export const INTENTS = Object.freeze([
  'CONSULTA_DISPONIBILIDAD', 'CONSULTA_PRECIO', 'RESERVA', 'ANTICIPO', 'METODO_PAGO', 'ENVIO_COMPROBANTE',
  'CANCELACION', 'CAMBIO_FECHAS', 'NO_SHOW', 'EXTENSION', 'POLITICA_CANCELACION',
  'CHECKIN', 'CHECKOUT', 'LLEGADA_TARDE', 'CHECKIN_TEMPRANO', 'CHECKOUT_TARDE', 'LLEGADA_INMINENTE',
  'PARQUEADERO', 'MASCOTA', 'UBICACION', 'TURISMO', 'PREGUNTA_PROPIEDAD',
  'RECLAMO', 'INCIDENCIA', 'REEMBOLSO', 'DESCUENTO', 'GRUPO',
  'ALIADO_CONSULTA', 'ALIADO_LIQUIDACION', 'FUERA_DE_ALCANCE', 'CONFIRMAR_RESERVA_OTA',
  'HABLAR_CON_HUMANO', 'SALUDO', 'CIERRE', 'INTENCION_NO_ENTENDIDA',
]);
export const CHANNELS = Object.freeze(['DIRECT', 'BOOKING', 'AIRBNB', 'OTHER']);
export const RESERVATION_ACTIONS = Object.freeze(['NEW', 'CANCEL', 'CHANGE', 'NO_SHOW', 'EXTEND', 'STATUS']);
export const PAYMENT_STATES = Object.freeze(['NONE', 'CLAIMED_PAID', 'ASKING_HOW', 'DEFERRED']);
export const RESERVATION_STATES = Object.freeze(['NONE', 'EXISTING_DIRECT', 'EXISTING_OTA', 'NEW_INQUIRY']);
export const AMBIGUITIES = Object.freeze(['DATE_UNCLEAR', 'PAX_UNCLEAR', 'PROPERTY_UNCLEAR', 'INTENT_UNCLEAR', 'CHANNEL_UNCLEAR', 'MULTIPLE_REQUESTS', 'CONTEXT_SWITCH']);

const TOP_KEYS = ['schema_version', 'intent', 'confidence', 'entities', 'reservation_action', 'payment_claim', 'payment_state', 'reservation_state', 'requires_human', 'ambiguities'];
const ENTITY_KEYS = ['dates', 'pax', 'property', 'channel', 'amount'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PROPERTY_KEYS = ['AS', 'CA', 'CN', 'AA', 'CC', 'LM'];

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** @returns {{ok:boolean, errors:string[], value:object|null}} */
export function validateInterpretation(raw) {
  const errors = [];
  if (!isObj(raw)) return { ok: false, errors: ['NOT_AN_OBJECT'], value: null };
  for (const k of Object.keys(raw)) if (!TOP_KEYS.includes(k)) errors.push(`UNKNOWN_FIELD:${k}`);
  if (raw.schema_version !== SCHEMA_VERSION) errors.push('BAD_SCHEMA_VERSION');
  if (!INTENTS.includes(raw.intent)) errors.push('BAD_INTENT');
  if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) errors.push('BAD_CONFIDENCE');
  if (typeof raw.payment_claim !== 'boolean') errors.push('BAD_PAYMENT_CLAIM');
  if (typeof raw.requires_human !== 'boolean') errors.push('BAD_REQUIRES_HUMAN');
  if (raw.reservation_action !== null && raw.reservation_action !== undefined && !RESERVATION_ACTIONS.includes(raw.reservation_action)) errors.push('BAD_RESERVATION_ACTION');
  if (raw.payment_state !== undefined && !PAYMENT_STATES.includes(raw.payment_state)) errors.push('BAD_PAYMENT_STATE');
  if (raw.reservation_state !== undefined && !RESERVATION_STATES.includes(raw.reservation_state)) errors.push('BAD_RESERVATION_STATE');
  if (!Array.isArray(raw.ambiguities) || raw.ambiguities.length > 7 || raw.ambiguities.some((a) => !AMBIGUITIES.includes(a))) errors.push('BAD_AMBIGUITIES');

  const e = raw.entities;
  if (!isObj(e)) errors.push('BAD_ENTITIES');
  else {
    for (const k of Object.keys(e)) if (!ENTITY_KEYS.includes(k)) errors.push(`UNKNOWN_ENTITY:${k}`);
    if (!Array.isArray(e.dates) || e.dates.length > 2 || e.dates.some((d) => typeof d !== 'string' || !ISO.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) errors.push('BAD_DATES');
    else if (e.dates.length === 2 && e.dates[1] <= e.dates[0]) errors.push('BAD_DATE_RANGE');
    if (e.pax !== null && e.pax !== undefined && (!Number.isInteger(e.pax) || e.pax < 1 || e.pax > 500)) errors.push('BAD_PAX');
    if (e.property !== null && e.property !== undefined && !PROPERTY_KEYS.includes(e.property)) errors.push('BAD_PROPERTY');
    if (e.channel !== null && e.channel !== undefined && !CHANNELS.includes(e.channel)) errors.push('BAD_CHANNEL');
    if (e.amount !== null && e.amount !== undefined && (typeof e.amount !== 'number' || !Number.isFinite(e.amount) || e.amount < 0)) errors.push('BAD_AMOUNT');
  }
  if (errors.length) return { ok: false, errors, value: null };
  return {
    ok: true,
    errors: [],
    value: Object.freeze({
      schema_version: raw.schema_version,
      intent: raw.intent,
      confidence: raw.confidence,
      entities: Object.freeze({ dates: [...e.dates], pax: e.pax ?? null, property: e.property ?? null, channel: e.channel ?? null, amount: e.amount ?? null }),
      reservation_action: raw.reservation_action ?? null,
      payment_claim: raw.payment_claim,
      payment_state: raw.payment_state ?? 'NONE',
      reservation_state: raw.reservation_state ?? 'NONE',
      requires_human: raw.requires_human,
      ambiguities: [...raw.ambiguities],
    }),
  };
}

/** Interpretacion minima valida (util para mocks y pruebas). */
export function makeInterpretation(over = {}) {
  const { entities = {}, ...rest } = over;
  return {
    schema_version: SCHEMA_VERSION,
    intent: 'INTENCION_NO_ENTENDIDA',
    confidence: 0.9,
    entities: { dates: [], pax: null, property: null, channel: null, amount: null, ...entities },
    reservation_action: null,
    payment_claim: false,
    payment_state: 'NONE',
    reservation_state: 'NONE',
    requires_human: false,
    ambiguities: [],
    ...rest,
  };
}
