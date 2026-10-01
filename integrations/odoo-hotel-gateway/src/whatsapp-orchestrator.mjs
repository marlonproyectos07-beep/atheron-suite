/**
 * ATH-ODOO-HOTEL-011, Fase 5 -- orquestador del "golden path" completo:
 *
 *   MessagingProvider (LAB o WhatsAppCloudProvider, cualquiera de los
 *   dos, mismo contrato) -> nlu-lite.mjs -> conversation-engine.mjs ->
 *   ai-tool-adapters.mjs -> Gateway -> whatsapp-copy.mjs -> respuesta.
 *
 * Es el UNICO punto donde se conectan todas las piezas ya construidas
 * (HOTEL-009/010) -- no reimplementa ninguna. Mantiene una conversacion
 * por numero de telefono (`from`), en memoria (un Map), y por cada
 * mensaje entrante:
 *
 *   1. recupera o crea la conversacion de ese telefono;
 *   2. la NLU interpreta el texto (nunca decide nada comercial);
 *   3. el motor avanza (real, contra Gateway/Odoo si `tools` son reales);
 *   4. si escala a HUMAN_REQUIRED, arma la ficha de handoff
 *      (human-handoff.mjs) y la entrega via `onHumanRequired` -- este
 *      modulo NO tiene un canal real para notificar a Angela todavia,
 *      eso es responsabilidad de quien lo use;
 *   5. redacta la respuesta (whatsapp-copy.mjs, datos ya reales, nunca
 *      inventados) y la envia de vuelta por el mismo `provider`.
 */

import { parseMessage, toEngineInput } from './nlu-lite.mjs';
import { createConversation, advanceConversation } from './conversation-engine.mjs';
import { buildHandoffContext } from './human-handoff.mjs';
import * as copy from './whatsapp-copy.mjs';
import { mediaForUnit } from './whatsapp-media-catalog.mjs';

function currentUnit(conversation) {
  return conversation.selectedUnit
    ?? (conversation.options?.length === 1 ? conversation.options[0].unit : null);
}

function renderReply(conversation, priorState, slots = null) {
  if (slots?.intent === 'affirmation' && conversation.state === 'OPTIONS_PRESENTED') {
    return copy.offerNextStep({ unit: currentUnit(conversation) });
  }
  if (slots?.intent === 'needs_clarification' && conversation.state === 'OPTIONS_PRESENTED') {
    return copy.contextualClarification({ unit: currentUnit(conversation) });
  }

  switch (conversation.state) {
    case 'COLLECTING_DATES':
      return priorState === 'NEW' ? copy.greeting() : copy.askDates();
    case 'COLLECTING_GUESTS':
      return copy.askGuests();
    case 'OPTIONS_PRESENTED':
      return copy.presentOptions(conversation.options);
    case 'READY_FOR_HOLD':
      return copy.presentPrice({ unit: conversation.selectedUnit, total: conversation.quote?.total });
    case 'HOLD_CREATED':
      return copy.holdCreated({ holdId: conversation.hold?.hold_id });
    case 'HUMAN_REQUIRED':
      return copy.escalateToHuman();
    default:
      return copy.temporaryError();
  }
}

/**
 * @param {{provider, tools, referenceDate?: string, onHumanRequired?: Function, onEvent?: Function}} options
 *   `provider`: cualquier MessagingProvider (LAB o real).
 *   `tools`: deps reales o fake para check_availability/quote/create_hold (ver ai-tool-adapters.mjs).
 *   `onHumanRequired(handoffContext)`: llamado cuando una conversacion escala.
 */
export function createWhatsAppOrchestrator({
  provider,
  tools,
  referenceDate = null,
  onHumanRequired = null,
  onEvent = null,
  allowBookingActions = true,
  mediaResolver = mediaForUnit,
} = {}) {
  const conversations = new Map(); // from (telefono) -> conversation

  provider.onMessage(async (message) => {
    const { from, text, message_id } = message;

    // Fase 9 (idempotencia): un reintento real de WhatsApp con el MISMO
    // message_id nunca debe disparar una segunda operacion (HOLD, etc).
    // Se aplica aqui, a nivel de orquestador, para que valga igual con
    // cualquier MessagingProvider (LAB o real) sin depender de que cada
    // uno implemente su propio dedup interno en receiveMessage.
    if (message_id && typeof provider.deduplicate === 'function' && provider.deduplicate(message_id)) {
      return conversations.get(from) ?? null;
    }

    const correlationId = typeof provider.correlationId === 'function' ? provider.correlationId(message_id) : message_id;

    let conversation = conversations.get(from);
    const isNew = !conversation;
    if (isNew) {
      conversation = createConversation({ conversationId: `wa-${from}`, correlationId, channel: 'whatsapp' });
    }
    const priorState = conversation.state;

    const slots = parseMessage(text, { referenceDate: referenceDate ?? new Date().toISOString().slice(0, 10) });
    const engineInput = toEngineInput(slots);

    // HOTEL-016: media contextual. Si ya presentamos una sola unidad (o
    // ya hay una seleccion), una pregunta por fotos/video NO reinicia la
    // disponibilidad. Se responde con material REAL asociado a esa unidad.
    if (slots.intent === 'ask_media') {
      const unit = currentUnit(conversation);
      const media = unit && typeof mediaResolver === 'function' ? mediaResolver(unit) : null;
      try {
        if (!unit || !media) {
          await provider.sendMessage(from, copy.mediaUnavailable({ unit }));
        } else {
          await provider.sendMessage(from, copy.mediaIntro({ unit, hasVideo: Boolean(media.video) }));
          for (const image of media.images ?? []) {
            if (typeof provider.sendImage === 'function') {
              await provider.sendImage(from, image.url, image.caption);
            }
          }
          if (media.video && typeof provider.sendVideo === 'function') {
            await provider.sendVideo(from, media.video.url, media.video.caption);
          }
        }
        if (typeof provider.markRead === 'function') await provider.markRead(message_id);
      } catch (error) {
        if (typeof onEvent === 'function') onEvent({ type: 'send_failed', correlation_id: correlationId, error: error.message });
      }
      return conversation;
    }

    // HOTEL-016 TEST: capturamos intención de reserva pero NO creamos
    // HOLD ni reserva real. El gate comercial sigue cerrado.
    if (slots.intent === 'request_booking' && !allowBookingActions) {
      try {
        await provider.sendMessage(from, copy.bookingIntentSafe({ unit: currentUnit(conversation) }));
        if (typeof provider.markRead === 'function') await provider.markRead(message_id);
      } catch (error) {
        if (typeof onEvent === 'function') onEvent({ type: 'send_failed', correlation_id: correlationId, error: error.message });
      }
      return conversation;
    }

    // Fase 11 (fallas): Gateway offline / Odoo timeout / respuesta
    // malformada -- se propaga desde el motor (nunca se inventa un
    // resultado), pero el cliente SIEMPRE recibe una respuesta corta y
    // sin detalle tecnico, nunca silencio ni un stack trace. La
    // conversacion se conserva intacta (no se pierde el estado previo)
    // para poder reintentar despues.
    try {
      conversation = await advanceConversation(conversation, engineInput, tools, onEvent ?? undefined);
      conversations.set(from, conversation);
    } catch (error) {
      if (typeof onEvent === 'function') onEvent({ type: 'gateway_error', correlation_id: correlationId, error: error.message });
      await provider.sendMessage(from, copy.temporaryError());
      if (typeof provider.markRead === 'function') await provider.markRead(message_id);
      return conversation;
    }

    if (conversation.state === 'HUMAN_REQUIRED' && priorState !== 'HUMAN_REQUIRED') {
      const handoff = buildHandoffContext(conversation, conversation.handoffReason, text);
      if (typeof onHumanRequired === 'function') onHumanRequired(handoff);
    }

    // El motor ya avanzo (fuente de verdad: Gateway/Odoo, arriba). Que el
    // canal de salida no pueda entregar la respuesta (p.ej. adaptador de
    // WhatsApp real sin accessToken todavia, ver Fase 15/16) nunca debe
    // tirar la conversacion ni la peticion HTTP que la disparo -- se
    // reporta via onEvent y se sigue.
    const reply = renderReply(conversation, priorState, slots);
    try {
      await provider.sendMessage(from, reply);
      if (typeof provider.markRead === 'function') await provider.markRead(message_id);
    } catch (error) {
      if (typeof onEvent === 'function') onEvent({ type: 'send_failed', correlation_id: correlationId, error: error.message });
    }

    return conversation;
  });

  return {
    getConversation: (from) => conversations.get(from) ?? null,
    conversations,
  };
}
