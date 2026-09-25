import { createHash, timingSafeEqual } from 'node:crypto';
import { ContractError } from './contract.mjs';

/**
 * Identidad tecnica del gateway HOTEL-007.
 *
 * Esta es una capa de autenticacion PROPIA del gateway (no son credenciales
 * de Odoo). Cada agente autorizado (claude, chatgpt, codex, opencode, sofia)
 * recibe un agent_id + una clave opaca. El gateway solo guarda el hash de la
 * clave, nunca la clave en claro. Las claves reales deben cargarse por
 * variable de entorno (ver GATEWAY_TECHNICAL_IDENTITIES en .env.example) o
 * por un secret manager del runtime; nunca en este repositorio ni en logs.
 *
 * Todas las identidades comparten el mismo minimo privilegio: las 4
 * operaciones aprobadas (availability/quote/hold/status). Ningun agente
 * tiene privilegios especiales (Fase 5).
 */

const ALLOWED_SCOPES = Object.freeze(['availability', 'quote', 'hold', 'status']);

export function hashKey(rawKey) {
  return createHash('sha256').update(String(rawKey), 'utf8').digest('hex');
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export class IdentityStore {
  #identities = new Map(); // agent_id -> { agentId, actor, keyHash, revoked, scopes }

  /**
   * @param {Array<{agentId:string, actor:string, keyHash:string, revoked?:boolean}>} identities
   */
  constructor(identities = []) {
    for (const identity of identities) {
      this.#identities.set(identity.agentId, {
        agentId: identity.agentId,
        actor: identity.actor,
        keyHash: identity.keyHash,
        revoked: Boolean(identity.revoked),
        scopes: ALLOWED_SCOPES,
      });
    }
  }

  /** Carga identidades desde una variable de entorno JSON (nunca desde codigo). */
  static fromEnv(envValue) {
    if (!envValue) return new IdentityStore([]);
    let parsed;
    try {
      parsed = JSON.parse(envValue);
    } catch {
      throw new Error('GATEWAY_TECHNICAL_IDENTITIES no es JSON valido');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('GATEWAY_TECHNICAL_IDENTITIES debe ser un arreglo');
    }
    return new IdentityStore(parsed);
  }

  register({ agentId, actor, rawKey }) {
    this.#identities.set(agentId, {
      agentId,
      actor,
      keyHash: hashKey(rawKey),
      revoked: false,
      scopes: ALLOWED_SCOPES,
    });
  }

  revoke(agentId) {
    const identity = this.#identities.get(agentId);
    if (!identity) return false;
    identity.revoked = true;
    return true;
  }

  /** Rota la clave sin cambiar de agent_id ni requerir despliegue de codigo. */
  rotate(agentId, newRawKey) {
    const identity = this.#identities.get(agentId);
    if (!identity) return false;
    identity.keyHash = hashKey(newRawKey);
    identity.revoked = false;
    return true;
  }

  authenticate(agentId, rawKey) {
    if (!agentId || !rawKey) {
      throw new ContractError('UNAUTHORIZED', 'Missing technical credentials');
    }
    const identity = this.#identities.get(agentId);
    if (!identity) {
      throw new ContractError('UNAUTHORIZED', 'Unknown technical identity');
    }
    if (identity.revoked) {
      throw new ContractError('UNAUTHORIZED', 'Technical identity has been revoked');
    }
    if (!safeEqualHex(hashKey(rawKey), identity.keyHash)) {
      throw new ContractError('UNAUTHORIZED', 'Invalid technical credentials');
    }
    return Object.freeze({
      agentId: identity.agentId,
      actor: identity.actor,
      scopes: identity.scopes,
    });
  }

  isAuthorizedFor(identity, operation) {
    return identity.scopes.includes(operation);
  }
}
