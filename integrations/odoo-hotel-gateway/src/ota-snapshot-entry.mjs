/**
 * Lectura de snapshots ota_snapshot_put tal como los guarda la accion 1967 en
 * x_hotel_api_log.x_request. Odoo puede guardar dos formas:
 *   - plana:    { idempotency_key, source, canonical_unit_id, state, ... }
 *   - envuelta: { entry: { idempotency_key, ... }, correlation_id }
 * Ambas deben leerse igual. Sin esta normalizacion, la revalidacion y el
 * adapter ven `state` indefinido en filas envueltas y fallan con
 * SNAPSHOT_CHANGED aunque el dato en Odoo sea correcto.
 */

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Devuelve { shape, entry } con shape: empty | invalid | unexpected | flat | wrapped. */
export function unwrapSnapshotRequest(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { shape: 'empty', entry: null };
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return { shape: 'invalid', entry: null };
  }
  if (!isPlainObject(parsed)) return { shape: 'invalid', entry: null };
  if (Object.keys(parsed).length === 0) return { shape: 'empty', entry: null };
  if ('entry' in parsed) {
    return isPlainObject(parsed.entry)
      ? { shape: 'wrapped', entry: parsed.entry }
      : { shape: 'unexpected', entry: null };
  }
  if (typeof parsed.idempotency_key === 'string' && parsed.idempotency_key !== '') {
    return { shape: 'flat', entry: parsed };
  }
  return { shape: 'unexpected', entry: null };
}

/**
 * Toma la fila mas reciente (la ultima por id ascendente, igual que la accion
 * 1967 con order='id desc', limit=1). Filas vacias o con forma inesperada
 * fallan cerrado.
 */
export function latestSnapshotEntry(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { code: 'SNAPSHOT_MISSING' };
  const unwrapped = unwrapSnapshotRequest(rows.at(-1)?.x_request);
  if (unwrapped.shape !== 'flat' && unwrapped.shape !== 'wrapped') {
    return { code: 'SNAPSHOT_SHAPE_UNEXPECTED', shape: unwrapped.shape, count: rows.length };
  }
  return { shape: unwrapped.shape, entry: unwrapped.entry, count: rows.length };
}

/** Snapshot CONFLICT que coincide exactamente con el evento iCal. */
export function snapshotMatchesEvent(entry, event) {
  return entry?.state === 'CONFLICT'
    && entry.check_in === event.dtstart
    && entry.check_out === event.dtend
    && entry.external_uid === event.uid;
}
