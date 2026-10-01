import type { APIRoute } from 'astro';
import { verifySignature } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-webhook-security.mjs';
import { WhatsAppCloudProvider } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-cloud-adapter.mjs';
import { createWhatsAppOrchestrator } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-orchestrator.mjs';
import { buildWhatsAppQuoteOnlyTools } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-gateway-tools.mjs';
import { inspectTestMessage } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-test-gate.mjs';
import { inspectMetaEvent, ignoredReason, logHotel011Diagnostic } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-preview-diagnostics.mjs';

/**
 * ATH-ODOO-HOTEL-011 — Webhook Staging Deployment Gate.
 *
 * GET  -> verificacion real de Meta (hub.mode/hub.verify_token/hub.challenge).
 * POST -> recepcion real de eventos: verifica firma (X-Hub-Signature-256,
 *         OBLIGATORIA) y, si el Gateway esta configurado
 *         (HOTEL_GATEWAY_BASE_URL/HOTEL_WEB_AGENT_ID/HOTEL_WEB_AGENT_KEY,
 *         mismas variables que availability.ts), enruta cada mensaje
 *         nuevo por el pipeline real ya probado: nlu-lite.mjs ->
 *         conversation-engine.mjs -> ai-tool-adapters.mjs -> Gateway ->
 *         Odoo STAGING (whatsapp-orchestrator.mjs). Sin Gateway
 *         configurado, devuelve 503 antes de deduplicar el mensaje.
 *
 * El envio real exige credenciales Meta y el interruptor explicito
 * WHATSAPP_TEST_SEND_ENABLED=true. Sin ambos, POST devuelve 503 antes
 * de procesar o deduplicar mensajes, para que no se pierdan en silencio.
 *
 * Nunca conecta produccion, nunca imprime secretos, nunca confia en un
 * payload sin firma valida.
 */
export const prerender = false;

// Instancia por proceso "tibio": el dedup por message_id y el estado de
// cada conversacion sobreviven mientras la funcion serverless siga viva
// (igual de razonable que el rate limiter en memoria de availability.ts
// — no es persistencia garantizada entre cold starts, es la primera
// capa de defensa).
// Vercel Preview ya usa META_PHONE_NUMBER_ID; aceptar tambien el nombre
// del adaptador evita duplicar un identificador en el panel.
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID;
const outboundReady = process.env.WHATSAPP_TEST_SEND_ENABLED === 'true'
  && Boolean(process.env.WHATSAPP_ACCESS_TOKEN)
  && Boolean(phoneNumberId)
  && Boolean(process.env.WHATSAPP_TEST_ALLOWED_FROM);
const provider = new WhatsAppCloudProvider(outboundReady ? {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId,
  httpClient: async (...args: Parameters<typeof fetch>) => {
    logHotel011Diagnostic('OUTBOUND_STEP', { outbound_call_started: true, outbound_call_status: 'started' });
    try {
      const response = await fetch(...args);
      logHotel011Diagnostic('OUTBOUND_STEP', { outbound_call_started: true, outbound_call_status: response.status });
      return response;
    } catch (error) {
      logHotel011Diagnostic('OUTBOUND_STEP', { outbound_call_started: true, outbound_call_status: 'error' });
      throw error;
    }
  },
} : {});

function readConfig() {
  return {
    verifyToken: process.env.META_VERIFY_TOKEN,
    appSecret: process.env.META_APP_SECRET,
  };
}

function readGatewayConfig() {
  const baseUrl = process.env.HOTEL_GATEWAY_BASE_URL;
  const agentId = process.env.HOTEL_WEB_AGENT_ID;
  const rawKey = process.env.HOTEL_WEB_AGENT_KEY;
  if (!baseUrl || !agentId || !rawKey) return null;
  return { baseUrl, agentId, rawKey };
}

// El orquestador se crea UNA sola vez por instancia "tibia", igual que
// `provider`: registra su propio handler via provider.onMessage() para
// que cada llamada a provider.receiveMessage() (ver POST) dispare el
// pipeline real NLU -> motor -> Gateway -> respuesta.
let orchestrator: ReturnType<typeof createWhatsAppOrchestrator> | null = null;

function ensureOrchestrator() {
  if (orchestrator) return orchestrator;
  const gatewayConfig = readGatewayConfig();
  if (!gatewayConfig) return null;
  const tools = buildWhatsAppQuoteOnlyTools(gatewayConfig);
  const observedTools = {
    checkAvailability: async (...args: Parameters<typeof tools.checkAvailability>) => {
      logHotel011Diagnostic('ODOO_STEP', { odoo_call_started: true, odoo_call_status: 'started' });
      try {
        const result = await tools.checkAvailability(...args);
        logHotel011Diagnostic('ODOO_STEP', { odoo_call_started: true, odoo_call_status: 'success' });
        return result;
      } catch (error) {
        logHotel011Diagnostic('ODOO_STEP', { odoo_call_started: true, odoo_call_status: 'error' });
        throw error;
      }
    },
    quote: async (...args: Parameters<typeof tools.quote>) => {
      logHotel011Diagnostic('ODOO_STEP', { odoo_call_started: true, odoo_call_status: 'quote_started' });
      try {
        const result = await tools.quote(...args);
        logHotel011Diagnostic('ODOO_STEP', { odoo_call_started: true, odoo_call_status: 'quote_success' });
        return result;
      } catch (error) {
        logHotel011Diagnostic('ODOO_STEP', { odoo_call_started: true, odoo_call_status: 'quote_error' });
        throw error;
      }
    },
  };
  orchestrator = createWhatsAppOrchestrator({
    provider,
    tools: observedTools,
    allowBookingActions: false,
    onEvent: (e: { type: string }) => {
      // Observabilidad SIN PII: solo el tipo de evento, nunca texto/telefono del cliente.
      // eslint-disable-next-line no-console
      console.log('[hotel/webhook] evento', e.type);
    },
  });
  return orchestrator;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const GET: APIRoute = async ({ url }) => {
  const { verifyToken } = readConfig();
  if (!verifyToken) {
    // Fail closed: sin verify token configurado, nunca se acepta nada.
    return new Response('SERVICE_UNAVAILABLE', { status: 503 });
  }

  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response('FORBIDDEN', { status: 403 });
};

export const POST: APIRoute = async ({ request }) => {
  const { appSecret } = readConfig();

  // El cuerpo crudo es OBLIGATORIO para la firma: un solo caracter
  // distinto al re-serializar invalidaria el HMAC.
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';

  if (!appSecret) {
    // eslint-disable-next-line no-console
    console.error('[hotel/webhook] META_APP_SECRET no configurado -- rechazando POST (fail-closed, nunca acepta sin poder verificar)');
    return jsonResponse({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
  }

  if (!verifySignature(rawBody, signature, appSecret)) {
    logHotel011Diagnostic('FLOW_DECISION', { decision: 'ignored', reason: 'signature_invalid' });
    // eslint-disable-next-line no-console
    console.error('[hotel/webhook] firma invalida o ausente -- payload rechazado');
    return jsonResponse({ ok: false, error: 'INVALID_SIGNATURE' }, 401);
  }

  if (!outboundReady) {
    logHotel011Diagnostic('FLOW_DECISION', { decision: 'ignored', reason: 'other' });
    return jsonResponse({ ok: false, error: 'META_OUTBOUND_NOT_CONNECTED' }, 503);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logHotel011Diagnostic('FLOW_DECISION', { decision: 'ignored', reason: 'other' });
    return jsonResponse({ ok: false, error: 'INVALID_JSON_BODY' }, 400);
  }

  // Solo el numero Meta TEST, remitente autorizado y texto aprobado por
  // el CEO pueden llegar al orquestador. Los demas eventos se reconocen
  // sin efectuar consultas ni envios y sin provocar reintentos de Meta.
  const messages = provider.parseInboundPayload(payload);
  // Puente temporal HOTEL-011 -> capacidades conversacionales HOTEL-013.
  // Se habilita SOLO en este Preview TEST, manteniendo remitente y Phone Number ID autorizados.
  const naturalTextEnabled = process.env.VERCEL_ENV === 'preview'
    && ['feature/ath-odoo-hotel-011-whatsapp-controlled-pilot', 'feature/ath-odoo-hotel-016-whatsapp-natural-media']
      .includes(process.env.VERCEL_GIT_COMMIT_REF ?? '');
  const gate = inspectTestMessage(messages, {
    allowedFrom: process.env.WHATSAPP_TEST_ALLOWED_FROM,
    phoneNumberId: process.env.META_PHONE_NUMBER_ID,
    naturalTextEnabled,
  });
  const diagnostic = inspectMetaEvent(payload, messages, gate);
  logHotel011Diagnostic('EVENT_RECEIVED', diagnostic.event);
  logHotel011Diagnostic('MESSAGE_PARSED', diagnostic.message);
  if (!gate.allowed) {
    logHotel011Diagnostic('FLOW_DECISION', {
      decision: 'ignored', reason: ignoredReason(diagnostic.event, messages, gate),
    });
    logHotel011Diagnostic('ODOO_STEP', { odoo_call_started: false, odoo_call_status: 'not_reached' });
    logHotel011Diagnostic('OUTBOUND_STEP', { outbound_call_started: false, outbound_call_status: 'not_reached' });
    return jsonResponse({ ok: true, accepted: 0, ignored: messages.length }, 200);
  }

  const routed = ensureOrchestrator();
  if (!routed) {
    logHotel011Diagnostic('FLOW_DECISION', { decision: 'ignored', reason: 'other' });
    // eslint-disable-next-line no-console
    console.error('[hotel/webhook] Gateway no configurado -- mensaje rechazado antes de deduplicar');
    return jsonResponse({ ok: false, error: 'GATEWAY_NOT_CONNECTED' }, 503);
  }

  // provider.onMessage() ya tiene registrado el handler del orquestador
  // receiveMessage() parsea, deduplica por message_id y dispara el
  // pipeline real completo para cada mensaje nuevo.
  const { accepted, duplicates } = await provider.receiveMessage(payload);
  logHotel011Diagnostic('FLOW_DECISION', {
    decision: accepted > 0 ? 'accepted' : 'ignored',
    reason: accepted > 0 ? 'other' : 'duplicate',
  });
  // Observabilidad SIN PII: solo conteos, nunca texto/telefono del cliente.
  // eslint-disable-next-line no-console
  console.log('[hotel/webhook] recibido', { accepted, duplicates, routed: Boolean(routed) });

  // Meta espera un 200 rapido; ya se enruto (si el Gateway esta
  // configurado) dentro de esta misma llamada -- nunca hay un paso
  // pendiente fuera de este ack.
  return jsonResponse({ ok: true, accepted, duplicates }, 200);
};
