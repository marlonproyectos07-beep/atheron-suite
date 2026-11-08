// ATH-PMS-WA-068 — Envio UNICO y supervisado de una respuesta por WhatsApp (cuenta Odoo 7) al telefono de gerencia.
// DESARMADO por defecto: planSend() es de SOLO LECTURA y nunca envia. sendOnce() exige, a la vez, la frase de
// autorizacion de gerencia, el hash del texto aprobado, todas las verificaciones previas en verde y la reserva
// del marcador de idempotencia en el canal interno. No crea reservas, pedidos, pagos ni facturas.
import { createHash } from 'node:crypto';
import { OdooJson2Client } from './odoo-json2-client.mjs';
import { HOTELS_ACCOUNT_ID, handleInbound, composeDraft, POLICY } from './whatsapp-agent-shadow.mjs';
import { parseInbound, maskPhone } from './whatsapp-agent-runner.mjs';
import { ConnectorError } from './errors.mjs';

export const SEND_AUTH_PHRASE = 'AUTORIZO ENVIO UNICO ATH-PMS-WA-068 AL TELEFONO TERMINADO EN 9866';
export const SEND_TAG = 'ATH-SEND once=';
export const AUTHORIZED_PHONE = '573202859866';                 // unico destinatario permitido (gerencia)
export const WINDOW_MARGIN_MS = 30 * 60 * 1000;                  // no se envia con menos de 30 min de ventana restante
export const SEND_ONCE_DEFAULTS = Object.freeze({ channelId: 256, inboundMsgUid: 'wamid.HBgMNTczMjAyODU5ODY2FQIAEhgWM0VCMDVGNjA5MUFGNUU1Qjk4NjMyNQA=', draftChannelId: 257 });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digits = (p) => String(p ?? '').replace(/\D/g, '');
export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const odooUtc = (s) => new Date(String(s).replace(' ', 'T') + 'Z');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function fechaLarga(iso) {
  const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS[dt.getUTCDay()]} ${d} de ${MESES[m - 1]} de ${y}`;
}
const nights = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3);

/** Redaccion comercial definitiva. Solo para disponibilidad SIN precio verificado: el valor lo confirma recepcion. */
export function composeCommercialMessage({ state, rooms }) {
  const names = rooms.map((r) => r.room);
  const lista = names.length === 1 ? `la habitación ${names[0]}` : `las habitaciones ${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  const n = nights(state.arrival, state.departure);
  const pers = state.guests === 1 ? '1 persona' : `${state.guests} personas`;
  return [
    'Hola, gracias por escribirnos a Atheron Hotels.',
    `Para ${pers}, con llegada el ${fechaLarga(state.arrival)} y salida el ${fechaLarga(state.departure)} (${n} ${n === 1 ? 'noche' : 'noches'}), tenemos disponible ${lista}.`,
    'El valor de la estadía lo debe confirmar nuestro equipo de recepción; en cuanto lo tengamos le compartimos la tarifa final.',
    `Check-in desde las ${POLICY.checkIn} y check-out hasta las ${POLICY.checkOut}.`,
    'Esta es una consulta de disponibilidad y no constituye una reserva confirmada.',
  ].join('\n\n');
}

export class OdooWhatsAppSendOnce extends OdooJson2Client {
  /** @param {{authorization?:string, approvedTextSha256?:string}} gate  — sin ambos, sendOnce() se niega. */
  constructor(cfg, { channelId = SEND_ONCE_DEFAULTS.channelId, draftChannelId = SEND_ONCE_DEFAULTS.draftChannelId, inboundMsgUid = SEND_ONCE_DEFAULTS.inboundMsgUid, authorization, approvedTextSha256, controlGate = null } = {}) {
    super(cfg);
    Object.assign(this, { channelId: Number(channelId), draftChannelId: Number(draftChannelId), inboundMsgUid, authorization, approvedTextSha256, controlGate });
    if (!Number.isSafeInteger(this.channelId) || this.channelId <= 0 || !Number.isSafeInteger(this.draftChannelId) || this.draftChannelId <= 0) throw new ConnectorError('SEND_ONCE_CHANNEL_INVALID');
  }

  /** SOLO LECTURA. Devuelve el plan, las verificaciones y el texto exacto; jamas envia. */
  async planSend({ smoobu, today, now = new Date() }) {
    const gate = this.controlGate ? await this.controlGate.check({ requireReply: true, requireBooking: false }) : { allowed: true, epoch: null };
    const checks = []; const ck = (name, ok, detail) => checks.push({ name, ok: !!ok, ...(detail ? { detail } : {}) });
    ck('centro_control_ath', gate.allowed, gate.code || (gate.epoch != null ? 'epoch ' + gate.epoch : 'legacy test'));
    const [ch] = await this.searchRead('discuss.channel', [['id', '=', this.channelId]], ['id', 'channel_type', 'wa_account_id', 'whatsapp_number', 'whatsapp_channel_valid_until']);
    ck('canal_whatsapp_cuenta_7', ch && ch.channel_type === 'whatsapp' && (Array.isArray(ch.wa_account_id) ? ch.wa_account_id[0] : ch.wa_account_id) === HOTELS_ACCOUNT_ID);
    ck('destinatario_unico_autorizado', ch && digits(ch.whatsapp_number) === AUTHORIZED_PHONE, ch ? maskPhone(ch.whatsapp_number) : undefined);
    const valid = ch?.whatsapp_channel_valid_until ? odooUtc(ch.whatsapp_channel_valid_until) : null;
    ck('ventana_24h_vigente_odoo', valid && valid.getTime() - now.getTime() > WINDOW_MARGIN_MS, valid ? `vence ${valid.toISOString()}` : 'sin ventana');

    const rows = await this.searchRead('whatsapp.message', [['wa_account_id', '=', HOTELS_ACCOUNT_ID], ['mobile_number_formatted', 'ilike', AUTHORIZED_PHONE.slice(-10)]],
      ['id', 'body', 'create_date', 'message_type', 'mobile_number', 'mobile_number_formatted', 'msg_uid', 'state', 'wa_account_id', 'mail_message_id'], { order: 'id asc', limit: 200 });
    const inbound = rows.filter((r) => r.message_type === 'inbound');
    const last = inbound[inbound.length - 1];
    ck('mensaje_entrante_es_el_aprobado', last && last.msg_uid === this.inboundMsgUid, last ? `id ${last.id}` : 'sin entrantes');
    const lim = last ? odooUtc(last.create_date).getTime() + 24 * 3600e3 : 0;
    ck('ventana_24h_desde_ultimo_entrante', last && lim - now.getTime() > WINDOW_MARGIN_MS, last ? `vence ${new Date(lim).toISOString()}` : undefined);
    const prior = last ? rows.filter((r) => r.message_type === 'outbound' && r.id > last.id) : [];
    ck('sin_saliente_previo_a_este_entrante', last && prior.length === 0, prior.length ? `salientes: ${prior.map((p) => p.id).join(',')}` : undefined);
    const marks = await this.searchRead('mail.message', [['model', '=', 'discuss.channel'], ['res_id', '=', this.draftChannelId], ['body', 'ilike', SEND_TAG + this.inboundMsgUid]], ['id'], { limit: 5 });
    ck('sin_marcador_de_envio_previo', marks.length === 0, marks.length ? `marcador ${marks[0].id}` : undefined);

    let text = null; let facts = null; let smoobuRequests = 0;
    if (last && parseInbound(last)) {
      let state = null; let step = null;
      for (const r of inbound) { const e = parseInbound(r); if (!e) continue; step = handleInbound({ event: e, today, previous: state }); if (step.state) state = step.state; }
      if (step?.kind === 'lookup_required') {
        const me = await smoobu.getCurrentUser();
        const resp = await smoobu.checkApartmentAvailability({ ...step.lookup, customerId: me.id }); smoobuRequests = 1;
        const out = composeDraft({ state: step.state, response: resp });
        ck('disponibilidad_smoobu_sin_precio', out.kind === 'draft_without_price', out.kind);
        if (out.kind === 'draft_without_price') {
          const open = out.rooms.filter((x) => x.status === 'available_price_unverified');
          facts = { arrival: out.state.arrival, departure: out.state.departure, guests: out.state.guests, rooms: open.map((x) => x.room), allRoomsChecked: out.rooms.map((x) => x.room) };
          text = composeCommercialMessage({ state: out.state, rooms: open });
        }
      } else ck('solicitud_completa_interpretada', false, step?.kind);
    }
    const textSha = text ? sha256(text) : null;
    ck('texto_unico_sin_precio_inventado', !!text && !/\$|COP|\bprecio de\b/i.test(text));
    const ok = checks.every((c) => c.ok);
    return { ok, checks, text, textSha256: textSha, facts, smoobuRequests, recipient: maskPhone(AUTHORIZED_PHONE), channelId: this.channelId,
      wouldCall: ok ? { model: 'discuss.channel', method: 'message_post', ids: [this.channelId], message_type: 'whatsapp_message', bodyHtml: esc(text ?? '').replace(/\n/g, '<br>') } : null, sent: false };
  }

  /** ENVIO REAL (una sola vez). Se niega salvo autorizacion exacta + hash exacto + plan en verde + marcador reservado. */
  async sendOnce({ smoobu, today, now = new Date() }) {
    if (this.authorization !== SEND_AUTH_PHRASE) throw new ConnectorError('SEND_ONCE_NOT_AUTHORIZED');
    if (!/^[a-f0-9]{64}$/.test(this.approvedTextSha256 ?? '')) throw new ConnectorError('SEND_ONCE_TEXT_NOT_APPROVED');
    const plan = await this.planSend({ smoobu, today, now });
    if (!plan.ok) throw new ConnectorError('SEND_ONCE_CHECKS_FAILED');
    if (plan.textSha256 !== this.approvedTextSha256) throw new ConnectorError('SEND_ONCE_TEXT_CHANGED_SINCE_APPROVAL');
    // CP-04: comprobar nuevamente inmediatamente antes de cualquier escritura.
    if (this.controlGate) await this.controlGate.assertAllowed({ requireReply: true, requireBooking: false });
    // 1) reservar el marcador (idempotencia): si el envio falla, queda constancia y NO se reintenta solo
    await this._request('discuss.channel', 'message_post', { ids: [this.draftChannelId], body: `<p><b>ENVIO UNICO RESERVADO</b> · destinatario ${esc(plan.recipient)}</p><p style="font-size:11px">${SEND_TAG}${esc(this.inboundMsgUid)}</p>`, message_type: 'comment', subtype_xmlid: 'mail.mt_comment' });
    // 2) enviar por la cuenta WhatsApp 7 (canal de la conversacion con el telefono autorizado)
    if (this.controlGate) await this.controlGate.assertAllowed({ requireReply: true, requireBooking: false });
    const res = await this._request('discuss.channel', 'message_post', { ids: [this.channelId], body: plan.wouldCall.bodyHtml, message_type: 'whatsapp_message' });
    return { sent: true, result: res, recipient: plan.recipient, textSha256: plan.textSha256 };
  }
}
