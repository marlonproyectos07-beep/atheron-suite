/**
 * Contrato para un proveedor LOCAL (Ollama) -- SOLO el contrato. No se descarga ningun modelo, no se instala
 * nada, no se abre ninguna conexion. Permite comparar despues, con el MISMO benchmark:
 *   cloud LLM  vs  local LLM.
 * Un proveedor local debe ser loopback-only (nada sale de la maquina) y devolver el mismo esquema estricto.
 * El fallo cerrado de privacidad aplica igual a los locales (se prefiere no enviar antes que arriesgar PII).
 */
import { MockUnderstandingProvider, ProviderDisabledError, assertProvider } from './provider.mjs';

export const LOCAL_OLLAMA_CONTRACT = Object.freeze({
  name: 'LOCAL_OLLAMA',
  kind: 'local',
  locality: 'local',
  transport: Object.freeze({ protocol: 'http', host: '127.0.0.1', port: 11434, path: '/api/chat', loopback_only: true }),
  required_capabilities: Object.freeze(['json_schema_constrained_output', 'temperature_zero', 'request_timeout', 'no_network_egress']),
  model: Object.freeze({ name: null, status: 'TO_BE_DEFINED', download: 'NOT_PERFORMED' }),
  install: 'NOT_PERFORMED',
  enabled: false,
});

export class LocalContractError extends Error {
  constructor(code) {
    super(`LOCAL_PROVIDER_CONTRACT_VIOLATION: ${code}`);
    this.name = 'LocalContractError';
    this.code = code;
  }
}

export const isLoopbackHost = (h) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(h).toLowerCase());

/** Verifica que un proveedor local cumple el contrato (sin conectarse a nada). */
export function assertLocalProviderContract(p) {
  assertProvider(p);
  if (p.locality !== 'local') throw new LocalContractError('NOT_LOCAL');
  if (p.network !== 'loopback_only') throw new LocalContractError('NETWORK_NOT_LOOPBACK_ONLY');
  if (p.endpoint && !isLoopbackHost(p.endpoint.host)) throw new LocalContractError('ENDPOINT_NOT_LOOPBACK');
  if (typeof p.name !== 'string' || !p.name) throw new LocalContractError('MISSING_NAME');
  if (typeof p.lastUsage !== 'function') throw new LocalContractError('MISSING_USAGE_REPORTING');
  return true;
}

/** Fabrica del proveedor real: DESHABILITADA. No hay implementacion ni red en esta fase. */
export function createLocalOllamaProvider() {
  throw new ProviderDisabledError('LOCAL_OLLAMA');
}

/** Doble de prueba que cumple el contrato local (para probar el benchmark nube-vs-local sin instalar nada). */
export class MockLocalProvider extends MockUnderstandingProvider {
  constructor(opts = {}) {
    super({ name: 'local-ollama-mock', ...opts });
    this.locality = 'local';
    this.network = 'loopback_only';
    this.endpoint = { host: '127.0.0.1', port: 11434 };
  }
}
