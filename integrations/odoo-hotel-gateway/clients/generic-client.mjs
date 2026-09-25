import { HotelGatewayClient } from './base-client.mjs';

/**
 * Cliente B: generico para ChatGPT/Codex/OpenCode. Cualquier motor
 * intercambiable (D-002/D-003 en AI/DECISIONS.md) usa esta misma clase,
 * cambiando solo el agent_id de la identidad tecnica que le fue asignada.
 */
export class GenericHotelClient extends HotelGatewayClient {
  constructor({ baseUrl, rawKey, agentId }) {
    if (!agentId) {
      throw new Error('GenericHotelClient requires an explicit agentId (chatgpt-hotel-007, codex-hotel-007, ...)');
    }
    super({ baseUrl, agentId, rawKey });
  }
}
