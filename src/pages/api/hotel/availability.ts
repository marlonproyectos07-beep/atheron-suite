import type { APIRoute } from 'astro';
import { WebHotelClient } from '../../../../integrations/odoo-hotel-gateway/clients/web-client.mjs';
import { requestAccommodationAlternatives } from '../../../../integrations/odoo-hotel-gateway/src/alternatives-engine.mjs';
import { RateLimiter } from '../../../../integrations/odoo-hotel-gateway/src/rate-limiter.mjs';

/**
 * ATH-ODOO-HOTEL-008 — puente seguro NAVEGADOR -> este endpoint (same-origin,
 * server-side) -> WebHotelClient -> Hotel Gateway -> Odoo STAGING.
 *
 * El navegador nunca recibe HOTEL_WEB_AGENT_KEY ni ninguna otra credencial:
 * esas variables solo existen en el proceso del servidor (Vercel Function),
 * nunca con prefijo PUBLIC_, nunca en el bundle cliente.
 *
 * Esta ruta se sirve on-demand (Vercel Function) porque declara
 * `prerender = false`; el resto del sitio sigue 100% estatico.
 */
export const prerender = false;

const VALID_UNITS = new Set(['201', '202', '203', '301', '302', 'CASA_COMPLETA']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Ventana deslizante en memoria, reutilizando el mismo limitador ya probado
// del gateway (Fase 8 de HOTEL-007). Sobrevive mientras la funcion
// serverless este "tibia"; no es una proteccion perfecta, es razonable
// para un canario.
const rateLimiter = new RateLimiter({ limit: 30, windowMs: 60_000 });

function jsonError(message: string, status: number) {
  // Nunca se expone stack trace ni detalle interno: solo un codigo fijo.
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function readClientConfig() {
  // Variables server-side EXCLUSIVAMENTE (nunca PUBLIC_*). Si faltan, el
  // endpoint falla cerrado con SERVICE_UNAVAILABLE, nunca inventa un
  // resultado.
  const baseUrl = process.env.HOTEL_GATEWAY_BASE_URL;
  const agentId = process.env.HOTEL_WEB_AGENT_ID;
  const rawKey = process.env.HOTEL_WEB_AGENT_KEY;
  if (!baseUrl || !agentId || !rawKey) return null;
  return { baseUrl, agentId, rawKey };
}

export function validateAvailabilityInput(body: unknown) {
  const { unit, checkIn, checkOut, guests } = (body ?? {}) as Record<string, unknown>;

  if (typeof unit !== 'string' || !VALID_UNITS.has(unit)) {
    return { error: 'INVALID_UNIT' as const };
  }
  if (typeof checkIn !== 'string' || !DATE_RE.test(checkIn)) {
    return { error: 'INVALID_CHECKIN' as const };
  }
  if (typeof checkOut !== 'string' || !DATE_RE.test(checkOut) || checkOut <= checkIn) {
    return { error: 'INVALID_CHECKOUT' as const };
  }
  if (!Number.isInteger(guests) || (guests as number) <= 0 || (guests as number) > 20) {
    return { error: 'INVALID_GUESTS' as const };
  }

  return { unit, checkIn, checkOut, guests: guests as number };
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimiter.consume(clientAddress ?? 'unknown');
  } catch {
    return jsonError('RATE_LIMITED', 429);
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return jsonError('CONTENT_TYPE_MUST_BE_JSON', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('INVALID_JSON_BODY', 400);
  }

  const parsed = validateAvailabilityInput(body);
  if ('error' in parsed) {
    return jsonError(parsed.error, 400);
  }

  const config = readClientConfig();
  if (!config) {
    return jsonError('SERVICE_UNAVAILABLE', 503);
  }

  const client = new WebHotelClient(config);

  try {
    const checkAvailability = async (candidateUnit: string, checkIn: string, checkOut: string) => {
      const response = await client.availability({
        check_in: checkIn,
        check_out: checkOut,
        guests: parsed.guests,
        unit_id: candidateUnit,
      });
      // Forma real de error del gateway: { ok:false, error:{ code, message } }
      // (src/server.mjs), NUNCA un `error_code` plano. Con la condicion
      // anterior este chequeo nunca se disparaba sobre un error real del
      // gateway; el resultado quedaba en `available: undefined` -> false,
      // sin distinguir "no disponible" de "el gateway fallo".
      if (response?.ok === false) throw new Error(`GATEWAY_AVAILABILITY_ERROR:${response?.error?.code ?? 'UNKNOWN'}`);
      // Odoo decide "available"; este endpoint solo propaga el booleano.
      return Boolean(response?.available);
    };

    const result = await requestAccommodationAlternatives(
      { requestedUnit: parsed.unit, checkIn: parsed.checkIn, checkOut: parsed.checkOut, guests: parsed.guests },
      { checkAvailability },
    );

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    // Nunca se reenvia el mensaje/stack real del gateway al navegador.
    return jsonError('AVAILABILITY_LOOKUP_FAILED', 502);
  }
};

export const GET: APIRoute = async () => jsonError('METHOD_NOT_ALLOWED', 405);
