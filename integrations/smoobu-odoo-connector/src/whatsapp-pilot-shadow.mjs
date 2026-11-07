// ATH-PMS-WA-059 — Orquestador PURO, en sombra. Ninguna llamada HTTP, WhatsApp ni Odoo.
import { validateRatesInput, inspectDailyRates } from './rates-readonly.mjs';
import { UNITS } from './unit-map.mjs';

const PHYSICAL = Object.freeze(UNITS.filter((u) => u.unit !== 'CASA'));
const PHYSICAL_IDS = Object.freeze(PHYSICAL.map((u) => u.smoobuApartmentId));
const clean = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (s) => Date.parse(s + 'T00:00:00Z');
const plusDays = (s, n) => iso(dayMs(s) + n * 86400000);
const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && Number.isFinite(dayMs(s)) && iso(dayMs(s)) === s;

function parseDateIntent(raw, today) {
  const m = clean(raw);
  const dates = [...m.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map((x) => x[0]);
  if (dates.length > 2 || dates.some((d) => !dateOk(d))) return { invalid: true };
  const relative = m.includes('pasado manana') ? 2 : /\bmanana\b/.test(m) ? 1 : /\bhoy\b/.test(m) ? 0 : null;
  if (relative !== null && dates.length) return { invalid: true };
  let arrival = dates[0] || (relative === null ? null : plusDays(today, relative));
  const nightsMatch = m.match(/\b(\d{1,2})\s*(?:noches?|noche)\b/);
  const nights = nightsMatch ? Number(nightsMatch[1]) : null;
  if (nights !== null && (nights < 1 || nights > 30)) return { invalid: true };
  if (dates.length === 2 && nights !== null) return { invalid: true };
  let departure = dates[1] || (arrival && nights ? plusDays(arrival, nights) : null);
  return { arrival, departure };
}

function parseGuests(raw) {
  const m = clean(raw);
  const digits = m.match(/\b(\d{1,2})\s*(?:personas?|huespedes?|adultos?)\b/);
  const words = m.match(/\b(?:para|somos)\s+(una|uno|dos|tres|cuatro|cinco)\s+(?:personas?|huespedes?|adultos?)\b/);
  if (digits && words) return { invalid: true };
  const named = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
  const guests = digits ? Number(digits[1]) : words ? named[words[1]] : null;
  if (guests !== null && (guests < 1 || guests > 10)) return { invalid: true };
  return { guests };
}

export function advanceInquiry({ message, messageId, accountId, today, previous = null }) {
  if (accountId !== 7) return { kind: 'blocked', code: 'NOT_HOTELS_ACCOUNT' };
  if (!dateOk(today)) return { kind: 'blocked', code: 'INVALID_TODAY' };
  if (typeof message !== 'string' || !message.trim() || message.length > 1000) return { kind: 'blocked', code: 'INVALID_MESSAGE' };
  if (typeof messageId !== 'string' || !/^[a-zA-Z0-9_.:-]{4,120}$/.test(messageId)) return { kind: 'blocked', code: 'INVALID_MESSAGE_ID' };
  if (previous?.messageIds?.includes(messageId)) return { kind: 'duplicate', state: previous };
  const m = clean(message);
  if (/\b(?:casa completa|carrera 19|otra propiedad|hotel colonial|casa neusa)\b/.test(m)) {
    return { kind: 'handoff', reason: 'OUT_OF_SCOPE', draft: 'Por ahora atendemos consultas de nuestras cinco habitaciones. Un asesor revisará su solicitud.', sendEnabled: false };
  }
  const a = parseDateIntent(message, today);
  const g = parseGuests(message);
  if (a.invalid || g.invalid) return { kind: 'handoff', reason: 'AMBIGUOUS_OR_INVALID_DATA', draft: 'Para evitar errores, por favor indíquenos fecha de llegada (AAAA-MM-DD), fecha de salida (AAAA-MM-DD) y cantidad de personas.', sendEnabled: false };
  const state = { arrival: a.arrival || previous?.arrival || null, departure: a.departure || previous?.departure || null,
    guests: g.guests || previous?.guests || null, messageIds: [...(previous?.messageIds || []), messageId].slice(-20) };
  const missing = [];
  if (!state.arrival) missing.push('fecha de llegada (AAAA-MM-DD)');
  if (!state.departure) missing.push('fecha de salida (AAAA-MM-DD)');
  if (!state.guests) missing.push('cantidad de personas');
  if (missing.length) {
    return { kind: 'needs_details', state, missing, draft: '¡Hola! Bienvenido a Atheron Hotels. Para consultar disponibilidad, indíquenos: ' + missing.join(', ') + '.', sendEnabled: false };
  }
  try { validateRatesInput({ startDate: state.arrival, endDate: state.departure, apartmentIds: PHYSICAL_IDS }); }
  catch { return { kind: 'handoff', reason: 'INVALID_STAY', state, draft: 'Las fechas requieren revisión. Indíquenos llegada y salida válidas, máximo 30 noches.', sendEnabled: false }; }
  if (state.departure <= state.arrival || state.arrival < today) return { kind: 'handoff', reason: 'PAST_OR_ZERO_STAY', state, draft: 'Las fechas requieren revisión antes de cotizar.', sendEnabled: false };
  return { kind: 'lookup_ready', state, readOnlyRequest: { startDate: state.arrival, endDate: state.departure, apartmentIds: [...PHYSICAL_IDS], guests: state.guests }, draft: 'Consulta preparada. Pendiente de validar tarifas, ocupación y restricciones en Smoobu.', sendEnabled: false };
}

export function previewAvailability({ inquiry, rates, propertyNames = {}, verifiedCurrency = null }) {
  if (inquiry?.kind !== 'lookup_ready') return { kind: 'blocked', code: 'INQUIRY_NOT_READY' };
  const { arrival, departure, guests } = inquiry.state;
  const evaluated = inspectDailyRates({ rates, arrival, departure, physicalIds: PHYSICAL_IDS });
  const candidates = evaluated.filter((x) => x.status === 'candidate_only').map((x) => {
    const unit = PHYSICAL.find((u) => u.smoobuApartmentId === x.apartmentId);
    return { room: unit.unit, apartmentId: x.apartmentId, status: 'PRELIMINARY_NOT_BOOKABLE', nightlyTotal: x.nightlyTotal, nights: x.nights };
  });
  const unresolved = evaluated.filter((x) => x.status !== 'candidate_only').map((x) => ({ id: x.apartmentId, reason: x.reason }));
  // No se publica un precio comercial: API /rates puede omitir IVA, extras, huespedes o reglas de canal.
  const draft = candidates.length
    ? 'Consulta preliminar para ' + guests + ' persona(s), del ' + arrival + ' al ' + departure + '. Posibles habitaciones: ' + candidates.map((c) => c.room).join(', ') + '. Tarifas y disponibilidad sujetas a verificación de recepción. Aún no hay reserva confirmada.'
    : 'No podemos confirmar habitaciones disponibles con la información recibida. Recepción revisará la consulta.';
  return { kind: 'review_required', candidates, unresolved, draft, currencyStatus: verifiedCurrency ? 'INPUT_PROVIDED_NOT_VALIDATED' : 'NOT_VERIFIED', sendEnabled: false, bookingEnabled: false, odooWriteEnabled: false };
}
