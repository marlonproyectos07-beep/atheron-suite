/**
 * ATH-ODOO-WA-004 — Contacto asistido por WhatsApp. Puro: sin red, sin Odoo, sin envio.
 *
 * Que hace: a partir de LO QUE YA TRAE la reserva de Smoobu (nombre, telefono, fechas, enlace de check-in si existe),
 * prepara (1) un enlace wa.me con mensaje prellenado que SOLO abre el chat — el envio es manual —, o (2) si no hay un
 * telefono valido, una alternativa por Smoobu/Booking. Nunca inventa datos: sin telefono valido no hay accion de WhatsApp.
 *
 * Verificado el 2026-11-02 con la reserva 162332151 (Booking): `phone` vacio, `email` presente (alias), `guest-app-url`
 * vacio y sin campo de estado de online check-in. Por eso el estado digital NUNCA se deduce: queda NO_VERIFICADO.
 */

const DIGITS_ONLY = (s) => String(s ?? '').replace(/\D/g, '');

export const PHONE_REASONS = Object.freeze({
  SIN_TELEFONO: 'SIN_TELEFONO',
  NO_NUMERICO: 'TELEFONO_NO_NUMERICO',
  SIN_CODIGO_PAIS: 'NUMERO_SIN_CODIGO_DE_PAIS',
  LONGITUD_INVALIDA: 'LONGITUD_INVALIDA',
  COLOMBIA_NO_MOVIL: 'COLOMBIA_NO_ES_MOVIL',
  NUMERO_FALSO: 'NUMERO_REPETIDO_O_FALSO',
});

/**
 * Normaliza a formato internacional E.164. Solo adivina el pais en un caso sin ambiguedad: movil colombiano de 10 cifras
 * que empieza por 3. Cualquier otro numero sin "+" ni "00" se rechaza (no se supone el pais).
 * @returns {{ok:true,e164:string,digits:string}|{ok:false,reason:string}}
 */
export function normalizePhoneE164(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, reason: PHONE_REASONS.SIN_TELEFONO };
  if (/[^\d\s+().-]/.test(s)) return { ok: false, reason: PHONE_REASONS.NO_NUMERICO };
  let digits = DIGITS_ONLY(s);
  if (!digits) return { ok: false, reason: PHONE_REASONS.SIN_TELEFONO };
  const international = s.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!international) {
    if (/^3\d{9}$/.test(digits)) digits = `57${digits}`; // movil colombiano sin indicativo
    else if (/^573\d{9}$/.test(digits)) { /* ya trae 57 sin "+" */ } else return { ok: false, reason: PHONE_REASONS.SIN_CODIGO_PAIS };
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return { ok: false, reason: PHONE_REASONS.LONGITUD_INVALIDA };
  if (digits.startsWith('57') && !/^573\d{9}$/.test(digits)) return { ok: false, reason: PHONE_REASONS.COLOMBIA_NO_MOVIL };
  if (/^(\d)\1+$/.test(digits.slice(-7))) return { ok: false, reason: PHONE_REASONS.NUMERO_FALSO };
  return { ok: true, e164: `+${digits}`, digits };
}

const CHECKIN_HOSTS = new Set(['login.smoobu.com']);
/** Solo se acepta un enlace https de check-in cuyo host sea de Smoobu; cualquier otra cosa se descarta en silencio. */
export function safeCheckinLink(raw) {
  try {
    const u = new URL(String(raw ?? '').trim());
    return u.protocol === 'https:' && CHECKIN_HOSTS.has(u.hostname) && !u.username && !u.password ? u.toString() : null;
  } catch { return null; }
}

const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : null; };
const firstName = (name) => {
  const w = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'-]{2,}$/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : null;
};

/** Mensaje prellenado. Solo usa datos presentes: sin fechas o sin enlace, esa parte se omite. */
export function buildGuestMessage({ guestName, arrival, departure, checkinLink } = {}) {
  const n = firstName(guestName);
  const a = fmtDate(arrival); const d = fmtDate(departure);
  const link = safeCheckinLink(checkinLink);
  const parts = [`Hola${n ? ` ${n}` : ''}, le escribimos de Atheron Hotels.`];
  parts.push(a && d ? `Recibimos su reserva del ${a} al ${d}.` : 'Recibimos su reserva.');
  if (link) parts.push(`Para agilizar su llegada puede completar el check-in en línea aquí: ${link}`);
  parts.push('Quedamos atentos a cualquier duda.');
  return parts.join(' ');
}

/** Enlace que abre el chat con el mensaje escrito; NO envia nada (la persona pulsa enviar). */
export function buildWhatsappLink(e164, message) {
  const digits = DIGITS_ONLY(e164);
  if (!/^\d{8,15}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(message ?? '').slice(0, 1000))}`;
}

const SMOOBU_BOOKING_URL = 'https://login.smoobu.com/en/booking/detail/';
/** Alternativa cuando falta el telefono: abrir la reserva en Smoobu y escribir desde Mensajes (Booking no siempre entrega telefono). */
export function fallbackContact({ smoobuId }) {
  const id = Number(smoobuId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { channel: 'SMOOBU_MENSAJES', url: `${SMOOBU_BOOKING_URL}${id}`, hint: 'Escribir desde Mensajes de Smoobu (o la extranet de Booking); la reserva puede no traer telefono.' };
}

/**
 * Plan de contacto de una reserva.
 * @returns {{whatsapp:{available:boolean,url:string|null,reason:string|null}, fallback:object|null, message:string|null}}
 */
export function planGuestContact({ smoobuId, guest, arrival, departure, checkinLink } = {}) {
  const phone = normalizePhoneE164(guest?.phone);
  const fallback = fallbackContact({ smoobuId });
  if (!phone.ok) return { whatsapp: { available: false, url: null, reason: phone.reason }, fallback, message: null };
  const message = buildGuestMessage({ guestName: guest?.name, arrival, departure, checkinLink });
  return { whatsapp: { available: true, url: buildWhatsappLink(phone.e164, message), reason: null }, fallback, message };
}

/** Fragmento para la nota interna ATH-SYNC del pedido nuevo (el guard solo exige que empiece por "ATH-SYNC | "). */
export function assistNoteFragment(plan) {
  if (plan?.whatsapp?.available && plan.whatsapp.url) return ` | WhatsApp (abre el chat, envio manual): ${plan.whatsapp.url}`;
  const alt = plan?.fallback?.url ? ` | alternativa: ${plan.fallback.url}` : '';
  return ` | WhatsApp no disponible (${plan?.whatsapp?.reason ?? 'SIN_DATOS'})${alt}`;
}

/* ---------- estados independientes ---------- */
export const DIGITAL_STATES = Object.freeze(['NO_VERIFICADO', 'PENDIENTE', 'ENLACE_ENVIADO', 'COMPLETADO']);
export const PHYSICAL_STATES = Object.freeze(['NO_VERIFICADO', 'PENDIENTE', 'EN_CASA', 'SALIDA', 'CANCELADO']);
export const PAYMENT_STATES = Object.freeze(['NO_VERIFICADO', 'PENDIENTE', 'PARCIAL', 'PAGADO']);
const FROM_ODOO_PHYSICAL = { pending: 'PENDIENTE', confirmed: 'PENDIENTE', checked_in: 'EN_CASA', checked_out: 'SALIDA', cancelled: 'CANCELADO' };
/** x_checkin_state de planning.slot -> estado fisico. Vacio o desconocido = NO_VERIFICADO (nunca se supone). */
export const physicalFromOdoo = (v) => FROM_ODOO_PHYSICAL[v] ?? 'NO_VERIFICADO';

/**
 * Los tres estados son campos separados: ninguno se calcula a partir de otro. El digital no tiene fuente verificada en la API
 * (no hay campo de estado), asi que si nadie lo registra queda NO_VERIFICADO.
 */
export function contactStates({ digital = 'NO_VERIFICADO', physical = 'NO_VERIFICADO', payment = 'NO_VERIFICADO' } = {}) {
  const ok = (v, set, k) => { if (!set.includes(v)) throw new Error(`ESTADO_${k}_INVALIDO`); return v; };
  return { digital: ok(digital, DIGITAL_STATES, 'DIGITAL'), physical: ok(physical, PHYSICAL_STATES, 'FISICO'), payment: ok(payment, PAYMENT_STATES, 'PAGO') };
}
