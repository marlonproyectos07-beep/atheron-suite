import { ContractError } from './contract.mjs';

/**
 * Rate limit por identidad tecnica (Fase 8). Ventana deslizante simple en
 * memoria: evita loops/flood accidentales sin romper el uso normal de un
 * agente bien comportado.
 */
export class RateLimiter {
  #hits = new Map(); // agentId -> timestamps[]

  constructor({ limit = 60, windowMs = 60_000, clock = () => Date.now() } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.clock = clock;
  }

  consume(agentId) {
    const now = this.clock();
    const windowStart = now - this.windowMs;
    const timestamps = (this.#hits.get(agentId) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.limit) {
      throw new ContractError('RATE_LIMITED', `Rate limit exceeded for ${agentId}`, {
        limit: this.limit,
        window_ms: this.windowMs,
      });
    }

    timestamps.push(now);
    this.#hits.set(agentId, timestamps);
  }

  reset(agentId) {
    this.#hits.delete(agentId);
  }
}
