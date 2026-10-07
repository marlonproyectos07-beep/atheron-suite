import type { APIRoute } from 'astro';
import { COOKIE_NAME } from '../../../../integrations/odoo-hotel-gateway/src/reception-auth.mjs';

export const prerender = false;

export const POST: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    },
  });

export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }), {
    status: 405,
    headers: { 'content-type': 'application/json' },
  });
