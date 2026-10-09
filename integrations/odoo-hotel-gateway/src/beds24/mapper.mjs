import { createHash } from 'node:crypto';
import { CANONICAL_UNITS } from '../../../odoo-hotel-ical/src/ota-adapters.mjs';
import { Beds24Error } from './errors.mjs';

const PHYSICAL = new Set(CANONICAL_UNITS.filter((unit) => unit !== 'AHS-CASA'));
const EVENT_TYPES = new Set(['reservation.created', 'reservation.modified', 'reservation.cancelled']);
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const present = (value) => typeof value === 'string' && value.trim().length > 0;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function assertStay(checkIn, checkOut) {
  if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) {
    throw new Beds24Error('INVALID_STAY_WINDOW');
  }
}

/** Configurable mapping. No real Beds24, Booking or Airbnb identifiers belong here. */
export function createBeds24Mapping(rows) {
  if (!Array.isArray(rows) || rows.length !== CANONICAL_UNITS.length) {
    throw new Beds24Error('MAPPING_INCOMPLETE');
  }
  const byUnit = new Map();
  const byRoom = new Map();
  const odooIds = new Set();
  for (const row of rows) {
    if (!CANONICAL_UNITS.includes(row?.canonicalUnitId) || byUnit.has(row.canonicalUnitId) ||
        !present(row.beds24AccountId) || !present(row.beds24PropertyId) ||
        !present(row.beds24RoomId) || !present(row.odooUnitId)) {
      throw new Beds24Error('MAPPING_INVALID');
    }
    const physical = PHYSICAL.has(row.canonicalUnitId);
    if (row.kind !== (physical ? 'physical' : 'virtual') ||
        (physical && !present(row.odooResourceId)) || (!physical && row.odooResourceId != null)) {
      throw new Beds24Error('MAPPING_INVALID');
    }
    const roomKey = JSON.stringify([row.beds24AccountId, row.beds24PropertyId, row.beds24RoomId]);
    if (byRoom.has(roomKey) || odooIds.has(row.odooUnitId)) throw new Beds24Error('MAPPING_AMBIGUOUS');
    const normalized = Object.freeze({
      canonicalUnitId: row.canonicalUnitId,
      kind: row.kind,
      odooUnitId: row.odooUnitId,
      odooResourceId: row.odooResourceId ?? null,
      beds24AccountId: row.beds24AccountId,
      beds24PropertyId: row.beds24PropertyId,
      beds24RoomId: row.beds24RoomId,
      bookingPropertyId: row.bookingPropertyId ?? null,
      bookingRoomId: row.bookingRoomId ?? null,
      airbnbListingId: row.airbnbListingId ?? null,
    });
    byUnit.set(row.canonicalUnitId, normalized);
    byRoom.set(roomKey, normalized);
    odooIds.add(row.odooUnitId);
  }
  return Object.freeze({
    units: () => [...byUnit.keys()],
    forUnit: (unit) => byUnit.get(unit) ?? null,
    forRoom: (accountId, propertyId, roomId) =>
      byRoom.get(JSON.stringify([accountId, propertyId, roomId])) ?? null,
  });
}

/** Synthetic event contract; a future API mapper must translate Beds24 v2 fields into it. */
export function normalizeBeds24Event(raw, mapping) {
  if (!raw || !EVENT_TYPES.has(raw.type) || !present(raw.bookingId) || !present(raw.accountId) ||
      !present(raw.propertyId) || !present(raw.roomId) ||
      !Number.isSafeInteger(raw.revision) || raw.revision < 1) {
    throw new Beds24Error('INVALID_RESERVATION_EVENT');
  }
  assertStay(raw.checkIn, raw.checkOut);
  const unit = mapping?.forRoom?.(raw.accountId, raw.propertyId, raw.roomId);
  if (!unit) throw new Beds24Error('MAPPING_UNKNOWN');
  const idempotencyKey = sha(['BEDS24', raw.accountId, raw.bookingId]);
  const status = raw.type === 'reservation.cancelled' ? 'cancelled' : 'active';
  const signature = sha([unit.canonicalUnitId, raw.checkIn, raw.checkOut, status, raw.revision]);
  return Object.freeze({
    type: raw.type,
    bookingId: raw.bookingId,
    accountId: raw.accountId,
    propertyId: raw.propertyId,
    canonicalUnitId: unit.canonicalUnitId,
    checkIn: raw.checkIn,
    checkOut: raw.checkOut,
    revision: raw.revision,
    status,
    idempotencyKey,
    signature,
  });
}

/** Rates remain Odoo-approved proposals; this phase does not publish them. */
export function normalizeApprovedRate(raw, mapping) {
  if (!raw || !mapping?.forUnit?.(raw.canonicalUnitId) || !present(raw.currency) ||
      !present(raw.approvalRef) || !Number.isFinite(raw.amount) || raw.amount < 0) {
    throw new Beds24Error('RATE_CONTRACT_INVALID');
  }
  assertStay(raw.from, raw.to);
  const unit = mapping.forUnit(raw.canonicalUnitId);
  return Object.freeze({
    propertyId: unit.beds24PropertyId,
    roomId: unit.beds24RoomId,
    from: raw.from,
    to: raw.to,
    currency: raw.currency,
    amount: raw.amount,
    approvalRef: raw.approvalRef,
    synthetic: true,
  });
}
