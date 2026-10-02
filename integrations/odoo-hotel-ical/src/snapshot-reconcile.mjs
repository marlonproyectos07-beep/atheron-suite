/** HOTEL-017: reconciliacion por snapshot para cancelaciones por desaparicion.
 * Booking y Airbnb no envian STATUS:CANCELLED: el VEVENT deja de aparecer.
 * Un UID solo se libera tras DOS lecturas correctas consecutivas sin el, y solo
 * si el bloqueo en Odoo sigue siendo de ese mismo canal, unidad, clave y fechas.
 * Modulo puro: feed, puerto Odoo y almacen de snapshot se inyectan.
 */
import { parseIcal } from './ical-import.mjs';
import { importCalendar, normalizeReservation, preventLoop } from './ota-adapters.mjs';

export const RELEASE_AFTER_MISSES = 2;
const TRACKED = new Set(['ACTIVE', 'MISSING_PENDING']);

/** Almacen en memoria SOLO para pruebas. STAGING requiere persistencia durable. */
export function createSnapshotStore() {
  const rows = new Map();
  const id = (e) => `${e.source}|${e.canonical_unit_id}|${e.idempotency_key}`;
  return {
    list: async (source, unit) => [...rows.values()].filter((e) => e.source === source && e.canonical_unit_id === unit).map((e) => ({ ...e })),
    put: async (entry) => { rows.set(id(entry), { ...entry }); },
  };
}

function record(audit, operation, entry, result) {
  audit?.record?.({
    operation, source_channel: entry.source, unit_id: entry.canonical_unit_id,
    idempotency_key: entry.idempotency_key, correlation_id: entry.correlation_id ?? null, result,
  });
}

function validEnvelope(text) {
  return typeof text === 'string' && text.includes('BEGIN:VCALENDAR') && text.includes('END:VCALENDAR');
}

export async function reconcileSnapshot({
  feed, source, canonical_unit_id, mapping, correlation_id, odoo, ledger, audit, snapshotStore, now, allow_empty = false,
}) {
  if (!snapshotStore) throw new Error('SNAPSHOT_STORE_REQUIRED');
  if (!now) throw new Error('NOW_REQUIRED');
  const scope = { source, canonical_unit_id };
  if (!feed?.ok || !validEnvelope(feed.ical)) {
    record(audit, 'reconcileSnapshot', { ...scope, idempotency_key: null }, 'FEED_ERROR_NO_CHANGE');
    return { status: 'FEED_ERROR_NO_CHANGE', pending: [], released: [], kept: [] };
  }
  const events = parseIcal(feed.ical).filter((e) => !preventLoop(e));
  const previous = await snapshotStore.list(source, canonical_unit_id);
  const tracked = previous.filter((e) => TRACKED.has(e.state));
  if (events.length === 0 && tracked.length > 0 && !allow_empty) {
    record(audit, 'reconcileSnapshot', { ...scope, idempotency_key: null }, 'EMPTY_FEED_HELD');
    return { status: 'EMPTY_FEED_HELD', pending: [], released: [], kept: tracked.map((e) => e.idempotency_key) };
  }

  const imported = await importCalendar({ ical: feed.ical, source, canonical_unit_id, mapping, correlation_id, odoo, ledger, audit });
  const present = events.map((e) => normalizeReservation(e, { source, canonical_unit_id, mapping, correlation_id }));
  const byKey = new Map(previous.map((e) => [e.idempotency_key, e]));
  const seen = new Set();
  const resultByKey = new Map();
  { let i = 0; const done = new Set();
    for (const r of present) {
      const sig = `${r.idempotency_key}:${r.check_in}:${r.check_out}:${r.status}`;
      if (done.has(sig)) continue;
      done.add(sig); resultByKey.set(r.idempotency_key, imported.results[i++]?.status);
    } }

  for (const r of present) {
    if (seen.has(r.idempotency_key)) continue;
    seen.add(r.idempotency_key);
    const result = resultByKey.get(r.idempotency_key);
    const owned = result === 'APPLIED' || result === 'DUPLICATE';
    const prior = byKey.get(r.idempotency_key);
    await snapshotStore.put({
      source, canonical_unit_id, idempotency_key: r.idempotency_key, external_uid: r.external_reservation_id,
      check_in: r.check_in, check_out: r.check_out, correlation_id: r.correlation_id,
      first_seen_at: prior?.first_seen_at ?? now, last_seen_at: now, missing_count: 0,
      state: r.status === 'cancelled' ? 'CANCELLED' : owned ? 'ACTIVE' : (result ?? 'UNKNOWN'),
    });
  }

  const pending = [], released = [], kept = [];
  for (const entry of tracked) {
    if (seen.has(entry.idempotency_key)) continue;
    const missing_count = (entry.missing_count ?? 0) + 1;
    if (missing_count < RELEASE_AFTER_MISSES) {
      await snapshotStore.put({ ...entry, missing_count, state: 'MISSING_PENDING' });
      record(audit, 'reconcileSnapshot', entry, 'MISSING_PENDING');
      pending.push(entry.idempotency_key);
      continue;
    }
    const block = (await odoo.listBlocks()).find((b) => b.idempotency_key === entry.idempotency_key);
    const sameOwner = block && block.source === source && block.canonical_unit_id === canonical_unit_id
      && block.check_in === entry.check_in && block.check_out === entry.check_out;
    if (!sameOwner) {
      const state = block ? 'SUPERSEDED_IN_ODOO' : 'ALREADY_ABSENT_IN_ODOO';
      await snapshotStore.put({ ...entry, missing_count, state });
      record(audit, 'reconcileSnapshot', entry, state);
      kept.push(entry.idempotency_key);
      continue;
    }
    await odoo.releaseBlock(entry.idempotency_key);
    ledger?.revisions?.delete?.(entry.idempotency_key);
    await snapshotStore.put({ ...entry, missing_count, state: 'RELEASED', released_at: now });
    record(audit, 'reconcileSnapshot', entry, 'RELEASED_BY_DISAPPEARANCE');
    released.push(entry.idempotency_key);
  }
  return { status: 'OK', imported, pending, released, kept };
}
