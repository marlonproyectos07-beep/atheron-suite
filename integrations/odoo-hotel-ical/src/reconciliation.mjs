/** Comparacion pura: Odoo es el inventario; los snapshots OTA son observaciones. */
import { isAvailable, nightsOf } from './inventory-model.mjs';
import { legacyUnit, toInventory } from './ota-adapters.mjs';

export const RECONCILIATION = Object.freeze({
  MATCH: 'MATCH',
  MISSING_IN_ODOO: 'MISSING_IN_ODOO',
  MISSING_IN_OTA: 'MISSING_IN_OTA',
  CONFLICT: 'CONFLICT',
  STALE: 'STALE',
  UNKNOWN: 'UNKNOWN',
});

function covers(windows, start, end) {
  return nightsOf(start, end).every((night) => windows.some((window) =>
    window.start <= night && night < window.end));
}

/** `expectedOutbound` se deriva del feed de Odoo, nunca de un inventario paralelo. */
export function reconcileInventories({ odooBlocks, scopes, snapshots, expectedOutbound = [], now, staleAfterSeconds = 900 }) {
  if (!Array.isArray(odooBlocks) || !Array.isArray(scopes) || !Array.isArray(snapshots)) throw new Error('RECONCILIATION_INPUT_REQUIRED');
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || !Number.isFinite(staleAfterSeconds) || staleAfterSeconds <= 0) {
    throw new Error('INVALID_RECONCILIATION_CLOCK');
  }
  const rows = [];
  for (const scope of scopes) {
    const snapshot = snapshots.find((item) => item.source === scope.source && item.unit === scope.unit);
    const base = { source: scope.source, unit: scope.unit };
    if (!snapshot || snapshot.complete !== true) {
      rows.push({ ...base, status: RECONCILIATION.UNKNOWN });
      continue;
    }
    const capturedMs = Date.parse(snapshot.captured_at);
    if (!Number.isFinite(capturedMs) || capturedMs > nowMs || (nowMs - capturedMs) / 1000 > staleAfterSeconds) {
      rows.push({ ...base, status: RECONCILIATION.STALE });
      continue;
    }
    const events = snapshot.events ?? [];
    if (!Array.isArray(events)) throw new Error('INVALID_SNAPSHOT_EVENTS');
    const sourceBlocks = odooBlocks.filter((block) => block.source?.toUpperCase() === scope.source &&
      block.canonical_unit_id === scope.unit);
    const seen = new Set();
    for (const event of events) {
      if (event.STATUS === 'CANCELLED') continue;
      seen.add(event.IDEMPOTENCY_KEY);
      const block = sourceBlocks.find((candidate) => candidate.idempotency_key === event.IDEMPOTENCY_KEY);
      if (block) {
        rows.push({ ...base, idempotency_key: event.IDEMPOTENCY_KEY,
          status: block.check_in === event.START && block.check_out === event.END
            ? RECONCILIATION.MATCH : RECONCILIATION.CONFLICT });
      } else {
        const unavailable = !isAvailable(toInventory(odooBlocks), legacyUnit(scope.unit), event.START, event.END);
        rows.push({ ...base, idempotency_key: event.IDEMPOTENCY_KEY,
          status: unavailable ? RECONCILIATION.CONFLICT : RECONCILIATION.MISSING_IN_ODOO });
      }
    }
    for (const block of sourceBlocks) {
      if (!seen.has(block.idempotency_key)) rows.push({ ...base, idempotency_key: block.idempotency_key,
        status: RECONCILIATION.MISSING_IN_OTA });
    }
    for (const desired of expectedOutbound.filter((item) => item.source === scope.source && item.unit === scope.unit)) {
      if (!Array.isArray(snapshot.blocked_windows)) {
        rows.push({ ...base, expected_start: desired.start, expected_end: desired.end,
          status: RECONCILIATION.UNKNOWN });
      } else {
        rows.push({ ...base, expected_start: desired.start, expected_end: desired.end,
          status: covers(snapshot.blocked_windows, desired.start, desired.end)
            ? RECONCILIATION.MATCH : RECONCILIATION.MISSING_IN_OTA });
      }
    }
  }
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}
