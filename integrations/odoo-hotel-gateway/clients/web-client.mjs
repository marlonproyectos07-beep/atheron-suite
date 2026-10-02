import { HotelGatewayClient } from './base-client.mjs';

/**
 * Cliente para hotelesatheron.com (Workstream E). Todavia NO esta cableado
 * en el sitio (el sitio sigue sin consumir el gateway, ver
 * AI/ATH-ODOO-HOTEL-008_OTA_MAP.md) -- esta clase es la capacidad lista
 * para integrarse, sin rehacer la arquitectura del frontend Astro. Usa el
 * mismo contrato de minimo privilegio que los demas clientes (Fase 14).
 */
export class WebHotelClient extends HotelGatewayClient {
  constructor({ baseUrl, rawKey, agentId = 'web-hotel-007', fetchImpl }) {
    super({ baseUrl, agentId, rawKey, fetchImpl });
  }
}
