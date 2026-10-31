import { assessBookingAmounts, AMOUNT_BLOCKS } from './booking-amounts.mjs';

/** ATH-DEV-137/138: como mucho N lecturas de elementos de precio por ejecucion; las que no se leen quedan sin total fiable. */
export const PRICE_ELEMENT_READS = 40;
export const BOOKING_CHANNEL = 7208046;
const WANTED = new Set(['MISSING_IN_ODOO', 'MATCH', 'MATCH_DRAFT', 'ROOM_MOVED']);

/**
 * Desglose de las reservas VIGENTES de Booking que pueden crear o comparar un pedido. Solo GET a Smoobu.
 * Un fallo de lectura NO inventa nada: esa reserva queda con total no fiable (bloqueada para crear; aviso en el conciliador).
 * Si el cliente no sabe leer elementos de precio, no se devuelve nada (reglas antiguas).
 */
export async function readBookingAmounts(smoobu, report, bookings, { max = PRICE_ELEMENT_READS } = {}) {
  const amounts = new Map(); let requests = 0;
  if (typeof smoobu?.getPriceElements !== 'function') return { amounts, requests };
  const raw = new Map(bookings.map((b) => [Number(b?.id), b]));
  const want = (report.perReservation ?? []).filter((r) => r.smoobuStatus === 'ACTIVE' && r.channelId === BOOKING_CHANNEL && WANTED.has(r.verdict));
  for (const r of want) {
    if (requests >= max) { amounts.set(r.smoobuId, { ok: false, block: AMOUNT_BLOCKS.TOTAL_DESCONOCIDO }); continue; }
    requests += 1;
    let elements = null;
    try { elements = await smoobu.getPriceElements(r.smoobuId); } catch { elements = null; }
    amounts.set(r.smoobuId, assessBookingAmounts({ booking: raw.get(r.smoobuId), elements }));
  }
  return { amounts, requests };
}
