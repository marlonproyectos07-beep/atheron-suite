/**
 * ATH-ODOO-HOTEL-010/011 - interfaz de proveedor de mensajeria,
 * desacoplada de cualquier canal real. NO llama a Meta/WhatsApp real,
 * NO configura un numero, NO crea un webhook publico, NO usa ni guarda
 * un token. Esto es el CONTRATO que un futuro `WhatsAppCloudProvider`
 * real (ver whatsapp-cloud-adapter.mjs, HOTEL-011) tiene que implementar,
 * mas una implementacion de laboratorio (`LabMessagingProvider`) para
 * probar el resto del sistema sin esa pieza.
 *
 * Cualquier cosa que use un `MessagingProvider` (el simulador, el motor
 * conversacional) programa contra esta interfaz, nunca contra un SDK de
 * Meta -- el dia que exista autorizacion para conectar WhatsApp real,
 * solo hace falta pasar un provider distinto, sin tocar el motor.
 *
 * ATH-ODOO-HOTEL-011, Fase 2: se amplio el contrato con
 * `markDelivered`/`deduplicate`/`correlationId` -- WhatsApp entrega
 * confirmaciones de "entregado" distintas de "leido", puede reenviar el
 * MISMO mensaje mas de una vez (reintentos de Meta), y cada mensaje debe
 * poder trazarse con un correlation_id estable.
 */

const REQUIRED_METHODS = Object.freeze([
  'receiveMessage',
  'sendMessage',
  'markRead',
  'markDelivered',
  'deduplicate',
  'correlationId',
  'verifyWebhook',
]);

/** Lanza si `provider` no implementa el contrato completo -- fail closed. */
export function assertImplementsMessagingProvider(provider) {
  for (const method of REQUIRED_METHODS) {
    if (typeof provider?.[method] !== 'function') {
      throw new Error(`MESSAGING_PROVIDER_MISSING_METHOD: ${method}`);
    }
  }
  return true;
}

export { REQUIRED_METHODS as MESSAGING_PROVIDER_METHODS };

/**
 * Implementacion de laboratorio: en memoria, sin red, sin credenciales.
 * `receiveMessage` entrega el mensaje a los handlers registrados (simula
 * lo que un webhook real haria); `sendMessage` solo lo guarda en
 * `sentMessages` para que un test pueda verificarlo.
 */
export class LabMessagingProvider {
  #handlers = [];
  #sent = [];
  #media = [];
  #nextId = 1;
  #seenMessageIds = new Set();
  #correlationIds = new Map();

  onMessage(handler) {
    this.#handlers.push(handler);
  }

  async receiveMessage(message) {
    for (const handler of this.#handlers) {
      await handler(message);
    }
  }

  async sendMessage(to, text) {
    const message_id = `LAB-${this.#nextId++}`;
    this.#sent.push({ to, text, message_id });
    return { message_id };
  }

  async sendImage(to, link, caption = undefined) {
    const message_id = `LAB-${this.#nextId++}`;
    this.#media.push({ to, type: 'image', link, caption, message_id });
    return { message_id };
  }

  async sendVideo(to, link, caption = undefined) {
    const message_id = `LAB-${this.#nextId++}`;
    this.#media.push({ to, type: 'video', link, caption, message_id });
    return { message_id };
  }

  async markRead(_messageId) {
    return true;
  }

  async markDelivered(_messageId) {
    return true;
  }

  /**
   * `true` si `messageId` YA se proceso antes (deja constancia la primera
   * vez que lo ve, nunca dos veces). Sirve para que un reintento real de
   * Meta con el MISMO message_id nunca dispare una segunda operacion
   * (HOLD, cancel) -- ver ai-tool-adapters.mjs / conversation-engine.mjs.
   */
  deduplicate(messageId) {
    if (this.#seenMessageIds.has(messageId)) return true;
    this.#seenMessageIds.add(messageId);
    return false;
  }

  /** correlation_id estable por message_id -- el mismo mensaje siempre produce el mismo id. */
  correlationId(messageId) {
    if (!this.#correlationIds.has(messageId)) {
      this.#correlationIds.set(messageId, `corr-${messageId}`);
    }
    return this.#correlationIds.get(messageId);
  }

  /** Laboratorio: nunca habla con Meta, siempre "valido" -- nunca produce un webhook publico real. */
  verifyWebhook() {
    return true;
  }

  get sentMessages() {
    return [...this.#sent];
  }

  get sentMedia() {
    return [...this.#media];
  }
}
