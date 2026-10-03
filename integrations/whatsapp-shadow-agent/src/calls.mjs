/**
 * MISSED_CALL / CALL_REQUEST -- solo se MODELA el evento (portado a mano desde
 * la referencia 4935d59, sin su texto ni su marca). No se usa la Calling API
 * ni se llama a nadie: clasifica, propone un mensaje SHADOW y deja una tarea
 * CALLBACK_HUMAN.
 */
import { PROPERTIES, POLICY } from './policy.mjs';

export const CALL_EVENTS = Object.freeze(['MISSED_CALL', 'CALL_REQUEST']);

const diffDays = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

export function classifyCaller(session, explicit = null) {
  if (explicit) return explicit;
  if (session?.reservation) return 'GUEST_RESERVED';
  if (session?.lastQuote || session?.memory?.checkIn || session?.memory?.guests) return 'GUEST_LEAD';
  return 'UNKNOWN';
}

export function processCallEvent(session, event, { classification = null } = {}) {
  if (!CALL_EVENTS.includes(event?.type)) throw new Error(`CALL_EVENT_UNKNOWN: ${event?.type}`);
  const cls = classifyCaller(session, classification);
  const today = session.now.slice(0, 10);
  let priority = 'P3';
  let reason = 'contacto sin contexto conocido';
  if (cls === 'GUEST_RESERVED') {
    const ci = session.reservation?.checkIn;
    const days = ci ? diffDays(today, ci) : null;
    if (days !== null && days <= 2) { priority = 'P1'; reason = 'huesped con reserva y llegada en 48 h o menos'; }
    else { priority = 'P2'; reason = 'huesped con reserva'; }
  } else if (cls === 'GUEST_LEAD') {
    priority = session.lastQuote ? 'P2' : 'P3';
    reason = session.lastQuote ? 'prospecto con cotizacion activa' : 'prospecto';
  } else if (cls === 'ATHERON_SECURITY') { priority = 'P1'; reason = 'posible tema de Atheron Security'; }
  else if (['ALLY_B2B', 'SUPPLIER', 'STAFF'].includes(cls)) { priority = 'P2'; reason = cls; }
  const guest = cls === 'GUEST_LEAD' || cls === 'GUEST_RESERVED';
  const proposed = guest
    ? 'Hola, vimos que intentaste comunicarte con Hoteles Atheron. Una persona del equipo te va a devolver la llamada; si prefieres, cuéntanos por aquí en qué te podemos ayudar.'
    : null;
  session.history.push({ role: 'call_event', text: event.type });
  return {
    type: 'CALL_EVENT_SHADOW',
    mode: POLICY.mode,
    event: event.type,
    classification: cls,
    priority,
    priority_reason: reason,
    escalate: true,
    escalation: { reason: 'CALLBACK_HUMAN', urgency: priority === 'P1' ? 'ALTA' : 'NORMAL' },
    callback: { required: true, owner: 'HUMANO', task: 'CALLBACK_HUMAN' },
    reply: proposed,
    call_placed: false,
    outbound: null,
  };
}
