/**
 * Clasificacion comercial de un lead (multi-etiqueta) + enrutamiento humano. No decide nada comercial:
 * etiqueta, calcula brechas contra capacidad VERIFICADA y marca lo que debe ver una persona.
 *
 * Primaria (una): STANDARD_LEAD | GROUP_LEAD | CORPORATE_LEAD | STRATEGIC_GROUP_LEAD
 * Banderas: CAPACITY_GAP | PAYMENT_REPORTED | PAYMENT_CONFIRMED | MANUAL_REVIEW_REQUIRED
 *
 * Reglas: 11+ pax GROUP_LEAD · 30+ prioridad humana · 100+ STRATEGIC_GROUP_LEAD · demanda > capacidad conocida CAPACITY_GAP ·
 * descuento = humano · pantallazo = PAYMENT_REPORTED · solo Cartera/Banco = PAYMENT_CONFIRMED · politica directa 50 % (con
 * respeto a acuerdos historicos) · nunca se inventa disponibilidad ni tarifa.
 */
import { VERIFIED_ODOO_CAPACITY, POLICY } from '../policy.mjs';
import { groupFlowFor } from '../groups.mjs';

export const PRIMARY_CLASSES = Object.freeze(['STANDARD_LEAD', 'GROUP_LEAD', 'CORPORATE_LEAD', 'STRATEGIC_GROUP_LEAD']);
export const FLAG_LABELS = Object.freeze(['CAPACITY_GAP', 'PAYMENT_REPORTED', 'PAYMENT_CONFIRMED', 'MANUAL_REVIEW_REQUIRED']);

/** Capacidad CONOCIDA y verificada. Solo Hotel Atheron Suite (Odoo). Las capacidades de la web de otras propiedades NO cuentan. */
export function knownCapacity(lead) {
  const { property } = lead.stay;
  if (property !== 'AS') return { known: null, basis: 'NOT_VERIFIED', property };
  return { known: VERIFIED_ODOO_CAPACITY.casa_completa_AS, basis: 'ODOO_VERIFIED_AS_CASA_COMPLETA', property };
}

export function classifyLead(lead) {
  const pax = lead.stay.pax;
  const pay = lead.payment;
  const corporate = lead.stay.party_types.includes('COMPANY');
  const labels = new Set();
  let leadClass = 'STANDARD_LEAD';
  if (pax >= 100) leadClass = 'STRATEGIC_GROUP_LEAD';
  else if (corporate) leadClass = 'CORPORATE_LEAD';
  else if (pax >= 11) leadClass = 'GROUP_LEAD';
  labels.add(leadClass);
  if (pax >= 11) labels.add('GROUP_LEAD');
  if (pax >= 100) labels.add('STRATEGIC_GROUP_LEAD');
  if (corporate) labels.add('CORPORATE_LEAD');

  // capacidad: demanda vs capacidad conocida (nunca se prometen cupos)
  const cap = knownCapacity(lead);
  const gap = pax != null && cap.known != null && pax > cap.known ? pax - cap.known : 0;
  if (gap > 0) labels.add('CAPACITY_GAP');
  const capacity = { known_capacity: cap.known, basis: cap.basis, demand: pax ?? null, gap, capacity_known: cap.known != null, note: 'Solo cuenta capacidad verificada en Odoo (Atheron Suite); la capacidad de la web de otras propiedades no se promete.' };

  // pagos
  if (pay.state === 'PAYMENT_CONFIRMED') labels.add('PAYMENT_CONFIRMED');
  const reportedUnconfirmed = pay.state === 'PAYMENT_REPORTED' || (pay.state === 'PAYMENT_CONFIRMED' && pay.deposit_reported != null && pay.deposit_reported > (pay.deposit_received ?? 0));
  if (reportedUnconfirmed) labels.add('PAYMENT_REPORTED');

  // anomalias -> MANUAL_REVIEW_REQUIRED
  const r = [];
  const price = lead.pricing.agreed_price;
  const candidate = pay.deposit_received ?? pay.deposit_reported ?? pay.deposit_requested ?? pay.deposit_offered_by_guest;
  if (lead.pricing.discount_requested) r.push('DISCOUNT_REQUESTED');
  if (lead.unit.room_unidentified) r.push('ROOM_UNIDENTIFIED');
  if (lead.stay.date_ambiguous) r.push('DATE_AMBIGUOUS');
  if (lead.stay.date_ambiguity_reasons.includes('DATE_IN_PAST')) r.push('DATE_IN_PAST');
  if (lead.stay.date_changes.length && lead.signals.date_changed_after_payment) r.push('DATE_CHANGED_AFTER_PAYMENT');
  if (lead.pricing.conflict) r.push('PRICE_CONFLICT');
  if (pay.stated_balance != null && price != null && candidate != null && pay.stated_balance !== price - candidate) r.push('BALANCE_MISMATCH');
  if (pay.policy.status === 'BELOW_POLICY_NO_AGREEMENT') r.push('DEPOSIT_BELOW_POLICY_NO_AGREEMENT');
  if (pay.policy.status === 'EXCEEDS_PRICE') r.push('DEPOSIT_EXCEEDS_PRICE');
  if (gap > 0) r.push('CAPACITY_GAP');
  if (lead.unit.capacity_of_unit != null && pax != null && pax > lead.unit.capacity_of_unit) r.push('ROOM_CAPACITY_EXCEEDED');
  if (lead.channel.origin === 'BOOKING' || lead.channel.origin === 'AIRBNB') r.push('OTA_RESERVATION_PLATFORM_RULES');
  if (lead.signals.sensitive_pii_in_conversation) r.push('SENSITIVE_DATA_SHARED');
  if (pay.payment_denied_by_finance) r.push('PAYMENT_NOT_FOUND_BY_FINANCE');
  if (lead.signals.multiple_payment_reports) r.push('MULTIPLE_PAYMENT_REPORTS');
  if ((pay.state === 'PAYMENT_REPORTED' || pay.state === 'PAYMENT_CONFIRMED') && price == null) r.push('PAYMENT_WITHOUT_PRICE');
  if (pay.deposit_received != null && pay.deposit_reported != null && pay.deposit_received !== pay.deposit_reported) r.push('CONFIRMED_AMOUNT_MISMATCH');
  if (pay.balance != null && pay.balance < 0) r.push('OVERPAID');
  const manualReasons = [...new Set(r)];
  if (manualReasons.length) labels.add('MANUAL_REVIEW_REQUIRED');

  // humano / enrutamiento
  const humanReasons = [];
  if (pax >= 11) humanReasons.push(groupFlowFor(pax));
  if (corporate) humanReasons.push('CORPORATE_QUOTE');
  if (labels.has('PAYMENT_REPORTED')) humanReasons.push('PAYMENT_VALIDATION_REQUIRED');
  if (manualReasons.length) humanReasons.push('MANUAL_REVIEW_REQUIRED');
  const priority = pax >= 100 ? 'STRATEGIC' : pax >= 30 ? 'HIGH' : pax >= 11 || corporate ? 'NORMAL' : null;
  const queue = leadClass === 'STRATEGIC_GROUP_LEAD' ? 'STRATEGIC_ACCOUNTS' : leadClass === 'CORPORATE_LEAD' ? 'CORPORATE_SALES' : leadClass === 'GROUP_LEAD' ? 'GROUP_SALES' : 'RECEPTION';
  const required = humanReasons.length > 0;
  return {
    lead_class: leadClass,
    labels: [...labels],
    capacity,
    human: { required, priority: required ? (priority ?? 'NORMAL') : null, human_priority_alert: pax >= 30, reasons: [...new Set(humanReasons)], manual_review_reasons: manualReasons },
    group_routing: {
      queue,
      flow: pax >= 11 ? groupFlowFor(pax) : null,
      pricing_approval: pax >= 11 || corporate ? 'GROUP_PRICING_APPROVAL' : null,
      auto_discount: false,
      can_promise_capacity: false,
      hold_allowed: false,
    },
    guards: { availability_invented: false, price_invented: false, discount_applied: false, outbound: null, sends_message: false },
    policy: { direct_deposit_percent: POLICY.deposit.percent, historical_agreements_respected: true },
  };
}
