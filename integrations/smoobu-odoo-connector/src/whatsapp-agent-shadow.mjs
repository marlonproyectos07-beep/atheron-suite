// ATH-PMS-WA-063 — Agente comercial de Atheron Hotels, MODO SOMBRA.
// PURO: sin red, sin Odoo, sin WhatsApp, sin escrituras. Compone el piloto de PR #108 con la consulta
// oficial de disponibilidad de PR #110. Solo produce BORRADORES para aprobacion humana (sendEnabled=false).
import { advanceInquiry } from './whatsapp-pilot-shadow.mjs';
import { normalizeAvailabilityResponse, validateAvailabilityInput } from './availability-readonly.mjs';
import { UNITS } from './unit-map.mjs';

export const HOTELS_ACCOUNT_ID = 7; // Atheron Hotels (+57 301 803 5593). Security y Masivos quedan excluidos.
export const HOTELS_PHONE_NUMBER_ID = '1334054313134716';
export const POLICY = Object.freeze({ checkIn: '15:00', checkOut: '11:00' });
const PHYSICAL = Object.freeze(UNITS.filter((u) => u.unit !== 'CASA'));
const PHYSICAL_IDS = Object.freeze(PHYSICAL.map((u) => u.smoobuApartmentId));
const roomOf = (id) => PHYSICAL.find((u) => u.smoobuApartmentId === Number(id))?.unit ?? null;

const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const MONTH_RE = Object.keys(MONTHS).join('|');
const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const validIso = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

/** Convierte «del 15 al 17 de noviembre» / «15 de noviembre» a fechas ISO. Anio = proxima ocurrencia futura. */
export function normalizeSpanishDates(text, today) {
  const ty = Number(today.slice(0, 4));
  const toIso = (d, mName) => {
    const m = MONTHS[mName]; const day = Number(d);
    for (const y of [ty, ty + 1]) { if (validIso(y, m, day)) { const iso = `${y}-${pad(m)}-${pad(day)}`; if (iso >= today) return iso; } }
    return null; // fecha invalida: el piloto la derivara a humano
  };
  let out = strip(text);
  out = out.replace(new RegExp(`\\bdel\\s+(\\d{1,2})\\s+al\\s+(\\d{1,2})\\s+de\\s+(${MONTH_RE})\\b`, 'g'),
    (_, a, b, mo) => `${toIso(a, mo) ?? 'fecha-invalida'} ${toIso(b, mo) ?? 'fecha-invalida'}`);
  out = out.replace(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTH_RE})\\b`, 'g'), (_, d, mo) => toIso(d, mo) ?? 'fecha-invalida');
  return out;
}

/** Valida la forma del evento entrante y descarta todo lo que no sea inbound de Atheron Hotels. */
export function validateInboundEvent(ev) {
  if (!ev || typeof ev !== 'object') return { ok: false, code: 'INVALID_EVENT' };
  if (ev.direction !== 'inbound') return { ok: false, code: 'NOT_INBOUND' };
  if (ev.accountId !== HOTELS_ACCOUNT_ID) return { ok: false, code: 'NOT_HOTELS_ACCOUNT' };
  if (ev.phoneNumberId !== undefined && String(ev.phoneNumberId) !== HOTELS_PHONE_NUMBER_ID) return { ok: false, code: 'NOT_HOTELS_PHONE' };
  if (!/^\+?\d{8,15}$/.test(String(ev.from ?? ''))) return { ok: false, code: 'INVALID_SENDER' };
  return { ok: true };
}

const SAFE = Object.freeze({ sendEnabled: false, bookingEnabled: false, odooWriteEnabled: false, paymentEnabled: false });
const tail = ` Check-in desde las ${POLICY.checkIn}, check-out hasta las ${POLICY.checkOut}. Esto no es una reserva confirmada.`;

/** Paso 1: del mensaje al siguiente paso. Sin red. */
export function handleInbound({ event, today, previous = null }) {
  const v = validateInboundEvent(event);
  if (!v.ok) return { kind: 'blocked', code: v.code, ...SAFE };
  const message = normalizeSpanishDates(String(event.text ?? ''), today);
  const r = advanceInquiry({ message, messageId: event.messageId, accountId: event.accountId, today, previous });
  if (r.kind !== 'lookup_ready') {
    // needs_details / handoff / duplicate / blocked: borrador de pregunta o derivacion; nunca envio.
    const out = { ...r, ...SAFE, needsHuman: r.kind === 'handoff' };
    if (r.kind === 'needs_details') {
      out.draft = '¡Hola! Bienvenido a Atheron Hotels. Para consultar disponibilidad, cuéntenos: ' + r.missing.map((m) => m.replace(/\s*\(AAAA-MM-DD\)/, '')).join(', ') + '.';
    }
    return out;
  }
  const { arrival, departure, guests } = r.state;
  const request = validateAvailabilityInput({ arrivalDate: arrival, departureDate: departure, apartmentIds: [...PHYSICAL_IDS], customerId: 1, guests });
  return { kind: 'lookup_required', state: r.state, lookup: { arrivalDate: request.arrivalDate, departureDate: request.departureDate, guests: request.guests, apartmentIds: request.apartmentIds, needsCustomerId: true }, ...SAFE };
}

/** Paso 2: con la respuesta real de Smoobu (checkApartmentAvailability) genera el borrador comercial. */
export function composeDraft({ state, response }) {
  const rows = normalizeAvailabilityResponse({ response, apartmentIds: PHYSICAL_IDS }).map((x) => ({ ...x, room: roomOf(x.apartmentId) }));
  const cap = rows.filter((x) => x.status === 'unavailable' && /guests? exceeds|number of guests/i.test(x.reason));
  const open = rows.filter((x) => x.status === 'available_quote' || x.status === 'available_price_unverified');
  const quoted = rows.filter((x) => x.status === 'available_quote' && x.currency === 'COP');
  const base = { state, rooms: rows, ...SAFE, needsHuman: true };
  const when = `llegar el ${state.arrival} y salir el ${state.departure}, ${state.guests} persona(s)`;
  if (cap.length === rows.length) {
    return { ...base, kind: 'handoff', reason: 'GUEST_CAPACITY_UNVERIFIED',
      draft: `Gracias por su consulta (${when}). Para esa cantidad de personas necesitamos que recepción confirme la ocupación de las habitaciones; un asesor le responderá en breve.` };
  }
  if (!open.length) {
    return { ...base, kind: 'no_availability', reason: 'NO_VERIFIED_AVAILABILITY',
      draft: `Gracias por su consulta. Para ${when}, no vemos habitaciones disponibles. Si tiene flexibilidad de fechas, un asesor puede sugerirle alternativas.` };
  }
  const names = open.map((x) => x.room).join(', ');
  if (quoted.length) {
    const lines = quoted.map((x) => `Habitación ${x.room}: ${x.price} ${x.currency} (total de la estadía)`).join('; ');
    return { ...base, kind: 'draft_with_price', reason: 'PRICE_VERIFIED_PENDING_HUMAN_APPROVAL',
      draft: `Para ${when}, tenemos disponibles: habitaciones ${names}. ${lines}.${tail}` };
  }
  return { ...base, kind: 'draft_without_price', reason: 'PRICE_UNVERIFIED',
    draft: `Para ${when}, vemos disponibles: habitaciones ${names}. El valor lo confirma recepción.${tail}` };
}
