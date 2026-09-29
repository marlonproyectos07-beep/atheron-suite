import type { APIRoute } from 'astro';
import { WebHotelClient } from '../../../../integrations/odoo-hotel-gateway/clients/web-client.mjs';
import { requestAccommodationAlternatives } from '../../../../integrations/odoo-hotel-gateway/src/alternatives-engine.mjs';
import { RateLimiter } from '../../../../integrations/odoo-hotel-gateway/src/rate-limiter.mjs';
import { findOpciones, unitAvailability } from '../../../../integrations/odoo-hotel-gateway/src/gateway-response-utils.mjs';

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

// Mapeo real confirmado por el CEO (no inventado, ver
// AI/ATH-ODOO-HOTEL-008_OTA_MAP.md): 201=unit_id 1 ... CASA_COMPLETA=6.
const UNIT_ID_MAP: Record<string, string> = {
  201: '1',
  202: '2',
  203: '3',
  301: '4',
  302: '5',
  CASA_COMPLETA: '6',
};

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
    // El contrato real de /hotel/availability (src/contract.mjs) NO acepta
    // unit_id: es una consulta por PROPIEDAD que devuelve TODAS las
    // unidades (data.opciones), y el llamador filtra localmente -- mismo
    // patron ya probado en scripts/live-hotel-008a-runner.mjs. Mandar
    // unit_id producia UNKNOWN_FIELD (bug real, encontrado via logs).
    // Se cachea una sola llamada al gateway por request, no una por unidad.
    let availabilityCache: Promise<any> | null = null;
    const fetchAvailabilityOnce = () => {
      if (!availabilityCache) {
        availabilityCache = client.availability({
          check_in: parsed.checkIn,
          check_out: parsed.checkOut,
          guests: parsed.guests,
        });
      }
      return availabilityCache;
    };

    const checkAvailability = async (candidateUnit: string) => {
      const response = await fetchAvailabilityOnce();
      // Forma real de error del gateway: { ok:false, error:{ code, message } }
      // (src/server.mjs), NUNCA un `error_code` plano.
      if (response?.ok === false) throw new Error(`GATEWAY_AVAILABILITY_ERROR:${response?.error?.code ?? 'UNKNOWN'}`);

      // La respuesta real viene DOBLEMENTE anidada (sobre HTTP + envelope
      // propio del adapter); findOpciones busca sin asumir profundidad
      // fija. Confirmado probando el Gateway directo con la clave real,
      // no era una hipotesis.
      const opciones = findOpciones(response);
      const unitId = UNIT_ID_MAP[candidateUnit];
      const available = unitAvailability(opciones, unitId);
      return available === true; // null (no encontrada) o false -> no disponible, nunca se inventa
    };

    const result = await requestAccommodationAlternatives(
      { requestedUnit: parsed.unit, checkIn: parsed.checkIn, checkOut: parsed.checkOut, guests: parsed.guests },
      { checkAvailability },
    );

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    // Se registra SOLO en los logs server-side de Vercel (nunca en la
    // respuesta al navegador) para poder diagnosticar sin exponer nada.
    // eslint-disable-next-line no-console
    console.error('[hotel/availability] fallo interno:', error instanceof Error ? error.message : String(error));
    return jsonError('AVAILABILITY_LOOKUP_FAILED', 502);
  }
};

export const GET: APIRoute = async () => jsonError('METHOD_NOT_ALLOWED', 405);
