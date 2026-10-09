import { IdempotencyStore } from '../idempotency-store.mjs';
import { AuditLog } from '../audit-log.mjs';
import { isAvailable, nightsOf } from '../../../odoo-hotel-ical/src/inventory-model.mjs';
import { legacyUnit } from '../../../odoo-hotel-ical/src/ota-adapters.mjs';
import { Beds24Error, safeBeds24Error } from './errors.mjs';
import { assertStay, normalizeBeds24Event } from './mapper.mjs';

export const PRODUCTION_DURABLE_STORE_REQUIRED = true;

/** Test-only implementation of the required get/upsert/list/uncertainty port. */
export class MemoryBeds24Store {
  #reservations = new Map();
  #uncertain;

  constructor({ initiallyCertain = false } = {}) {
    this.#uncertain = !initiallyCertain;
  }

  get(key) { return this.#reservations.get(key) ?? null; }
  list() { return [...this.#reservations.values()]; }
  upsert(row) { this.#reservations.set(row.idempotencyKey, row); }
  markUncertain() { this.#uncertain = true; }
  clearUncertain() { this.#uncertain = false; }
  isCertain() { return !this.#uncertain; }
}

function activeBookings(store, exceptKey = null) {
  return store.list().filter((row) => row.status === 'active' && row.idempotencyKey !== exceptKey)
    .map((row) => ({ unit: legacyUnit(row.canonicalUnitId), checkIn: row.checkIn, checkOut: row.checkOut }));
}

function result(status, event) {
  return Object.freeze({ status, idempotencyKey: event.idempotencyKey,
    canonicalUnitId: event.canonicalUnitId, revision: event.revision, synthetic: true });
}

/**
 * Synthetic orchestration inside the existing gateway. No Odoo write or Beds24
 * network transport is present. A real integration must inject a durable store.
 */
export class Beds24Adapter {
  constructor({ client, mapping, store, idempotencyStore = new IdempotencyStore(),
    auditLog = new AuditLog(), sleep = () => Promise.resolve() } = {}) {
    if (!client || !mapping || !store ||
        ['get', 'list', 'upsert', 'markUncertain', 'clearUncertain', 'isCertain']
          .some((method) => typeof store[method] !== 'function')) {
      throw new Beds24Error('ADAPTER_PORTS_REQUIRED');
    }
    this.client = client;
    this.mapping = mapping;
    this.store = store;
    this.idempotencyStore = idempotencyStore;
    this.auditLog = auditLog;
    this.sleep = sleep;
  }

  #audit(event, status, errorCode = undefined) {
    this.auditLog.record({ operation: 'beds24.reservation', source_channel: 'beds24',
      property_id: event?.propertyId, unit_id: event?.canonicalUnitId,
      idempotency_key: event?.idempotencyKey, result: status, error_code: errorCode });
  }

  async applyEvent(raw) {
    let event;
    try {
      event = normalizeBeds24Event(raw, this.mapping);
      const current = this.store.get(event.idempotencyKey);
      if (current && event.revision < current.revision) {
        this.#audit(event, 'STALE');
        return result('STALE', event);
      }
      if (current && event.revision === current.revision) {
        if (current.signature !== event.signature) throw new Beds24Error('REVISION_CONFLICT');
        this.#audit(event, 'DUPLICATE');
        return result('DUPLICATE', event);
      }

      const outcome = await this.idempotencyStore.run(
        `${event.idempotencyKey}:${event.revision}`, { signature: event.signature }, () => {
          // Recheck inside the serialized executor for concurrent delivery.
          const prior = this.store.get(event.idempotencyKey);
          if (prior && event.revision < prior.revision) return result('STALE', event);
          if (prior && event.revision === prior.revision) {
            if (prior.signature !== event.signature) throw new Beds24Error('REVISION_CONFLICT');
            return result('DUPLICATE', event);
          }
          if ((event.type === 'reservation.modified' || event.type === 'reservation.cancelled') && !prior) {
            throw new Beds24Error('RECONCILIATION_REQUIRED');
          }
          if (event.type === 'reservation.created' && prior) throw new Beds24Error('EVENT_ORDER_INVALID');
          if (prior?.status === 'cancelled' && event.type !== 'reservation.cancelled') {
            throw new Beds24Error('EVENT_ORDER_INVALID');
          }
          if (event.status === 'active' && !isAvailable(activeBookings(this.store, event.idempotencyKey),
            legacyUnit(event.canonicalUnitId), event.checkIn, event.checkOut)) {
            throw new Beds24Error('INVENTORY_CONFLICT');
          }
          this.store.upsert(event);
          return result(event.status === 'cancelled' ? 'CANCELLED' :
            event.type === 'reservation.modified' ? 'MODIFIED' : 'CREATED', event);
        },
      );
      this.#audit(event, outcome.status);
      return outcome;
    } catch (error) {
      this.store.markUncertain();
      const safe = safeBeds24Error(error);
      this.#audit(event, 'ERROR', safe.code);
      throw safe;
    }
  }

  availability({ canonicalUnitId, checkIn, checkOut }) {
    assertStay(checkIn, checkOut);
    if (!this.mapping.forUnit(canonicalUnitId)) {
      return Object.freeze({ available: false, certain: false, reason: 'MAPPING_UNKNOWN', synthetic: true });
    }
    if (!this.store.isCertain()) {
      return Object.freeze({ available: false, certain: false, reason: 'UNCERTAIN_STATE', synthetic: true });
    }
    return Object.freeze({ available: isAvailable(activeBookings(this.store), legacyUnit(canonicalUnitId),
      checkIn, checkOut), certain: true, reason: null, synthetic: true });
  }

  inventory({ from, to }) {
    assertStay(from, to);
    return Object.freeze(this.mapping.units().map((canonicalUnitId) => Object.freeze({
      canonicalUnitId,
      dates: Object.freeze(nightsOf(from, to).map((date) => Object.freeze({
        date,
        ...this.availability({ canonicalUnitId, checkIn: date,
          checkOut: new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) }),
      }))),
    })));
  }

  /** Bounded retry is safe here because this method only reads a reservation. */
  async refreshReservation({ accountId, propertyId, bookingId, maxAttempts = 2 }) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
      throw new Beds24Error('RETRY_CONTRACT_INVALID');
    }
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const raw = await this.client.getReservation({ accountId, propertyId, bookingId });
        if (raw?.accountId !== accountId || raw?.bookingId !== bookingId) {
          throw new Beds24Error('RESERVATION_ID_MISMATCH');
        }
        return await this.applyEvent(raw);
      } catch (error) {
        const safe = safeBeds24Error(error);
        if (!safe.retryable || attempt === maxAttempts) {
          this.store.markUncertain();
          throw safe;
        }
        await this.sleep(100 * 2 ** (attempt - 1));
      }
    }
    throw new Beds24Error('BEDS24_UNREACHABLE');
  }

  /** Compare complete synthetic snapshots; an incomplete read never reopens inventory. */
  reconcile({ observed, complete }) {
    if (complete !== true || !Array.isArray(observed)) {
      this.store.markUncertain();
      return Object.freeze({ status: 'UNKNOWN', differences: [], synthetic: true });
    }
    try {
      const remote = new Map();
      for (const raw of observed) {
        const event = normalizeBeds24Event(raw, this.mapping);
        if (remote.has(event.idempotencyKey)) throw new Beds24Error('RECONCILIATION_DUPLICATE');
        remote.set(event.idempotencyKey, event);
      }
      const local = new Map(this.store.list().map((event) => [event.idempotencyKey, event]));
      const differences = [];
      for (const [key, event] of remote) {
        const saved = local.get(key);
        if (!saved) differences.push({ idempotencyKey: key, type: 'MISSING_LOCAL' });
        else if (saved.signature !== event.signature) differences.push({ idempotencyKey: key, type: 'MISMATCH' });
      }
      for (const key of local.keys()) {
        if (!remote.has(key)) differences.push({ idempotencyKey: key, type: 'MISSING_REMOTE' });
      }
      if (differences.length) this.store.markUncertain();
      else this.store.clearUncertain();
      return Object.freeze({ status: differences.length ? 'DIVERGENT' : 'MATCH', differences,
        synthetic: true });
    } catch (error) {
      this.store.markUncertain();
      throw safeBeds24Error(error);
    }
  }
}
