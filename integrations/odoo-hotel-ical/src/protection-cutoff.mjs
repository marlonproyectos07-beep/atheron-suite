/** Clasificacion local; PHASE A no activa un corte ni cambia inventario real.
 * El corte es el instante UTC en que la proteccion nueva se active de verdad.
 * Falta de fecha nunca se clasifica como LEGACY por conveniencia.
 */
export const OVERBOOKING_CLASS = Object.freeze({
  LEGACY_OVERBOOKING: 'LEGACY_OVERBOOKING',
  NEW_OVERBOOKING: 'NEW_OVERBOOKING',
  AT_RISK: 'AT_RISK',
  NO_CONFLICT: 'NO_CONFLICT',
  UNCLASSIFIED_CONFLICT: 'UNCLASSIFIED_CONFLICT',
});

function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const normalized = new Date(milliseconds).toISOString();
  return normalized.slice(0, 19) === value.slice(0, 19) ? milliseconds : null;
}

export function classifyOverbooking({ conflict, created_at = [], cutoff_at = null, synchronized = false } = {}) {
  if (!conflict) return synchronized ? OVERBOOKING_CLASS.NO_CONFLICT : OVERBOOKING_CLASS.AT_RISK;
  const cutoff = utcInstant(cutoff_at);
  const created = created_at.map(utcInstant);
  if (cutoff === null || created.length < 2) {
    return OVERBOOKING_CLASS.UNCLASSIFIED_CONFLICT;
  }
  if (created.some((time) => time !== null && time >= cutoff)) return OVERBOOKING_CLASS.NEW_OVERBOOKING;
  if (created.some((time) => time === null)) return OVERBOOKING_CLASS.UNCLASSIFIED_CONFLICT;
  return OVERBOOKING_CLASS.LEGACY_OVERBOOKING;
}
