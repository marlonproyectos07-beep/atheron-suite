/** Contrato de evento sin datos comerciales inferidos. Un VEVENT es CALENDAR_BLOCK. */
import { createHash } from 'node:crypto';
import { CANONICAL_UNITS, normalizeReservation } from './ota-adapters.mjs';

export const EVENT_SOURCES = Object.freeze(['BOOKING', 'AIRBNB', 'DIRECT', 'ODOO', 'ICAL']);
export const EVENT_TYPES = Object.freeze(['CALENDAR_BLOCK', 'RESERVATION', 'HOLD']);
export const EVENT_STATUSES = Object.freeze(['BLOCKED', 'CANCELLED']);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validInstant(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

export function createCanonicalEvent(input) {
  const event = {
    SOURCE: input?.SOURCE ?? null,
    PROPERTY: input?.PROPERTY ?? null,
    UNIT: input?.UNIT ?? null,
    EXTERNAL_REF: input?.EXTERNAL_REF ?? null,
    START: input?.START ?? null,
    END: input?.END ?? null,
    STATUS: input?.STATUS ?? null,
    EVENT_TYPE: input?.EVENT_TYPE ?? null,
    BOOKED_AT: input?.BOOKED_AT ?? null,
    UPDATED_AT: input?.UPDATED_AT ?? null,
    RECEIVED_AT: input?.RECEIVED_AT ?? null,
    IDEMPOTENCY_KEY: input?.IDEMPOTENCY_KEY ?? null,
  };
  if (!EVENT_SOURCES.includes(event.SOURCE)) throw new Error('UNKNOWN_EVENT_SOURCE');
  if (!CANONICAL_UNITS.includes(event.UNIT)) throw new Error('UNKNOWN_CANONICAL_UNIT');
  if (typeof event.EXTERNAL_REF !== 'string' || !event.EXTERNAL_REF.trim()) throw new Error('EXTERNAL_REF_REQUIRED');
  if (!validDate(event.START) || !validDate(event.END) || event.END <= event.START) throw new Error('INVALID_STAY_WINDOW');
  if (!EVENT_STATUSES.includes(event.STATUS)) throw new Error('UNKNOWN_EVENT_STATUS');
  if (!EVENT_TYPES.includes(event.EVENT_TYPE)) throw new Error('UNKNOWN_EVENT_TYPE');
  if (![event.BOOKED_AT, event.UPDATED_AT, event.RECEIVED_AT].every(validInstant) || event.RECEIVED_AT === null) {
    throw new Error('INVALID_EVENT_TIMESTAMP');
  }
  event.IDEMPOTENCY_KEY ??= createHash('sha256').update(JSON.stringify([
    event.SOURCE, event.PROPERTY, event.UNIT, event.EXTERNAL_REF,
  ])).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(event.IDEMPOTENCY_KEY)) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return Object.freeze(event);
}

/** Reutiliza la identidad HOTEL-017, sin convertir iCal en reserva comercial. */
export function canonicalFromIcal(rawEvent, { source, canonical_unit_id, mapping, received_at }) {
  if (!['booking', 'airbnb'].includes(source)) throw new Error('ICAL_OTA_SOURCE_REQUIRED');
  const normalized = normalizeReservation(rawEvent, { source, canonical_unit_id, mapping });
  return createCanonicalEvent({
    SOURCE: source.toUpperCase(),
    PROPERTY: normalized.external_property_id ?? normalized.external_listing_id,
    UNIT: normalized.canonical_unit_id,
    EXTERNAL_REF: normalized.external_reservation_id,
    START: normalized.check_in,
    END: normalized.check_out,
    STATUS: normalized.status === 'cancelled' ? 'CANCELLED' : 'BLOCKED',
    EVENT_TYPE: 'CALENDAR_BLOCK',
    BOOKED_AT: null,
    UPDATED_AT: normalized.source_updated_at,
    RECEIVED_AT: received_at,
    IDEMPOTENCY_KEY: normalized.idempotency_key,
  });
}
