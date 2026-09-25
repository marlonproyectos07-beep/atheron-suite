/**
 * Cliente base del contrato HOTEL-007. Todos los clientes concretos
 * (claude-client.mjs, generic-client.mjs) son wrappers delgados sobre esta
 * misma clase: ningun agente tiene un camino de codigo especial (Fase 5 y
 * Fase 14). Lo unico que cambia entre clientes es el agent_id/actor que se
 * usa para autenticarse.
 */
export class HotelGatewayClient {
  constructor({ baseUrl, agentId, rawKey, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.agentId = agentId;
    this.rawKey = rawKey;
    this.fetchImpl = fetchImpl;
  }

  async #call(path, body) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': this.agentId,
        authorization: `Bearer ${this.rawKey}`,
      },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  availability(request) {
    return this.#call('/hotel/availability', request);
  }

  quote(request) {
    return this.#call('/hotel/quote', request);
  }

  hold(request) {
    return this.#call('/hotel/hold', request);
  }

  status(request) {
    return this.#call('/hotel/status', request);
  }
}
