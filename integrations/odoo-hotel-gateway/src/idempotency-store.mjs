import { createHash } from 'node:crypto';
import { ContractError } from './contract.mjs';

function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Store de idempotencia para quote/hold (Fase 6).
 *
 * Contrato probado:
 *  A. misma request + misma key -> mismo resultado (replay).
 *  B. misma key + payload distinto -> IDEMPOTENCY_KEY_REUSED.
 *  C/D. N HOLD simultaneos con la misma key -> exactamente una ejecucion del
 *       executor (un solo HOLD real); el resto recibe el mismo resultado.
 *
 * El truco de concurrencia: JavaScript es single-threaded y no hay ningun
 * `await` entre leer `this.#entries.get(key)` y escribir `this.#entries.set`,
 * asi que dos llamadas "simultaneas" (mismo tick de microtask antes del
 * primer await real) nunca ven el Map en un estado intermedio: la segunda
 * siempre encuentra la entrada que dejo la primera.
 */
export class IdempotencyStore {
  #entries = new Map(); // key -> { payloadHash, promise }

  async run(key, payload, executor) {
    const payloadHash = hashPayload(payload);
    const existing = this.#entries.get(key);

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ContractError(
          'IDEMPOTENCY_KEY_REUSED',
          'idempotency_key was already used with a different payload',
          { idempotency_key: key }
        );
      }
      return existing.promise;
    }

    const promise = Promise.resolve().then(executor);
    this.#entries.set(key, { payloadHash, promise });

    try {
      return await promise;
    } catch (error) {
      // Un fallo del executor no debe dejar la key "quemada": se permite reintentar.
      this.#entries.delete(key);
      throw error;
    }
  }

  has(key) {
    return this.#entries.has(key);
  }

  clear() {
    this.#entries.clear();
  }
}
