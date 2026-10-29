import { maskSmoobu, maskOta } from './public-report.mjs';

/**
 * ATH-DEV-052 — Resumen PUBLICO de una sola reserva leida con GET /api/reservations/{id}. Puro, sin red.
 *
 * Objetivo: entender por que una reserva marcada "Overbooking" en la interfaz de Smoobu no sale en el listado
 * GET /api/reservations. Se imprime:
 *  - los NOMBRES de todos los campos que devuelve la API (sin valores), para ver si existe algun campo de estado;
 *  - SOLO los valores de una lista blanca de campos tecnicos (tipo, fechas, unidad, canal, bloqueo, marcas de tiempo);
 *  - los valores de campos cuyo NOMBRE sugiera estado/sobreventa, solo si son booleanos, numeros o textos cortos sin '@';
 *  - el id y la referencia OTA enmascarados (3 ultimos caracteres).
 * Nunca: nombre del huesped, correo, telefono, direccion, notas, mensajes, precios ni ningun otro valor fuera de la lista.
 */
export const ALLOWED_RESERVATION_IDS = Object.freeze(new Set([160829171]));

const TECHNICAL = ['type', 'arrival', 'departure', 'created-at', 'createdAt', 'modifiedAt', 'modified-at', 'is-blocked-booking', 'adults', 'children'];
const STATUS_NAME = /(status|state|overbook|conflict|valid|active|cancel|blocked|confirm)/i;
const SAFE_SHORT = (v) => typeof v === 'boolean' || typeof v === 'number' || v === null || (typeof v === 'string' && v.length <= 40 && !v.includes('@') && !/\d{7,}/.test(v));

export function parseAllowedId(raw, allowed = ALLOWED_RESERVATION_IDS) {
  const s = String(raw ?? '').trim();
  if (!/^\d{6,12}$/.test(s)) return { ok: false, code: 'RESERVATION_ID_INVALID' };
  const id = Number(s);
  if (!allowed.has(id)) return { ok: false, code: 'RESERVATION_ID_NOT_ALLOWED' };
  return { ok: true, id };
}

export function summarizeReservation(r) {
  const keys = Object.keys(r ?? {}).sort();
  const technical = {};
  for (const k of TECHNICAL) if (k in (r ?? {}) && SAFE_SHORT(r[k])) technical[k] = r[k];
  const statusLike = {};
  for (const k of keys) {
    if (TECHNICAL.includes(k) || !STATUS_NAME.test(k)) continue;
    statusLike[k] = SAFE_SHORT(r[k]) ? r[k] : `<${Array.isArray(r[k]) ? 'array' : typeof r[k]}>`;
  }
  return {
    smoobuRef: maskSmoobu(r?.id),
    otaRef: maskOta(r?.['reference-id']),
    hasOtaRef: r?.['reference-id'] != null && String(r['reference-id']).trim() !== '',
    apartmentId: Number.isInteger(Number(r?.apartment?.id)) ? Number(r.apartment.id) : null,
    channelId: Number.isInteger(Number(r?.channel?.id)) ? Number(r.channel.id) : null,
    channelName: typeof r?.channel?.name === 'string' && SAFE_SHORT(r.channel.name) ? r.channel.name : null,
    technical,
    statusLikeFields: statusLike,
    fieldNames: keys,
  };
}
