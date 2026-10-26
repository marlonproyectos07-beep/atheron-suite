/**
 * Filtro anti-eco Smoobu -> Odoo -> iCal -> Smoobu (ATH-DEV-017). Funcion pura, sin red.
 * La forma exacta de las reservas de Smoobu NO esta verificada (API con 401): el filtro es defensivo y
 * se apoya en banderas y textos que, si no existen, no cambian el resultado.
 *
 * Camino de eco a cortar: una reserva de Smoobu se importa a Odoo como turno "directo" (sin x_nobeds_id);
 * la accion 1654 lo publica en el .ics (SUMMARY "ODOO <unidad> - ...") y el cron 147 lo refresca cada 5 min.
 * Si Smoobu (o un canal conectado a Smoobu) importa ese calendario, el mismo turno volveria como un
 * bloqueo y se reimportaria. Defensas: (1) ignorar bloqueos/calendarios, (2) ignorar el marcador ODOO,
 * (3) ignorar lo que coincida con un turno de Odoo ya existente, (4) no reimportar lo propio (libro de claves).
 */
import { defaultNightWindow } from './reconcile.mjs';

const ECHO_TEXT = /^\s*ODOO\b/i;
const CALENDAR_CHANNEL = /ical|calendar|calendario|odoo|nobeds|blocked|bloque/i;

const texts = (b) => [b['guest-name'], b.guestName, b.notice, b.summary, b.title, b.name, b.channel?.name, b.channelName].filter((x) => typeof x === 'string');

/** Ventana [15:00 de la primera noche, 11:00 del dia de salida) de una reserva de Smoobu. */
export function defaultWindowOf(b) {
  const last = new Date(Date.parse(`${b.departure}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return [defaultNightWindow(b.arrival)[0], defaultNightWindow(last)[1]];
}

export function echoVerdict(booking, { ownReservationIds = new Set(), odooSlots = [], unitForApartment, windowOf = defaultWindowOf }) {
  if (booking?.['is-blocked-booking'] === true || booking?.type === 'blocked' || booking?.isBlocked === true) return { echo: true, reason: 'BLOCKED_ENTRY' };
  if (texts(booking).some((t) => ECHO_TEXT.test(t))) return { echo: true, reason: 'ODOO_MARKER' };
  const ch = booking.channel?.name ?? booking.channelName;
  if (typeof ch === 'string' && CALENDAR_CHANNEL.test(ch)) return { echo: true, reason: 'CALENDAR_CHANNEL' };
  if (ownReservationIds.has(Number(booking.id))) return { echo: false, reason: 'ALREADY_IMPORTED' };
  const unit = unitForApartment?.(booking.apartment?.id);
  if (unit && windowOf) {
    const [ws, we] = windowOf(booking);
    const clash = odooSlots.filter((s) => s.roleId === unit.odooRoleId && s.start < we && s.end > ws && !s.key);
    // coincidencia EXACTA con un turno ajeno: casi seguro es la misma reserva viniendo por otro canal (NOBEDS)
    if (clash.some((s) => Math.abs(s.start - ws) < 3600000 && Math.abs(s.end - we) < 3600000)) return { echo: true, reason: 'MATCHES_EXISTING_FOREIGN_SLOT', slotIds: clash.map((s) => s.id) };
  }
  return { echo: false, reason: 'PASS' };
}

export function filterBookings(bookings, ctx) {
  const pass = []; const ignored = [];
  for (const b of bookings) {
    const v = echoVerdict(b, ctx);
    if (v.echo) ignored.push({ reservationId: b.id ?? null, ...v }); else pass.push(b);
  }
  return { pass, ignored };
}
