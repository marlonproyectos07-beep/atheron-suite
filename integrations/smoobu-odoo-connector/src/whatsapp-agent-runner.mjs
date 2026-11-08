// ATH-PMS-WA-064 — Ejecutor del agente en sombra: lee mensajes ENTRANTES de la cuenta Odoo 7, consulta Smoobu
// (solo las cinco habitaciones) y deja el BORRADOR en un canal interno de Odoo para Marlon.
// NUNCA envia WhatsApp, no escribe en whatsapp.message, no crea reservas/pedidos/pagos/facturas.
// Persistencia: sin base de datos propia. El estado se reconstruye releyendo la conversacion en Odoo y la
// deduplicacion se apoya en etiquetas «ATH-AGENT msg=<wamid>» dentro de los propios borradores.
export { OdooDraftWriter } from './odoo-draft-writer.mjs';
import { handleInbound, composeDraft, HOTELS_ACCOUNT_ID } from './whatsapp-agent-shadow.mjs';
import { ControlGate } from './control-gate.mjs';

export const TAG = 'ATH-AGENT msg=';
// ATH-PMS-WA-067: durante la prueba real solo se procesa el telefono autorizado por gerencia (+57 320 285 9866).
export const AUTHORIZED_TEST_PHONES = Object.freeze(['573202859866']);
const digits = (p) => String(p ?? '').replace(/\D/g, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripHtml = (h) => String(h ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
export const maskPhone = (p) => '***' + String(p ?? '').replace(/\D/g, '').slice(-4);

export function parseInbound(row) {
  const acc = Array.isArray(row?.wa_account_id) ? row.wa_account_id[0] : row?.wa_account_id;
  if (acc !== HOTELS_ACCOUNT_ID || row.message_type !== 'inbound' || typeof row.msg_uid !== 'string' || !row.msg_uid) return null;
  const from = String(row.mobile_number_formatted || row.mobile_number || '').replace(/[^\d+]/g, '');
  return { direction: 'inbound', accountId: acc, messageId: row.msg_uid, from, text: stripHtml(row.body), odooId: row.id, createdAt: row.create_date };
}

export const bogotaToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);

export async function runAgent({ odoo, writer = null, smoobu, controlGate = null, today, sinceHours = 48, limit = 100, now = new Date() }) {
  // CP-04: producción debe inyectar ControlGate; si se proporciona, bloquea antes de leer/procesar mensajes.
  if (controlGate) {
    const gate = await controlGate.check({ requireReply: true, requireBooking: false });
    if (!gate.allowed) return { considered: 0, excludedOtherAccount: 0, excludedUnauthorizedSender: 0, alreadyProcessed: 0, drafts: [], blocked: [{ code: gate.code }], smoobuRequests: 0, posted: 0, sendEnabled: false, bookingEnabled: false, odooWritesOnWhatsapp: 0, controlGate: gate };
  }
  const since = new Date(now.getTime() - sinceHours * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  const rows = await odoo.searchRead('whatsapp.message',
    [['wa_account_id', '=', HOTELS_ACCOUNT_ID], ['message_type', '=', 'inbound'], ['create_date', '>=', since]],
    ['id', 'body', 'create_date', 'message_type', 'mobile_number', 'mobile_number_formatted', 'msg_uid', 'state', 'wa_account_id', 'mail_message_id'],
    { order: 'id asc', limit });
  const report = { considered: rows.length, excludedOtherAccount: 0, excludedUnauthorizedSender: 0, alreadyProcessed: 0, drafts: [], blocked: [], smoobuRequests: 0, posted: 0, sendEnabled: false, bookingEnabled: false, odooWritesOnWhatsapp: 0 };
  const events = [];
  for (const r of rows) {
    const e = parseInbound(r);
    if (!e) { report.excludedOtherAccount += 1; continue; }
    if (!AUTHORIZED_TEST_PHONES.includes(digits(e.from))) { report.excludedUnauthorizedSender += 1; continue; }
    events.push(e);
  }
  // deduplicacion persistente: etiquetas ya publicadas en el canal de borradores
  const done = new Set();
  if (writer) {
    await writer.assertInternal();
    const prev = await odoo.searchRead('mail.message', [['model', '=', 'discuss.channel'], ['res_id', '=', writer.channelId], ['body', 'ilike', TAG]], ['id', 'body'], { limit: 500 });
    for (const m of prev) for (const x of String(m.body).matchAll(/ATH-AGENT msg=([A-Za-z0-9_.:=+\/-]+)/g)) done.add(x[1]);
  }
  const bySender = new Map();
  for (const e of events) { if (!bySender.has(e.from)) bySender.set(e.from, []); bySender.get(e.from).push(e); }
  let customerId = null;
  for (const [from, list] of bySender) {
    let state = null; let last = null;
    for (const e of list) { last = handleInbound({ event: e, today, previous: state }); if (last.state) state = last.state; }
    const pending = list.filter((e) => !done.has(e.messageId));
    if (!pending.length) { report.alreadyProcessed += list.length; continue; }
    report.alreadyProcessed += list.length - pending.length;
    let outcome = last;
    if (last.kind === 'lookup_required') {
      customerId ??= (await smoobu.getCurrentUser()).id;
      const resp = await smoobu.checkApartmentAvailability({ ...last.lookup, customerId });
      report.smoobuRequests += 1;
      outcome = composeDraft({ state: last.state, response: resp });
    }
    if (outcome.kind === 'blocked') { report.blocked.push({ sender: maskPhone(from), code: outcome.code }); continue; }
    if (outcome.kind === 'duplicate' || !outcome.draft) continue;
    const lastMsg = list[list.length - 1];
    const html = `<p><b>BORRADOR DEL AGENTE — NO ENVIADO</b></p><p>Cliente: ${esc(maskPhone(from))} · Cuenta: Atheron Hotels (ID 7)</p>` +
      `<p>Mensaje recibido: «${esc(lastMsg.text.slice(0, 300))}»</p><p>Resultado: ${esc(outcome.kind)}${outcome.reason ? ' · ' + esc(outcome.reason) : ''}${outcome.needsHuman ? ' · requiere revisión humana' : ''}</p>` +
      `<blockquote>${esc(outcome.draft)}</blockquote><p><i>Para responder, copie el texto en la conversación de WhatsApp del cliente y envíelo usted.</i></p>` +
      `<p style="font-size:11px">${pending.map((e) => TAG + e.messageId).join(' ')}</p>`;
    report.drafts.push({ sender: maskPhone(from), kind: outcome.kind, reason: outcome.reason ?? null, covers: pending.map((e) => e.messageId), draft: outcome.draft });
    if (writer) {
      if (controlGate) await controlGate.assertAllowed({ requireReply: true, requireBooking: false });
      await writer.postDraft(html); report.posted += 1;
    }
  }
  return report;
}
