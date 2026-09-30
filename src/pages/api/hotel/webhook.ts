import type { APIRoute } from 'astro';
import { verifySignature } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-webhook-security.mjs';
import { WhatsAppCloudProvider } from '../../../../integrations/odoo-hotel-gateway/src/whatsapp-cloud-adapter.mjs';

/**
 * ATH-ODOO-HOTEL-011 — Webhook Staging Deployment Gate.
 *
 * GET  -> verificacion real de Meta (hub.mode/hub.verify_token/hub.challenge).
 * POST -> recepcion real de eventos, con verificacion de firma
 *         (X-Hub-Signature-256) OBLIGATORIA y deduplicacion por
 *         message_id. Este gate prueba el TRANSPORTE (verificacion +
 *         firma + dedup + logs sin secretos); enrutar el mensaje ya
 *         validado hacia whatsapp-orchestrator.mjs (motor real, ya
 *         probado contra Odoo STAGING) es la conexion final que solo se
 *         activa cuando Marlon autorice el piloto real (Fase 17).
 *
 * Nunca conecta produccion, nunca imprime secretos, nunca confia en un
 * payload sin firma valida.
 */
export const prerender = false;

// Instancia por proceso "tibio": el dedup por message_id sobrevive
// mientras la funcion serverless siga viva (igual de razonable que el
// rate limiter en memoria de availability.ts — no es persistencia
// garantizada entre cold starts, es la primera capa de defensa).
const provider = new WhatsAppCloudProvider({});

function readConfig() {
  return {
    verifyToken: process.env.META_VERIFY_TOKEN,
    appSecret: process.env.META_APP_SECRET,
  };
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

  const messages = provider.parseInboundPayload(payload);
  let accepted = 0;
  let duplicates = 0;
  for (const message of messages) {
    if (!message.message_id || provider.deduplicate(message.message_id)) {
      duplicates += 1;
      continue;
    }
    accepted += 1;
    // Observabilidad SIN PII: solo message_id/correlation_id, nunca el
    // texto del cliente ni su telefono en el log.
    // eslint-disable-next-line no-console
    console.log('[hotel/webhook] mensaje aceptado', { message_id: message.message_id, correlation_id: provider.correlationId(message.message_id) });
  }

  // Meta espera un 200 rapido; el enrutamiento real al motor
  // conversacional (Fase 17, gate CEO) queda fuera de este ack.
  return jsonResponse({ ok: true, accepted, duplicates }, 200);
};
