import { ConnectorError } from './errors.mjs';
import { UNITS } from './unit-map.mjs';

/** Validacion estricta: fechas UTC, ventana acotada y IDs explicitos. */
function dayNumber(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ConnectorError('RATES_INVALID_DATE');
  const ms = Date.parse(s + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== s) throw new ConnectorError('RATES_INVALID_DATE');
  return Math.floor(ms / 86400000);
}

export function validateRatesInput({ startDate, endDate, apartmentIds }) {
  const a = dayNumber(startDate), b = dayNumber(endDate);
  if (b < a || b - a > 30) throw new ConnectorError('RATES_RANGE_INVALID');
  if (!Array.isArray(apartmentIds) || !apartmentIds.length || apartmentIds.length > 10) throw new ConnectorError('RATES_IDS_INVALID');
  const ids = apartmentIds.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw new ConnectorError('RATES_IDS_INVALID');
  return { from: startDate, to: endDate, ids: ids.sort((x, y) => x - y) };
}

/** Genera fechas de noche: salida exclusiva. No presume que la tarifa sea un precio final. */
export function inspectDailyRates({ rates, arrival, departure, physicalIds }) {
  const { from, to } = validateRatesInput({ startDate: arrival, endDate: departure, apartmentIds: physicalIds });
  const start = dayNumber(from), end = dayNumber(to);
  if (start === end) throw new ConnectorError('RATES_RANGE_INVALID');
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) throw new ConnectorError('SMOOBU_RESPONSE_INVALID');
  const parent = UNITS.find((u) => u.unit === 'CASA');
  const parentReturned = !!(parent && Object.hasOwn(rates, String(parent.smoobuApartmentId)));
  return physicalIds.map((id) => {
    const days = rates[String(id)];
    if (!days || typeof days !== 'object' || Array.isArray(days)) return { apartmentId: id, status: 'unknown', reason: 'NO_DAILY_DATA' };
    let sum = 0, reason = null;
    for (let d = start; d < end; d += 1) {
      const key = new Date(d * 86400000).toISOString().slice(0, 10);
      const v = days[key];
      if (!v || typeof v !== 'object') { reason = 'MISSING_NIGHT'; break; }
      if (!Number.isFinite(Number(v.available))) { reason = 'INVALID_AVAILABILITY'; break; }
      if (Number(v.available) <= 0) { reason = 'UNAVAILABLE_NIGHT'; break; }
      if (d === start && Number(v.min_length_of_stay || 0) > end - start) { reason = 'MIN_STAY_RESTRICTION'; break; }
      if (v.price === null || !Number.isFinite(Number(v.price)) || Number(v.price) < 0) { reason = 'PRICE_UNVERIFIED'; break; }
      sum += Number(v.price);
    }
    if (reason) return { apartmentId: id, status: ['UNAVAILABLE_NIGHT', 'MIN_STAY_RESTRICTION'].includes(reason) ? 'unavailable' : 'unknown', reason };
    return { apartmentId: id, status: 'candidate_only', nightlyTotal: sum, nights: end - start, currency: 'UNVERIFIED', parentInventory: parentReturned ? 'PARENT_DATA_PRESENT_REQUIRES_REVIEW' : 'PARENT_NOT_RETURNED' };
  });
}
