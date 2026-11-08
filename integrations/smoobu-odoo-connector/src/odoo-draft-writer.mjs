// ATH-PMS-WA-064 — Escritor de borradores del agente. UNICA escritura: message_post en UN canal interno de Odoo.
// No crea ni modifica whatsapp.message, reservas, pedidos, pagos ni facturas. Nueva excepcion a la lista de
// test/p0.test.mjs (revisar): se justifica porque necesita _request y cada llamada pasa por esta guardia.
import { OdooJson2Client } from './odoo-json2-client.mjs';
import { ConnectorError } from './errors.mjs';

export class OdooDraftWriter extends OdooJson2Client {
  constructor(cfg, channelId) {
    super(cfg);
    if (!Number.isSafeInteger(Number(channelId)) || Number(channelId) <= 0) throw new ConnectorError('DRAFT_CHANNEL_INVALID');
    this.channelId = Number(channelId);
  }
  /** El canal debe ser interno (channel/group). Un canal de WhatsApp enviaria el texto al cliente: se rechaza. */
  async assertInternal() {
    const rows = await this.searchRead('discuss.channel', [['id', '=', this.channelId]], ['id', 'channel_type']);
    if (rows.length !== 1 || !['channel', 'group'].includes(rows[0].channel_type)) throw new ConnectorError('DRAFT_CHANNEL_IS_NOT_INTERNAL');
  }
  async postDraft(html) {
    if (typeof html !== 'string' || !html || html.length > 6000) throw new ConnectorError('DRAFT_INVALID');
    return this._request('discuss.channel', 'message_post', { ids: [this.channelId], body: html, message_type: 'comment', subtype_xmlid: 'mail.mt_comment' });
  }
}

