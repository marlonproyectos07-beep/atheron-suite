/** Lectura protectora de la causa de inventario. Odoo sigue siendo la fuente;
 * este modulo solo clasifica bloques ya recibidos y aplica la exclusion existente.
 */
import { ALL_UNITS, CASA_COMPLETA, ROOM_UNITS, nightsOf } from './inventory-model.mjs';

export const INVENTORY_STATE = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED_DIRECT: 'RESERVED_DIRECT',
  RESERVED_BOOKING: 'RESERVED_BOOKING',
  RESERVED_AIRBNB: 'RESERVED_AIRBNB',
  HOLD: 'HOLD',
  HOUSE_BLOCK: 'HOUSE_BLOCK',
  MANUAL_BLOCK_EXPLAINED: 'MANUAL_BLOCK_EXPLAINED',
  UNEXPLAINED_BLOCK: 'UNEXPLAINED_BLOCK',
});

const text = (value) => typeof value === 'string' ? value.trim() : '';
const token = (value) => text(value).toUpperCase().replaceAll('-', '_');

/** Sin referencia o motivo verificable se mantiene cerrado, nunca disponible. */
export function classifyBlock(block) {
  const primarySource = token(block.source);
  const source = primarySource && primarySource !== 'ODOO' ? primarySource : token(block.source_channel);
  const status = token(block.status);
  const reference = text(block.reservation_ref ?? block.external_reservation_id ?? block.external_uid
    ?? block.hold_id ?? block.idempotency_key);
  const reason = text(block.reason ?? block.block_reason);
  if (status === 'CANCELLED' || status === 'RELEASED') return null;
  if (status === 'CLOSED_MANUAL') {
    return reason ? INVENTORY_STATE.MANUAL_BLOCK_EXPLAINED : INVENTORY_STATE.UNEXPLAINED_BLOCK;
  }
  if (status === 'HOLD' || source === 'HOLD') {
    return reference ? INVENTORY_STATE.HOLD : INVENTORY_STATE.UNEXPLAINED_BLOCK;
  }
  if (source === 'DIRECT_WHATSAPP' || source === 'WHATSAPP') {
    return reference ? INVENTORY_STATE.RESERVED_DIRECT : INVENTORY_STATE.UNEXPLAINED_BLOCK;
  }
  if (source === 'BOOKING') {
    return reference ? INVENTORY_STATE.RESERVED_BOOKING : INVENTORY_STATE.UNEXPLAINED_BLOCK;
  }
  if (source === 'AIRBNB') {
    return reference ? INVENTORY_STATE.RESERVED_AIRBNB : INVENTORY_STATE.UNEXPLAINED_BLOCK;
  }
  if (source === 'MANUAL') {
    return reason ? INVENTORY_STATE.MANUAL_BLOCK_EXPLAINED : INVENTORY_STATE.UNEXPLAINED_BLOCK;
  }
  return INVENTORY_STATE.UNEXPLAINED_BLOCK;
}

/** La ventana [checkIn, checkOut) y el parentesco CASA se comparten con el modelo Nivel 1. */
export function inventoryStateFor(blocks, unit, date, { snapshotComplete = false } = {}) {
  if (!ALL_UNITS.includes(unit)) throw new Error(`UNKNOWN_UNIT: ${unit}`);
  if (!Array.isArray(blocks) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('INVENTORY_INPUT_INVALID');
  for (const block of blocks) {
    if (classifyBlock(block) === null) continue;
    if (!ALL_UNITS.includes(block.unit) || !/^\d{4}-\d{2}-\d{2}$/.test(block.checkIn ?? '')
      || !/^\d{4}-\d{2}-\d{2}$/.test(block.checkOut ?? '') || block.checkOut <= block.checkIn) {
      throw new Error('INVENTORY_BLOCK_INVALID');
    }
  }
  const active = blocks.filter((block) => block.unit === unit
    || (unit === CASA_COMPLETA && ROOM_UNITS.includes(block.unit))
    || (ROOM_UNITS.includes(unit) && block.unit === CASA_COMPLETA))
    .filter((block) => date >= block.checkIn && date < block.checkOut)
    .map((block) => ({ block, cause: classifyBlock(block) }))
    .filter(({ cause }) => cause !== null);
  if (active.length === 0) {
    return snapshotComplete
      ? { state: INVENTORY_STATE.AVAILABLE, available: true, blockers: [] }
      : { state: INVENTORY_STATE.UNEXPLAINED_BLOCK, available: false, blockers: [] };
  }
  const blockers = active.map(({ block, cause }) => ({
    unit: block.unit,
    state: (block.unit === CASA_COMPLETA && unit !== CASA_COMPLETA)
      || (unit === CASA_COMPLETA && block.unit !== CASA_COMPLETA)
      ? INVENTORY_STATE.HOUSE_BLOCK : cause,
    cause,
    reference: text(block.reservation_ref ?? block.external_reservation_id ?? block.external_uid
      ?? block.hold_id ?? block.idempotency_key) || null,
    reason: text(block.reason ?? block.block_reason) || null,
  }));
  const unexplained = blockers.some((item) => item.cause === INVENTORY_STATE.UNEXPLAINED_BLOCK);
  return { state: unexplained ? INVENTORY_STATE.UNEXPLAINED_BLOCK : blockers[0].state,
    available: false, blockers };
}

/** Solo una lectura completa permite declarar AVAILABLE para todas las noches. */
export function assessStay(blocks, { unit, checkIn, checkOut, guests, capacity, snapshotComplete = false }) {
  if (!ALL_UNITS.includes(unit)) throw new Error(`UNKNOWN_UNIT: ${unit}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut ?? '')
    || checkOut <= checkIn) throw new Error('INVALID_STAY_WINDOW');
  if (!Number.isInteger(guests) || guests <= 0) throw new Error('INVALID_GUEST_COUNT');
  if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('CAPACITY_UNKNOWN');
  if (guests > capacity) return { status: 'CAPACITY_GAP', unit, requested_guests: guests, capacity };
  const nights = nightsOf(checkIn, checkOut).map((date) => ({ date,
    ...inventoryStateFor(blocks, unit, date, { snapshotComplete }) }));
  return { status: nights.every((night) => night.available) ? 'AVAILABLE' : 'BLOCKED', unit, nights };
}
