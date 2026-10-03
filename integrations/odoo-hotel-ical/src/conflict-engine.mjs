/** Clasifica resultados sin convertir ausencia de fecha en LEGACY. */
import { classifyOverbooking, OVERBOOKING_CLASS } from './protection-cutoff.mjs';

export const SYNC_DECISIONS = Object.freeze([
  'LEGACY_OVERBOOKING', 'NEW_OVERBOOKING', 'AT_RISK', 'DUPLICATE', 'STALE_EVENT',
  'CANCELLED', 'RELEASED', 'UNCLASSIFIED_CONFLICT', 'APPLIED', 'UNKNOWN',
]);

export function classifySyncOutcome({ status, event = null, otherBookedAt = null, cutoffAt = null, atRisk = false } = {}) {
  if (status === 'CONFLICT') {
    const code = classifyOverbooking({ conflict: true, cutoff_at: cutoffAt,
      created_at: [event?.BOOKED_AT ?? null, otherBookedAt] });
    return Object.freeze({ code, severity: code === OVERBOOKING_CLASS.NEW_OVERBOOKING ||
      code === OVERBOOKING_CLASS.UNCLASSIFIED_CONFLICT ? 'CRITICAL' : 'P1' });
  }
  const code = {
    DUPLICATE: 'DUPLICATE', STALE_EVENT: 'STALE_EVENT', CANCELLED: 'CANCELLED',
    RELEASED: 'RELEASED', RELEASED_BY_DISAPPEARANCE: 'RELEASED',
    NO_OWN_BLOCK: 'DUPLICATE', APPLIED: atRisk ? 'AT_RISK' : 'APPLIED',
  }[status] ?? 'UNKNOWN';
  const severity = code === 'AT_RISK' || code === 'STALE_EVENT' ? 'P1' : 'INFO';
  return Object.freeze({ code, severity });
}
