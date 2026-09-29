/**
 * Workstream K - reserva manual de recepcion (Angela), sin Excel.
 *
 * Pasa por la MISMA logica que cualquier otro canal: disponibilidad ->
 * cotizacion -> HOLD. No existe bypass: si la unidad no esta disponible,
 * nunca se llega a crear cotizacion ni HOLD (eso es justamente lo que
 * evita overbooking desde recepcion).
 */

export const REJECTED_UNIT_NOT_AVAILABLE = 'UNIT_NOT_AVAILABLE';

/**
 * @param {{guest: string, phone: string, checkin: string, checkout: string, guests: number, unit: string}} input
 * @param {{checkAvailability: Function, createQuote: Function, createHold: Function}} deps
 */
export async function createManualReservation(input, { checkAvailability, createQuote, createHold }) {
  const { guest, phone, checkin, checkout, guests, unit } = input;
  if (!guest || !unit || !checkin || !checkout) {
    throw new Error('MANUAL_RESERVATION_REQUIRES_GUEST_UNIT_CHECKIN_CHECKOUT');
  }

  const available = await checkAvailability(unit, checkin, checkout);
  if (!available) {
    return { status: 'REJECTED', reason: REJECTED_UNIT_NOT_AVAILABLE, unit, checkin, checkout };
  }

  // source_channel='reception' viaja explicito hacia el gateway, igual que
  // 'sofia' -- nunca se inventa un canal ni se salta la cotizacion.
  const quote = await createQuote({ unit, checkin, checkout, guests, source_channel: 'reception' });
  const hold = await createHold({ quote_id: quote.quote_id, source_channel: 'reception' });

  return {
    status: 'HELD',
    guest,
    phone: phone ?? null,
    unit,
    checkin,
    checkout,
    guests,
    quote_id: quote.quote_id,
    hold_id: hold.hold_id,
  };
}
