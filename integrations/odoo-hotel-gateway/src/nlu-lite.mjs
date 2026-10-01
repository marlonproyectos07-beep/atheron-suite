/**
 * ATH-ODOO-HOTEL-010 (preparacion), Gate 010-B - capa de interpretacion
 * de mensajes, DESACOPLADA de WhatsApp y del motor de estados
 * (`conversation-engine.mjs`). Convierte texto libre en espanol a una
 * estructura de slots; NUNCA decide nada comercial (eso sigue siendo
 * trabajo exclusivo de `conversation-engine.mjs` + el Gateway/Odoo).
 *
 * Deliberadamente basado en reglas (sin modelo externo, sin red, 100%
 * determinista y testeable) -- suficiente para el laboratorio de
 * HOTEL-010; una NLU real (proveedor externo) podria reemplazar
 * `parseMessage` sin tocar el resto del sistema, porque produce la
 * MISMA estructura de salida.
 *
 * Regla que gobierna este archivo: si no puede inferir un dato con
 * confianza, lo deja `null` y marca el campo en `missing_fields` --
 * nunca inventa una fecha, un numero de huespedes o una intencion.
 * Si el mensaje no calza con ningun patron conocido, el intent es
 * `needs_clarification`.
 */

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita tildes para matching robusto
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dowOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Proxima fecha (estrictamente futura) que caiga en `weekdayName`. */
function nextWeekday(referenceDate, weekdayName) {
  const target = WEEKDAYS.indexOf(weekdayName);
  if (target === -1) return null;
  const todayDow = dowOf(referenceDate);
  let delta = target - todayDow;
  if (delta <= 0) delta += 7;
  return addDays(referenceDate, delta);
}

function findDates(normalized, referenceDate) {
  if (!referenceDate) return { checkIn: null, checkOut: null };
  const dayMonthRange = normalized.match(new RegExp(`\\bdel\\s+(\\d{1,2})\\s+al\\s+(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+de\\s+(\\d{4}))?\\b`));
  if (dayMonthRange) {
    const month = MONTHS.indexOf(dayMonthRange[3]) + 1;
    const [arrivalDay, departureDay] = [Number(dayMonthRange[1]), Number(dayMonthRange[2])];
    let year = dayMonthRange[4] ? Number(dayMonthRange[4]) : Number(referenceDate.slice(0, 4));
    const dateFor = (day) => {
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date.toISOString().slice(0, 10) : null;
    };
    if (arrivalDay >= departureDay) return { checkIn: null, checkOut: null };
    let checkIn = dateFor(arrivalDay);
    let checkOut = dateFor(departureDay);
    if (checkIn && checkOut && !dayMonthRange[4] && checkIn < referenceDate) {
      year += 1;
      checkIn = dateFor(arrivalDay);
      checkOut = dateFor(departureDay);
    }
    return { checkIn, checkOut };
  }
  if (/\bmanana\b/.test(normalized) && !/\bpasado manana\b/.test(normalized)) {
    return { checkIn: addDays(referenceDate, 1), checkOut: null };
  }
  if (/\bhoy\b/.test(normalized)) {
    return { checkIn: referenceDate, checkOut: null };
  }
  const rangeMatch = normalized.match(new RegExp(`del (${WEEKDAYS.join('|')}) al (${WEEKDAYS.join('|')})`));
  if (rangeMatch) {
    const checkIn = nextWeekday(referenceDate, rangeMatch[1]);
    let checkOut = nextWeekday(referenceDate, rangeMatch[2]);
    if (checkOut && checkIn && checkOut <= checkIn) checkOut = addDays(checkOut, 7);
    return { checkIn, checkOut };
  }
  const singleDayMatch = normalized.match(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`));
  if (singleDayMatch) {
    return { checkIn: nextWeekday(referenceDate, singleDayMatch[1]), checkOut: null };
  }
  const isoMatch = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
  if (isoMatch && isoMatch.length >= 2) return { checkIn: isoMatch[0], checkOut: isoMatch[1] };
  if (isoMatch && isoMatch.length === 1) return { checkIn: isoMatch[0], checkOut: null };
  return { checkIn: null, checkOut: null };
}

function findStayNights(normalized) {
  const match = normalized.match(/\b(?:por\s+)?(\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+noches?\b/);
  if (!match) return null;
  const token = match[1];
  const words = { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const value = token in words ? words[token] : Number(token);
  return Number.isInteger(value) && value > 0 ? value : null;
}

const NUMBER_WORDS = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const NUMBER_TOKEN = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;

function toNumber(token) {
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  const value = Number(token);
  return Number.isInteger(value) ? value : null;
}

function findGuests(normalized) {
  if (/\b(?:somos\s+)?(?:una\s+)?pareja\b/.test(normalized)) return 2;
  // "somos 7, no 5" -> se queda con el ULTIMO numero mencionado (correccion
  // explicita del cliente), nunca con el primero. Acepta digitos y numeros
  // en palabra ("dos", "tres"...) hasta diez.
  const pattern = new RegExp(`(?:somos|para|seriamos)\\s+${NUMBER_TOKEN}|${NUMBER_TOKEN}\\s+personas`, 'g');
  const matches = [...normalized.matchAll(pattern)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return toNumber(last[1] ?? last[2]);
}

const INTENT_PATTERNS = [
  { intent: 'human_request', re: /hablar con (alguien|una persona|un humano)|necesito ayuda humana/ },
  { intent: 'request_cancellation', re: /cancelar|anular/ },
  { intent: 'request_discount', re: /descuento|rebaja/ },
  { intent: 'ask_price', re: /cuanto (vale|cuesta)|cuanto sale|precio|tarifa|valor/ },
  { intent: 'ask_media', re: /fotos?|imagenes?|video|verla|verlo|mostrar(me|nos)?|como (es|se ve)|quiero verla|quiero verlo/ },
  { intent: 'affirmation', re: /^(si|sí|claro|dale|ok|okay|bueno|perfecto|listo)[.!?\s]*$/ },
  { intent: 'request_alternatives', re: /algo mas barato|otra opcion|alternativa/ },
  { intent: 'request_booking', re: /quiero reservar|hacer la reserva|reservar ya/ },
  { intent: 'change_dates', re: /cambiamela|cambiar (la )?fecha|mejor para el/ },
];

function findIntent(normalized, { hasGuestCorrection }) {
  for (const { intent, re } of INTENT_PATTERNS) {
    if (re.test(normalized)) return intent;
  }
  if (hasGuestCorrection) return 'update_guests';
  if (/necesito|busco|quiero (una habitacion|alojamiento)|habitacion|alojamiento|hospedarnos|hospedarme|quedarnos|quedarme/.test(normalized)) return 'availability_inquiry';
  return null;
}

/**
 * @param {string} text - mensaje crudo del cliente
 * @param {{referenceDate?: string}} context - referenceDate en YYYY-MM-DD (hoy)
 */
export function parseMessage(text, { referenceDate = null } = {}) {
  const normalized = normalize(text ?? '');
  let { checkIn, checkOut } = findDates(normalized, referenceDate);
  const stayNights = findStayNights(normalized);
  if (checkIn && !checkOut && stayNights) checkOut = addDays(checkIn, stayNights);
  const guests = findGuests(normalized);
  const hasGuestCorrection = /somos \d{1,2}.*no \d{1,2}/.test(normalized);
  let intent = findIntent(normalized, { hasGuestCorrection });

  if (!intent) {
    if (checkIn || checkOut) intent = 'provide_dates';
    else if (guests != null) intent = 'provide_guests';
    else intent = 'needs_clarification';
  }

  const missingFields = [];
  if (['availability_inquiry', 'request_booking', 'provide_dates'].includes(intent)) {
    if (!checkIn) missingFields.push('check_in');
    if (!checkOut) missingFields.push('check_out');
    if (guests == null) missingFields.push('guests');
  }

  return {
    intent,
    check_in: checkIn,
    check_out: checkOut,
    guests,
    stay_nights: stayNights,
    requested_action: intent,
    missing_fields: missingFields,
    confidence: intent === 'needs_clarification' ? 'low' : checkIn || guests != null || intent !== 'availability_inquiry' ? 'high' : 'medium',
  };
}

/**
 * Traduce los slots de `parseMessage` al `input` que espera
 * `conversation-engine.mjs#advanceConversation`. Es el UNICO punto de
 * acoplamiento entre las dos capas -- a proposito, para que se puedan
 * probar y reemplazar por separado.
 */
export function toEngineInput(slots) {
  return {
    checkIn: slots.check_in ?? undefined,
    checkOut: slots.check_out ?? undefined,
    guests: slots.guests ?? undefined,
    askPrice: slots.intent === 'ask_price' || undefined,
    askMedia: slots.intent === 'ask_media' || undefined,
    affirmation: slots.intent === 'affirmation' || undefined,
    requestDiscount: slots.intent === 'request_discount' || undefined,
    requestBooking: slots.intent === 'request_booking' || undefined,
    requestAlternatives: slots.intent === 'request_alternatives' || undefined,
    requestCancellation: slots.intent === 'request_cancellation' || undefined,
    sensitiveReason: slots.intent === 'human_request' ? 'CLIENT_REQUESTED_HUMAN' : undefined,
  };
}
