/** HOTEL-017: contratos puros para sincronizar bloqueos iCal con Odoo.
 * El puerto `odoo` se inyecta; este modulo no abre red ni contiene credenciales.
 * Un VEVENT es un bloqueo de calendario, no una reserva comercial verificada.
 */
import { createHash } from 'node:crypto';
import { parseIcal } from './ical-import.mjs';
import { buildIcalFeed } from './ical-export.mjs';
import { isAvailable } from './inventory-model.mjs';

export const CANONICAL_UNITS = Object.freeze(['AHS-201', 'AHS-202', 'AHS-203', 'AHS-301', 'AHS-302', 'AHS-CASA']);
const LEGACY_UNIT = Object.freeze({
  'AHS-201': '201', 'AHS-202': '202', 'AHS-203': '203',
  'AHS-301': '301', 'AHS-302': '302', 'AHS-CASA': 'CASA_COMPLETA',
});
const SOURCES = new Set(['booking', 'airbnb']);

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertWindow(checkIn, checkOut) {
  if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) {
    throw new Error('INVALID_STAY_WINDOW');
  }
}

function assertUnit(unit) {
  if (!CANONICAL_UNITS.includes(unit)) throw new Error('UNKNOWN_CANONICAL_UNIT');
}

function auditRecord(audit, operation, reservation, result, extra = {}) {
  audit?.record?.({
    operation, source_channel: reservation?.source ?? null,
    unit_id: reservation?.canonical_unit_id ?? null,
    idempotency_key: reservation?.idempotency_key ?? null,
    correlation_id: reservation?.correlation_id ?? null,
    result, ...extra,
  });
}

/** Mapeo provisto por Odoo STAGING/configuracion verificada, nunca inferido del nombre. */
export function normalizeReservation(event, { source, canonical_unit_id, mapping, correlation_id } = {}) {
  if (!SOURCES.has(source)) throw new Error('UNKNOWN_OTA_SOURCE');
  assertUnit(canonical_unit_id);
  const unitMapping = mapping?.[canonical_unit_id];
  if (!unitMapping) throw new Error('MAPPING_REQUIRED');
  if (!event?.uid || typeof event.uid !== 'string') throw new Error('EVENT_WITHOUT_UID');
  assertWindow(event.dtstart, event.dtend);
  const status = String(event.status ?? '').toUpperCase() === 'CANCELLED' ? 'cancelled' : 'blocked';
  const idempotency_key = hash(JSON.stringify([source, canonical_unit_id, unitMapping.external_listing_id ?? null, event.uid]));
  return Object.freeze({
    source,
    external_property_id: unitMapping.external_property_id ?? null,
    external_listing_id: unitMapping.external_listing_id ?? null,
    external_reservation_id: event.uid,
    canonical_unit_id,
    odoo_unit_id: unitMapping.odoo_unit_id ?? null,
    check_in: event.dtstart,
    check_out: event.dtend,
    status,
    source_updated_at: event.source_updated_at ?? null,
    idempotency_key,
    correlation_id: correlation_id ?? hash(`${source}:${event.uid}`).slice(0, 24),
  });
}

/** El marcador de UID lo emite exclusivamente buildIcalFeed de Atheron. */
export function preventLoop(event) {
  return /^atheron-(?:201|202|203|301|302|CASA_COMPLETA)-\d{8}-\d{8}@nivel1\.local$/i.test(event?.uid ?? '');
}

/** Quita replays identicos dentro de un lote. Cambios reales de fecha/estado conservan el mismo ID. */
export function deduplicate(reservations) {
  const seen = new Set();
  return reservations.filter((r) => {
    const signature = `${r.idempotency_key}:${r.check_in}:${r.check_out}:${r.status}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/** Ledger tecnico de prueba. Produccion requiere persistencia transaccional y clave unica en Odoo. */
export function createSyncLedger() {
  return { revisions: new Map(), exportedUids: new Set() };
}

function revision(reservation) {
  return hash(JSON.stringify([reservation.check_in, reservation.check_out, reservation.status, reservation.source_updated_at]));
}

export function legacyUnit(unit) {
  assertUnit(unit);
  return LEGACY_UNIT[unit];
}

export function toInventory(blocks) {
  return blocks.filter((b) => b.status !== 'cancelled').map((b) => ({
    unit: LEGACY_UNIT[b.canonical_unit_id], checkIn: b.check_in, checkOut: b.check_out,
    source: b.source, source_channel: b.source_channel, status: b.status, reservation_ref: b.reservation_ref,
    external_reservation_id: b.external_reservation_id, external_uid: b.external_uid,
    hold_id: b.hold_id, idempotency_key: b.idempotency_key,
    reason: b.reason, block_reason: b.block_reason,
  }));
}

/** Aplica solo al puerto Odoo inyectado. El puerto debe imponer unicidad de idempotency_key. */
export async function applyBlock(reservation, { odoo, ledger, audit } = {}) {
  if (reservation.status !== 'blocked') throw new Error('BLOCK_STATUS_REQUIRED');
  if (reservation.odoo_unit_id == null) {
    auditRecord(audit, 'applyBlock', reservation, 'PENDING_MAPPING');
    return { status: 'PENDING_MAPPING' };
  }
  const signature = revision(reservation);
  const current = await odoo.listBlocks();
  const existing = current.find((b) => b.idempotency_key === reservation.idempotency_key);
  if (existing?.source === reservation.source && existing.check_in === reservation.check_in
    && existing.check_out === reservation.check_out && existing.status === reservation.status) {
    ledger.revisions.set(reservation.idempotency_key, signature);
    auditRecord(audit, 'applyBlock', reservation, 'DUPLICATE');
    return { status: 'DUPLICATE' };
  }
  if (!existing && ledger.revisions.get(reservation.idempotency_key) === signature) {
    auditRecord(audit, 'applyBlock', reservation, 'ODOO_OVERRIDE');
    return { status: 'ODOO_OVERRIDE', authority: 'odoo' };
  }
  const others = current.filter((b) => b.idempotency_key !== reservation.idempotency_key);
  if (!isAvailable(toInventory(others), LEGACY_UNIT[reservation.canonical_unit_id], reservation.check_in, reservation.check_out)) {
    auditRecord(audit, 'applyBlock', reservation, 'CONFLICT');
    return { status: 'CONFLICT', authority: 'odoo' };
  }
  await odoo.applyBlock(reservation);
  ledger.revisions.set(reservation.idempotency_key, signature);
  auditRecord(audit, 'applyBlock', reservation, 'APPLIED');
  return { status: 'APPLIED' };
}

/** La cancelacion identifica exactamente el bloqueo de origen; jamas libera otro UID. */
export async function releaseBlock(reservation, { odoo, ledger, audit } = {}) {
  if (reservation.status !== 'cancelled') throw new Error('CANCELLED_STATUS_REQUIRED');
  const current = await odoo.listBlocks();
  const owned = current.find((b) => b.idempotency_key === reservation.idempotency_key && b.source === reservation.source);
  if (!owned) {
    auditRecord(audit, 'releaseBlock', reservation, 'NO_OWN_BLOCK');
    return { status: 'NO_OWN_BLOCK' };
  }
  await odoo.releaseBlock(reservation.idempotency_key);
  ledger.revisions.set(reservation.idempotency_key, revision(reservation));
  auditRecord(audit, 'releaseBlock', reservation, 'RELEASED');
  return { status: 'RELEASED' };
}

/** Reconcilia eventos explicitos. Ausencias en un feed no cancelan: pueden ser feeds parciales. */
export async function reconcile(reservations, deps) {
  const results = [];
  for (const reservation of deduplicate(reservations)) {
    results.push(reservation.status === 'cancelled'
      ? await releaseBlock(reservation, deps)
      : await applyBlock(reservation, deps));
  }
  return results;
}

/** Importacion local de texto iCal. No hace fetch ni escribe directamente en una OTA. */
export async function importCalendar({ ical, source, canonical_unit_id, mapping, correlation_id, odoo, ledger, audit }) {
  assertUnit(canonical_unit_id);
  if (typeof ical !== 'string' || !ical.includes('BEGIN:VCALENDAR') || !ical.includes('END:VCALENDAR')) {
    throw new Error('INVALID_ICAL_FEED');
  }
  const raw = parseIcal(ical);
  const kept = raw.filter((event) => !preventLoop(event));
  const reservations = kept.map((event) => normalizeReservation(event, {
    source, canonical_unit_id, mapping, correlation_id,
  }));
  const results = await reconcile(reservations, { odoo, ledger, audit });
  for (const event of raw.filter(preventLoop)) auditRecord(audit, 'importCalendar', {
    source, canonical_unit_id, external_reservation_id: event.uid,
  }, 'LOOP_DISCARDED');
  return { imported: reservations.length, loops_discarded: raw.length - kept.length, results };
}

/** Exportacion local derivada del estado Odoo; el llamador publica el texto tras el gate.
 * `destination_channel` evita el eco: el feed destinado a un canal omite los bloqueos
 * que ese mismo canal origino EN ESA MISMA UNIDAD. Los bloqueos del canal en otras
 * unidades se conservan porque su efecto CASA <-> habitaciones si debe llegar al canal.
 */
export async function exportCalendar({ canonical_unit_id, from, to, stamp, odoo, ledger, destination_channel }) {
  assertUnit(canonical_unit_id);
  assertWindow(from, to);
  if (destination_channel != null && !SOURCES.has(destination_channel)) throw new Error('UNKNOWN_OTA_SOURCE');
  const all = await odoo.listBlocks();
  const blocks = destination_channel
    ? all.filter((b) => !(b.source === destination_channel && b.canonical_unit_id === canonical_unit_id))
    : all;
  const ical = buildIcalFeed(toInventory(blocks), LEGACY_UNIT[canonical_unit_id], { from, to, stamp });
  for (const event of parseIcal(ical)) ledger?.exportedUids.add(event.uid);
  return ical;
}

export function createChannelAdapter(source, deps) {
  if (!SOURCES.has(source)) throw new Error('UNKNOWN_OTA_SOURCE');
  return Object.freeze({
    importCalendar: (args) => importCalendar({ ...deps, ...args, source }),
    exportCalendar: (args) => exportCalendar({ ...deps, ...args, destination_channel: source }),
  });
}
