/** HOTEL-017: construccion del feed publico por unidad y canal destino.
 * Funcion pura respecto a red: recibe el puerto Odoo. Falla cerrado: cualquier error
 * del puerto se propaga y el endpoint responde 503, nunca un calendario vacio.
 */
import { timingSafeEqual } from 'node:crypto';
import { exportCalendar } from './ota-adapters.mjs';

export const FEED_UNITS = Object.freeze({
  201: 'AHS-201', 202: 'AHS-202', 203: 'AHS-203', 301: 'AHS-301', 302: 'AHS-302', casa: 'AHS-CASA',
});
export const FEED_CHANNELS = Object.freeze(['booking', 'airbnb']);
export const FEED_HORIZON_DAYS = 540;

export function tokenMatches(expected, provided) {
  if (!expected) return false;
  const a = Buffer.from(String(expected)); const b = Buffer.from(String(provided ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function buildPublicFeed({ unit, channel, odoo, today }) {
  const canonical_unit_id = FEED_UNITS[unit];
  if (!canonical_unit_id) throw new Error('UNKNOWN_FEED_UNIT');
  if (!FEED_CHANNELS.includes(channel)) throw new Error('UNKNOWN_FEED_CHANNEL');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) throw new Error('TODAY_REQUIRED');
  const end = new Date(`${today}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + FEED_HORIZON_DAYS);
  const ical = await exportCalendar({
    canonical_unit_id, from: today, to: end.toISOString().slice(0, 10), stamp: today, odoo, destination_channel: channel,
  });
  // Sin PII ni motivos internos: el canal solo necesita saber que la noche esta cerrada.
  return ical.replace(/^SUMMARY:.*$/gm, 'SUMMARY:Not available').replace(/^X-ATHERON-UNIT:.*\r?\n/m, '');
}
