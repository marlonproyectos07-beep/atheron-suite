import type { APIRoute } from 'astro';
import { verifySignature } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-webhook-security.mjs';
import { WhatsAppCloudProvider } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-cloud-adapter.mjs';
import { createWhatsAppOrchestrator } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-orchestrator.mjs';
import { buildWhatsAppGatewayTools } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-gateway-tools.mjs';

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
 *         configurado, el mensaje se acepta/deduplica a nivel de
 *         transporte (para que Meta no reintente) pero NO se enruta --
 *         falla cerrado, nunca simula una respuesta.
 *
 * `provider.sendMessage` (la respuesta de vuelta por WhatsApp real)
 * sigue fallando cerrado (WHATSAPP_ADAPTER_NOT_CONNECTED) sin
 * accessToken/httpClient real -- eso es, a proposito, la unica pieza que
 * falta y que requiere autorizacion del CEO para conectar Meta real.
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
const provider = new WhatsAppCloudProvider({});

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
// pipeline real NLU -> motor -> Gateway -> respuesta. Si el Gateway no
// esta configurado (HOTEL_GATEWAY_BASE_URL/etc.), el mensaje se sigue
// aceptando/deduplicando a nivel de transporte (para que Meta no reciba
// reintentos) pero no se enruta -- se falla cerrado, nunca se simula
// una respuesta.
let orchestrator: ReturnType<typeof createWhatsAppOrchestrator> | null = null;

function ensureOrchestrator() {
  if (orchestrator) return orchestrator;
  const gatewayConfig = readGatewayConfig();
  if (!gatewayConfig) return null;
  const tools = buildWhatsAppGatewayTools(gatewayConfig);
  orchestrator = createWhatsAppOrchestrator({
    provider,
    tools,
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
    // eslint-disable-next-line no-console
    console.error('[hotel/webhook] firma invalida o ausente -- payload rechazado');
    return jsonResponse({ ok: false, error: 'INVALID_SIGNATURE' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON_BODY' }, 400);
  }

  const routed = ensureOrchestrator();
  if (!routed) {
    // eslint-disable-next-line no-console
    console.error('[hotel/webhook] HOTEL_GATEWAY_BASE_URL/HOTEL_WEB_AGENT_ID/HOTEL_WEB_AGENT_KEY no configurados -- mensaje aceptado a nivel de transporte, NO enrutado (fail-closed)');
  }

  // provider.onMessage() ya tiene registrado el handler del orquestador
  // (si el Gateway esta configurado): receiveMessage() parsea, deduplica
  // por message_id y dispara el pipeline real completo para cada mensaje
  // nuevo. Si el Gateway no esta configurado, no hay ningun handler
  // registrado todavia -- receiveMessage igual deduplica/cuenta a nivel
  // de transporte, simplemente no hay nada que lo procese mas alla.
  const { accepted, duplicates } = await provider.receiveMessage(payload);
  // Observabilidad SIN PII: solo conteos, nunca texto/telefono del cliente.
  // eslint-disable-next-line no-console
  console.log('[hotel/webhook] recibido', { accepted, duplicates, routed: Boolean(routed) });

  // Meta espera un 200 rapido; ya se enruto (si el Gateway esta
  // configurado) dentro de esta misma llamada -- nunca hay un paso
  // pendiente fuera de este ack.
  return jsonResponse({ ok: true, accepted, duplicates }, 200);
};
