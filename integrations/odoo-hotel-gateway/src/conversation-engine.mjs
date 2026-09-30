/**
 * ATH-ODOO-HOTEL-010 (preparacion), Frente H/G - maquina de estados
 * conversacional de laboratorio. NUNCA conecta WhatsApp/Meta real (ver
 * AI/ATH-ODOO-HOTEL-010_WHATSAPP_CONTRACT.md, WHATSAPP_CONNECTED: NO).
 *
 * Principio que gobierna todo este archivo (ya aprobado desde
 * HOTEL-006/007): LA IA CONVERSA. ODOO DECIDE. Este motor nunca calcula
 * disponibilidad, tarifa, ni confirma una reserva por su cuenta: cada
 * decision de negocio pasa por ai-tool-adapters.mjs, que a su vez delega
 * en el Gateway ya probado. Este motor solo decide EN QUE ORDEN llamar
 * esas herramientas y cuando escalar a un humano.
 *
 * La capa de NLU (texto libre -> {checkIn, checkOut, guests, unit}) esta
 * fuera de alcance de este gate (ver contrato HOTEL-010): `input` aqui ya
 * llega parseado, como si viniera de esa capa.
 */

import { requestAccommodationAlternatives, UNIT_CATALOG, ROOM_UNITS, CASA_COMPLETA } from './alternatives-engine.mjs';
import { checkAvailabilityTool, quoteTool, createHoldTool } from './ai-tool-adapters.mjs';
import { buildEvent } from './observability-events.mjs';

export const STATES = Object.freeze([
  'NEW',
  'COLLECTING_DATES',
  'COLLECTING_GUESTS',
  'CHECKING_AVAILABILITY',
  'OPTIONS_PRESENTED',
  'QUOTING',
  'COLLECTING_GUEST_DATA',
  'READY_FOR_HOLD',
  'HOLD_CREATED',
  'HUMAN_REQUIRED',
  'COMPLETED',
  'EXPIRED',
]);

function pickCandidateUnit(guests) {
  const room = ROOM_UNITS.find((u) => UNIT_CATALOG[u].capacity >= guests);
  if (room) return room;
  if (UNIT_CATALOG[CASA_COMPLETA].capacity >= guests) return CASA_COMPLETA;
  return null;
}

export function createConversation({ conversationId, correlationId, channel, customer = {} }) {
  if (!conversationId || !correlationId || !channel) {
    throw new Error('CONVERSATION_REQUIRES_CONVERSATION_ID_CORRELATION_ID_CHANNEL');
  }
  const now = new Date().toISOString();
  return {
    conversationId,
    correlationId,
    channel,
    customer,
    state: 'NEW',
    requested: { checkIn: null, checkOut: null, guests: null },
    options: [],
    selectedUnit: null,
    quote: null,
    hold: null,
    handoffReason: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function touch(conversation, patch) {
  return { ...conversation, ...patch, updatedAt: new Date().toISOString() };
}

function trace(conversation) {
  return { conversation_id: conversation.conversationId, correlation_id: conversation.correlationId, channel: conversation.channel };
}

function emit(onEvent, conversation, type, data) {
  const event = buildEvent(type, trace(conversation), data);
  if (onEvent) onEvent(event);
  return event;
}

function toHumanRequired(conversation, reason, onEvent) {
  emit(onEvent, conversation, 'human_handoff', { reason });
  return touch(conversation, { state: 'HUMAN_REQUIRED', handoffReason: reason });
}

/**
 * GATE 010-D: mecanismo para que Angela devuelva una conversacion
 * escalada a la IA (accion inversa a "TOMAR CONVERSACION"). Reconstruye
 * el estado mas avanzado que los datos YA CONFIRMADOS soportan -- nunca
 * asume un paso que no se volvio a verificar.
 */
export function resumeFromHuman(conversation) {
  if (conversation.state !== 'HUMAN_REQUIRED') {
    throw new Error('RESUME_ONLY_VALID_FROM_HUMAN_REQUIRED');
  }
  let state = 'COLLECTING_DATES';
  if (!conversation.requested.checkIn || !conversation.requested.checkOut) state = 'COLLECTING_DATES';
  else if (conversation.requested.guests == null) state = 'COLLECTING_GUESTS';
  else if (conversation.hold) state = 'HOLD_CREATED';
  else if (conversation.quote) state = 'READY_FOR_HOLD';
  else if (conversation.options.length > 0) state = 'OPTIONS_PRESENTED';
  else state = 'CHECKING_AVAILABILITY';
  return touch(conversation, { state, handoffReason: null });
}

/**
 * Avanza la conversacion un turno. `input` (ya parseado por la capa de
 * NLU, fuera de alcance): { checkIn, checkOut, guests, selectUnit,
 * requestDiscount, requestBooking, askPrice, sensitiveReason,
 * requestAlternatives }. `tools`: dependencias inyectadas (reales o de
 * prueba) para checkAvailability/quote/createHold.
 */
export async function advanceConversation(conversation, input, tools, onEvent) {
  if (conversation.state === 'HUMAN_REQUIRED' || conversation.state === 'COMPLETED' || conversation.state === 'EXPIRED') {
    return conversation; // conversacion cerrada/escalada: no se reabre sola
  }

  // Caso 10: reembolso/excepcion/queja/modificacion sensible -> humano,
  // sin excepcion, sin importar en que estado estuviera la conversacion.
  if (input.sensitiveReason) {
    return toHumanRequired(conversation, 'SENSITIVE_REQUEST', onEvent);
  }

  // Caso 4: descuento -> siempre requiere humano (no existe hoy una regla
  // de descuento autorizada que la IA pueda aplicar por su cuenta).
  if (input.requestDiscount) {
    return toHumanRequired(conversation, 'UNAUTHORIZED_DISCOUNT_REQUEST', onEvent);
  }

  // Cancelacion con impacto economico -- la IA nunca cancela un HOLD por
  // su cuenta (ver GATE 010-C, RED): el Gateway tampoco tiene hoy una
  // operacion de cancelacion aprobada (ver anti-overbooking-harness.mjs).
  if (input.requestCancellation) {
    return toHumanRequired(conversation, 'CANCELLATION_REQUEST_NEEDS_HUMAN', onEvent);
  }

  // Caso 15 (GATE 010-E): el HOLD vencio -- se libera la conversacion sin
  // intervencion humana, no es un caso sensible, solo se cierra el ciclo.
  if (input.holdExpired && conversation.state === 'HOLD_CREATED') {
    emit(onEvent, conversation, 'hold_expired', { hold_id: conversation.hold?.hold_id ?? null });
    return touch(conversation, { state: 'EXPIRED' });
  }

  let next = conversation;

  // Casos 7/8: cambio de fechas o de numero de huespedes a mitad de
  // conversacion invalida opciones/cotizacion previas -- se recalcula
  // desde la fuente real, nunca se reutiliza un numero viejo.
  const datesChanged =
    (input.checkIn && input.checkIn !== conversation.requested.checkIn) ||
    (input.checkOut && input.checkOut !== conversation.requested.checkOut);
  const guestsChanged = input.guests != null && input.guests !== conversation.requested.guests;
  if ((datesChanged || guestsChanged) && conversation.state !== 'NEW' && conversation.state !== 'COLLECTING_DATES' && conversation.state !== 'COLLECTING_GUESTS') {
    next = touch(next, { options: [], selectedUnit: null, quote: null, hold: null, state: 'CHECKING_AVAILABILITY' });
  }

  const requested = {
    checkIn: input.checkIn ?? next.requested.checkIn,
    checkOut: input.checkOut ?? next.requested.checkOut,
    guests: input.guests ?? next.requested.guests,
  };
  next = touch(next, { requested });

  // Fecha invalida: checkout <= checkin. Se reporta el error, no se
  // avanza de estado con datos incoherentes.
  if (requested.checkIn && requested.checkOut && requested.checkOut <= requested.checkIn) {
    return touch(next, { state: 'COLLECTING_DATES', lastError: 'CHECKOUT_MUST_BE_AFTER_CHECKIN', requested: { ...requested, checkOut: null } });
  }

  // Caso 1: solicitud vaga -- faltan fechas y/o huespedes.
  if (!requested.checkIn || !requested.checkOut) {
    return touch(next, { state: 'COLLECTING_DATES', lastError: null });
  }
  if (requested.guests == null) {
    return touch(next, { state: 'COLLECTING_GUESTS', lastError: null });
  }

  // Caso 9 (parcial): grupo mayor a la capacidad de cualquier alojamiento
  // -> escalar, nunca inventar una unidad que no cabe.
  const candidateUnit = input.selectUnit ?? pickCandidateUnit(requested.guests);
  if (!candidateUnit) {
    return toHumanRequired(next, 'LARGE_GROUP_NEEDS_APPROVAL', onEvent);
  }

  // Caso 6 explicito o seleccion pendiente: consultar disponibilidad real
  // (nunca calculada por la IA) antes de presentar opciones.
  if (next.state === 'NEW' || next.state === 'COLLECTING_DATES' || next.state === 'COLLECTING_GUESTS' || next.state === 'CHECKING_AVAILABILITY' || input.requestAlternatives) {
    next = touch(next, { state: 'CHECKING_AVAILABILITY' });
    const result = await requestAccommodationAlternatives(
      { requestedUnit: candidateUnit, checkIn: requested.checkIn, checkOut: requested.checkOut, guests: requested.guests },
      { checkAvailability: (unit, checkIn, checkOut) => checkAvailabilityTool({ unit, checkIn, checkOut, guests: requested.guests }, tools) },
    );
    emit(onEvent, next, 'availability_checked', { unit: candidateUnit, available: result.requested_available, alternatives_count: result.alternatives.length });

    const options = result.requested_available
      ? [{ unit: candidateUnit, capacity: UNIT_CATALOG[candidateUnit].capacity }]
      : result.alternatives;
    next = touch(next, { state: 'OPTIONS_PRESENTED', options, selectedUnit: null, quote: null });
  }

  // Caso 5 (seleccion explicita) o Caso 3 (pregunta de precio con una
  // sola opcion disponible): cotizar SOLO contra lo que Odoo ya confirmo
  // como disponible, nunca calculando un precio libremente.
  const wantsQuote = input.selectUnit || input.askPrice || input.requestBooking;
  if (next.state === 'OPTIONS_PRESENTED' && wantsQuote && next.options.length > 0) {
    const chosen = input.selectUnit
      ? next.options.find((o) => o.unit === input.selectUnit)
      : next.options.length === 1
        ? next.options[0]
        : null;
    if (!chosen) {
      // Varias opciones y ninguna seleccion explicita: se queda esperando
      // que el cliente elija, nunca asume una por su cuenta.
      return next;
    }
    next = touch(next, { state: 'QUOTING', selectedUnit: chosen.unit });
    const quote = await quoteTool({ unit: chosen.unit, checkIn: requested.checkIn, checkOut: requested.checkOut, guests: requested.guests }, tools);
    emit(onEvent, next, 'quote_generated', { unit: chosen.unit, quote_id: quote?.quote_id ?? null });

    if (quote?.requires_manual_confirmation) {
      return toHumanRequired(next, 'MANUAL_CONFIRMATION_REQUIRED', onEvent);
    }
    next = touch(next, { state: 'READY_FOR_HOLD', quote });
  }

  // Caso 5: "quiero reservar" -- solo crea el HOLD si ya hay cotizacion
  // real; nunca confirma lo que Odoo todavia no confirmo.
  if (input.requestBooking && next.state === 'READY_FOR_HOLD' && next.quote) {
    const hold = await createHoldTool({ quoteId: next.quote.quote_id }, tools);
    emit(onEvent, next, 'hold_created', { unit: next.selectedUnit, hold_id: hold?.hold_id ?? null });
    next = touch(next, { state: 'HOLD_CREATED', hold });
  }

  return next;
}
