import type { APIRoute } from 'astro';

/**
 * ATH-ODOO-HOTEL-011 — chequeo de salud minimo del entorno STAGING/
 * Preview. Nunca revela configuracion ni secretos: solo confirma que
 * la funcion serverless esta viva y si el webhook tiene lo minimo para
 * operar (sin decir el valor de nada).
 */
export const prerender = false;

export const GET: APIRoute = async () => {
  const webhookReady = Boolean(process.env.META_VERIFY_TOKEN);
  return new Response(
    JSON.stringify({ ok: true, service: 'atheron-hotel-webhook', webhook_verify_configured: webhookReady }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
