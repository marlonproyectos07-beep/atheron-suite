// ATH-WA-INGEST-002 — lector privado de whatsapp.message (SOLO LECTURA).
// Requiere cuenta(s) y remitentes explícitamente autorizados. NO consulta
// cuerpos de mensajes de huéspedes ni otros remitentes: filtro EN EL SERVIDOR
// Odoo, ANTES de traer body. Sin persistencia, envío ni escritura en Odoo.
import { classifyOdooWhatsApp } from './whatsapp-classify-readonly.mjs';

const PHONE = /^\+?[1-9][0-9]{7,14}$/;
const MAX_PER_ACCOUNT = 100;
const BIZ = new Set(['HOTELS', 'SECURITY']);

function validateSettings({ accounts, sinceUtc, maxPerAccount }) {
  if (!Array.isArray(accounts) || accounts.length < 1 || accounts.length > 5) {
    throw new Error('ACCOUNT_ALLOWLIST_REQUIRED');
  }
  if (typeof sinceUtc !== 'string' ||
      !/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sinceUtc) ||
      !Number.isFinite(Date.parse(sinceUtc.replace(' ', 'T') + 'Z'))) {
    throw new Error('VALID_UTC_WATERMARK_REQUIRED');
  }
  if (!Number.isSafeInteger(maxPerAccount) || maxPerAccount < 1 || maxPerAccount > MAX_PER_ACCOUNT) {
    throw new Error('INVALID_FETCH_LIMIT');
  }
  const ids = new Set();
  for (const acct of accounts) {
    if (!Number.isSafeInteger(acct?.accountId) || acct.accountId < 1 || ids.has(acct.accountId) ||
        !BIZ.has(acct.businessUnit)) throw new Error('ACCOUNT_ID_AND_BUSINESS_MUST_BE_EXPLICIT');
    ids.add(acct.accountId);
    if (!Array.isArray(acct.senders) || acct.senders.length === 0 || acct.senders.length > 15 ||
        acct.senders.some(s => typeof s !== 'string' || !PHONE.test(s)) ||
        new Set(acct.senders).size !== acct.senders.length) {
      throw new Error('STAFF_PHONE_ALLOWLIST_REQUIRED');
    }
  }
}

/**
 * Un ciclo de consulta, sin programador. `reader` solo puede implementar
 * whatsapp.message.search_read con autorización de lectura mínima.
 * `accounts` debe venir de configuración protegida, NUNCA del texto WhatsApp.
 *
 * Si una consulta alcanza el límite no declara cobertura ni genera asientos.
 * Los registros devueltos solo contienen información normalizada.
 */
export async function pollAuthorizedWhatsApp({
  reader,
  accounts,
  sinceUtc,
  maxPerAccount = 50
}) {
  validateSettings({ accounts, sinceUtc, maxPerAccount });
  if (typeof reader !== 'function') throw new Error('READ_ONLY_READER_REQUIRED');

  const batches = [];
  let incomplete = false;
  for (const acct of accounts) {
    const domain = [
      ['wa_account_id', '=', acct.accountId],
      ['message_type', '=', 'inbound'],
      ['mobile_number', 'in', acct.senders],
      ['create_date', '>=', sinceUtc]
    ];
    // Lista cerrada: no correo, no adjuntos, no nombres de huéspedes.
    const fields = ['id','wa_account_id','mobile_number','message_type','create_date','body'];
    const items = await reader({
      model: 'whatsapp.message', method: 'search_read',
      params: { domain, fields, order: 'create_date asc,id asc', limit: maxPerAccount }
    });
    if (!Array.isArray(items) || items.length > maxPerAccount) throw new Error('UNSAFE_SOURCE_RESULT');
    if (items.length === maxPerAccount) incomplete = true;
    batches.push({acct, items});
  }

  const messages = [], seen = new Set();
  for (const {acct,items} of batches) {
    for (const item of items) {
      const linkedId = Array.isArray(item?.wa_account_id) ? item.wa_account_id[0] : item?.wa_account_id;
      if (linkedId !== acct.accountId || item?.message_type !== 'inbound' ||
          !acct.senders.includes(item?.mobile_number) ||
          !Number.isSafeInteger(item?.id) || item.id < 1 ||
          typeof item?.body !== 'string' || item.body.length > 10000 ||
          typeof item?.create_date !== 'string' || item.create_date < sinceUtc) {
        throw new Error('SOURCE_SCOPE_VIOLATION');
      }
      const id = String(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const classification = classifyOdooWhatsApp({
        id, body: item.body, account: acct.businessUnit,
        source: 'whatsapp.message', inbound: true,
        senderAllowlisted: true
      });
      messages.push({
        messageKey: classification.messageKey,
        receivedDateUtc: item.create_date.slice(0, 10),
        businessUnit: classification.businessUnit,
        type: classification.type,
        direction: classification.direction,
        amountCop: classification.amountCop,
        cashAccount: classification.cashAccount,
        conceptCategory: classification.conceptCategory,
        status: classification.status,
        cashMovementVerified: false,
        accountingApproved: false,
        odooWrites: 0
      });
    }
  }

  // No presenta los resultados como auditoría completa si hay paginación pendiente.
  return {
    mode: 'SOLO_LECTURA',
    coverage: incomplete ? 'INCOMPLETA_REQUIERE_PAGINACION' : 'VENTANA_CONSULTADA',
    configuredAccounts: accounts.length,
    inspectedAuthorizedMessages: seen.size,
    messages,
    odooWrites: 0
  };
}
