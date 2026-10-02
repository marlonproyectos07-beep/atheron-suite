import type { APIRoute } from 'astro';
import { WebHotelClient } from '../../../../../../integrations/odoo-hotel-gateway/clients/web-client.mjs';
import { createGatewayOdooPort } from '../../../../../../integrations/odoo-hotel-ical/src/gateway-odoo-port.mjs';
import { buildPublicFeed, FEED_CHANNELS, FEED_UNITS, tokenMatches } from '../../../../../../integrations/odoo-hotel-ical/src/public-feed.mjs';

export const prerender = false;

function fail(code: string, status: number) {
  return new Response(code, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

export const GET: APIRoute = async ({ params, url }) => {
  const unit = String(params.unit ?? '').toLowerCase();
  const channel = String(params.channel ?? '').toLowerCase();
  if (!(unit in FEED_UNITS) || !FEED_CHANNELS.includes(channel)) return fail('NOT_FOUND', 404);

  const expected = process.env.HOTEL_ICAL_FEED_TOKEN;
  if (!expected) return fail('SERVICE_UNAVAILABLE', 503);
  if (!tokenMatches(expected, url.searchParams.get('t'))) return fail('NOT_FOUND', 404);

  const baseUrl = process.env.HOTEL_GATEWAY_BASE_URL;
  const agentId = process.env.HOTEL_WEB_AGENT_ID;
  const rawKey = process.env.HOTEL_WEB_AGENT_KEY;
  if (!baseUrl || !agentId || !rawKey) return fail('SERVICE_UNAVAILABLE', 503);

  try {
    const odoo = createGatewayOdooPort({ client: new WebHotelClient({ baseUrl, agentId, rawKey }) });
    const ical = await buildPublicFeed({ unit, channel, odoo, today: new Date().toISOString().slice(0, 10) });
    return new Response(ical, {
      status: 200,
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('[hotel/ical] fallo:', (error as { code?: string })?.code ?? 'ERROR');
    return fail('SERVICE_UNAVAILABLE', 503);
  }
};
