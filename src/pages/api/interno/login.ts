import type { APIRoute } from 'astro';
import {
  COOKIE_NAME,
  LoginLimiter,
  OPERATOR_IDS,
  SESSION_TTL_MS,
  parseRoster,
  resolveOperatorName,
  signSession,
  verifyPin,
} from '../../../../integrations/odoo-hotel-gateway/src/reception-auth.mjs';

/**
 * ATH-DISP-001 — login de recepción por PIN propio. Sin usuario Odoo.
 * Solo servidor: el roster (hashes) y el secreto de sesión viven en variables
 * de entorno del servidor, nunca en el navegador ni en el repositorio.
 */
export const prerender = false;

const limiter = new LoginLimiter({ max: 5, windowMs: 15 * 60_000 });

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return jsonResponse({ ok: false, error: 'CONTENT_TYPE_MUST_BE_JSON' }, 400);
  }

  const secret = process.env.HOTEL_RECEPTION_SESSION_SECRET ?? '';
  const rosterRaw = process.env.HOTEL_RECEPTION_OPERATORS ?? '';
  if (secret.length < 32 || !rosterRaw) {
    return jsonResponse({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
  }

  let roster: Map<string, string>;
  try {
    roster = parseRoster(rosterRaw);
  } catch {
    // Configuración inválida: se falla cerrado sin revelar el detalle.
    return jsonResponse({ ok: false, error: 'SERVICE_UNAVAILABLE' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_JSON_BODY' }, 400);
  }

  const operatorId = typeof body.operator === 'string' ? body.operator : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!OPERATOR_IDS.includes(operatorId)) {
    return jsonResponse({ ok: false, error: 'CREDENCIALES_INVALIDAS' }, 401);
  }

  const lockKey = `${operatorId}|${clientAddress ?? 'unknown'}`;
  if (limiter.isLocked(lockKey)) {
    return jsonResponse({ ok: false, error: 'BLOQUEADO_TEMPORALMENTE' }, 429);
  }

  const name = resolveOperatorName(operatorId, body.nombre);
  const stored = roster.get(operatorId) ?? '';
  const pinOk = await verifyPin(pin, stored);
  if (!pinOk || !name) {
    limiter.recordFailure(lockKey);
    return jsonResponse({ ok: false, error: 'CREDENCIALES_INVALIDAS' }, 401);
  }

  limiter.reset(lockKey);
  const token = signSession({ operatorId, name }, secret);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return jsonResponse({ ok: true, operador: name }, 200, {
    'set-cookie': `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
  });
};

export const GET: APIRoute = async () => jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
