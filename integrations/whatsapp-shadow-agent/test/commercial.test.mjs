/**
 * ATH-WHATSAPP-COMMERCIAL-001 -- captura de reservas y grupos en SHADOW.
 * Conversacion -> lead estructurado + clasificacion comercial + payload Odoo DRY_RUN. Sin autonomia, sin envio,
 * sin escritura en Odoo, sin proveedor. Fecha de referencia: sabado 2026-10-03.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { captureReservation, captureFromSession, parseCopAmounts, depositPolicy, buildOdooPayload, validateOdooPayload, redactPayload, commitToOdoo, classifyLead, extractLead } from '../src/commercial/index.mjs';
import { ShadowViolation, guardPort } from '../src/odoo-port.mjs';
import { resolveConfig, ConfigError } from '../src/config.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { createSession, processMessage } from '../src/agent.mjs';
import { makeFakeOdoo } from './fake-odoo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cap = (turns, opts = {}) => captureReservation(turns, { today: '2026-10-03', conversation_id: 'conv-test', ...opts });
const g = (text, extra = {}) => ({ role: 'guest', text, ...extra });
const s = (text) => ({ role: 'staff', text });
const fin = (text) => ({ role: 'finance', text });

// ---- 0. caso real de referencia: reserva directa 301 --------------------------------------------------------------------
test('REFERENCIA: reserva directa 301, llegada 04/10/2026, total 130.000, anticipo 40.000, saldo 90.000, DIRECT_WHATSAPP', () => {
  const c = cap([
    g('Hola, soy Carlos Perez, quiero la habitación 301 para el 04/10/2026, 1 noche, somos 2'),
    s('Listo. El total son $130.000. Anticipo $40.000 como quedamos (acuerdo previo). Saldo $90.000'),
    g('listo, ya pague 40 mil', { type: 'image' }),
    fin('Cartera: pago confirmado 40.000 nequi'),
  ]);
  const { lead, classification: k } = c;
  assert.equal(lead.unit.requested_unit, '301');
  assert.equal(lead.unit.capacity_of_unit, 7);
  assert.equal(lead.unit.whole_house, false);
  assert.equal(lead.stay.check_in, '2026-10-04');
  assert.equal(lead.stay.check_out, '2026-10-05');
  assert.equal(lead.stay.nights, 1);
  assert.equal(lead.stay.pax, 2);
  assert.equal(lead.channel.origin, 'DIRECT_WHATSAPP');
  assert.equal(lead.channel.source, 'DIRECT_WHATSAPP');
  assert.equal(lead.pricing.agreed_price, 130000);
  assert.equal(lead.pricing.verified, false, 'una tarifa dicha en el chat nunca queda verificada');
  assert.equal(lead.payment.deposit_requested, 40000);
  assert.equal(lead.payment.deposit_received, 40000);
  assert.equal(lead.payment.balance, 90000);
  assert.equal(lead.payment.state, 'PAYMENT_CONFIRMED');
  assert.equal(lead.payment.policy.status, 'BELOW_POLICY_HISTORICAL_AGREEMENT', 'el acuerdo historico se respeta');
  assert.equal(lead.payment.policy.matches_legacy_odoo_percent, true);
  assert.equal(lead.guest.name_as_stated, 'Carlos Perez');
  assert.equal(k.lead_class, 'STANDARD_LEAD');
  assert.ok(k.labels.includes('PAYMENT_CONFIRMED'));
  assert.ok(!k.labels.includes('MANUAL_REVIEW_REQUIRED'));
  assert.equal(c.payload_validation.ok, true, c.payload_validation.errors.join());
  assert.equal(c.outbound, null);
});

// ---- 1. reserva normal 2 pax --------------------------------------------------------------------------------------------------
test('1. reserva normal de 2 pax: lead completo, STANDARD_LEAD, anticipo 50 % pedido, sin humano', () => {
  const { lead, classification: k } = cap([
    g('Hola, me llamo Ana Rojas, quiero la habitación 302 del 10 al 12 de octubre, somos 2'),
    s('El total son $240.000 por las 2 noches. Anticipo del 50%: $120.000'),
  ]);
  assert.equal(lead.stay.check_in, '2026-10-10');
  assert.equal(lead.stay.check_out, '2026-10-12');
  assert.equal(lead.stay.nights, 2);
  assert.equal(lead.stay.pax, 2);
  assert.equal(lead.unit.requested_unit, '302');
  assert.equal(lead.pricing.agreed_price, 240000);
  assert.equal(lead.payment.deposit_requested, 120000);
  assert.equal(lead.payment.state, 'DEPOSIT_REQUESTED');
  assert.equal(lead.payment.policy.status, 'MEETS_POLICY');
  assert.equal(lead.payment.policy.target_amount, 120000);
  assert.equal(lead.payment.balance, 240000, 'saldo = precio menos lo CONFIRMADO (nada confirmado todavia)');
  assert.equal(lead.payment.balance_if_deposit_confirmed, 120000);
  assert.equal(k.lead_class, 'STANDARD_LEAD');
  assert.equal(k.human.required, false);
  assert.deepEqual(k.labels, ['STANDARD_LEAD']);
  assert.equal(lead.availability.status, 'NOT_VERIFIED', 'la disponibilidad nunca se asume');
  assert.ok(lead.data_gaps.includes('AVAILABILITY_NOT_VERIFIED'));
});

// ---- 2. grupo de 20 ----------------------------------------------------------------------------------------------------------------
test('2. grupo de 20 pax: GROUP_LEAD, humano, sin brecha de capacidad (<= 22), sin promesa de cupo ni descuento', () => {
  const { lead, classification: k } = cap([g('Somos 20 personas para el 14 de noviembre, 2 noches, queremos casa completa')]);
  assert.equal(lead.stay.pax, 20);
  assert.equal(lead.unit.whole_house, true);
  assert.equal(k.lead_class, 'GROUP_LEAD');
  assert.ok(k.labels.includes('GROUP_LEAD'));
  assert.ok(!k.labels.includes('CAPACITY_GAP'));
  assert.ok(!k.labels.includes('STRATEGIC_GROUP_LEAD'));
  assert.equal(k.human.required, true);
  assert.equal(k.human.priority, 'NORMAL');
  assert.equal(k.human.human_priority_alert, false);
  assert.equal(k.group_routing.queue, 'GROUP_SALES');
  assert.equal(k.group_routing.flow, 'GROUP_SALES_FLOW');
  assert.equal(k.group_routing.pricing_approval, 'GROUP_PRICING_APPROVAL');
  assert.equal(k.group_routing.can_promise_capacity, false);
  assert.equal(k.group_routing.auto_discount, false);
  assert.equal(k.group_routing.hold_allowed, false);
  assert.equal(lead.pricing.agreed_price, null, 'no se inventa tarifa de grupo');
});

// ---- 3. grupo de 200 ----------------------------------------------------------------------------------------------------------------
test('3. grupo de 200 pax: STRATEGIC_GROUP_LEAD + GROUP_LEAD + CAPACITY_GAP (22 verificados), prioridad estrategica', () => {
  const { lead, classification: k } = cap([g('Necesito hospedar a 200 invitados de un matrimonio el 20 de diciembre')]);
  assert.equal(lead.stay.pax, 200);
  assert.ok(lead.stay.party_types.includes('WEDDING'));
  assert.equal(k.lead_class, 'STRATEGIC_GROUP_LEAD');
  for (const l of ['STRATEGIC_GROUP_LEAD', 'GROUP_LEAD', 'CAPACITY_GAP', 'MANUAL_REVIEW_REQUIRED']) assert.ok(k.labels.includes(l), l);
  assert.equal(k.capacity.known_capacity, 22);
  assert.equal(k.capacity.demand, 200);
  assert.equal(k.capacity.gap, 178);
  assert.equal(k.capacity.basis, 'ODOO_VERIFIED_AS_CASA_COMPLETA');
  assert.equal(k.human.priority, 'STRATEGIC');
  assert.equal(k.human.human_priority_alert, true);
  assert.equal(k.group_routing.queue, 'STRATEGIC_ACCOUNTS');
  assert.equal(k.group_routing.flow, 'STRATEGIC_GROUP_LEAD');
  assert.equal(k.group_routing.can_promise_capacity, false);
  assert.ok(k.human.manual_review_reasons.includes('CAPACITY_GAP'));
});

test('30+ pax: prioridad humana HIGH (LARGE_GROUP_FLOW); 11 pax: GROUP_LEAD normal; 10 pax: STANDARD', () => {
  const k35 = cap([g('somos 35 personas del colegio, excursion el 3 de noviembre')]).classification;
  assert.equal(k35.human.priority, 'HIGH');
  assert.equal(k35.human.human_priority_alert, true);
  assert.equal(k35.group_routing.flow, 'LARGE_GROUP_FLOW');
  assert.equal(k35.capacity.gap, 13);
  assert.equal(cap([g('somos 11 personas para el 14 de noviembre')]).classification.lead_class, 'GROUP_LEAD');
  const k10 = cap([g('somos 10 personas para el 14 de noviembre')]).classification;
  assert.equal(k10.lead_class, 'STANDARD_LEAD');
  assert.equal(k10.human.required, false);
});

test('CORPORATE_LEAD: empresa/NIT/retiro empresarial; con 11+ tambien es GROUP_LEAD; capacidad de otras propiedades NO se cuenta', () => {
  const c = cap([g('Somos una empresa, retiro empresarial de 15 personas el 5 de diciembre, necesitamos factura con NIT')]);
  assert.equal(c.classification.lead_class, 'CORPORATE_LEAD');
  assert.ok(c.classification.labels.includes('GROUP_LEAD'));
  assert.equal(c.classification.group_routing.queue, 'CORPORATE_SALES');
  assert.equal(cap([g('somos una empresa, 4 personas el 5 de diciembre')]).classification.lead_class, 'CORPORATE_LEAD');
  const other = cap([g('somos 30 personas en Casa Neusa el 3 de diciembre')]).classification;
  assert.equal(other.capacity.capacity_known, false, 'la capacidad web de otras propiedades no esta verificada');
  assert.ok(!other.labels.includes('CAPACITY_GAP'), 'sin capacidad conocida no se afirma una brecha');
  assert.equal(other.human.required, true);
});

// ---- 4. anticipo parcial superior al 50 % -------------------------------------------------------------------------------------------
test('4. anticipo superior al 50 %: ABOVE_POLICY, aceptable, sin revision manual; saldo calculado', () => {
  const { lead, classification: k } = cap([
    g('hola quiero la habitación 203 para el 11 de octubre, 1 noche, somos 3'),
    s('Total $130.000, anticipo $80.000 y saldo $50.000'),
    g('listo, pague 80 mil', { type: 'image' }),
    fin('Banco: abono confirmado 80.000'),
  ]);
  assert.equal(lead.payment.policy.status, 'ABOVE_POLICY');
  assert.equal(lead.payment.policy.percent, 61.5);
  assert.equal(lead.payment.deposit_received, 80000);
  assert.equal(lead.payment.balance, 50000);
  assert.equal(lead.payment.confirmations[0].source, 'BANCO');
  assert.ok(!k.labels.includes('MANUAL_REVIEW_REQUIRED'));
  assert.ok(k.labels.includes('PAYMENT_CONFIRMED'));
  assert.equal(depositPolicy(130000, 65000, false).status, 'MEETS_POLICY');
  assert.equal(depositPolicy(130000, 140000, false).status, 'EXCEEDS_PRICE');
});

// ---- 5. anticipo inferior al 50 % historico ------------------------------------------------------------------------------------------
test('5. anticipo inferior al 50 %: con acuerdo historico explicito se RESPETA; sin acuerdo pasa a revision manual', () => {
  const withAgreement = cap([g('quiero la 301 para el 04/10/2026, 1 noche, somos 2'), s('Total $130.000. Anticipo $40.000, acuerdo previo con el huesped'), ]);
  assert.equal(withAgreement.lead.payment.policy.status, 'BELOW_POLICY_HISTORICAL_AGREEMENT');
  assert.ok(!withAgreement.classification.labels.includes('MANUAL_REVIEW_REQUIRED'));
  const viaOption = cap([g('quiero la 301 para el 04/10/2026, 1 noche, somos 2'), s('Total $130.000. Anticipo $40.000')], { agreements: { historical_deposit: true } });
  assert.equal(viaOption.lead.payment.policy.status, 'BELOW_POLICY_HISTORICAL_AGREEMENT', 'acuerdo aportado de forma estructurada (CRM/Odoo)');
  const noAgreement = cap([g('quiero la 301 para el 04/10/2026, 1 noche, somos 2'), s('Total $130.000. Anticipo $40.000')]);
  assert.equal(noAgreement.lead.payment.policy.status, 'BELOW_POLICY_NO_AGREEMENT');
  assert.ok(noAgreement.classification.labels.includes('MANUAL_REVIEW_REQUIRED'));
  assert.ok(noAgreement.classification.human.manual_review_reasons.includes('DEPOSIT_BELOW_POLICY_NO_AGREEMENT'));
  assert.equal(noAgreement.lead.payment.policy.matches_legacy_odoo_percent, true, 'coincide con el 30 % anterior de Odoo, pero eso solo no es un acuerdo');
  const guestOffers = cap([g('quiero la 301 para el 04/10/2026, somos 2, les abono 30 mil'), s('Total $130.000')]);
  assert.equal(guestOffers.lead.payment.deposit_offered_by_guest, 30000);
  assert.ok(guestOffers.classification.human.manual_review_reasons.includes('DEPOSIT_BELOW_POLICY_NO_AGREEMENT'));
});

// ---- 6. pago reportado no confirmado --------------------------------------------------------------------------------------------------
test('6. pago por pantallazo: PAYMENT_REPORTED, NUNCA confirmado ni recibido; solo Cartera/Banco confirma', () => {
  const turns = [g('quiero la 301 para el 04/10/2026, 1 noche, somos 2'), s('Total $130.000, anticipo $65.000'), g('ya pague 65 mil por nequi', { type: 'image' })];
  const rep = cap(turns);
  assert.equal(rep.lead.payment.state, 'PAYMENT_REPORTED');
  assert.equal(rep.lead.payment.deposit_reported, 65000);
  assert.equal(rep.lead.payment.deposit_received, null);
  assert.equal(rep.lead.payment.balance, 130000, 'nada confirmado: el saldo no baja');
  assert.equal(rep.lead.payment.balance_if_deposit_confirmed, 65000);
  assert.ok(rep.classification.labels.includes('PAYMENT_REPORTED'));
  assert.ok(!rep.classification.labels.includes('PAYMENT_CONFIRMED'));
  assert.ok(rep.classification.human.reasons.includes('PAYMENT_VALIDATION_REQUIRED'));
  assert.equal(rep.classification.human.required, true);
  // un pantallazo sin monto tambien es solo REPORTED
  assert.equal(cap([g('quiero la 301 el 04/10/2026'), g('', { type: 'image' })]).lead.payment.state, 'PAYMENT_REPORTED');
  // recepcion que dice "recibimos" NO es Cartera/Banco
  const staffSays = cap([...turns, s('Recibimos el comprobante, anticipo recibido $65.000')]);
  assert.equal(staffSays.lead.payment.state, 'PAYMENT_REPORTED');
  assert.equal(staffSays.lead.payment.deposit_received, null);
  // Cartera confirma -> PAYMENT_CONFIRMED
  const ok = cap([...turns, fin('Cartera: confirmado 65.000')]);
  assert.equal(ok.lead.payment.state, 'PAYMENT_CONFIRMED');
  assert.equal(ok.lead.payment.deposit_received, 65000);
  assert.equal(ok.lead.payment.balance, 65000);
  // confirmacion estructurada (Gateway/Odoo)
  assert.equal(cap(turns, { payment_confirmations: [{ source: 'CARTERA', amount: 65000 }] }).lead.payment.state, 'PAYMENT_CONFIRMED');
  // Finanzas no la encuentra
  const denied = cap([...turns, fin('Cartera: no se refleja en el banco')]);
  assert.equal(denied.lead.payment.state, 'PAYMENT_REPORTED');
  assert.ok(denied.classification.human.manual_review_reasons.includes('PAYMENT_NOT_FOUND_BY_FINANCE'));
  // monto confirmado distinto del reportado
  const mismatch = cap([...turns, fin('Cartera: confirmado 40.000')]);
  assert.ok(mismatch.classification.human.manual_review_reasons.includes('CONFIRMED_AMOUNT_MISMATCH'));
  // un huesped que dice "ya pague" nunca confirma, aunque escriba "confirmado"
  assert.equal(cap([g('pago confirmado, ya pague 65 mil, quedo confirmada la reserva?')]).lead.payment.state, 'PAYMENT_REPORTED');
});

// ---- 7. descuento -------------------------------------------------------------------------------------------------------------------------
test('7. solicitud de descuento: MANUAL_REVIEW_REQUIRED, el precio NO se modifica, ningun descuento se aplica', () => {
  for (const ask of ['me hacen un descuento?', 'me pueden rebajar un poquito', 'tienen precio especial?', 'me deja en 100 mil?']) {
    const c = cap([g('quiero la 302 para el 10 de octubre, 1 noche, somos 2'), s('El total son $120.000'), g(ask)]);
    assert.equal(c.lead.pricing.discount_requested, true, ask);
    assert.equal(c.lead.pricing.agreed_price, 120000, ask);
    assert.ok(c.classification.labels.includes('MANUAL_REVIEW_REQUIRED'), ask);
    assert.ok(c.classification.human.manual_review_reasons.includes('DISCOUNT_REQUESTED'), ask);
    assert.equal(c.classification.guards.discount_applied, false);
    assert.equal(c.classification.group_routing.auto_discount, false);
  }
  // sin precio dicho, el descuento no inventa ninguna tarifa
  const noPrice = cap([g('quiero la 302 para el 10 de octubre, me hacen descuento?')]);
  assert.equal(noPrice.lead.pricing.agreed_price, null);
  // el staff cambia el precio a mitad de conversacion: conflicto -> revision
  const conflict = cap([s('Total $130.000'), s('Bueno, te lo dejo en $110.000 por total')]);
  assert.equal(conflict.lead.pricing.conflict, true);
  assert.ok(conflict.classification.human.manual_review_reasons.includes('PRICE_CONFLICT'));
});

// ---- 8. habitacion no identificada --------------------------------------------------------------------------------------------------------
test('8. habitacion no identificada: numero inexistente o referencia vaga -> ROOM_UNIDENTIFIED + revision manual', () => {
  const unknownNumber = cap([g('quiero la habitación 405 para el 10 de octubre, somos 2')]);
  assert.equal(unknownNumber.lead.unit.requested_unit, null);
  assert.deepEqual(unknownNumber.lead.unit.unknown_room_numbers, ['405']);
  assert.equal(unknownNumber.lead.unit.room_unidentified, true);
  assert.ok(unknownNumber.classification.human.manual_review_reasons.includes('ROOM_UNIDENTIFIED'));
  const vague = cap([g('quiero la de arriba, la grande, para el 10 de octubre, somos 2')]);
  assert.equal(vague.lead.unit.room_unidentified, true);
  assert.equal(vague.lead.unit.requested_unit, null, 'jamas se adivina una habitacion');
  // sin mencion de habitacion no hay nada "no identificado": solo falta el dato
  const none = cap([g('hay cupo para el 10 de octubre? somos 2')]);
  assert.equal(none.lead.unit.room_unidentified, false);
  assert.equal(none.lead.unit.requested_unit, null);
  // capacidad: 4 personas en la 302 (cap 3)
  const over = cap([g('quiero la 302 para el 10 de octubre, somos 4')]);
  assert.ok(over.classification.human.manual_review_reasons.includes('ROOM_CAPACITY_EXCEEDED'));
});

// ---- 9. fecha ambigua ---------------------------------------------------------------------------------------------------------------------
test('9. fecha ambigua: "el puente", "fin de semana", el mismo dia de la semana de hoy -> DATE_AMBIGUOUS + revision; no se inventa fecha', () => {
  const puente = cap([g('queremos ir el puente, somos 4')]);
  assert.equal(puente.lead.stay.check_in, null);
  assert.equal(puente.lead.stay.date_ambiguous, true);
  assert.ok(puente.lead.data_gaps.includes('CHECKIN_MISSING'));
  assert.ok(puente.classification.human.manual_review_reasons.includes('DATE_AMBIGUOUS'));
  const finde = cap([g('para el fin de semana somos 2')]);
  assert.equal(finde.lead.stay.date_ambiguous, true);
  const sabado = cap([g('para el sábado somos 2')]); // hoy es sabado 3: es el de hoy o el proximo?
  assert.equal(sabado.lead.stay.date_ambiguous, true);
  assert.ok(sabado.classification.labels.includes('MANUAL_REVIEW_REQUIRED'));
  const clear = cap([g('para el 17 de octubre, 1 noche, somos 2')]);
  assert.equal(clear.lead.stay.date_ambiguous, false);
  assert.equal(clear.lead.stay.check_in, '2026-10-17');
  const past = cap([g('para el 01/09/2026, 1 noche, somos 2')]);
  assert.ok(past.classification.human.manual_review_reasons.includes('DATE_IN_PAST'));
});

// ---- 10. cambio de fechas -----------------------------------------------------------------------------------------------------------------
test('10. cambio de fechas: gana la ultima, el cambio queda registrado; con pago reportado/confirmado -> revision manual', () => {
  const sinPago = cap([g('quiero la 302 del 10 al 12 de octubre, somos 2'), g('mejor del 17 al 19 de octubre')]);
  assert.equal(sinPago.lead.stay.check_in, '2026-10-17');
  assert.equal(sinPago.lead.stay.check_out, '2026-10-19');
  assert.deepEqual(sinPago.lead.stay.date_changes.map((c) => [c.from, c.to]), [['2026-10-10', '2026-10-17']]);
  assert.ok(!sinPago.classification.labels.includes('MANUAL_REVIEW_REQUIRED'), 'sin dinero de por medio es solo un cambio de datos');
  const conPago = cap([g('quiero la 302 del 10 al 12 de octubre, somos 2'), s('Total $240.000, anticipo $120.000'), g('ya pague 120 mil', { type: 'image' }), g('mejor del 17 al 19 de octubre')]);
  assert.equal(conPago.lead.stay.check_in, '2026-10-17');
  assert.ok(conPago.classification.human.manual_review_reasons.includes('DATE_CHANGED_AFTER_PAYMENT'));
  assert.ok(conPago.classification.labels.includes('PAYMENT_REPORTED'));
  const pax = cap([g('somos 2 para el 10 de octubre'), g('en realidad somos 4')]);
  assert.equal(pax.lead.stay.pax, 4);
  assert.deepEqual(pax.lead.stay.pax_changes, [{ from: 2, to: 4 }]);
});

// ---- campos pedidos -------------------------------------------------------------------------------------------------------------------------
test('extraccion: huesped, fechas, pax, habitacion, casa completa, canal, precio, anticipo, saldo, estado de pago, tipo de grupo y escalamiento', () => {
  const { lead } = cap([
    g('Buenas, soy Maria Lopez, somos una familia de 5, queremos la 202 del 20 al 22 de noviembre'),
    s('Total $210.000, anticipo $105.000'),
  ]);
  assert.equal(lead.guest.name_as_stated, 'Maria Lopez');
  assert.match(lead.guest.ref, /^G-[0-9a-f]{10}$/);
  assert.equal(lead.stay.pax, 5);
  assert.equal(lead.stay.party_type, 'FAMILY');
  assert.equal(lead.unit.requested_unit, '202');
  assert.equal(lead.pricing.agreed_price, 210000);
  assert.equal(lead.payment.deposit_requested, 105000);
  for (const [text, type] of [['somos una pareja', 'COUPLE'], ['vamos con unos amigos, somos 6', 'FRIENDS'], ['es un evento de la empresa, somos 12', 'COMPANY']]) assert.ok(cap([g(text)]).lead.stay.party_types.includes(type), text);
});

test('canal de origen: DIRECT_WHATSAPP por defecto; Booking/Airbnb se detectan y pasan a revision (rige la plataforma)', () => {
  assert.equal(cap([g('quiero la 301 el 04/10/2026')]).lead.channel.origin, 'DIRECT_WHATSAPP');
  const b = cap([g('tengo una reserva por booking para el 20 de octubre, somos 2')]);
  assert.equal(b.lead.channel.origin, 'BOOKING');
  assert.ok(b.classification.human.manual_review_reasons.includes('OTA_RESERVATION_PLATFORM_RULES'));
  assert.equal(cap([g('reserve por airbnb para el 20 de octubre')]).lead.channel.origin, 'AIRBNB');
});

test('nunca se inventa: sin montos no hay tarifa; sin fechas no hay fecha; sin Odoo la disponibilidad es NOT_VERIFIED; una cotizacion de Odoo SI verifica', () => {
  const c = cap([g('hola, quiero reservar')]);
  assert.equal(c.lead.pricing.agreed_price, null);
  assert.equal(c.lead.stay.check_in, null);
  assert.equal(c.lead.stay.pax, null);
  assert.equal(c.lead.availability.status, 'NOT_VERIFIED');
  for (const gap of ['GUEST_NAME_MISSING', 'CHECKIN_MISSING', 'PAX_MISSING', 'PRICE_NOT_STATED', 'AVAILABILITY_NOT_VERIFIED']) assert.ok(c.lead.data_gaps.includes(gap), gap);
  assert.equal(c.classification.guards.availability_invented, false);
  assert.equal(c.classification.guards.price_invented, false);
  const q = cap([g('quiero la 301 el 04/10/2026, somos 2')], { odoo_quote: { total: 130000, quote_id: 'Q-1' } });
  assert.equal(q.lead.pricing.verified, true);
  assert.equal(q.lead.pricing.agreed_price_source, 'ODOO_QUOTE');
  assert.equal(parseCopAmounts('llegamos en 2026, somos 3 el 04/10/2026').length, 0, 'anios, fechas y personas no son dinero');
  assert.deepEqual(parseCopAmounts('total $130.000, anticipo 40 mil y saldo 90.000').map((a) => [a.value, a.kind]), [[130000, 'price'], [40000, 'deposit'], [90000, 'balance']]);
});

test('anomalias de saldo y pagos: saldo declarado incorrecto, pago sin precio, varios reportes, sobrepago', () => {
  const bal = cap([s('Total $130.000, anticipo $40.000 y saldo $100.000')], { agreements: { historical_deposit: true } });
  assert.ok(bal.classification.human.manual_review_reasons.includes('BALANCE_MISMATCH'));
  const noPrice = cap([g('ya pague 40 mil', { type: 'image' })]);
  assert.ok(noPrice.classification.human.manual_review_reasons.includes('PAYMENT_WITHOUT_PRICE'));
  const multi = cap([s('Total $130.000'), g('pague 40 mil'), g('ahora pague 65 mil mas')]);
  assert.ok(multi.classification.human.manual_review_reasons.includes('MULTIPLE_PAYMENT_REPORTS'));
});

// ---- payload Odoo (DRY_RUN) ---------------------------------------------------------------------------------------------------------------
test('payload Odoo: forma validada, DRY_RUN, write deshabilitado, sin texto crudo, idempotente; no hay escritura posible', () => {
  const turns = [g('Hola, soy Carlos Perez, quiero la 301 el 04/10/2026, 1 noche, somos 2'), s('Total $130.000, anticipo $40.000'), g('ya pague 40 mil', { type: 'image' })];
  const a = cap(turns, { agreements: { historical_deposit: true } });
  const p = a.odoo_payload;
  assert.equal(p.schema, 'ath.odoo.reservation-capture/1.0');
  assert.equal(p.mode, 'DRY_RUN');
  assert.equal(p.write_enabled, false);
  assert.equal(p.target_environment, 'NONE');
  assert.equal(p.ready_to_send, false);
  for (const b of ['SHADOW_ONLY', 'WRITE_DISABLED', 'AVAILABILITY_NOT_VERIFIED', 'UNIT_ID_NOT_MAPPED', 'NO_ODOO_QUOTE', 'HUMAN_REVIEW_PENDING']) assert.ok(p.blocked_by.includes(b), b);
  assert.equal(p.provenance.source, 'DIRECT_WHATSAPP');
  assert.equal(p.financial.agreed_price, 130000);
  assert.equal(p.financial.deposit_reported, 40000);
  assert.equal(p.financial.deposit_received_confirmed, null);
  assert.equal(p.financial.payment_state, 'PAYMENT_REPORTED');
  assert.equal(p.gateway_hold_candidate, null, 'sin quote_id/unit_id verificados no hay HOLD candidato');
  assert.deepEqual(validateOdooPayload(p), { ok: true, errors: [] });
  assert.equal(cap(turns, { agreements: { historical_deposit: true } }).odoo_payload.idempotency_key, p.idempotency_key, 'determinista');
  assert.ok(!JSON.stringify(p).includes('quiero la 301'), 'no incluye el texto crudo');
  assert.equal(redactPayload(p).guest.name_as_stated, '[NAME]');
  // con ids verificados el HOLD candidato respeta el contrato del Gateway (quote_id, unit_id, idempotency_key)
  const withIds = buildOdooPayload(a, { odoo_ids: { quote_id: 'Q-1', unit_id: '3' } });
  assert.deepEqual(Object.keys(withIds.gateway_hold_candidate).sort(), ['idempotency_key', 'quote_id', 'unit_id']);
  assert.equal(withIds.ready_to_send, false, 'aun con ids: no se envia hasta autorizar');
  // una forma insegura se rechaza
  for (const mutate of [(x) => { x.mode = 'LIVE'; }, (x) => { x.write_enabled = true; }, (x) => { x.target_environment = 'PRODUCTION'; }, (x) => { x.financial.agreed_price = -1; }, (x) => { x.stay.check_in = '04/10/2026'; }, (x) => { x.messages = ['hola']; }]) {
    const bad = JSON.parse(JSON.stringify(p));
    mutate(bad);
    assert.equal(validateOdooPayload(bad).ok, false);
  }
  assert.throws(() => commitToOdoo(p), ShadowViolation);
});

test('el modulo comercial no tiene red, claves, proveedores ni escritura; el puerto Odoo sigue rechazando escrituras', () => {
  for (const f of readdirSync(join(here, '..', 'src', 'commercial'))) {
    const src = readFileSync(join(here, '..', 'src', 'commercial', f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(|\bhttps?:\/\/|process\.env|child_process|from ['"](openai|@anthropic-ai|@google)|api[_-]?key|\bsendMessage\b/i, f);
  }
  const port = guardPort(makeFakeOdoo());
  for (const op of ['hold', 'createReservation', 'registerPayment', 'write']) assert.throws(() => port[op](), ShadowViolation);
});

test('privacidad: datos sensibles en la conversacion se marcan y NO se copian al lead ni al payload', () => {
  const card = ['4111', '1111', '1111', '1111'].join('');
  const c = cap([g(`quiero la 301 el 04/10/2026, somos 2, mi tarjeta es ${card}`)]);
  assert.ok(c.classification.human.manual_review_reasons.includes('SENSITIVE_DATA_SHARED'));
  assert.ok(!JSON.stringify(c).includes(card));
});

// ---- integracion con el agente y el runtime -----------------------------------------------------------------------------------------------
test('captura desde la sesion del agente: sin nombre (el historial no guarda PII), sin enviar nada', async () => {
  const fake = makeFakeOdoo();
  const deps = { odoo: guardPort(fake), humanAvailable: true };
  const session = createSession({ id: 'sess-1' });
  await processMessage(session, { type: 'text', text: 'Hola, me llamo Ana Rojas, hay cupo para el 14 de noviembre? somos 2' }, deps);
  await processMessage(session, { type: 'text', text: 'quiero la habitación 302' }, deps);
  const c = captureFromSession(session);
  assert.equal(c.lead.stay.check_in, '2026-11-14');
  assert.equal(c.lead.stay.pax, 2);
  assert.equal(c.lead.unit.requested_unit, '302');
  assert.equal(c.lead.guest.name_as_stated, null, 'el nombre fue redactado del historial; lo completa una persona en Odoo');
  assert.ok(c.lead.data_gaps.includes('GUEST_NAME_MISSING'));
  assert.equal(c.outbound, null);
  assert.equal(c.mode, 'SHADOW');
});

test('config WHATSAPP_COMMERCIAL_CAPTURE: off por defecto (sin cambio de comportamiento); shadow adjunta decision.commercial sin outbound', async () => {
  assert.equal(resolveConfig({}).commercial_capture, 'off');
  assert.throws(() => resolveConfig({ WHATSAPP_COMMERCIAL_CAPTURE: 'live' }), (e) => e instanceof ConfigError && e.code === 'UNKNOWN_COMMERCIAL_CAPTURE');
  const run = async (env) => {
    const rt = createRuntime({ env });
    const fake = makeFakeOdoo();
    return rt.handleMessage(createSession({ id: 'rt' }), { type: 'text', text: 'hay cupo para el 14 de noviembre? somos 2' }, { odoo: guardPort(fake), humanAvailable: true });
  };
  const off = await run({ WHATSAPP_AUTOMATION_ENABLED: 'true' });
  assert.equal('commercial' in off, false);
  const on = await run({ WHATSAPP_AUTOMATION_ENABLED: 'true', WHATSAPP_COMMERCIAL_CAPTURE: 'shadow' });
  assert.equal(on.commercial.lead.stay.pax, 2);
  assert.equal(on.outbound, null);
  assert.equal(on.commercial.odoo_payload.write_enabled, false);
  const killed = await run({ WHATSAPP_AUTOMATION_ENABLED: 'false', WHATSAPP_COMMERCIAL_CAPTURE: 'shadow' });
  assert.equal(killed.suppressed, true);
  assert.equal('commercial' in killed, false);
  const d = resolveConfig({});
  assert.deepEqual({ enabled: d.enabled, mode: d.mode, understanding: d.understanding }, { enabled: false, mode: 'shadow', understanding: 'rules' });
});

test('clasificacion es una funcion pura sobre el lead (misma entrada, misma salida) y no muta el lead', () => {
  const lead = extractLead([g('somos 40 personas el 3 de noviembre')], { today: '2026-10-03' });
  const snap = JSON.stringify(lead);
  const a = classifyLead(lead);
  const b = classifyLead(lead);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(lead), snap);
});
