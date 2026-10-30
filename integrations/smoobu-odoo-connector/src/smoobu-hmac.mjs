import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Firma HMAC-SHA256 de Smoobu (obligatoria desde 2026-09-25; la cabecera
 * `Api-Key` sola queda retirada).
 *
 *   CANONICAL = METHOD \n PATH \n QUERY \n TIMESTAMP \n NONCE \n SHA256_HEX(BODY) \n API_KEY
 *   SIGNATURE = Base64( HMAC-SHA256( key = API_SECRET, message = CANONICAL ) )
 *
 * Cabeceras: X-API-Key, X-Timestamp (UTC ISO 8601, sin milisegundos, +-5 min),
 * X-Nonce (UUID v4 irrepetible), X-Signature. PATH sin query; QUERY ordenada
 * alfabeticamente por clave (`k=v&k=v`), vacia si no hay.
 *
 * Fuentes de la verificacion (ver README): resumen de la documentacion oficial
 * via buscador y dos implementaciones de terceros que la siguen. La pagina
 * oficial NO fue alcanzable desde el sandbox, y no se encontro vector de
 * prueba publicado: los vectores de test/hmac.test.mjs son calculados aqui.
 */
export const HEADER_NAMES = Object.freeze({
  apiKey: 'X-API-Key',
  timestamp: 'X-Timestamp',
  nonce: 'X-Nonce',
  signature: 'X-Signature',
});

export const sha256Hex = (data = '') => createHash('sha256').update(data).digest('hex');
export const EMPTY_BODY_HASH = sha256Hex('');

export const isoTimestamp = (now = Date.now()) => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function canonicalQuery(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [String(k), String(v)])
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export function canonicalString({ method, path, query, body = '', timestamp, nonce, apiKey }) {
  return [method.toUpperCase(), path, canonicalQuery(query), timestamp, nonce, sha256Hex(body), apiKey].join('\n');
}

export const sign = (apiSecret, parts) => createHmac('sha256', apiSecret).update(canonicalString(parts)).digest('base64');

/** `now` y `nonce` inyectables para pruebas deterministas. */
export function hmacHeaders({ apiKey, apiSecret, method, path, query, body = '', now = Date.now(), nonce = randomUUID() }) {
  const timestamp = isoTimestamp(now);
  return {
    [HEADER_NAMES.apiKey]: apiKey,
    [HEADER_NAMES.timestamp]: timestamp,
    [HEADER_NAMES.nonce]: nonce,
    [HEADER_NAMES.signature]: sign(apiSecret, { method, path, query, body, timestamp, nonce, apiKey }),
  };
}
