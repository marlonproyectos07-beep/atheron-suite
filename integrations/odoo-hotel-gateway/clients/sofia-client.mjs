import { HotelGatewayClient } from './base-client.mjs';

/**
 * Cliente para Sofia/WhatsApp. Reutiliza el mismo gateway ya probado
 * (grupo 149 "Hotel v1 / API Sofia" documentado en AI/ODOO_HOTEL_STATE.md).
 * `source_channel=sofia` queda forzado por el servidor
 * (src/odoo-adapter.mjs), nunca por el cliente.
 */
export class SofiaHotelClient extends HotelGatewayClient {
  constructor({ baseUrl, rawKey, agentId = 'sofia-hotel-007' }) {
    super({ baseUrl, agentId, rawKey });
  }
}
