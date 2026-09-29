/**
 * Workstream E - flujo minimo integrable para hotelesatheron.com.
 *
 * No rehace la arquitectura del sitio (sigue siendo Astro estatico, sin
 * framework nuevo). Esto es la orquestacion reutilizable que un futuro
 * widget de reservas llamaria: seleccion de fechas/personas ->
 * availability -> alternativas si no hay -> quote -> HOLD. Todo pasa por
 * el gateway ya probado (clients/web-client.mjs), nunca calcula
 * disponibilidad ni precio por su cuenta.
 */
import { requestAccommodationAlternatives } from './alternatives-engine.mjs';

/**
 * @param {{unit: string, checkIn: string, checkOut: string, guests: number}} selection
 * @param {{client: {availability: Function, quote: Function, hold: Function}}} deps
 */
export async function runWebBookingFlow({ unit, checkIn, checkOut, guests }, { client, unitIdMap = {} }) {
  // El contrato real de /hotel/availability y /hotel/quote (src/contract.mjs)
  // NO acepta unit_id: es una consulta por PROPIEDAD (devuelve todas las
  // unidades), y el llamador filtra localmente. Mandar unit_id ahi produce
  // UNKNOWN_FIELD (bug real encontrado en ATH-ODOO-HOTEL-008, ver logs de
  // Vercel). Solo /hotel/hold acepta unit_id.
  let availabilityCache = null;
  const fetchAvailabilityOnce = () => {
    if (!availabilityCache) {
      availabilityCache = client.availability({ check_in: checkIn, check_out: checkOut, guests });
    }
    return availabilityCache;
  };

  const checkAvailability = async (candidateUnit) => {
    const response = await fetchAvailabilityOnce();
    if (response?.ok === false) throw new Error(`AVAILABILITY_FAILED: ${response?.error?.code ?? 'UNKNOWN'}`);
    const data = response?.data ?? response;
    const unitId = unitIdMap[candidateUnit];
    const opciones = Array.isArray(data?.opciones) ? data.opciones : Array.isArray(data?.units) ? data.units : [];
    const found = opciones.find((u) => String(u.unit_id) === String(unitId));
    if (!found) return false;
    if (typeof found.available === 'boolean') return found.available;
    return found.estado === 'disponible';
  };

  const alternatives = await requestAccommodationAlternatives(
    { requestedUnit: unit, checkIn, checkOut, guests },
    { checkAvailability },
  );

  if (!alternatives.requested_available) {
    return { step: 'availability', status: 'UNAVAILABLE', ...alternatives };
  }

  const quote = await client.quote({ check_in: checkIn, check_out: checkOut, guests, idempotency_key: cryptoRandomKey() });
  if (quote?.ok === false) {
    return { step: 'quote', status: 'FAILED', error_code: quote?.error?.code ?? 'UNKNOWN' };
  }

  const hold = await client.hold({ quote_id: quote.quote_id, unit_id: unitIdMap[unit], idempotency_key: cryptoRandomKey() });
  if (hold?.ok === false) {
    return { step: 'hold', status: 'FAILED', error_code: hold?.error?.code ?? 'UNKNOWN' };
  }

  return { step: 'hold', status: 'HELD', quote_id: quote.quote_id, hold_id: hold.hold_id };
}

function cryptoRandomKey() {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
