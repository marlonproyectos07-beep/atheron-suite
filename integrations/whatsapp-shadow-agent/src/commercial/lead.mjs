/**
 * Extraccion de un LEAD comercial estructurado desde una conversacion de WhatsApp.
 * Solo EXTRAE: no decide precios, disponibilidad, descuentos ni pagos. Todo lo que no se dijo queda en null
 * (+ data_gap): jamas se inventa fecha, tarifa, habitacion ni disponibilidad. Determinista, sin red, sin proveedor.
 *
 * turns: [{ role: 'guest'|'agent'|'staff'|'finance', text?, type?: 'text'|'image'|'document'|'audio', transcript?, source? }]
 *   guest   = el huesped        staff = recepcion humana       agent = propuesta SHADOW del agente
 *   finance = Cartera/Banco (UNICA fuente que confirma pagos)
 */
import { createHash } from 'node:crypto';
import { norm, extractDates, extractPersons, extractProperty, addDays } from '../nlu.mjs';
import { AS_ROOMS, POLICY } from '../policy.mjs';
import { redactPII } from '../hybrid/pii.mjs';
import { parseCopAmounts } from './amounts.mjs';

export const LEAD_SCHEMA = 'ath.commercial-lead/1.0';

const PARTY = [
  ['COMPANY', /\b(empresa|empresarial|corporativ\w*|compania|nit|retiro de empresa|convencion|congreso|capacitacion|seminario)\b/],
  ['SCHOOL', /\b(colegio|estudiantes|excursion|universidad|escolar|alumnos)\b/],
  ['WEDDING', /\b(matrimonio|boda|quince|cumpleanos|celebracion|evento)\b/],
  ['FAMILY', /\b(familia|familiar|abuelos|primos|hijos|reunion familiar)\b/],
  ['FRIENDS', /\b(amigos|amigas|parche|combo)\b/],
  ['COUPLE', /\b(pareja|esposa|esposo|novia|novio|luna de miel)\b/],
];
const DISCOUNT = /\b(descuento|rebaja|rebajar|rebajen|mas barat\w*|mejor precio|precio especial|tarifa especial|me hace(?:n)? (?:un )?precio|me deja(?:n)? en|igualar|igualen)\b/;
const AGREEMENT = /\b(acuerdo (?:previo|anterior|historico|pactado)|ya (?:habiamos|quedamos|pactamos|acordamos)|como (?:quedamos|habiamos quedado|acordamos)|segun lo pactado|acuerdo de antes|tarifa pactada|pactado con)\b/;
const PAID = /\b(ya pague|pague|pagamos|consigne|consignamos|transferi|transferimos|abone|abonamos|hice (?:el|la) (?:pago|transferencia|consignacion|abono|nequi)|ya hice (?:el|la) (?:pago|transferencia|consignacion|abono|nequi)|(?:les|te) (?:mande|envie)|envie (?:el )?(?:pago|comprobante|soporte)|comprobante|pantallazo|soporte de pago)\b/;
const PROMISED = /\b(pagare|pagaremos|abonare|abonaremos|consignare|voy a (?:pagar|abonar|consignar)|te abono|les abono|puedo abonar)\b/;
const STAFF_RECEIVED = /\b(recibimos|recibido|nos llego|ya llego|ya vimos|abono recibido|anticipo recibido|comprobante recibido)\b/;
const CONFIRM = /\b(confirmo|confirmado|confirmada|acreditad[oa]|se refleja|ingreso|verificado|conciliado|recibido en (?:el )?banco)\b/;
const DENY = /\b(no se refleja|no aparece|no ha llegado|no llego|rechazado|devuelto)\b/;
const NAME_STOP = new Set(['y', 'e', 'para', 'que', 'de', 'del', 'el', 'la', 'mi', 'es', 'por', 'en', 'con', 'quiero', 'queria', 'necesito', 'tengo', 'una', 'un', 'ya', 'si', 'no', 'hay', 'tienen', 'somos', 'vamos', 'voy', 'reserva', 'reservar', 'habitacion', 'cupo', 'hola', 'buenas', 'gracias', 'desde', 'hasta', 'al', 'a', 'le', 'me', 'te', 'estamos', 'llego', 'llegamos', 'saber', 'consultar', 'pagar', 'cliente', 'huesped', 'agencia']);

const hash = (s, n = 10) => createHash('sha256').update(String(s)).digest('hex').slice(0, n);
const validIso = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };

/** Fechas numericas dia-primero (Colombia): 04/10/2026, 4-10, 2026-10-04. */
function numericDates(rawNorm, today) {
  const out = [];
  for (const m of rawNorm.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) if (validIso(+m[1], +m[2], +m[3])) out.push({ iso: m[0], at: m.index });
  for (const m of rawNorm.matchAll(/(?<![\d/-])(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?![\d/-])/g)) {
    const d = +m[1];
    const mo = +m[2];
    let y = m[3] ? +m[3] : +today.slice(0, 4);
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || !validIso(y, mo, d)) continue;
    let iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!m[3] && iso < today) iso = `${y + 1}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push({ iso, at: m.index });
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.iso);
}

function extractStatedName(text) {
  const m = text.match(/\b(me llamo|mi nombre es|a nombre de|soy)\s+((?:[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s*){1,3})/i);
  if (!m) return null;
  const titleOnly = m[1].toLowerCase() === 'soy';
  const kept = [];
  for (const w of m[2].trim().split(/\s+/)) {
    if (NAME_STOP.has(norm(w))) break;
    if (titleOnly && !/^[A-ZÁÉÍÓÚÑ]/.test(w)) break;
    kept.push(w);
  }
  return kept.length ? kept.join(' ') : null;
}

const textOf = (t) => (t.type === 'audio' ? t.transcript : t.text) ?? '';
const unique = (xs) => [...new Set(xs)];

/**
 * @param {object[]} turns
 * @param {{today?:string, conversation_id?:string, channel_hint?:string, agreements?:{historical_deposit?:boolean,historical_price?:boolean}, payment_confirmations?:{source:string,amount:number}[], odoo_quote?:{total:number, quote_id?:string}}} opts
 */
export function extractLead(turns, opts = {}) {
  const today = opts.today ?? '2026-10-03';
  const gaps = [];
  const stay = { check_in: null, check_out: null, nights: null, pax: null, adults: null, children: null, party_type: null, party_types: [], date_ambiguous: false, date_ambiguity_reasons: [], date_changes: [], pax_changes: [], property: null, property_assumed: false };
  const unit = { requested_unit: null, requested_units: [], whole_house: false, room_unidentified: false, room_reference_vague: false, unknown_room_numbers: [], rooms_requested_count: null, capacity_of_unit: null };
  const pricing = { currency: 'COP', agreed_price: null, agreed_price_source: null, verified: false, conflict: false, prices_seen: [], discount_requested: false, price_agreement_historical: Boolean(opts.agreements?.historical_price) };
  const pay = { state: 'NONE', deposit_requested: null, deposit_offered_by_guest: null, deposit_reported: null, deposit_received: null, confirmations: [], reported_events: 0, receipt_attached: false, payment_promised: false, payment_denied_by_finance: false, stated_balance: null, historical_agreement: Boolean(opts.agreements?.historical_deposit) };
  const flagsSeen = { sensitive_pii: false, multiple_payment_reports: false };
  let nameStated = null;
  let channelOrigin = null;
  const reportedAmounts = [];
  const datesSeq = [];
  const paxSeq = [];
  let paymentSeenBeforeDateChange = false;
  const wholeHouseRe = /\b(casa completa|toda la casa|la casa entera|alquilar toda|rentar toda)\b/;

  for (const turn of turns) {
    const role = turn.role;
    const raw = textOf(turn);
    const n = norm(raw);
    if (raw && redactPII(raw).sensitive) flagsSeen.sensitive_pii = true;
    if (role === 'guest' && (turn.type === 'image' || turn.type === 'document')) { pay.receipt_attached = true; pay.reported_events += 1; }
    if (!raw) continue;
    const amounts = parseCopAmounts(raw);

    // ---- pagos / precios / anticipos ----------------------------------------------------------------------
    if (role === 'finance') {
      const source = /\bbanc[oa]\b/.test(n) ? 'BANCO' : 'CARTERA';
      if (DENY.test(n)) pay.payment_denied_by_finance = true;
      else if (CONFIRM.test(n)) for (const a of amounts) if (['deposit', 'payment_act', 'unclassified', 'price'].includes(a.kind)) pay.confirmations.push({ source, amount: a.value });
    } else {
      for (const a of amounts) {
        if (a.kind === 'price') { pricing.prices_seen.push({ amount: a.value, by: role === 'guest' ? 'GUEST_STATEMENT' : 'STAFF_STATEMENT' }); }
        else if (a.kind === 'balance') pay.stated_balance = a.value;
        else if (a.kind === 'payment_act' && role === 'guest') { reportedAmounts.push(a.value); pay.reported_events += 1; }
        else if (a.kind === 'deposit') {
          if (role === 'guest') {
            if (PAID.test(n)) { reportedAmounts.push(a.value); pay.reported_events += 1; } else pay.deposit_offered_by_guest = a.value;
          } else if (STAFF_RECEIVED.test(n)) { reportedAmounts.push(a.value); pay.reported_events += 1; } else pay.deposit_requested = a.value;
        }
      }
      if (role === 'guest' && PAID.test(n) && !amounts.some((a) => ['payment_act', 'deposit'].includes(a.kind))) pay.reported_events += 1;
      if (role === 'guest' && PROMISED.test(n)) pay.payment_promised = true;
      if ((role === 'staff' || role === 'agent') && STAFF_RECEIVED.test(n) && !amounts.length) pay.reported_events += 1;
    }
    if (AGREEMENT.test(n)) { pay.historical_agreement = true; if (/\b(precio|tarifa|valor)\b/.test(n)) pricing.price_agreement_historical = true; }

    // ---- solo guest/staff aportan datos de la estancia ---------------------------------------------------------------
    if (role !== 'guest' && role !== 'staff') continue;
    if (role === 'guest') {
      nameStated ??= extractStatedName(raw);
      if (DISCOUNT.test(n)) pricing.discount_requested = true;
    }
    const origin = /airbnb/.test(n) ? 'AIRBNB' : /booking/.test(n) ? 'BOOKING' : null;
    if (origin && /\b(reserv\w*|tengo|hice|por|en)\b/.test(n)) channelOrigin ??= origin;
    for (const [type, re] of PARTY) if (re.test(n) && !stay.party_types.includes(type)) stay.party_types.push(type);

    // fechas
    const nums = numericDates(n, today);
    const dt = extractDates(n, today);
    let ci = null;
    let co = null;
    if (nums.length) { ci = nums[0]; co = nums[1] && nums[1] > nums[0] ? nums[1] : null; }
    else if (dt.checkIn) { ci = dt.checkIn; co = dt.checkOut ?? null; }
    if (!ci && (dt.ambiguous || dt.deferral)) { stay.date_ambiguous = true; stay.date_ambiguity_reasons.push(dt.ambiguous ?? 'DEFERRAL'); }
    if (ci && !nums.length && dt.tentative) { stay.date_ambiguous = true; stay.date_ambiguity_reasons.push('SAME_WEEKDAY_AS_TODAY'); }
    if (ci) datesSeq.push({ ci, co, nights: nums.length ? null : dt.nights ?? null, at: pay.reported_events > 0 || pay.confirmations.length > 0 });
    const nightsMatch = n.match(/\b(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete) noches?\b/);
    if (nightsMatch) stay.nights = ({ una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7 })[nightsMatch[1]] ?? Number(nightsMatch[1]);

    // personas
    // "somos una empresa / un grupo / una familia" no significa 1 persona: se quita el articulo antes de extraer
    const pe = extractPersons(n.replace(/\b(somos|seremos|vamos|quedamos) (un|una) /g, '$1 '));
    let total = pe.total;
    if (total == null) { const m = n.match(/\b(\d{1,4}) (estudiantes|alumnos|colegas|empleados|invitados|asistentes|participantes|huespedes|pax|amigos|personas)\b/); if (m) total = Number(m[1]); }
    if (total != null && role === 'guest') paxSeq.push(total);
    else if (total != null && role === 'staff' && paxSeq.length === 0) paxSeq.push(total);
    if (pe.adults != null) stay.adults = pe.adults;
    if (pe.children != null) stay.children = pe.children;
    if (pe.rooms != null) unit.rooms_requested_count = pe.rooms;

    // habitacion / casa completa / propiedad
    if (wholeHouseRe.test(n)) unit.whole_house = true;
    for (const m of n.matchAll(/\b(?:habitacion|hab|cuarto|pieza|suite|apartamento|apto|la|el|numero|no|#)\s*\.?\s*(\d{3})\b/g)) {
      if (AS_ROOMS[m[1]]) { if (!unit.requested_units.includes(m[1])) unit.requested_units.push(m[1]); }
      else if (/^[1-9]\d\d$/.test(m[1]) && !unit.unknown_room_numbers.includes(m[1])) unit.unknown_room_numbers.push(m[1]);
    }
    if (/\b(esa|la) (de abajo|de arriba|grande|privada|economica|mas barata|del tercer piso|de la terraza|que me dijeron|de siempre)\b|\bla (de siempre|que me dijeron)\b/.test(n)) unit.room_reference_vague = true;
    const prop = extractProperty(n);
    if (prop.key) stay.property = prop.key;
  }

  // ---- consolidacion --------------------------------------------------------------------------------------------------
  // fechas: gana la ultima; los cambios quedan registrados
  if (datesSeq.length) {
    const last = datesSeq.at(-1);
    stay.check_in = last.ci;
    stay.check_out = last.co ?? (stay.nights != null ? addDays(last.ci, stay.nights) : null);
    for (let i = 1; i < datesSeq.length; i += 1) if (datesSeq[i].ci !== datesSeq[i - 1].ci) { stay.date_changes.push({ from: datesSeq[i - 1].ci, to: datesSeq[i].ci, after_payment_report: datesSeq[i].at || datesSeq[i - 1].at }); paymentSeenBeforeDateChange ||= datesSeq[i].at || datesSeq[i - 1].at; }
    if (stay.check_in && stay.check_out && stay.nights == null) stay.nights = Math.round((Date.parse(`${stay.check_out}T00:00:00Z`) - Date.parse(`${stay.check_in}T00:00:00Z`)) / 86400000);
    if (stay.check_in < today) stay.date_ambiguity_reasons.push('DATE_IN_PAST');
  }
  if (stay.check_in) stay.date_ambiguous = stay.date_ambiguous && stay.date_ambiguity_reasons.some((r) => r !== 'DATE_IN_PAST');
  if (paxSeq.length) {
    stay.pax = paxSeq.at(-1);
    for (let i = 1; i < paxSeq.length; i += 1) if (paxSeq[i] !== paxSeq[i - 1]) stay.pax_changes.push({ from: paxSeq[i - 1], to: paxSeq[i] });
  } else if (stay.adults != null) stay.pax = stay.adults + (stay.children ?? 0);
  stay.party_type = stay.party_types[0] ?? (stay.pax === 2 ? 'COUPLE' : null);
  if (!stay.property) { stay.property = POLICY.default_property; stay.property_assumed = true; }

  // habitacion
  unit.requested_unit = unit.requested_units[0] ?? null;
  unit.capacity_of_unit = unit.requested_unit ? AS_ROOMS[unit.requested_unit].capacity : null;
  unit.room_unidentified = !unit.requested_unit && !unit.whole_house && (unit.unknown_room_numbers.length > 0 || unit.room_reference_vague);

  // precio: se registra lo DICHO; nada se calcula ni se inventa. Solo una cotizacion estructurada de Odoo lo verifica
  const distinctPrices = unique(pricing.prices_seen.map((p) => p.amount));
  if (opts.odoo_quote?.total > 0) { pricing.agreed_price = opts.odoo_quote.total; pricing.agreed_price_source = 'ODOO_QUOTE'; pricing.verified = true; }
  else if (pricing.prices_seen.length) {
    const staff = pricing.prices_seen.filter((p) => p.by === 'STAFF_STATEMENT');
    const pick = (staff.length ? staff : pricing.prices_seen).at(-1);
    pricing.agreed_price = pick.amount;
    pricing.agreed_price_source = pick.by;
    pricing.conflict = distinctPrices.length > 1;
  }

  // pagos
  pay.deposit_reported = reportedAmounts.length ? reportedAmounts.at(-1) : null;
  if (unique(reportedAmounts).length > 1) flagsSeen.multiple_payment_reports = true;
  for (const c of opts.payment_confirmations ?? []) pay.confirmations.push({ source: c.source, amount: c.amount });
  const confirmedTotal = pay.confirmations.reduce((a, c) => a + c.amount, 0);
  pay.deposit_received = confirmedTotal > 0 ? confirmedTotal : null; // SOLO Cartera/Banco confirma
  if (pay.deposit_received != null) pay.state = 'PAYMENT_CONFIRMED';
  else if (pay.reported_events > 0 || pay.payment_denied_by_finance) pay.state = 'PAYMENT_REPORTED';
  else if (pay.deposit_requested != null || pay.payment_promised) pay.state = 'DEPOSIT_REQUESTED';
  const price = pricing.agreed_price;
  pay.balance = price != null ? price - (pay.deposit_received ?? 0) : null;
  const candidate = pay.deposit_received ?? pay.deposit_reported ?? pay.deposit_requested ?? pay.deposit_offered_by_guest;
  pay.balance_if_deposit_confirmed = price != null && candidate != null ? price - candidate : null;
  pay.policy = depositPolicy(price, candidate, pay.historical_agreement);

  // data gaps (lo que falta, sin rellenar)
  if (!nameStated) gaps.push('GUEST_NAME_MISSING');
  if (!stay.check_in) gaps.push('CHECKIN_MISSING');
  if (stay.check_in && !stay.check_out) gaps.push('CHECKOUT_MISSING');
  if (stay.pax == null) gaps.push('PAX_MISSING');
  if (price == null) gaps.push('PRICE_NOT_STATED');
  gaps.push('AVAILABILITY_NOT_VERIFIED', 'UNIT_ID_NOT_MAPPED');

  return {
    schema: LEAD_SCHEMA,
    conversation_ref: opts.conversation_id ? `C-${hash(opts.conversation_id)}` : null,
    guest: { name_as_stated: nameStated, ref: opts.conversation_id ? `G-${hash(`g|${opts.conversation_id}`)}` : null, contains_pii: Boolean(nameStated) },
    stay,
    unit,
    channel: { origin: channelOrigin ?? opts.channel_hint ?? 'DIRECT_WHATSAPP', source: 'DIRECT_WHATSAPP' },
    pricing,
    payment: pay,
    availability: { status: 'NOT_VERIFIED', source: null },
    signals: { sensitive_pii_in_conversation: flagsSeen.sensitive_pii, multiple_payment_reports: flagsSeen.multiple_payment_reports, date_changed_after_payment: paymentSeenBeforeDateChange },
    data_gaps: gaps,
  };
}

/** Politica de anticipo: 50 % para reservas directas; respeta acuerdos historicos explicitos; nunca decide por si misma. */
export function depositPolicy(price, amount, historicalAgreement) {
  const target = POLICY.deposit.percent;
  const base = { target_percent: target, target_amount: price != null ? Math.round((price * target) / 100) : null, legacy_odoo_percent: POLICY.deposit.legacy_odoo_percent, amount_basis: amount ?? null, percent: null, status: 'UNKNOWN', matches_legacy_odoo_percent: false };
  if (price == null || amount == null || price <= 0) return base;
  const pct = (amount / price) * 100;
  const status = amount > price ? 'EXCEEDS_PRICE' : pct > target + 0.1 ? 'ABOVE_POLICY' : pct >= target - 0.1 ? 'MEETS_POLICY' : historicalAgreement ? 'BELOW_POLICY_HISTORICAL_AGREEMENT' : 'BELOW_POLICY_NO_AGREEMENT';
  return { ...base, percent: Math.round(pct * 10) / 10, status, matches_legacy_odoo_percent: Math.abs(pct - POLICY.deposit.legacy_odoo_percent) <= 1.5 };
}
