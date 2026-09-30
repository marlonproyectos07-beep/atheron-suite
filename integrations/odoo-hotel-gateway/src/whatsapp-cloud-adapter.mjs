/**
 * ATH-ODOO-HOTEL-011, Fase 3 -- adaptador REAL para WhatsApp Cloud API
 * (Meta), preparado pero NUNCA conectado por si solo. Implementa el
 * contrato `MessagingProvider` (ver messaging-provider.mjs) para que el
 * motor conversacional pueda usarlo exactamente igual que
 * `LabMessagingProvider`, sin saber que canal hay detras.
 *
 * Reglas que gobiernan este archivo (fail closed, mismo patron que
 * odoo-adapter.mjs LIVE):
 *   - Sin `accessToken`/`phoneNumberId` configurados, cualquier envio
 *     lanza `WHATSAPP_ADAPTER_MISCONFIGURED` -- nunca falla en silencio.
 *   - Sin un `httpClient` inyectado explicitamente, cualquier envio
 *     lanza `WHATSAPP_ADAPTER_NOT_CONNECTED` -- este adaptador NUNCA
 *     hace un `fetch` a Meta por su cuenta. La conexion real requiere
 *     que alguien inyecte el cliente HTTP a proposito (ver Fase 15/16,
 *     gate CEO).
 *   - Ningun secreto (`accessToken`, `verifyToken`) se imprime ni se
 *     incluye en ningun error/log -- los errores solo nombran el campo
 *     que falta, nunca su valor.
 */

export const WHATSAPP_API_VERSION = 'v20.0';

function requireConfig(config, keys) {
  for (const key of keys) {
    if (!config[key]) throw new Error(`WHATSAPP_ADAPTER_MISCONFIGURED: falta ${key}`);
  }
}

export class WhatsAppCloudProvider {
  #config;
  #httpClient;
  #handlers = [];
  #seenMessageIds = new Set();
  #correlationIds = new Map();

  /**
   * @param {{accessToken?, phoneNumberId?, verifyToken?, apiBaseUrl?, httpClient?}} options
   *   `httpClient`: `(url, requestInit) => Promise<any>` inyectable (real
   *   fetch o un fake de prueba). Sin el, el adaptador esta "preparado
   *   pero no conectado" -- puede verificar webhooks y parsear payloads
   *   (solo lectura, sin red), pero nunca puede enviar nada.
   */
  constructor({ accessToken, phoneNumberId, verifyToken, apiBaseUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`, httpClient = null } = {}) {
    this.#config = { accessToken, phoneNumberId, verifyToken, apiBaseUrl };
    this.#httpClient = httpClient;
  }

  onMessage(handler) {
    this.#handlers.push(handler);
  }

  /**
   * Verificacion REAL del handshake de Meta (GET /webhook con
   * hub.mode/hub.verify_token/hub.challenge). Pura, sin red -- solo
   * compara contra el `verifyToken` ya configurado.
   */
  verifyWebhook(query) {
    requireConfig(this.#config, ['verifyToken']);
    if (query?.['hub.mode'] === 'subscribe' && query?.['hub.verify_token'] === this.#config.verifyToken) {
      return query['hub.challenge'] ?? null;
    }
    return null;
  }

  /**
   * Traduce un payload REAL de Meta (POST /webhook) a nuestro formato
   * interno de mensaje. Ignora de forma segura cualquier forma
   * inesperada (status updates, tipos no-texto, payload corrupto) --
   * NUNCA lanza sobre un payload raro, solo devuelve menos mensajes.
   */
  parseInboundPayload(payload) {
    const messages = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const raw of change?.value?.messages ?? []) {
          if (raw?.type !== 'text') continue; // Fase 5: solo texto en este gate
          messages.push({
            from: raw.from ?? null,
            text: raw.text?.body ?? '',
            message_id: raw.id ?? null,
            timestamp: raw.timestamp ?? null,
            phone_number_id: change?.value?.metadata?.phone_number_id ?? null,
          });
        }
      }
    }
    return messages;
  }

  /** Entrega cada mensaje de texto del payload a los handlers, deduplicando por message_id (Fase 9). */
  async receiveMessage(payload) {
    for (const message of this.parseInboundPayload(payload)) {
      if (!message.message_id || this.deduplicate(message.message_id)) continue;
      for (const handler of this.#handlers) {
        await handler(message);
      }
    }
  }

  async #post(path, body) {
    requireConfig(this.#config, ['accessToken', 'phoneNumberId']);
    if (!this.#httpClient) {
      throw new Error('WHATSAPP_ADAPTER_NOT_CONNECTED: sin httpClient inyectado, este adaptador nunca llama a Meta por su cuenta.');
    }
    return this.#httpClient(`${this.#config.apiBaseUrl}/${this.#config.phoneNumberId}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async sendMessage(to, text) {
    return this.#post('/messages', { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } });
  }

  async markRead(messageId) {
    return this.#post('/messages', { messaging_product: 'whatsapp', status: 'read', message_id: messageId });
  }

  /**
   * Meta no expone "marcar como entregado" desde el lado del negocio --
   * la entrega la reporta Meta por su propio webhook de status. No se
   * inventa un endpoint que no existe: no-op explicito y documentado.
   */
  async markDelivered(_messageId) {
    return { status: 'NOT_APPLICABLE_DELIVERY_IS_META_REPORTED' };
  }

  deduplicate(messageId) {
    if (this.#seenMessageIds.has(messageId)) return true;
    this.#seenMessageIds.add(messageId);
    return false;
  }

  correlationId(messageId) {
    if (!this.#correlationIds.has(messageId)) {
      this.#correlationIds.set(messageId, `corr-${messageId}`);
    }
    return this.#correlationIds.get(messageId);
  }
}
