/**
 * LanguageUnderstandingProvider -- interfaz de comprension de lenguaje.
 * HOY no hay ningun proveedor real conectado: todos estan DISABLED. Solo existe el mock de pruebas.
 *
 *   interpretMessage({ text, context, schema_version })        -> object (se valida despues)
 *   interpretConversation({ turns, context, schema_version })  -> object
 *   health()                                                   -> { ok, provider, mock }
 *
 * `text`/`turns` llegan YA redactados (redactPII). Un proveedor devuelve un objeto; el pipeline lo
 * valida con el esquema estricto. Un proveedor nunca recibe credenciales del cliente ni datos de Odoo.
 */
export const PROVIDER_METHODS = Object.freeze(['interpretMessage', 'interpretConversation', 'health']);

export function assertProvider(p) {
  for (const m of PROVIDER_METHODS) if (typeof p?.[m] !== 'function') throw new Error(`UNDERSTANDING_PROVIDER_MISSING_METHOD: ${m}`);
  return true;
}

/** Registro de proveedores reales: TODOS DESHABILITADOS. Habilitar uno requiere autorizacion de Control Maestro. */
export const REAL_PROVIDERS = Object.freeze({
  openai: Object.freeze({ enabled: false, reason: 'DISABLED_PENDING_CEO_AUTHORIZATION' }),
  anthropic: Object.freeze({ enabled: false, reason: 'DISABLED_PENDING_CEO_AUTHORIZATION' }),
  gemini: Object.freeze({ enabled: false, reason: 'DISABLED_PENDING_CEO_AUTHORIZATION' }),
  other: Object.freeze({ enabled: false, reason: 'DISABLED_PENDING_CEO_AUTHORIZATION' }),
});

export class ProviderDisabledError extends Error {
  constructor(name) {
    super(`PROVIDER_DISABLED: ${name}`);
    this.name = 'ProviderDisabledError';
    this.provider = name;
  }
}

/** Obtiene un proveedor real por nombre: siempre lanza mientras esten deshabilitados. No hay red ni claves. */
export function getRealProvider(name) {
  const entry = REAL_PROVIDERS[name];
  if (!entry || entry.enabled !== true) throw new ProviderDisabledError(name);
  throw new ProviderDisabledError(name); // incluso "habilitado" no hay implementacion en esta fase
}

/**
 * MockUnderstandingProvider: determinista, sin red. `script` puede ser
 *  - una funcion ({text, context}) => objeto | Promise   (o lanza / nunca resuelve)
 *  - un Map/objeto texto-normalizado -> objeto
 * `usage` simula tokens por llamada para el contrato de benchmark.
 */
export class MockUnderstandingProvider {
  constructor({ script, name = 'mock', latencyMs = 0, usage = { input_tokens: 0, output_tokens: 0 } } = {}) {
    this.name = name;
    this.isMock = true;
    this.script = script;
    this.latencyMs = latencyMs;
    this.usage = usage;
    this.calls = [];
  }

  async #run(payload) {
    this.calls.push(payload);
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const s = this.script;
    if (typeof s === 'function') return s(payload);
    if (s instanceof Map) return s.get(payload.text);
    return s?.[payload.text];
  }

  interpretMessage(payload) { return this.#run(payload); }
  interpretConversation(payload) { return this.#run({ ...payload, text: payload.turns?.at(-1) ?? '' }); }
  lastUsage() { return { ...this.usage }; }
  async health() { return { ok: true, provider: this.name, mock: true }; }
}
