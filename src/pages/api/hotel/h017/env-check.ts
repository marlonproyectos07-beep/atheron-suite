import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new Response('NOT_FOUND', { status: 404 });
  }
  let gatewayHost: string | null = null;
  try {
    gatewayHost = process.env.HOTEL_GATEWAY_BASE_URL ? new URL(process.env.HOTEL_GATEWAY_BASE_URL).hostname : null;
  } catch {
    gatewayHost = 'invalid-url';
  }
  return new Response(JSON.stringify({
    preview: true,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    gateway_configured: Boolean(process.env.HOTEL_GATEWAY_BASE_URL && process.env.HOTEL_WEB_AGENT_ID && process.env.HOTEL_WEB_AGENT_KEY),
    gateway_host: gatewayHost,
    odoo_direct_configured: Boolean(process.env.ODOO_BASE_URL && process.env.ODOO_DATABASE && process.env.ODOO_TECHNICAL_USER && process.env.ODOO_TECHNICAL_SECRET && process.env.ODOO_ACTION_ID),
    odoo_base_present: Boolean(process.env.ODOO_BASE_URL),
    odoo_db_present: Boolean(process.env.ODOO_DATABASE),
    odoo_user_present: Boolean(process.env.ODOO_TECHNICAL_USER),
    odoo_secret_present: Boolean(process.env.ODOO_TECHNICAL_SECRET),
    odoo_action_present: Boolean(process.env.ODOO_ACTION_ID),
    feed_token_present: Boolean(process.env.HOTEL_ICAL_FEED_TOKEN),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
