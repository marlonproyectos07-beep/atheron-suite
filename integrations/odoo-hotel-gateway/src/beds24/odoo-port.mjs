import { createHash } from 'node:crypto';
import { isAvailable } from '../../../odoo-hotel-ical/src/inventory-model.mjs';
import { legacyUnit } from '../../../odoo-hotel-ical/src/ota-adapters.mjs';
import { Beds24Error } from './errors.mjs';

/** Contract only. A future implementation may use the existing Odoo transport. */
export class OdooHotelPort {
  getAvailability() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  getReservation() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  createReservation() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  updateReservation() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  cancelReservation() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  applyHold() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  releaseHold() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  getMapping() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
  healthCheck() { throw new Beds24Error('ODOO_PORT_UNIMPLEMENTED'); }
}

/** Fake only: preserves the same cross-unit inventory rule as Odoo. */
export class FakeOdooHotelPort extends OdooHotelPort {
  #mapping;
  #reservations = new Map();
  #holds = new Map();
  #effects = new Map();
  #failure = null;
  #writes = 0;

  constructor({ mapping } = {}) {
    super();
    if (!mapping) throw new Beds24Error('MAPPING_REQUIRED');
    this.#mapping = mapping;
  }

  get writeCount() { return this.#writes; }
  getReservation(reservationId) { return this.#reservations.get(reservationId) ?? null; }
  getMapping(canonicalUnitId) { return this.#mapping.forUnit(canonicalUnitId); }
  healthCheck() { return { status: 'UP', synthetic: true }; }

  /** One-shot failure injection; after-write timeout models an ambiguous ACK. */
  failNext(operation, { stage = 'before', code = 'ODOO_TIMEOUT' } = {}) {
    this.#failure = { operation, stage, code };
  }

  #maybeFail(operation, stage) {
    if (this.#failure?.operation !== operation || this.#failure.stage !== stage) return;
    const { code } = this.#failure;
    this.#failure = null;
    throw new Beds24Error(code, { retryable: code === 'ODOO_TIMEOUT' });
  }

  #active(exceptId = null) {
    return [...this.#reservations.entries()].filter(([id, row]) => id !== exceptId && row.status === 'active')
      .map(([, row]) => ({ unit: legacyUnit(row.canonicalUnitId),
        checkIn: row.checkIn, checkOut: row.checkOut }));
  }

  #activeHolds() {
    return [...this.#holds.values()].filter((h) => h.status === 'active')
      .map((h) => ({ unit: legacyUnit(h.canonicalUnitId), checkIn: h.checkIn, checkOut: h.checkOut }));
  }

  getAvailability({ canonicalUnitId, checkIn, checkOut }) {
    if (!this.#mapping.forUnit(canonicalUnitId)) throw new Beds24Error('MAPPING_UNKNOWN');
    return { available: isAvailable([...this.#active(), ...this.#activeHolds()],
      legacyUnit(canonicalUnitId), checkIn, checkOut), synthetic: true };
  }

  #write(operation, event, mutate) {
    const commandId = `${event.idempotencyKey}:${event.revision}:${operation}`;
    const replay = this.#effects.get(commandId);
    if (replay) return replay;
    this.#maybeFail(operation, 'before');
    const result = mutate();
    this.#effects.set(commandId, result);
    this.#writes += 1;
    this.#maybeFail(operation, 'after');
    return result;
  }

  createReservation(event) {
    return this.#write('createReservation', event, () => {
      if (!this.#mapping.forUnit(event.canonicalUnitId)) throw new Beds24Error('MAPPING_UNKNOWN');
      if (this.#reservations.has(event.idempotencyKey)) throw new Beds24Error('ODOO_RESERVATION_EXISTS');
      if (!isAvailable([...this.#active(), ...this.#activeHolds()],
        legacyUnit(event.canonicalUnitId), event.checkIn, event.checkOut)) {
        throw new Beds24Error('ODOO_INVENTORY_CONFLICT');
      }
      const row = Object.freeze({ ...event, odooReservationId: `TEST-ODOO-RES-${createHash('sha256')
        .update(event.idempotencyKey).digest('hex').slice(0, 12)}` });
      this.#reservations.set(event.idempotencyKey, row);
      return { reservationId: row.odooReservationId, status: 'CREATED', synthetic: true };
    });
  }

  updateReservation(event) {
    return this.#write('updateReservation', event, () => {
      const prior = this.#reservations.get(event.idempotencyKey);
      if (!prior || prior.status !== 'active' || event.revision <= prior.revision) {
        throw new Beds24Error('ODOO_RESERVATION_STATE_INVALID');
      }
      if (!isAvailable([...this.#active(event.idempotencyKey), ...this.#activeHolds()],
        legacyUnit(event.canonicalUnitId), event.checkIn, event.checkOut)) {
        throw new Beds24Error('ODOO_INVENTORY_CONFLICT');
      }
      this.#reservations.set(event.idempotencyKey,
        Object.freeze({ ...event, odooReservationId: prior.odooReservationId }));
      return { reservationId: prior.odooReservationId, status: 'MODIFIED', synthetic: true };
    });
  }

  cancelReservation(event) {
    return this.#write('cancelReservation', event, () => {
      const prior = this.#reservations.get(event.idempotencyKey);
      if (!prior || event.revision <= prior.revision) throw new Beds24Error('ODOO_RESERVATION_STATE_INVALID');
      this.#reservations.set(event.idempotencyKey,
        Object.freeze({ ...event, odooReservationId: prior.odooReservationId }));
      return { reservationId: prior.odooReservationId, status: 'CANCELLED', synthetic: true };
    });
  }

  applyHold({ holdId, canonicalUnitId, checkIn, checkOut }) {
    if (!holdId || !this.getAvailability({ canonicalUnitId, checkIn, checkOut }).available) {
      throw new Beds24Error('ODOO_INVENTORY_CONFLICT');
    }
    if (this.#holds.has(holdId)) return this.#holds.get(holdId);
    const hold = Object.freeze({ holdId, canonicalUnitId, checkIn, checkOut, status: 'active' });
    this.#holds.set(holdId, hold);
    return hold;
  }

  releaseHold(holdId) {
    const hold = this.#holds.get(holdId);
    if (!hold) throw new Beds24Error('ODOO_HOLD_NOT_FOUND');
    const released = Object.freeze({ ...hold, status: 'released' });
    this.#holds.set(holdId, released);
    return released;
  }
}
