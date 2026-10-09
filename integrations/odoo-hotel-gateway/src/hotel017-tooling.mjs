/**
 * HOTEL-017 — utilidades operativas compartidas (post-freeze).
 *
 * Funciones puras, sin red ni credenciales: resolucion de habitacion y feed, guarda de STAGING,
 * modo DRY-RUN por defecto, salida sin secretos y resumen de replay idempotente.
 * Las credenciales solo entran por el cargador seguro existente (scripts/secure-store).
 */
import { ROOMS } from './hotel017-outbound.mjs';

export const STAGING_DATABASE = 'atheron1-hotel-staging-20260923';
export const STAGING_BASE_URL = 'https://atheron1-hotel-staging-20260923.odoo.com';

/**
 * Resuelve una habitacion a partir de "203", "AHS-203", 203 (numero) o la unidad Odoo (3).
 * Ambiguedad o desconocido -> error.
 */
export function resolveRoom(input) {
  const raw = String(input ?? '').trim().toUpperCase();
  const number = raw.replace(/^AHS-/, '');
  if (ROOMS[number]) return { number, ...ROOMS[number] };
  const byUnit = Object.entries(ROOMS).filter(([, r]) => String(r.odooUnit) === raw);
  if (byUnit.length === 1) return { number: byUnit[0][0], ...byUnit[0][1] };
  throw new Error('ROOM_UNKNOWN');
}

/** Exactamente un feed que coincida con canonico y fuente. */
export function resolveFeed(feeds, { canonical, source }) {
  const matches = (feeds || []).filter((f) => f.x_canonical_unit_id === canonical && f.x_source === source);
  if (matches.length !== 1) throw new Error('FEED_NOT_UNIQUE');
  return matches[0];
}

/** Lanza si la configuracion no es exactamente la base de STAGING. Rechaza cualquier otro destino. */
export function assertStagingOnly({ database, baseUrl }) {
  if (database !== STAGING_DATABASE || baseUrl !== STAGING_BASE_URL) throw new Error('STAGING_ONLY');
}

/**
 * Modo de ejecucion. Por defecto DRY-RUN (solo lectura).
 * Una escritura exige --write y --confirm-staging. Cualquier otra combinacion se queda en lectura.
 */
export function parseMode(argv) {
  const has = (flag) => argv.includes(flag);
  const write = has('--write');
  const confirmed = has('--confirm-staging');
  if (write && !confirmed) throw new Error('WRITE_REQUIRES_CONFIRM_STAGING');
  return { mode: write && confirmed ? 'WRITE' : 'DRY_RUN', write: write && confirmed };
}

/** Quita URLs, correos personales, tokens y cualquier valor de credencial de un texto. */
export function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) if (typeof s === 'string' && s.length >= 4) out = out.split(s).join('[redacted]');
  return out
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/[\w.+-]+@(?!atheron1\.odoo\.com)[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(token|secret|password|cookie|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]');
}

/** Resumen de una pasada de importacion (conteos, sin identificadores). */
export function summarizeImport(result) {
  const r = (result?.results || [])[0] || {};
  const c = r.counts || {};
  return { status: r.status ?? null, created: c.APPLIED ?? 0, duplicate: c.DUPLICATE ?? 0, conflict: c.CONFLICT ?? 0 };
}

/** Un replay es idempotente si no crea nada, no hay conflictos y todo lo existente es duplicado. */
export function isIdempotentReplay(summary) {
  return summary.created === 0 && summary.conflict === 0 && summary.duplicate > 0;
}
