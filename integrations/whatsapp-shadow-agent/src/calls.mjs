/**
 * MISSED_CALL / CALL_REQUEST: solo se MODELA el evento. No se usa la Calling
 * API ni se llama a nadie. Produce prioridad, mensaje propuesto para despues
 * y una tarea de callback para un humano.
 */
import { bogotaToday, diffDays } from './nlu.mjs';

export const CALL_EVENTS = Object.freeze(['MISSED_CALL', 'CALL_REQUEST']);

export function handleCallEvent(event, { context = null, classification = 'UNKNOWN', now = new Date() } = {}) {
  if (!CALL_EVENTS.includes(event?.type)) throw new Error(`CALL_EVENT_UNKNOWN: ${event?.type}`);
  const today = bogotaToday(now);
  let priority = 'P3';
  let reason = 'contacto sin contexto conocido';
  if (classification === 'GUEST_RESERVED') {
    const days = context?.fecha_in ? diffDays(today, context.fecha_in) : null;
    if (days !== null && days <= 2) { priority = 'P1'; reason = 'huesped con reserva y llegada en 48 h o menos'; }
    else { priority = 'P2'; reason = 'huesped con reserva'; }
  } else if (classification === 'GUEST_LEAD') {
    priority = context?.precio_cotizado ? 'P2' : 'P3';
    reason = context?.precio_cotizado ? 'prospecto con cotizacion activa' : 'prospecto';
  } else if (classification === 'ATHERON_SECURITY') { priority = 'P1'; reason = 'posible tema de seguridad'; }
  else if (['ALLY_B2B', 'SUPPLIER', 'STAFF'].includes(classification)) { priority = 'P2'; reason = classification; }
  const proposedMessage = ['GUEST_LEAD', 'GUEST_RESERVED'].includes(classification)
    ? 'Hola, vimos que intentaste comunicarte con Hoteles Atero. Una persona del equipo te va a devolver la llamada; si prefieres, cuéntame por aquí en qué te podemos ayudar.'
    : null;
  return Object.freeze({
    type: 'CALL_EVENT_SHADOW', event: event.type, priority, priority_reason: reason,
    callback_required: true, callback_owner: 'HUMANO', proposed_followup_message: proposedMessage,
    call_placed: false, send: false,
  });
}
