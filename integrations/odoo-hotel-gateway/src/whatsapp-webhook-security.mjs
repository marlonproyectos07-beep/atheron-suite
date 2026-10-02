/**
 * ATH-ODOO-HOTEL-011, Webhook Staging Deployment Gate -- verificacion
 * de la firma real que Meta pone en cada webhook (`X-Hub-Signature-256`):
 * `sha256=` + HMAC-SHA256(cuerpo crudo, app secret) en hex.
 *
 * Puro, sin red, sin Vercel -- se prueba local con un secreto de prueba
 * (nunca el real de Meta) y se reutiliza tal cual desde la ruta de Astro.
 * Comparacion con `timingSafeEqual` (nunca `===` sobre un secreto/firma).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeSignature(rawBody, appSecret) {
  const hmac = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${hmac}`;
}

/**
 * `rawBody` DEBE ser el cuerpo crudo tal cual llego (nunca
 * re-serializado desde el JSON ya parseado: un solo espacio distinto
 * ya invalida el HMAC). Fail closed: sin `appSecret` configurado, o sin
 * cabecera, siempre `false` -- nunca "valido por defecto".
 */
export function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader) return false;
  const expected = computeSignature(rawBody, appSecret);
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}
