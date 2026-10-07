import type { APIRoute } from 'astro';
import { WebHotelClient } from '../../../../integrations/odoo-hotel-gateway/clients/web-client.mjs';
import { RateLimiter } from '../../../../integrations/odoo-hotel-gateway/src/rate-limiter.mjs';
import {
  buildReceptionAvailability,
  dataUnavailableResult,
  validateReceptionQuery,
} from '../../../../integrations/odoo-hotel-gateway/src/reception-availability.mjs';
import { COOKIE_NAME, verifySession } from '../../../../integrations/odoo-hotel-gateway/src/reception-auth.mjs';

/**
 * ATH-DISP-001 — disponibilidad para recepción (CHECKIN / CHECKOUT).
 * Reutiliza la misma fuente que el endpoint público: gateway -> acción 1967 ->
 * motor 1914. Sin catálogo de capacidades ni límite global de bloques.
 * Requiere sesión de operador. Ante cualquier fallo no devuelve LIBRE.
 */
export const prerender = false;

const rateLimiter = new RateLimiter({ limit: 60, windowMs: 60_000 });

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function todayInBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const secret = process.env.HOTEL_RECEPTION_SESSION_SECRET ?? '';
  const session = verifySession(cookies.get(COOKIE_NAME)?.value, secret);
  if (!session) {
    return jsonResponse({ ok: false, error: 'SESION_REQUERIDA' }, 401);
  }

  try {
    rateLimiter.consume(session.operatorId);
  } catch {
    return jsonResponse({ ok: false, error: 'RATE_LIMITED' }, 429);
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return jsonResponse({ ok: false, error: 'CONTENT_TYPE_MUST_BE_JSON' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON_BODY' }, 400);
  }

  const query = validateReceptionQuery({
    checkin: body.checkin as string,
    checkout: body.checkout as string,
    guests: body.guests as number,
    todayIso: todayInBogota(),
  });
  if ('error' in query) {
    return jsonResponse({ ok: false, error: query.error }, 400);
  }

  const baseUrl = process.env.HOTEL_GATEWAY_BASE_URL;
  const agentId = process.env.HOTEL_RECEPTION_AGENT_ID;
  const rawKey = process.env.HOTEL_RECEPTION_AGENT_KEY;
  if (!baseUrl || !agentId || !rawKey) {
    // Sin credencial de recepción no se consulta nada: se marca como no confiable.
    return jsonResponse({ ok: false, error: 'SERVICE_UNAVAILABLE', ...dataUnavailableResult(query) }, 503);
  }

  try {
    const client = new WebHotelClient({ baseUrl, agentId, rawKey });
    const response = await client.availability({ check_in: query.checkin, check_out: query.checkout, guests: query.guests });
    if (response?.ok === false) throw new Error(`GATEWAY_ERROR:${response?.error?.code ?? 'UNKNOWN'}`);
    const result = buildReceptionAvailability(response, query);
    // Solo fechas y conteos en el log del servidor. Sin nombres ni datos de huéspedes.
    // eslint-disable-next-line no-console
    console.info('[interno/disponibilidad]', session.operatorId, query.checkin, query.checkout, query.guests);
    return jsonResponse({ ok: true, operador: session.name, ...result }, 200);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[interno/disponibilidad] fallo:', error instanceof Error ? error.message : String(error));
    return jsonResponse({ ok: false, error: 'DATOS_NO_CONFIABLES', ...dataUnavailableResult(query) }, 502);
  }
};

export const GET: APIRoute = async () => jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
