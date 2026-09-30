/**
 * ATH-ODOO-HOTEL-010 (preparacion), Gate 010-I - interfaz de proveedor de
 * mensajeria, desacoplada de cualquier canal real. NO llama a Meta/
 * WhatsApp real, NO configura un numero, NO crea un webhook publico, NO
 * usa ni guarda un token. Esto es el CONTRATO que un futuro
 * `MetaWhatsAppProvider` real tendria que implementar, mas una
 * implementacion de laboratorio (`LabMessagingProvider`) para probar el
 * resto del sistema sin esa pieza.
 *
 * Cualquier cosa que use un `MessagingProvider` (el simulador, en este
 * gate) programa contra esta interfaz, nunca contra un SDK de Meta -- el
 * dia que exista autorizacion para conectar WhatsApp real, solo hace
 * falta escribir un provider nuevo que la implemente.
 */

const REQUIRED_METHODS = Object.freeze(['receiveMessage', 'sendMessage', 'markRead', 'verifyWebhook']);

/** Lanza si `provider` no implementa el contrato completo -- fail closed. */
export function assertImplementsMessagingProvider(provider) {
  for (const method of REQUIRED_METHODS) {
    if (typeof provider?.[method] !== 'function') {
      throw new Error(`MESSAGING_PROVIDER_MISSING_METHOD: ${method}`);
    }
  }
  return true;
}

/**
 * Implementacion de laboratorio: en memoria, sin red, sin credenciales.
 * `receiveMessage` entrega el mensaje a los handlers registrados (simula
 * lo que un webhook real haria); `sendMessage` solo lo guarda en
 * `sentMessages` para que un test pueda verificarlo.
 */
export class LabMessagingProvider {
  #handlers = [];
  #sent = [];
  #nextId = 1;

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

  async markRead(_messageId) {
    return true;
  }

  /** Laboratorio: nunca habla con Meta, siempre "valido" -- nunca produce un webhook publico real. */
  verifyWebhook() {
    return true;
  }

  get sentMessages() {
    return [...this.#sent];
  }
}
