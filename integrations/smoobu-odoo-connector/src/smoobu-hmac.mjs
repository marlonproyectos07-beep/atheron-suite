import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Firma HMAC-SHA256 para Smoobu.
 *
 * ESTADO: el formato canonico de abajo sigue la orden ATH-DEV-001, pero NO se
 * pudo contrastar con https://docs.smoobu.com/ (sin acceso de red desde la
 * sesion que lo escribio). Esta aislado en `canonicalString` y los nombres de
 * cabecera en HEADER_NAMES para corregirlo en un solo sitio al verificar.
 *
 * Canonico (lineas separadas por \n):
 *   METHOD en mayusculas / path / query ordenada y codificada /
 *   sha256 hex del cuerpo / timestamp (segundos unix) / nonce
 */
export const HEADER_NAMES = Object.freeze({
  keyId: 'X-Smoobu-Key-Id',
  timestamp: 'X-Smoobu-Timestamp',
  nonce: 'X-Smoobu-Nonce',
  contentSha256: 'X-Smoobu-Content-Sha256',
  signature: 'X-Smoobu-Signature',
});

export const sha256Hex = (data = '') => createHash('sha256').update(data).digest('hex');

export function canonicalQuery(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(String(v))])
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export function canonicalString({ method, path, query, body = '', timestamp, nonce }) {
  return [method.toUpperCase(), path, canonicalQuery(query), sha256Hex(body), String(timestamp), nonce].join('\n');
}

export function sign(secret, parts) {
  return createHmac('sha256', secret).update(canonicalString(parts)).digest('hex');
}

/** Devuelve las cabeceras de autenticacion. `now` y `nonce` inyectables para pruebas. */
export function hmacHeaders({ keyId, secret, method, path, query, body = '', now = Date.now(), nonce = randomBytes(16).toString('hex') }) {
  const timestamp = Math.floor(now / 1000);
  return {
    [HEADER_NAMES.keyId]: keyId,
    [HEADER_NAMES.timestamp]: String(timestamp),
    [HEADER_NAMES.nonce]: nonce,
    [HEADER_NAMES.contentSha256]: sha256Hex(body),
    [HEADER_NAMES.signature]: sign(secret, { method, path, query, body, timestamp, nonce }),
  };
}
