/**
 * Payload estructurado apto para enviar LUEGO a Odoo/Gateway. HOY es solo un borrador DRY_RUN:
 * `write_enabled=false`, `ready_to_send=false`, sin entorno destino. No hay funcion de envio; `commitToOdoo()` lanza
 * ShadowViolation. No incluye texto crudo de la conversacion. El nombre del huesped (si lo dijo) va marcado como PII
 * para el sistema interno; `redactPayload()` lo oculta para registros/informes.
 */
import { createHash } from 'node:crypto';
import { ShadowViolation } from '../odoo-port.mjs';
import { PRIMARY_CLASSES, FLAG_LABELS } from './classify.mjs';

export const PAYLOAD_SCHEMA = 'ath.odoo.reservation-capture/1.0';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hash16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** @param {{lead:object, classification:object}} cap  @param {{odoo_ids?:{quote_id:string, unit_id:string}}} opts */
export function buildOdooPayload({ lead, classification }, { odoo_ids = null } = {}) {
  const p = lead.payment;
  const blocked = ['SHADOW_ONLY', 'WRITE_DISABLED', 'AVAILABILITY_NOT_VERIFIED'];
  if (!odoo_ids?.unit_id) blocked.push('UNIT_ID_NOT_MAPPED');
  if (!odoo_ids?.quote_id) blocked.push('NO_ODOO_QUOTE');
  if (classification.human.required) blocked.push('HUMAN_REVIEW_PENDING');
  const key = `cap-${hash16([lead.conversation_ref, lead.stay.check_in, lead.stay.check_out, lead.unit.requested_unit, lead.stay.pax].join('|'))}`;
  return {
    schema: PAYLOAD_SCHEMA,
    mode: 'DRY_RUN',
    write_enabled: false,
    target_environment: 'NONE',
    ready_to_send: false,
    blocked_by: blocked,
    idempotency_key: key,
    provenance: { source: 'DIRECT_WHATSAPP', extracted_by: 'rules', shadow: true, conversation_ref: lead.conversation_ref },
    guest: { name_as_stated: lead.guest.name_as_stated, ref: lead.guest.ref, contains_pii: lead.guest.contains_pii },
    stay: { property: lead.stay.property, property_assumed: lead.stay.property_assumed, check_in: lead.stay.check_in, check_out: lead.stay.check_out, nights: lead.stay.nights, pax: lead.stay.pax, party_type: lead.stay.party_type, date_ambiguous: lead.stay.date_ambiguous, date_changes: lead.stay.date_changes },
    unit: { requested_unit: lead.unit.requested_unit, whole_house: lead.unit.whole_house, room_unidentified: lead.unit.room_unidentified },
    channel: { origin: lead.channel.origin, source: lead.channel.source },
    commercial: { lead_class: classification.lead_class, labels: classification.labels, priority: classification.human.priority, queue: classification.group_routing.queue, flow: classification.group_routing.flow, capacity: classification.capacity },
    financial: {
      currency: 'COP',
      agreed_price: lead.pricing.agreed_price,
      price_verified: lead.pricing.verified,
      price_source: lead.pricing.agreed_price_source,
      deposit_requested: p.deposit_requested,
      deposit_reported: p.deposit_reported,
      deposit_received_confirmed: p.deposit_received,
      balance: p.balance,
      payment_state: p.state,
      confirmations: p.confirmations,
      deposit_policy: p.policy,
      historical_agreement: p.historical_agreement,
      discount_requested: lead.pricing.discount_requested,
    },
    review: { requires_human: classification.human.required, priority: classification.human.priority, reasons: classification.human.reasons, manual_review_reasons: classification.human.manual_review_reasons },
    availability: lead.availability,
    data_gaps: lead.data_gaps,
    gateway_hold_candidate: odoo_ids?.quote_id && odoo_ids?.unit_id ? { quote_id: odoo_ids.quote_id, unit_id: odoo_ids.unit_id, idempotency_key: key } : null,
  };
}

/** Valida la FORMA del payload (no hay Odoo): esquema, modo seguro, enumeraciones, fechas y montos. */
export function validateOdooPayload(p) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (p?.schema !== PAYLOAD_SCHEMA) bad('BAD_SCHEMA');
  if (p?.mode !== 'DRY_RUN') bad('MODE_MUST_BE_DRY_RUN');
  if (p?.write_enabled !== false) bad('WRITE_MUST_BE_DISABLED');
  if (p?.ready_to_send !== false) bad('READY_TO_SEND_MUST_BE_FALSE');
  if (p?.target_environment !== 'NONE') bad('TARGET_ENVIRONMENT_MUST_BE_NONE');
  if (typeof p?.idempotency_key !== 'string' || !/^cap-[0-9a-f]{16}$/.test(p.idempotency_key)) bad('BAD_IDEMPOTENCY_KEY');
  for (const k of ['check_in', 'check_out']) if (p?.stay?.[k] != null && !ISO.test(p.stay[k])) bad(`BAD_DATE_${k}`);
  for (const k of ['agreed_price', 'deposit_requested', 'deposit_reported', 'deposit_received_confirmed']) { const v = p?.financial?.[k]; if (v != null && !(Number.isInteger(v) && v >= 0)) bad(`BAD_AMOUNT_${k}`); }
  if (p?.financial?.balance != null && !Number.isInteger(p.financial.balance)) bad('BAD_AMOUNT_balance');
  if (p?.financial?.currency !== 'COP') bad('CURRENCY_MUST_BE_COP');
  if (!PRIMARY_CLASSES.includes(p?.commercial?.lead_class)) bad('BAD_LEAD_CLASS');
  if ((p?.commercial?.labels ?? []).some((l) => !PRIMARY_CLASSES.includes(l) && !FLAG_LABELS.includes(l))) bad('BAD_LABEL');
  if (p?.provenance?.source !== 'DIRECT_WHATSAPP' && p?.channel?.source !== 'DIRECT_WHATSAPP') bad('BAD_SOURCE');
  const walk = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (['text', 'transcript', 'raw', 'raw_text', 'messages', 'turns'].includes(k)) bad(`RAW_TEXT_FORBIDDEN:${k}`); if (v && typeof v === 'object') walk(v); } };
  walk(p);
  return { ok: errors.length === 0, errors };
}

/** Oculta PII para logs/informes. */
export function redactPayload(p) {
  return { ...p, guest: { ...p.guest, name_as_stated: p.guest.name_as_stated ? '[NAME]' : null } };
}

/** Escritura a Odoo: NO existe en esta fase. */
export function commitToOdoo() {
  throw new ShadowViolation('odoo_write_from_commercial_capture');
}
