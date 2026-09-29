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
export async function runWebBookingFlow({ unit, checkIn, checkOut, guests }, { client }) {
  const checkAvailability = async (candidateUnit, ci, co) => {
    const response = await client.availability({ check_in: ci, check_out: co, guests, unit_id: candidateUnit });
    // Forma real de error del gateway: { ok:false, error:{ code, message } }
    // (src/server.mjs), nunca un `error_code` plano.
    if (response?.ok === false) throw new Error(`AVAILABILITY_FAILED: ${response?.error?.code ?? 'UNKNOWN'}`);
    // El contrato real de Odoo decide "available"; aqui solo se propaga.
    return Boolean(response?.available);
  };

  const alternatives = await requestAccommodationAlternatives(
    { requestedUnit: unit, checkIn, checkOut, guests },
    { checkAvailability },
  );

  if (!alternatives.requested_available) {
    return { step: 'availability', status: 'UNAVAILABLE', ...alternatives };
  }

  const quote = await client.quote({ check_in: checkIn, check_out: checkOut, guests, unit_id: unit, idempotency_key: cryptoRandomKey() });
  if (quote?.ok === false) {
    return { step: 'quote', status: 'FAILED', error_code: quote?.error?.code ?? 'UNKNOWN' };
  }

  const hold = await client.hold({ quote_id: quote.quote_id, idempotency_key: cryptoRandomKey() });
  if (hold?.ok === false) {
    return { step: 'hold', status: 'FAILED', error_code: hold?.error?.code ?? 'UNKNOWN' };
  }

  return { step: 'hold', status: 'HELD', quote_id: quote.quote_id, hold_id: hold.hold_id };
}

function cryptoRandomKey() {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
