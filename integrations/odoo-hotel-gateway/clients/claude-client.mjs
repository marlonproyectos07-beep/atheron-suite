import { HotelGatewayClient } from './base-client.mjs';

/** Cliente A: Claude. Mismo contrato que cualquier otro agente. */
export class ClaudeHotelClient extends HotelGatewayClient {
  constructor({ baseUrl, rawKey, agentId = 'claude-hotel-007' }) {
    super({ baseUrl, agentId, rawKey });
  }
}
