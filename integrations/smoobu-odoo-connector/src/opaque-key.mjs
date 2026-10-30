import { createHmac } from 'node:crypto';
import { stayId, nightlySlots } from './sync-plan.mjs';
import { unitForSmoobuApartment } from './unit-map.mjs';
import { slotKey } from './reconcile.mjs';

/**
 * Identificador PRIVADO de reserva sin crear campos en produccion (ATH-DEV-017).
 *
 * Problema: la accion 1654 publica en el .ics PUBLICO el SUMMARY "ODOO <unidad> - <x_guest_id.name o planning.slot.name>",
 * asi que una clave legible (SMOOBU-<reserva>:...) en `name` quedaria expuesta. x_guest_id no sirve de escudo:
 * hay acciones que lo usan (1651 notifica a NOBEDS, 1652 factura DIAN) y res.partner 7 parece un nombre de persona.
 *
 * Solucion: `name` lleva un TOKEN OPACO = "SM-" + 16 hex de HMAC-SHA256(sal, clave legible). Es determinista (se
 * recalcula desde Smoobu sin libro aparte), no reversible sin la sal y no revela el id de la reserva. La sal
 * (SMOOBU_KEY_SAL, secreto) NO esta configurada todavia; este modulo no la lee del entorno por su cuenta.
 */
export const TOKEN_RE = /^SM-([0-9a-f]{16})$/;
export const tokenFor = (salt, readableKey) => `SM-${createHmac('sha256', salt).update(readableKey).digest('hex').slice(0, 16)}`;

/** Construye el codec para un conjunto de reservas de Smoobu (incluye cancelaciones para poder reconocer sus turnos). */
export function buildOpaqueCodec({ salt, bookings, granularity = 'night' }) {
  if (typeof salt !== 'string' || salt.length < 16) { const e = new Error('KEY_SALT_TOO_SHORT'); e.code = 'KEY_SALT_TOO_SHORT'; throw e; }
  const decode = new Map();
  for (const b of bookings) {
    const unit = unitForSmoobuApartment(b?.apartment?.id);
    if (!unit || !Number.isInteger(Number(b.id))) continue;
    let keys = [];
    try {
      keys = granularity === 'stay' ? [`${stayId(b.id)}:${unit.unit}`] : nightlySlots({ arrival: b.arrival, departure: b.departure }).map((n) => slotKey(b.id, unit.unit, n.night));
    } catch { continue; }
    // claves de cobertura (COVER1..) que podrian existir para esas noches
    if (granularity === 'night') for (const n of nightlySlots({ arrival: b.arrival, departure: b.departure })) for (let i = 1; i <= 3; i += 1) keys.push(`${stayId(b.id)}:COVER${i}:${n.night}`);
    for (const k of keys) decode.set(tokenFor(salt, k), k);
  }
  return Object.freeze({ encode: (readableKey) => tokenFor(salt, readableKey), decode, size: decode.size });
}
