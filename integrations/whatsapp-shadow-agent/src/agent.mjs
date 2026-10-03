/**
 * GOAL-WHATSAPP-AGENT-001 -- agente de WhatsApp en modo SHADOW.
 *
 * SHADOW = recibe, entiende, decide y PROPONE; jamas envia. No existe
 * ninguna funcion de envio en este modulo: `decision.outbound` es siempre
 * null y `decision.reply` es una propuesta para aprobacion humana. El
 * acceso a Odoo pasa por `guardPort` (solo availability/quote). Nunca crea
 * HOLD, nunca confirma reservas, nunca calcula tarifas.
 *
 * Principio: LA IA CONVERSA, ODOO DECIDE, EL HUMANO VALIDA EL DINERO.
 */
import { POLICY, PROPERTIES, AS_ROOMS } from './policy.mjs';
import { norm, residualWords, STAY_CUE, detectIntents, extractDates, extractPersons, extractProperty, extractMisc, detectLanguage, fmtDate, addDays } from './nlu.mjs';
import { depositFor, reconcileWithOdoo } from './deposit.mjs';
import { evaluateGroup, scenarioFor, GROUP_STATUS } from './groups.mjs';
import { ShadowViolation } from './odoo-port.mjs';

const BRAND = 'Hoteles Atheron'; // el texto oficial dice "Hoteles Atero" (probable errata, pendiente de confirmar)

export const FACT_AMOUNTS = Object.freeze([15000, 20000, 10000]); // cifras de las fichas verificadas (parqueaderos, hora extra)

const money = (n) => `$${Number(n).toLocaleString('es-CO')}`;
const plural = (n, s, p) => (n === 1 ? s : p);

export function createSession({ id = 'shadow-session', now } = {}) {
  return {
    id,
    now: now ?? '2026-10-03T15:00:00-05:00',
    greeted: false,
    memory: {},
    history: [],
    lastOptions: [],
    lastQuote: null,
    reservation: null, // { property, source: 'DIRECT'|'BOOKING'|'AIRBNB', has_payment, checkIn, checkOut, in_stay }
    pending: null, // pregunta abierta: 'vehicle' | 'date' | ...
    audioFailures: 0,
    counters: {},
    template_sent: null,
    labels: new Set(),
  };
}

const todayOf = (session) => session.now.slice(0, 10);

function newDecision(session) {
  return {
    mode: POLICY.mode,
    outbound: null, // SHADOW: nunca se envia nada
    line: 'GUEST',
    intents: [],
    primary_intent: null,
    scenario: null,
    memory: null,
    missing: [],
    odoo: { needed: false, calls: [], results: [], planned_only: [] },
    escalate: false,
    escalation: null,
    data_gaps: [],
    flags: [],
    labels: [],
    group: null,
    template_proposed: null,
    hold: null, // el agente jamas crea HOLD
    reply: null,
    reply_amounts: [],
  };
}

function escalate(d, reason, { urgency = 'NORMAL', note = null } = {}) {
  if (reason === 'VALIDAR_COMPROBANTE') d.flags.push('PAYMENT_VALIDATION_REQUIRED'); // nunca se confirma una reserva sin validacion humana
  d.escalate = true;
  d.escalation = { reason, urgency, note };
}

function addIntent(d, ...names) {
  for (const n of names) if (n && !d.intents.includes(n)) d.intents.push(n);
}

// ---------------------------------------------------------------------------
// Memoria multi-turno
// ---------------------------------------------------------------------------

function mergeMemory(session, d, text, entities) {
  const m = session.memory;
  const changes = [];
  const set = (k, v, label) => {
    if (v === null || v === undefined) return;
    if (m[k] !== undefined && m[k] !== v) changes.push({ slot: label ?? k, from: m[k], to: v });
    m[k] = v;
  };
  const { dates, persons, property, misc } = entities;

  if (persons.total != null) set('guests', persons.total, 'personas');
  if (persons.adults != null) set('adults', persons.adults);
  if (persons.children != null) set('children', persons.children);
  if (persons.infants != null) set('infants', persons.infants);
  if (persons.rooms != null) set('rooms', persons.rooms);
  if (property.key) set('property', property.key, 'propiedad');
  if (misc.bath) set('bath', misc.bath);
  if (misc.vehicle) set('vehicle', misc.vehicle);
  if (misc.pet) m.pet = true;
  if (misc.budget) set('budget', misc.budget);
  if (misc.kids) m.kids = true;

  // Fechas
  const onlyShift = /\bsiguiente\b/.test(text) && m.checkIn;
  if (dates.checkIn && !onlyShift) {
    const nights = dates.nights ?? m.nights ?? 1;
    const ci = dates.checkIn;
    if (m.checkIn && m.checkIn !== ci) changes.push({ slot: 'fecha', from: m.checkIn, to: ci });
    m.checkIn = ci;
    m.nights = nights;
    m.checkOut = addDays(ci, nights);
    m.nights_assumed = dates.nights == null && !m.nights_explicit;
    if (dates.nights != null) m.nights_explicit = true;
    m.dates_tentative = Boolean(dates.tentative);
  } else if (onlyShift) {
    m.checkIn = addDays(m.checkIn, 7);
    m.checkOut = addDays(m.checkIn, m.nights ?? 1);
    m.dates_tentative = false;
    changes.push({ slot: 'fecha', from: 'anterior', to: m.checkIn });
  } else if (dates.nights != null && m.checkIn) {
    if (m.nights !== dates.nights) changes.push({ slot: 'noches', from: m.nights, to: dates.nights });
    m.nights = dates.nights;
    m.checkOut = addDays(m.checkIn, dates.nights);
    m.nights_assumed = false;
    m.nights_explicit = true;
  }
  if (changes.length && (session.lastQuote || session.lastOptions.length)) {
    // Cambio de personas/fechas/noches: la cotizacion anterior deja de ser valida
    session.lastQuote = null;
    session.lastOptions = [];
    d.flags.push('COTIZACION_ANTERIOR_INVALIDADA');
  }
  return changes;
}

const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

const dateText = (m) => {
  if (!m.checkIn) return null;
  const n = m.nights ?? 1;
  return n === 1 ? `${fmtDate(m.checkIn)} (1 noche)` : `del ${fmtDate(m.checkIn)} al ${fmtDate(m.checkOut)} (${n} noches)`;
};

// ---------------------------------------------------------------------------
// Datos faltantes
// ---------------------------------------------------------------------------

function missingFor(session) {
  const m = session.memory;
  const miss = [];
  if (!m.checkIn || m.dates_tentative) miss.push('fecha');
  if (!m.guests) miss.push('personas');
  return miss;
}

function askMissing(miss, { price = false, start = false } = {}) {
  const tail = price ? ' Así te doy el precio exacto.' : '';
  if (start && miss.includes('fecha')) return miss.includes('personas') ? '¿Desde qué fecha empiezas y cuántas personas son?' : '¿Desde qué fecha empiezas?';
  if (miss.includes('fecha') && miss.includes('personas')) return `¿Para qué fecha y cuántas personas?${tail}`;
  if (miss.includes('fecha')) return `¿Para qué fecha?${tail}`;
  if (miss.includes('personas')) return `¿Cuántas personas?${tail}`;
  return null;
}

// ---------------------------------------------------------------------------
// Odoo (solo lectura)
// ---------------------------------------------------------------------------

async function consultOdoo(session, d, deps, { checkIn, checkOut, guests, bath = null, rooms = 1, purpose = 'disponibilidad' }) {
  d.odoo.needed = true;
  const request = { property: 'AS', checkIn, checkOut, guests, bath, rooms };
  let res;
  try {
    res = await deps.odoo.availability(request);
  } catch (e) {
    if (e instanceof ShadowViolation) throw e;
    d.odoo.calls.push({ operation: 'availability', request, purpose, error: 'EXCEPTION' });
    d.flags.push('ODOO_TIMEOUT_ESCALATE_AFTER_120S');
    return { status: 'ERROR', options: [] };
  }
  d.odoo.calls.push({ operation: 'availability', request, purpose });
  d.odoo.results.push(res);
  if (res.status === 'OK' && res.options.some((o) => o.total == null)) {
    try {
      const q = await deps.odoo.quote(request);
      d.odoo.calls.push({ operation: 'quote', request, purpose });
      d.odoo.results.push(q);
      res = q;
    } catch (e) {
      if (!(e instanceof ShadowViolation)) throw e;
      d.odoo.planned_only.push({ operation: 'quote', request, reason: 'SHADOW_NO_ESCRIBE_EN_ODOO' });
      d.flags.push('QUOTE_PLANNED_NOT_EXECUTED');
    }
  }
  return res;
}

/** "Para sábado 3 de octubre (1 noche)" o "Del sábado 10 al martes 13 de octubre (3 noches)". */
function whenLead(m) {
  if (!m.checkIn) return 'Para esas fechas';
  const n = m.nights ?? 1;
  return n === 1 ? `Para ${fmtDate(m.checkIn)} (1 noche)` : `Del ${fmtDate(m.checkIn)} al ${fmtDate(m.checkOut)} (${n} noches)`;
}

function bathText(b) {
  return b === 'privado' ? 'baño privado' : b === 'compartido' ? 'baño compartido' : null;
}

function optionText(o, { withTotal = true } = {}) {
  const bits = [`hab. ${o.unit}`];
  const bt = bathText(o.bath ?? AS_ROOMS[o.unit]?.bath);
  if (bt) bits.push(`con ${bt}`);
  const base = bits.join(' ');
  return withTotal && o.total != null ? `${base}, ${money(o.total)} en total` : base;
}

function rankOptions(options, guests, bath) {
  return [...options]
    .filter((o) => o.capacity == null || o.capacity >= guests)
    .sort((a, b) => {
      const fitA = (a.capacity ?? 99) - guests;
      const fitB = (b.capacity ?? 99) - guests;
      const bathA = bath && (a.bath ?? AS_ROOMS[a.unit]?.bath) === bath ? 0 : 1;
      const bathB = bath && (b.bath ?? AS_ROOMS[b.unit]?.bath) === bath ? 0 : 1;
      return bathA - bathB || fitA - fitB || (a.total ?? 0) - (b.total ?? 0);
    });
}

function storeOptions(session, d, res, m) {
  session.lastOptions = res.options ?? [];
  const first = rankOptions(session.lastOptions, m.guests ?? 1, m.bath)[0];
  session.lastQuote = first
    ? { property: 'AS', checkIn: m.checkIn, checkOut: m.checkOut, nights: m.nights ?? 1, guests: m.guests, unit: first.unit, total: first.total, deposit_required: first.deposit_required ?? null }
    : null;
  if (session.lastQuote) {
    const rec = reconcileWithOdoo({ total: first.total, deposit_required: first.deposit_required });
    if (rec.mismatch) d.flags.push(`ODOO_DEPOSIT_MISMATCH:odoo=${rec.odoo_percent}%:oficial=${POLICY.deposit.percent}%`);
  }
}

function presentOptions(session, d, res, m, { prefix = null, budget = null } = {}) {
  const lines = [];
  const when = dateText(m);
  let ranked = rankOptions(res.options, m.guests ?? 1, m.bath);
  if (budget) {
    const per = (o) => (o.total != null ? o.total / (m.nights ?? 1) : Infinity);
    const within = ranked.filter((o) => per(o) <= budget);
    if (within.length === 0 && ranked.length) {
      const cheapest = [...ranked].sort((a, b) => per(a) - per(b))[0];
      d.reply_amounts.push(cheapest.total);
      lines.push(`Con ese presupuesto no tengo una opción disponible ${when ? whenLead(m).toLowerCase().replace(/^para /, 'para ') : 'para esas fechas'}.`);
      lines.push(`La más económica es la ${optionText(cheapest)}.`);
      return lines.join('\n');
    }
    ranked = within;
  }
  if (res.status === 'NO_AVAILABILITY' || ranked.length === 0) {
    d.flags.push('SIN_CUPO_ATHERON_SUITE');
    lines.push(`${whenLead(m)} no tengo cupo en Atheron Suite${m.guests ? ` para ${m.guests} personas` : ''}.`);
    lines.push('Déjame revisar con el equipo otras opciones en nuestras propiedades.');
    d.data_gaps.push('PARTIAL_CAPACITY:otras_propiedades_no_consultables_en_odoo');
    return lines.join('\n');
  }
  const top = ranked.slice(0, 2);
  for (const o of top) if (o.total != null) d.reply_amounts.push(o.total);
  if (prefix) lines.push(prefix);
  if (top.length === 1) {
    lines.push(`${whenLead(m)}, ${m.guests ?? '?'} pers.: solo me queda la ${optionText(top[0])} (precio por habitación).`);
    lines.push('¿Te la separo con el anticipo?');
  } else {
    lines.push(`${whenLead(m)}, ${m.guests ?? '?'} pers. tengo: ${optionText(top[0])} y ${optionText(top[1])} (precio por habitación).`);
    lines.push('¿Cuál prefieres?');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fragmentos FAQ (solo datos verificados; lo demas = DATA_GAP)
// ---------------------------------------------------------------------------

function propOf(session, entities) {
  const key = entities.property.key ?? session.memory.property ?? POLICY.default_property;
  return PROPERTIES[key];
}

function hoursPart(session, d, p, which = 'both') {
  if (!p.checkin && !p.checkout) {
    d.data_gaps.push(`DATA_GAP:horarios:${p.key}`);
    return { gap: true, text: `El horario de ${p.short} no lo tengo confirmado; lo consulto con el equipo y te cuento.` };
  }
  const ci = p.checkin_note ?? `desde las ${p.checkin}`;
  const co = p.checkout_note ?? `hasta las ${p.checkout}`;
  if (which === 'checkin') return { text: `En ${p.short} el check-in es ${ci}.` };
  if (which === 'checkout') return { text: `En ${p.short} el check-out es ${co}.` };
  return { text: `En ${p.short} el check-in es ${ci} y el check-out ${co}.` };
}

function parkingPart(p, vehicle, { ask = true } = {}) {
  const pk = p.parking;
  if (!pk) return { gap: true, text: `El parqueadero de ${p.short} no lo tengo confirmado; lo consulto con el equipo.` };
  if (pk.own) return { text: `En ${p.short} hay ${pk.text}.` };
  if (!vehicle && ask) return { ask: 'vehicle', text: '¿Es carro o moto?' };
  const parts = [`En ${p.short} no tenemos parqueadero propio, pero hay ${pk.ally}`];
  if (p.key === 'AS') {
    if (vehicle === 'moto') parts.push('(la moto va sin costo; el cupo se confirma el mismo día)');
    else if (vehicle === 'carro') parts.push('(unos $15.000 la noche el carro, sujeto a cupo)');
    else parts.push('(≈ $15.000 la noche el carro; la moto sin costo, sujeta a cupo)');
  }
  return { text: `${parts.join(' ')}.` };
}

// ---------------------------------------------------------------------------
// Pipeline principal
// ---------------------------------------------------------------------------

/**
 * @param {object} session  createSession()
 * @param {object} message  { type: 'text'|'audio'|'image'|'document'|'call', text?, transcript?, confidence?, direction?, caption? }
 * @param {{odoo: object, humanAvailable?: boolean}} deps  odoo = puerto (se envuelve con guardPort afuera)
 */
export async function processMessage(session, message, deps) {
  const d = newDecision(session);
  const type = message.type ?? 'text';
  session.history.push({ role: 'guest', type, text: message.text ?? message.transcript ?? null });

  // ---- llamada -------------------------------------------------------------
  if (type === 'call') {
    addIntent(d, 'LLAMADA');
    d.primary_intent = 'LLAMADA';
    d.labels.push('LLAMADA');
    escalate(d, 'LLAMADA_PERDIDA_CALLBACK', { urgency: 'ALTA' });
    if (deps.humanAvailable === false) {
      d.reply = 'Vimos tu llamada. En este momento no podemos atender; te respondemos desde las 8:00 a.m. Si es por una reserva, cuéntanos fecha y personas por aquí.';
      d.flags.push('TAREA_CALLBACK');
    }
    return finish(session, d, message);
  }

  // ---- imagen / documento (posible comprobante) -------------------------------
  if (type === 'image' || type === 'document') {
    addIntent(d, 'ENVIO_COMPROBANTE');
    d.primary_intent = 'ENVIO_COMPROBANTE';
    escalate(d, 'VALIDAR_COMPROBANTE', { urgency: 'ALTA' });
    d.reply = 'Recibido. Lo valido con el equipo y te confirmo.';
    return finish(session, d, message);
  }

  // ---- audio -------------------------------------------------------------
  let text = message.text ?? '';
  let fromAudio = false;
  if (type === 'audio') {
    fromAudio = true;
    addIntent(d, 'AUDIO');
    d.labels.push('AUDIO_TRANSCRITO');
    const low = !message.transcript || (message.confidence ?? 1) < 0.6;
    if (low) {
      addIntent(d, 'AUDIO_ILEGIBLE');
      d.primary_intent = 'AUDIO_ILEGIBLE';
      escalate(d, session.audioFailures >= 1 ? 'AUDIO_ILEGIBLE_REPETIDO' : 'CONFIANZA_INSUFICIENTE_AUDIO');
      session.audioFailures += 1;
      d.reply = 'No alcancé a escuchar bien. ¿Me escribes la fecha y cuántas personas son?';
      return finish(session, d, message);
    }
    text = message.transcript;
    if ((message.duration_s ?? 0) > 60) d.flags.push('AUDIO_LARGO_RESUMIR');
    const lang = detectLanguage(text);
    if (lang !== 'es' && !POLICY.languages_supported.includes(lang)) {
      addIntent(d, 'CONSULTA_DISPONIBILIDAD');
      d.primary_intent = 'CONSULTA_DISPONIBILIDAD';
      d.data_gaps.push('DATA_GAP:idioma_no_soportado');
      escalate(d, 'IDIOMA_NO_SOPORTADO');
      d.reply = 'Thanks for your message! A team member will help you shortly. / Gracias, una persona del equipo te ayudará en breve.';
      return finish(session, d, message);
    }
  }

  const n = norm(text);
  const intents = detectIntents(n);
  addIntent(d, ...intents);
  const entities = {
    dates: extractDates(n, todayOf(session)),
    persons: extractPersons(n),
    property: extractProperty(n),
    misc: extractMisc(n),
  };

  // ---- B2B / otra linea de negocio: no es un huesped ---------------------------
  if (intents.includes('ALIADO_CONSULTA') || intents.includes('ALIADO_LIQUIDACION')) {
    d.line = 'ALLY_B2B';
    d.labels.push('ALLY_B2B', 'B2B_ALIADO');
    d.primary_intent = intents.includes('ALIADO_LIQUIDACION') ? 'ALIADO_LIQUIDACION' : 'ALIADO_CONSULTA';
    escalate(d, 'TRAFICO_B2B_ALIADO', { note: 'No responder como huésped' });
    d.reply = null; // el agente de huespedes no responde trafico B2B
    return finish(session, d, message);
  }
  if (intents.includes('FUERA_DE_ALCANCE')) {
    d.line = 'ATHERON_SECURITY';
    d.labels.push('ATHERON_SECURITY');
    d.primary_intent = 'FUERA_DE_ALCANCE';
    escalate(d, 'OTRA_LINEA_DE_NEGOCIO_SECURITY');
    d.reply = 'Este canal es de reservas de hospedaje. Tu consulta de seguridad la derivamos al equipo de Atheron Security.';
    return finish(session, d, message);
  }
  if (entities.property.not_bookable) {
    d.primary_intent = 'CONSULTA_DISPONIBILIDAD';
    d.reply = `${entities.property.not_bookable} aún no está disponible para reservas. Si quieres te muestro nuestras otras propiedades.`;
    d.flags.push('PROPIEDAD_NO_RESERVABLE');
    return finish(session, d, message);
  }

  const changes = mergeMemory(session, d, n, entities);
  const m = session.memory;
  const guests = m.guests ?? null;
  d.scenario = scenarioFor(guests);
  if (d.scenario) addIntent(d, d.scenario);
  if (guests === 2 && /\bpareja\b/.test(n)) addIntent(d, 'PAREJA');
  const prop = propOf(session, entities);

  // ---- seguridad y quejas --------------------------------------------------------
  if (intents.includes('RECLAMO') || intents.includes('REEMBOLSO') || intents.includes('INCIDENCIA')) {
    const inc = intents.includes('INCIDENCIA') && !intents.includes('RECLAMO');
    d.primary_intent = inc ? 'INCIDENCIA' : intents.includes('REEMBOLSO') && !intents.includes('RECLAMO') ? 'REEMBOLSO' : 'RECLAMO';
    if (intents.includes('REEMBOLSO')) addIntent(d, 'REEMBOLSO');
    escalate(d, inc ? 'INCIDENCIA_EN_ESTADIA' : 'RECLAMO', { urgency: 'ALTA' });
    d.reply = inc
      ? 'Lamento eso. Aviso ya a operaciones para que lo revisen.'
      : intents.includes('REEMBOLSO')
        ? 'Lamento tu experiencia. Paso tu caso con una persona del equipo; por aquí no puedo confirmarte devoluciones.'
        : /esperando|nadie abre/.test(n)
          ? 'Lamento la espera. Aviso ya a una persona del equipo para que te atienda.'
          : 'Entiendo tu preocupación. Paso tu caso ya con una persona del equipo para que lo revise.';
    return finish(session, d, message);
  }

  // ---- llegada inminente / tarde ------------------------------------------------------
  if (intents.includes('LLEGADA_INMINENTE')) {
    d.primary_intent = 'LLEGADA_INMINENTE';
    escalate(d, 'LLEGADA_INMINENTE', { urgency: 'INMEDIATA' });
    d.reply = 'Aviso ya a recepción, en un momento te abren.';
    return finish(session, d, message);
  }
  if (intents.includes('LLEGADA_TARDE')) {
    d.primary_intent = 'LLEGADA_TARDE';
    escalate(d, 'LLEGADA_TARDE', { urgency: 'ALTA' });
    const t = entities.misc.lateTime;
    if (t) {
      m.arrival_time = t;
      d.reply = `Anotado: llegas hacia las ${t}. Lo confirmo con recepción.`;
    } else {
      d.reply = 'Anotado, llegas más tarde. Lo confirmo con recepción.';
    }
    d.data_gaps.push('DATA_GAP:horario_de_recepcion_fuera_de_horario');
    return finish(session, d, message);
  }

  // ---- humano / identidad / llamada -------------------------------------------------------
  if (intents.includes('HABLAR_CON_HUMANO')) {
    d.primary_intent = 'HABLAR_CON_HUMANO';
    escalate(d, 'PEDIDO_EXPLICITO_DE_HUMANO');
    d.reply = 'Claro, voy a pasar tu caso con una persona del equipo.';
    return finish(session, d, message);
  }
  if (intents.includes('LLAMADA_PEDIDA')) {
    d.primary_intent = 'LLAMADA';
    addIntent(d, 'LLAMADA');
    escalate(d, 'CALLBACK_SOLICITADO', { urgency: 'ALTA' });
    d.flags.push('TAREA_CALLBACK');
    d.reply = 'Listo, aviso a una persona del equipo para que te llame a este número.';
    return finish(session, d, message);
  }
  if (intents.includes('IDENTIDAD')) {
    d.primary_intent = 'IDENTIDAD';
    d.reply = 'Soy el asistente de atención de Atheron. Si prefieres, te paso con una persona del equipo.';
    return finish(session, d, message);
  }

  // ---- pagos y comprobantes -------------------------------------------------------------------
  if (intents.includes('ENVIO_COMPROBANTE')) {
    d.primary_intent = 'ENVIO_COMPROBANTE';
    escalate(d, 'VALIDAR_COMPROBANTE', { urgency: 'ALTA' });
    d.reply = 'Recibido. Lo valido con el equipo y te confirmo.';
    return finish(session, d, message);
  }

  // ---- cancelacion y politicas ----------------------------------------------------------------------
  const sayExisting0 = /\b(mi reserva|tengo (una )?reserva|ya tengo (mi )?reserva|reserve (por|en|con|a traves de)|hice (una |mi )?reserva|reservamos (por|en|con)|mi reservacion)\b/.test(n);
  if (sayExisting0 && !session.reservation) {
    session.reservation = { property: m.property ?? POLICY.default_property, source: entities.misc.ota ? (/airbnb/.test(n) ? 'AIRBNB' : 'BOOKING') : 'DIRECT', has_payment: null, declared_by_guest: true };
    d.flags.push('RESERVA_EXISTENTE_DECLARADA_SIN_VERIFICAR');
  }
  if (intents.includes('POLITICA_CANCELACION') && !session.reservation) {
    d.primary_intent = 'CANCELACION';
    addIntent(d, 'CANCELACION', 'POLITICA_CANCELACION');
    d.flags.push('POLITICA_CANCELACION_OFICIAL');
    d.reply = `${policyLines(false)}\nMenos de 48 h, no-show y casos excepcionales los revisa una persona; las reservas por Booking/Airbnb se rigen primero por la plataforma.`;
    return finish(session, d, message);
  }
  if (intents.includes('CANCELACION') || intents.includes('NO_SHOW') || intents.includes('POLITICA_CANCELACION') || (intents.includes('CAMBIO_FECHAS') && session.reservation)) {
    const cx = cancellationDecision(session, intents);
    d.primary_intent = intents.includes('NO_SHOW') ? 'NO_SHOW' : intents.includes('CANCELACION') || intents.includes('POLITICA_CANCELACION') ? 'CANCELACION' : 'CAMBIO_FECHAS';
    addIntent(d, d.primary_intent);
    d.flags.push(`CANCELACION_DECISION:${cx.mode}:${cx.reason}`);
    if (cx.mode === 'POLICY') {
      // >= 48 h, reserva directa: se explica la politica oficial. Nada se ejecuta ni se promete mas alla del texto oficial.
      let tail = '';
      const dt = entities.dates;
      if (dt.checkIn && !dt.tentative && session.reservation) {
        const nights = session.reservation.nights ?? 1;
        await consultOdoo(session, d, deps, { checkIn: dt.checkIn, checkOut: addDays(dt.checkIn, nights), guests: m.guests ?? session.reservation.guests ?? 2, purpose: 'cambio_fechas' });
        tail = `\nPara el ${fmtDate(dt.checkIn)} reviso el cupo.`;
      }
      d.flags.push('SEGUIMIENTO_HUMANO_PARA_EJECUTAR');
      if (!tail && (intents.includes('CAMBIO_FECHAS') || /cambi/.test(n))) tail = '\n¿Para qué nueva fecha sería?';
      d.reply = `${policyLines(true)}${tail}`;
      return finish(session, d, message);
    }
    escalate(d, cx.reason, { urgency: 'ALTA', note: cx.note });
    d.reply = cx.mode === 'HUMAN_OTA'
      ? 'Entiendo. Tu reserva por plataforma se rige primero por las condiciones de esa plataforma; paso tu caso con una persona del equipo.'
      : 'Entiendo. Paso tu caso con una persona del equipo para revisarlo; por aquí no decido devoluciones ni penalidades.';
    return finish(session, d, message);
  }

  // ---- descuentos y objeciones de precio -------------------------------------------------------------
  if (intents.includes('DESCUENTO')) {
    d.primary_intent = 'DESCUENTO';
    if (/booking|mas barato|igual/.test(n)) addIntent(d, 'OBJECION_PRECIO');
    d.data_gaps.push('DATA_GAP:regla_de_descuentos_no_documentada');
    escalate(d, 'DESCUENTO_O_IGUALAR_PRECIO');
    d.reply = /booking|igual/.test(n) ? 'Lo consulto con el equipo para ver qué podemos hacer.' : 'Déjame consultar si hay margen para esas fechas y te cuento.';
    return finish(session, d, message);
  }

  // ---- cambios sobre reservas existentes (con dinero) -----------------------------------------------
  const sayExisting = /\b(mi reserva|tengo (una )?reserva|ya tengo (mi )?reserva|reserve (por|en|con|a traves de)|hice (una |mi )?reserva|reservamos (por|en|con)|mi reservacion)\b/.test(n);
  if (sayExisting && !session.reservation) {
    session.reservation = { property: m.property ?? POLICY.default_property, source: entities.misc.ota ? (/airbnb/.test(n) ? 'AIRBNB' : 'BOOKING') : 'DIRECT', has_payment: null, declared_by_guest: true };
    d.flags.push('RESERVA_EXISTENTE_DECLARADA_SIN_VERIFICAR');
  }
  const paidRes = session.reservation?.has_payment;
  if (intents.includes('EXTENSION') && session.reservation) {
    d.primary_intent = 'EXTENSION';
    escalate(d, 'EXTENSION_DE_ESTADIA');
    const r = session.reservation;
    const res = r.checkOut ? await consultOdoo(session, d, deps, { checkIn: r.checkOut, checkOut: addDays(r.checkOut, 1), guests: m.guests ?? 2, purpose: 'extension' }) : null;
    d.reply = res?.status === 'OK' ? 'Reviso el cupo para esa noche más y lo confirmo con el equipo.' : 'Reviso el cupo para esa noche más con el equipo y te confirmo.';
    return finish(session, d, message);
  }
  if (false && intents.includes('CAMBIO_FECHAS') && (paidRes || session.reservation)) {
    d.primary_intent = 'CAMBIO_FECHAS';
    escalate(d, 'CAMBIO_DE_FECHAS_RESERVA_PAGADA');
    if (entities.dates.checkIn && !entities.dates.tentative) {
      const ci = entities.dates.checkIn;
      const nights = session.reservation.nights ?? 1;
      await consultOdoo(session, d, deps, { checkIn: ci, checkOut: addDays(ci, nights), guests: m.guests ?? session.reservation.guests ?? 2, purpose: 'cambio_fechas' });
      d.reply = `Reviso el cupo para el ${fmtDate(ci)} y lo confirmo con el equipo.`;
    } else {
      d.reply = 'Claro. ¿Para qué nueva fecha sería? Lo valido con el equipo.';
    }
    return finish(session, d, message);
  }
  if (intents.includes('CHECKIN_TEMPRANO') || intents.includes('CHECKOUT_TARDE')) {
    d.primary_intent = intents.includes('CHECKIN_TEMPRANO') ? 'CHECKIN_TEMPRANO' : 'CHECKOUT_TARDE';
    const early = d.primary_intent === 'CHECKIN_TEMPRANO';
    const h = hoursPart(session, d, prop, early ? 'checkin' : 'checkout');
    escalate(d, early ? 'INGRESO_TEMPRANO' : 'SALIDA_TARDIA');
    if (!h.gap) d.data_gaps.push(`DATA_GAP:costo_${early ? 'ingreso_temprano' : 'salida_tardia'}:${prop.key}`);
    d.reply = h.gap ? h.text : `${h.text} Consulto con el equipo si se puede ${early ? 'ingresar antes' : 'salir más tarde'}.`;
    return finish(session, d, message);
  }

  // ---- facturacion --------------------------------------------------------------------------------------
  if (intents.includes('FACTURA')) {
    d.primary_intent = 'FACTURA';
    escalate(d, 'FACTURA_ELECTRONICA');
    d.reply = 'Sí manejamos facturación electrónica. Te paso con una persona del equipo para tomar tus datos fiscales.';
    return finish(session, d, message);
  }

  // ---- grupos grandes ----------------------------------------------------------------------------------------
  if (!guests && (m.rooms ?? 0) >= 6) {
    d.primary_intent = 'GRUPO';
    addIntent(d, 'GRUPO', 'CONSULTA_DISPONIBILIDAD');
    d.flags.push('GRUPO_POR_HABITACIONES');
    d.data_gaps.push('CAPACIDAD_MULTIPROPIEDAD_NO_VERIFICADA_EN_ODOO');
    escalate(d, 'COTIZACION_DE_GRUPO');
    d.reply = `Para ${m.rooms} habitaciones armamos una cotización a la medida. Paso tu caso con una persona del equipo.${missingFor(session).includes('fecha') ? ' ¿Para qué fechas sería?' : ''}`;
    return finish(session, d, message);
  }
  const group = evaluateGroup(guests);
  d.group = group;
  if (group.status !== GROUP_STATUS.NONE) {
    d.primary_intent = 'GRUPO';
    addIntent(d, 'GRUPO');
    if (intents.includes('CONSULTA_DISPONIBILIDAD') || entities.dates.checkIn) addIntent(d, 'CONSULTA_DISPONIBILIDAD');
    if (group.status === GROUP_STATUS.STRATEGIC_GROUP_LEAD) {
      d.labels.push('STRATEGIC_GROUP_LEAD');
      d.flags.push('STRATEGIC_GROUP_LEAD');
    }
    d.data_gaps.push(...group.data_gaps);
    if (group.status !== GROUP_STATUS.SMALL_GROUP) d.flags.push('GROUP_PRICING_APPROVAL');
    escalate(d, group.status === GROUP_STATUS.STRATEGIC_GROUP_LEAD ? 'STRATEGIC_GROUP_LEAD' : 'COTIZACION_DE_GRUPO', { urgency: group.status === GROUP_STATUS.STRATEGIC_GROUP_LEAD ? 'ALTA' : 'NORMAL' });
    const miss = missingFor(session).includes('fecha') ? ' ¿Para qué fechas sería?' : '';
    if (group.status === GROUP_STATUS.STRATEGIC_GROUP_LEAD || group.status === GROUP_STATUS.PARTIAL_CAPACITY) {
      d.reply = `Sí podemos revisar un grupo de ese tamaño. Déjame validar capacidad entre nuestras propiedades y te confirmo la distribución.${miss}`;
    } else {
      d.reply = `Para un grupo de ${guests} personas armamos una cotización a la medida. Paso tu caso con una persona del equipo.${miss}`;
    }
    // Para grupos pequenos con fechas, se deja la consulta a Odoo como insumo del humano (nunca HOLD)
    const groupTarget = entities.property.key ?? m.property ?? POLICY.default_property;
    if (groupTarget !== 'AS') {
      d.data_gaps.push(`PARTIAL_CAPACITY:${groupTarget}_no_mapeada_en_odoo`);
      d.flags.push('ODOO_PROPERTY_NOT_MAPPED');
    }
    if ((group.status === GROUP_STATUS.STRATEGIC_GROUP_LEAD || group.status === GROUP_STATUS.PARTIAL_CAPACITY) && m.checkIn && !m.dates_tentative) {
      // capacidad VERIFICADA: solo Atheron Suite (casa completa, 22) y solo como insumo para el humano
      await consultOdoo(session, d, deps, { checkIn: m.checkIn, checkOut: m.checkOut, guests: group.verified_capacity.single_property_max, rooms: 1, purpose: 'capacidad_verificada_insumo_grupo' });
      d.flags.push('CAPACIDAD_VERIFICADA_CONSULTADA_SOLO_ATHERON_SUITE');
    }
    if (group.status === GROUP_STATUS.SMALL_GROUP && groupTarget === 'AS' && m.checkIn && !m.dates_tentative) {
      const res = await consultOdoo(session, d, deps, { checkIn: m.checkIn, checkOut: m.checkOut, guests, rooms: 1, purpose: 'insumo_cotizacion_grupo' });
      if (res.status === 'NO_AVAILABILITY') {
        d.flags.push('SIN_CUPO_ATHERON_SUITE');
        d.reply = `Para ${dateText(m)} no tengo cupo en Atheron Suite para ${guests} personas. Pasó tu caso con el equipo para revisar otras opciones y lista de espera.`.replace('Pasó', 'Paso');
      }
    }
    return finish(session, d, message);
  }

  // ---- mascotas ------------------------------------------------------------------------------------------------
  if (intents.includes('MASCOTA')) {
    d.primary_intent = 'MASCOTA';
    const mentioned = entities.property.key ?? (m.property && !session.reservation ? m.property : null) ?? (session.reservation?.property ?? null);
    if (mentioned === 'CC') {
      d.reply = 'En Colonial Confort no se admiten mascotas. Te puedo ofrecer Apartamentos Algarra (las reciben) o Atheron Suite (bajo consulta).';
      return finish(session, d, message);
    }
    if (session.reservation || mentioned) {
      const pr = PROPERTIES[mentioned ?? session.reservation.property] ?? PROPERTIES[POLICY.default_property];
      escalate(d, 'MASCOTA_APROBACION_Y_COSTO');
      d.data_gaps.push(`DATA_GAP:mascotas_costo:${pr.key}`);
      if (session.reservation) d.reply = 'Voy a consultar con el equipo si podemos recibir a tu mascota y te cuento; no te lo puedo confirmar yo.';
      else if (pr.pets === 'APROBACION_Y_COSTO') d.reply = `En ${pr.short} las mascotas requieren aprobación previa y tienen un costo adicional. Consulto el valor con el equipo.`;
      else if (pr.pets === 'BIENVENIDAS_CARGO_ASEO') d.reply = `En ${pr.short} las mascotas son bienvenidas, con un cargo de aseo adicional. El valor lo confirma el equipo.`;
      else d.reply = `En ${pr.short} las mascotas son bajo consulta. Lo consulto con el equipo y te cuento.`;
      return finish(session, d, message);
    }
    d.reply = '¿Para qué fechas y de qué tamaño es tu mascota? Depende de la propiedad: en Apartamentos Algarra las reciben y en Atheron Suite es bajo consulta.';
    return finish(session, d, message);
  }

  // ---- ninos / bebes --------------------------------------------------------------------------------------------------
  const kidsTarget = PROPERTIES[entities.property.key ?? m.property ?? ''] ?? null;
  if ((intents.includes('NINOS') || m.kids) && kidsTarget?.adults_only) {
    d.primary_intent = 'NINOS';
    addIntent(d, 'NINOS');
    d.reply = `${kidsTarget.short} es solo para adultos; no se admiten menores. Si quieres te muestro otra opción para ir con niños.`;
    return finish(session, d, message);
  }
  if (intents.includes('NINOS') || m.kids) {
    const rateAsk = /\b(pagan|tarifa|cobran|cuesta|valor|precio)\b/.test(n) && /\b(nino|ninos|menores|hijos)\b/.test(n);
    if (rateAsk) {
      d.primary_intent = 'NINOS';
      d.data_gaps.push(`DATA_GAP:tarifa_ninos:${prop.key}`);
      escalate(d, 'TARIFA_DE_NINOS');
      d.reply = 'La tarifa de niños no la tengo confirmada; la consulto con administración y te cuento.';
      return finish(session, d, message);
    }
  }

  // ======================= flujo comercial y FAQ ========================================================================================
  return commercialFlow({ session, d, deps, n, intents, entities, prop, changes, message, fromAudio, text });
}

/** Politica oficial de cancelacion/cambio de reservas DIRECTAS (CEO_CASES_V1). */
function policyLines(withFollowUp) {
  const a = `Cancelación o cambio hasta 48 horas antes del check-in: no hay devolución en efectivo; el valor pagado queda como saldo a favor 6 meses para una nueva reserva en ${BRAND}.`;
  const b = 'Queda sujeto a disponibilidad y a la tarifa vigente de las nuevas fechas; si es superior, pagas la diferencia.';
  return withFollowUp ? `${a}\n${b}` : `${a}\n${b}`;
}

/** POLICY (explicar) | HUMAN_* (escalar). Nunca decide devoluciones ni penalidades. */
function cancellationDecision(session, intents) {
  const r = session.reservation;
  if (intents.includes('NO_SHOW')) return { mode: 'HUMAN', reason: 'NO_SHOW', note: 'No-show: revisión humana (política oficial).' };
  if (!r) return { mode: 'HUMAN', reason: 'CANCELACION_SIN_RESERVA_VERIFICABLE', note: 'No se pudo identificar la reserva.' };
  if (r.source && r.source !== 'DIRECT') return { mode: 'HUMAN_OTA', reason: 'CANCELACION_RESERVA_OTA', note: 'OTA: rigen primero las condiciones de la plataforma.' };
  const prop = PROPERTIES[r.property] ?? PROPERTIES[POLICY.default_property];
  if (!r.checkIn || !prop.checkin) return { mode: 'HUMAN', reason: 'CANCELACION_SIN_FECHA_DE_CHECKIN_VERIFICADA', note: 'No hay check-in verificado para contar las 48 horas.' };
  const hours = (new Date(`${r.checkIn}T${prop.checkin}:00-05:00`) - new Date(session.now)) / 3600000;
  if (hours >= POLICY.cancellation.notice_hours) return { mode: 'POLICY', reason: `MAS_DE_48H(${Math.floor(hours)}h)` };
  return { mode: 'HUMAN', reason: 'MENOS_DE_48H', note: `Faltan ${Math.max(Math.floor(hours), 0)} h para el check-in: revisión humana; no decidir devolución ni penalidad.` };
}

async function commercialFlow({ session, d, deps, n, intents, entities, prop, changes, fromAudio }) {
  const m = session.memory;
  const parts = [];
  const miss = missingFor(session);
  const wantsFaq = [];
  if (intents.includes('CHECKIN') || intents.includes('CHECKOUT')) wantsFaq.push('hours');
  if (intents.includes('PARQUEADERO')) wantsFaq.push('parking');
  if (intents.includes('UBICACION')) wantsFaq.push('location');
  if (intents.includes('EQUIPAJE')) wantsFaq.push('luggage');
  if (intents.includes('PREGUNTA_PROPIEDAD')) wantsFaq.push('prop');

  const priceIntent = intents.includes('CONSULTA_PRECIO') || intents.includes('COTIZACION');
  const availIntent = intents.includes('CONSULTA_DISPONIBILIDAD') || intents.includes('RESERVA');
  const dateEntities = entities.dates.checkIn || entities.dates.nights != null;
  const personEntities = entities.persons.total != null;
  const changeIntent = intents.includes('CAMBIO_FECHAS') || changes.length > 0;
  const askingVehicleAnswer = session.pending === 'vehicle' && entities.misc.vehicle && !intents.includes('PARQUEADERO');
  if (askingVehicleAnswer) wantsFaq.push('parking');

  // Confianza: sin ninguna intencion y con varias palabras sin explicar, NO se interpreta ni se consulta Odoo.
  if (intents.length === 0 && (dateEntities || personEntities) && !askingVehicleAnswer && !STAY_CUE.test(n) && residualWords(n).length > 1) {
    d.flags.push('CONFIANZA_INSUFICIENTE', 'FALLBACK_A_HUMANO');
    d.primary_intent = 'INTENCION_NO_ENTENDIDA';
    addIntent(d, 'INTENCION_NO_ENTENDIDA');
    escalate(d, 'CONFIANZA_INSUFICIENTE');
    d.reply = 'Déjame revisar eso con una persona del equipo para responderte bien.';
    return finish(session, d, null);
  }

  // ---- saludo / cierre ----------------------------------------------------------------------
  if (intents.includes('CANCELA_CONSULTA')) {
    d.primary_intent = 'CANCELA_CONSULTA';
    addIntent(d, 'CIERRE');
    d.reply = 'Claro, sin problema. Si cambias de idea, aquí estoy.';
    return finish(session, d, null);
  }
  if (intents.includes('CIERRE') && !availIntent && !priceIntent) {
    d.primary_intent = 'CIERRE';
    d.reply = session.lastQuote ? 'Con gusto. Si quieres te la separo con el anticipo.' : 'Con gusto. Aquí estoy para lo que necesites.';
    return finish(session, d, null);
  }
  const greetRest = residualWords(n.replace(/^(hola|ola|hey|buenas?( tardes| noches| dias)?|buenos dias)\b/, ''));
  if (intents.includes('SALUDO') && intents.length === 1 && !dateEntities && !personEntities && greetRest.length <= 1) {
    d.primary_intent = 'SALUDO_SOLO';
    addIntent(d, 'SALUDO_SOLO');
    d.reply = 'Hola, ¿en qué te puedo ayudar?';
    session.greeted = true;
    return finish(session, d, null);
  }

  // ---- plantilla web con campos vacios -------------------------------------------------------------
  if (/fecha de llegada:?\s*(\/|$)|numero de huespedes:?\s*$/.test(n) && !dateEntities) {
    d.primary_intent = 'CONSULTA_DISPONIBILIDAD';
    addIntent(d, 'CONSULTA_DISPONIBILIDAD');
    d.reply = '¿Me completas así? Ej.: llegada 10 oct, salida 11 oct, 2 huéspedes.';
    return finish(session, d, null);
  }
  if (/me interesa/.test(n) && /disponibilidad/.test(n) && !dateEntities && !personEntities) {
    d.labels.push('ORIGEN_WEB');
    d.primary_intent = 'CONSULTA_DISPONIBILIDAD';
    addIntent(d, 'CONSULTA_DISPONIBILIDAD');
    d.reply = 'Perfecto. ¿Me confirmas fecha de llegada, fecha de salida y número de huéspedes?';
    return finish(session, d, null);
  }

  // ---- ambiguedades ---------------------------------------------------------------------------------------
  if (entities.dates.ambiguous === 'PUENTE' && !dateEntities) {
    d.primary_intent = 'CONSULTA_DISPONIBILIDAD';
    addIntent(d, 'CONSULTA_DISPONIBILIDAD');
    d.reply = '¿De qué día a qué día sería el puente?';
    return finish(session, d, null);
  }
  if (entities.dates.ambiguous === 'FIN_DE_SEMANA' && !entities.dates.checkIn) {
    d.primary_intent = 'CONSULTA_DISPONIBILIDAD';
    addIntent(d, 'CONSULTA_DISPONIBILIDAD');
    const g = m.guests;
    const pre = g && g >= 5 && g <= 7 ? `Para ${g} personas te sirve la suite 301 (hasta 7) o los Apartamentos Algarra.` : null;
    d.reply = `${pre ? `${pre} ` : ''}¿Es este fin de semana (sáb 3 – dom 4) o el siguiente, y necesitas cocina?`;
    d.flags.push('FECHAS_AMBIGUAS_NO_SE_CONSULTA_ODOO');
    return finish(session, d, null);
  }
  if (entities.persons.ambiguous_count != null) {
    d.primary_intent = 'CONSULTA_DISPONIBILIDAD';
    addIntent(d, 'CONSULTA_DISPONIBILIDAD');
    d.reply = `¿Son ${entities.persons.ambiguous_count} personas o ${entities.persons.ambiguous_count} habitaciones?`;
    return finish(session, d, null);
  }
  if (entities.dates.tentative && dateEntities && m.dates_tentative) {
    d.primary_intent = 'FECHA';
    addIntent(d, 'FECHA', 'CONSULTA_DISPONIBILIDAD');
    d.reply = `¿Te refieres al ${fmtDate(m.checkIn)}?`;
    d.flags.push('FECHA_PENDIENTE_DE_CONFIRMAR');
    return finish(session, d, null);
  }

  // ---- precio por persona o por habitacion ---------------------------------------------------------------
  if (intents.includes('ACLARACION_PRECIO')) {
    d.primary_intent = 'ACLARACION_PRECIO';
    addIntent(d, 'ACLARACION_PRECIO');
    const basis = prop.price_basis;
    if (basis) {
      d.reply = `En ${prop.short} el valor es ${basis}.`;
    } else {
      d.data_gaps.push(`DATA_GAP:base_de_precio:${prop.key}`);
      escalate(d, 'DATA_GAP_BASE_DE_PRECIO');
      d.reply = 'Eso no lo tengo confirmado para esa propiedad; lo consulto y te cuento.';
    }
    return finish(session, d, null);
  }

  // ---- seleccion de una opcion ya mostrada ---------------------------------------------------------------
  if (intents.includes('SELECCION') && session.lastOptions.length) {
    d.primary_intent = 'SELECCION';
    const num = n.match(/\b(\d{2,3})(?:\.?000| mil)?\b/);
    const price = num ? Number(num[1]) * 1000 : null;
    const pick = session.lastOptions.find((o) => o.total != null && (o.total === price || o.total / (session.lastQuote?.nights ?? 1) === price)) ?? null;
    if (pick) {
      d.reply_amounts.push(pick.total);
      d.reply = `¿Te refieres a la ${optionText(pick)}?`;
    } else {
      d.reply = '¿Cuál de las opciones te gustó, la de cuál habitación?';
    }
    return finish(session, d, null);
  }

  // ---- presupuesto limitado / mas economica (opciones ya consultadas) -----------------------------------
  const cheaper = intents.includes('PRESUPUESTO_LIMITADO') || /mas economic|mas barat/.test(n);
  if (cheaper && !entities.misc.budget && session.lastOptions.length) {
    d.primary_intent = 'PRESUPUESTO_LIMITADO';
    const sorted = [...session.lastOptions].filter((o) => o.total != null).sort((a, b) => a.total - b.total);
    const c = sorted[0];
    if (c) {
      d.reply_amounts.push(c.total);
      const bt = c.bath ?? AS_ROOMS[c.unit]?.bath;
      const diff = bt === 'compartido' ? ' Cambia que el baño se comparte con una habitación vecina.' : '';
      d.reply = `La más económica disponible es la ${optionText(c)}.${diff}`;
      return finish(session, d, null);
    }
  }
  if (intents.includes('OBJECION_PRECIO') && !entities.misc.budget) {
    d.primary_intent = 'OBJECION_PRECIO';
    d.reply = `Entiendo. Incluye ${prop.includes ?? 'aseo y ropa de cama'}; si quieres te muestro una opción más económica disponible.`;
    return finish(session, d, null);
  }

  // ---- anticipo / pago -----------------------------------------------------------------------------------------
  if (intents.includes('ANTICIPO')) {
    d.primary_intent = 'ANTICIPO';
    if (/\b(pago|pagar|te pago|pago al llegar|al llegar|manana)\b/.test(n) && (entities.dates.deferral || /al llegar|a la llegada/.test(n))) {
      /* se maneja abajo como diferido */
    }
  }
  if (entities.dates.deferral || /\bpago al llegar\b|\bpagar al llegar\b|\bpago a la llegada\b/.test(n)) {
    if (/al llegar|a la llegada/.test(n)) {
      d.primary_intent = 'PAGO';
      addIntent(d, 'PAGO');
      d.data_gaps.push('DATA_GAP:politica_pago_al_llegar');
      escalate(d, 'PAGO_AL_LLEGAR_SIN_POLITICA');
      d.reply = 'El anticipo es lo que asegura el cupo. Lo de pagar al llegar lo consulto con el equipo.';
      return finish(session, d, null);
    }
    d.primary_intent = 'ANTICIPO_DIFERIDO';
    addIntent(d, 'ANTICIPO_DIFERIDO', 'ANTICIPO');
    session.counters.deferral = (session.counters.deferral ?? 0) + 1;
    if (session.counters.deferral >= 2) escalate(d, 'INSISTE_EN_PAGAR_DESPUES');
    d.reply = 'El anticipo es lo que asegura el cupo; sin él no puedo garantizártelo.';
    return finish(session, d, null);
  }
  if (/\b(pago al llegar|pagar al llegar|al llegar)\b/.test(n) && /pag/.test(n)) {
    d.primary_intent = 'PAGO';
    addIntent(d, 'PAGO');
    escalate(d, 'PAGO_AL_LLEGAR_SIN_POLITICA');
    d.data_gaps.push('DATA_GAP:politica_pago_al_llegar');
    d.reply = 'El anticipo es lo que asegura el cupo. Lo de pagar al llegar lo consulto con el equipo.';
    return finish(session, d, null);
  }
  if (intents.includes('ANTICIPO') && !intents.includes('METODO_PAGO')) {
    const total = session.lastQuote?.total;
    const dep = depositFor(total);
    if (dep == null) {
      d.reply = `El anticipo es del ${POLICY.deposit.percent}% del total. Cuando tengamos la cotización te digo el valor exacto.`;
    } else {
      d.reply_amounts.push(total, dep);
      d.reply = `El anticipo es del ${POLICY.deposit.percent}%: ${money(dep)} de ${money(total)}, y asegura tu cupo.`;
      const rec = reconcileWithOdoo({ total, deposit_required: session.lastQuote?.deposit_required });
      if (rec.mismatch) d.flags.push(`ODOO_DEPOSIT_MISMATCH:odoo=${rec.odoo_percent}%:oficial=${POLICY.deposit.percent}%`);
    }
    d.deposit = { percent: POLICY.deposit.percent, amount: dep, total: total ?? null };
    return finish(session, d, null);
  }
  if (intents.includes('METODO_PAGO')) {
    d.primary_intent = 'METODO_PAGO';
    addIntent(d, 'PAGO', 'METODO_PAGO');
    if (/tarjeta/.test(n)) {
      d.reply = `Puedes pagar con tarjeta por un link de pago; tiene un recargo del ${POLICY.card_surcharge_percent}%.`;
    } else {
      d.template_proposed = 'PAGO_DE_RESERVA_OFICIAL';
      d.reply = 'Te envío los datos de pago oficiales; luego mándame el comprobante por este mismo WhatsApp.';
    }
    return finish(session, d, null);
  }

  // ---- OTA --------------------------------------------------------------------------------------------------------------
  if (intents.includes('CONFIRMAR_RESERVA_OTA')) {
    d.primary_intent = 'CONFIRMAR_RESERVA_OTA';
    d.odoo.needed = false;
    d.flags.push('BUSCAR_RESERVA_OTA_DATA_GAP_SINCRONIZACION');
    d.data_gaps.push('DATA_GAP:sincronizacion_OTA_Odoo');
    d.reply = 'Claro. ¿A nombre de quién está la reserva y para qué fechas? La ubico.';
    return finish(session, d, null);
  }

  if (priceIntent && session.lastQuote && session.lastQuote.total != null && !dateEntities && !personEntities && !wantsFaq.length && /cuanto (era|fue|me dijiste|dijiste)/.test(n)) {
    const q = session.lastQuote;
    d.primary_intent = 'CONSULTA_PRECIO';
    d.reply_amounts.push(q.total);
    const when = q.nights > 1 ? `${fmtDate(q.checkIn)} al ${fmtDate(q.checkOut)}` : fmtDate(q.checkIn);
    d.reply = `Eran ${money(q.total)} por ${q.nights} ${plural(q.nights, 'noche', 'noches')} (${when}), para ${q.guests} personas.`;
    return finish(session, d, null);
  }

  // ---- FAQ ---------------------------------------------------------------------------------------------------------------------
  const wantsFlow = availIntent || priceIntent || (dateEntities && !wantsFaq.length) || (personEntities && !wantsFaq.length) || changeIntent || Boolean(entities.misc.budget);
  const faqOnly = wantsFaq.length > 0 && !(availIntent && (dateEntities || personEntities));
  let faqEscalate = false;

  const POS = { hours: /check ?in|check ?out|hora de|a que hora/, parking: /parqueadero|carro|moto|camioneta/, location: /donde|direccion|catedral|lejos|cerca|ubicacion/, luggage: /maleta|equipaje/, prop: /desayuno|wifi|cocina|ascensor|piso|cama|incluye|aire|agua/ };
  const faqList = [...new Set(wantsFaq)].sort((a, b) => (n.search(POS[a]) + 1000) % 1000 - (n.search(POS[b]) + 1000) % 1000);
  if (new Set(wantsFaq).size + (priceIntent ? 1 : 0) >= 3) addIntent(d, 'MULTI_INTENCION');
  const distanceQ = intents.includes('PARQUEADERO') && /(que tan lejos|a cuantas? cuadras|distancia|donde queda)/.test(n) && /parqueadero/.test(n);
  for (const f of faqList) {
    if (f === 'location' && intents.includes('PARQUEADERO') && /parqueadero/.test(n)) continue;
    if (f === 'hours') {
      d.primary_intent ??= intents.includes('CHECKOUT') && !intents.includes('CHECKIN') ? 'CHECKOUT' : 'CHECKIN';
      if (session.pending === 'property' && !entities.property.key) { /* sigue con la propiedad por defecto */ }
      const which = intents.includes('CHECKIN') && !intents.includes('CHECKOUT') ? 'checkin' : intents.includes('CHECKOUT') && !intents.includes('CHECKIN') ? 'checkout' : 'both';
      const h = hoursPart(session, d, prop, which);
      parts.push(h.text);
      if (h.gap) faqEscalate = true;
    } else if (f === 'parking') {
      d.primary_intent ??= 'PARQUEADERO';
      addIntent(d, 'PARQUEADERO');
      const multi = faqList.length > 1 || priceIntent || availIntent;
      if (distanceQ) addIntent(d, 'UBICACION_PARQ', 'UBICACION');
      const pk = distanceQ && prop.key === 'AS' ? { text: 'El parqueadero aliado queda a unas 2 cuadras y media.' } : parkingPart(prop, m.vehicle, { ask: !multi });
      if (pk.ask) {
        session.pending = 'vehicle';
        parts.push(pk.text);
      } else {
        parts.push(pk.text);
        if (pk.gap) { faqEscalate = true; d.data_gaps.push(`DATA_GAP:parqueadero:${prop.key}`); }
        if (session.pending === 'vehicle') session.pending = null;
        if (/camioneta|alta/.test(n) && prop.key === 'AA') {
          faqEscalate = true;
          d.data_gaps.push('DATA_GAP:altura_maxima_parqueadero');
          parts.push('La altura máxima del parqueadero la confirmo con el equipo.');
        }
      }
    } else if (f === 'location') {
      d.primary_intent ??= 'UBICACION';
      addIntent(d, 'UBICACION');
      if (/catedral|lejos|cerca/.test(n) && prop.distance_catedral) parts.push(`Atheron Suite queda ${prop.distance_catedral} de la Catedral de Sal.`);
      else if (prop.address) parts.push(`${prop.short} queda en ${prop.address}.`);
      else parts.push('La dirección exacta se entrega al confirmar la reserva.');
    } else if (f === 'luggage') {
      d.primary_intent ??= 'EQUIPAJE';
      parts.push('El día de salida guardamos las maletas sin costo en la oficina principal (piso 1).');
    } else if (f === 'prop') {
      d.primary_intent ??= 'PREGUNTA_PROPIEDAD';
      if (/desayuno/.test(n)) {
        d.data_gaps.push(`DATA_GAP:desayuno:${prop.key}`);
        faqEscalate = true;
        parts.push('El desayuno no lo tengo confirmado; lo consulto con el equipo y te cuento.');
      } else if (/ascensor/.test(n)) parts.push('Atheron Suite no tiene ascensor; se sube por escaleras.');
      else if (/piso bajo|primer piso/.test(n)) {
        faqEscalate = true;
        d.data_gaps.push('DATA_GAP:piso_bajo_movilidad');
        parts.push('No tengo certeza de una habitación en piso bajo; lo consulto con el equipo.');
      } else if (/cocina/.test(n)) parts.push('Atheron Suite tiene cocina compartida en el 2.º piso, con nevera y utensilios.');
      else if (/wifi|wi-fi|netflix|agua caliente/.test(n)) parts.push('Hay WiFi, TV con Netflix y agua caliente.');
      else if (/incluye/.test(n)) {
        if (!priceIntent) parts.push(`El precio incluye ${prop.includes ?? 'lo de la ficha'}.`);
      }
      else if (/aire/.test(n)) parts.push('Las habitaciones de Atheron Suite no tienen aire acondicionado.');
      else if (/cama/.test(n)) {
        faqEscalate = true;
        d.data_gaps.push('DATA_GAP:detalle_de_camas');
        parts.push('El detalle de camas lo confirmo con el equipo según la habitación.');
      } else {
        faqEscalate = true;
        d.data_gaps.push('DATA_GAP:pregunta_de_propiedad');
        parts.push('Ese dato no lo tengo confirmado; lo consulto y te cuento.');
      }
    }
  }

  if (priceIntent && !wantsFaq.length) addIntent(d, 'CONSULTA_PRECIO');
  if (dateEntities && !availIntent && !priceIntent && !wantsFaq.length) addIntent(d, 'FECHA');
  if (faqEscalate) escalate(d, 'DATA_GAP_EN_FICHA');

  // ---- pedido de precio/disponibilidad ------------------------------------------------------------------------------------------
  const needFlow = !faqOnly && (wantsFlow || (wantsFaq.length === 0 && (dateEntities || personEntities))) || (faqOnly && priceIntent);
  if (needFlow) {
    d.primary_intent ??= priceIntent && !availIntent ? 'CONSULTA_PRECIO' : 'CONSULTA_DISPONIBILIDAD';
    if (priceIntent) addIntent(d, 'CONSULTA_PRECIO');
    if (availIntent || !priceIntent) addIntent(d, 'CONSULTA_DISPONIBILIDAD');
    if (entities.dates.checkIn && entities.dates.nights && entities.dates.nights > 1) addIntent(d, 'MULTI_NOCHE');
    if (changes.some((c) => c.slot === 'noches')) addIntent(d, 'CAMBIO_FECHAS', 'NOCHES');
    if (changes.some((c) => c.slot === 'personas')) addIntent(d, 'CAMBIO_PERSONAS');
    if (entities.misc.bath && changes.length === 0 && session.lastOptions.length) addIntent(d, 'PREFERENCIA');
    if (m.rooms && m.rooms > 1) addIntent(d, 'V2');
    if (entities.dates.nights === 7 && !entities.dates.checkIn) addIntent(d, 'CONSULTA_DISPONIBILIDAD');

    const miss2 = missingFor(session);
    const proptarget = entities.property.key ?? m.property ?? POLICY.default_property;
    if (proptarget !== 'AS') {
      d.data_gaps.push(`PARTIAL_CAPACITY:${proptarget}_no_mapeada_en_odoo`);
      d.flags.push('ODOO_PROPERTY_NOT_MAPPED');
      escalate(d, 'PROPIEDAD_SIN_PRECIO_EN_ODOO');
      parts.push(`Para ${PROPERTIES[proptarget].short} la disponibilidad y el precio los confirma el equipo.`);
    } else if (miss2.length) {
      d.missing = miss2;
      const ask = askMissing(miss2, { price: priceIntent });
      // capacidad verificada: se puede orientar sin afirmar disponibilidad (Atheron Suite, Odoo)
      if (m.guests && m.guests <= 6 && miss2.includes('fecha') && !wantsFaq.length) {
        const fits = Object.entries(AS_ROOMS).filter(([, r]) => r.capacity >= m.guests).sort((a, b) => a[1].capacity - b[1].capacity || Number(a[0]) - Number(b[0])).map(([u, r]) => `${u} (hasta ${r.capacity})`);
        if (m.guests === 3 && fits.length) parts.push(`Para ${m.guests} personas sirven la ${fits.slice(0, 2).join(' o la ')}, según disponibilidad.`);
      }
      if (priceIntent && m.guests === 2 && /incluye/.test(n)) parts.push(`El precio incluye ${prop.includes}.`);
      if (m.infants && !m.crib_asked) {
        m.crib_asked = true;
        addIntent(d, 'FAMILIA');
        parts.push(miss2.includes('fecha') ? '¿El bebé necesita cuna y para qué fecha?' : '¿El bebé necesita cuna?');
      } else if (m.children && !m.ages_known) {
        addIntent(d, 'FAMILIA');
        parts.push(miss2.includes('fecha') ? '¿Qué edades tienen los niños y para qué fecha?' : '¿Qué edades tienen los niños?');
      } else if (ask) {
        parts.push(entities.dates.nights > 1 && !m.checkIn ? askMissing(miss2, { price: priceIntent, start: true }) : ask);
      }
    } else {
      // Con fechas, personas y propiedad AS: consulta REAL a Odoo (solo lectura)
      const bath = m.bath;
      let rooms = m.rooms && m.rooms > 1 ? m.rooms : 1;
      let ci = m.checkIn;
      let co = m.checkOut;
      let purpose = 'disponibilidad';
      if (/tercera en otra habitacion/.test(n)) {
        ci = addDays(m.checkIn, 2);
        co = addDays(m.checkIn, 3);
        purpose = 'combinacion_habitaciones';
        addIntent(d, 'CAMBIO_HAB');
      }
      const prevTooSmall = session.lastOptions.length > 0 && session.lastOptions.every((o) => o.capacity != null && o.capacity < m.guests);
      let res = await consultOdoo(session, d, deps, { checkIn: ci, checkOut: co, guests: m.guests, bath, rooms, purpose });
      if (res.status === 'ERROR') {
        parts.push('Lo estoy confirmando.');
      } else {
        const noSingle = (res.options ?? []).filter((o) => o.capacity == null || o.capacity >= m.guests).length === 0;
        if (noSingle && m.guests > 1 && rooms === 1) {
          const two = await consultOdoo(session, d, deps, { checkIn: ci, checkOut: co, guests: m.guests, bath, rooms: 2, purpose: 'dos_habitaciones' });
          if (two.status === 'OK' && two.options.length) {
            res = { ...two, options: two.options };
            d.flags.push('PROPUESTA_DOS_HABITACIONES');
          }
        }
        let prefix = null;
        if (fromAudio) prefix = `Entendí: ${m.guests} personas, ${m.nights && m.nights > 1 ? dateText(m) : fmtDate(m.checkIn)}.`;
        else if (changes.some((c) => c.slot === 'noches' || c.slot === 'personas')) {
          prefix = changes.some((c) => c.slot === 'noches') ? `Entonces son ${m.nights} noches.` : `Entonces son ${m.guests} personas.`;
          d.flags.push('CAMBIO_CONFIRMADO');
        }
        if (prevTooSmall) parts.push(`Esa habitación no alcanza para ${m.guests} personas.`);
        const body = presentOptions(session, d, res, m, { prefix, budget: m.budget });
        parts.push(body);
        storeOptions(session, d, res, m);
        if (res.status === 'NO_AVAILABILITY' || (res.options ?? []).length === 0) {
          escalate(d, m.guests >= 7 ? 'SIN_CUPO_LISTA_DE_ESPERA' : 'SIN_CUPO_ALTERNATIVAS_FUERA_DE_ODOO');
        }
        if (m.nights_assumed && !fromAudio && !changes.length) d.flags.push('NOCHES_ASUMIDAS_1');
      }
    }
  }

  if (intents.includes('LISTA_ESPERA')) {
    d.primary_intent = 'LISTA_ESPERA';
    escalate(d, 'LISTA_DE_ESPERA');
    d.flags.push('REGISTRAR_INTERES');
    parts.length = 0;
    parts.push('Dejo tu interés anotado y te aviso si se libera; no te lo puedo asegurar.');
  }

  if (d.odoo.calls.length && d.odoo.results.some((r) => r.status === 'NO_AVAILABILITY') && m.guests >= 7) escalate(d, 'SIN_CUPO_LISTA_DE_ESPERA');
  const substantive = intents.filter((i) => i !== 'SALUDO');
  if (parts.length === 0 && substantive.length === 0 && !dateEntities && !personEntities && !entities.misc.vehicle && !entities.misc.budget) {
    // Nada reconocible: NUNCA se asume una consulta de disponibilidad. Se pasa a una persona con el texto tal cual.
    d.primary_intent = 'INTENCION_NO_ENTENDIDA';
    addIntent(d, 'INTENCION_NO_ENTENDIDA');
    d.flags.push('FALLBACK_A_HUMANO');
    escalate(d, 'INTENCION_NO_ENTENDIDA');
    d.reply = 'Déjame revisar eso con una persona del equipo para responderte bien.';
    return finish(session, d, null);
  }
  if (parts.length === 0) {
    // nada concreto: pedir lo que falte con una sola pregunta
    const ask = askMissing(missingFor(session));
    d.primary_intent ??= 'CONSULTA_DISPONIBILIDAD';
    parts.push(ask ?? '¿En qué te puedo ayudar?');
    d.missing = missingFor(session);
  }
  d.reply = composeParts(parts);
  return finish(session, d, null);
}

/** Une fragmentos en <=3 lineas y <=1 pregunta (la ultima pregunta gana). */
function composeParts(parts) {
  const questions = [];
  const statements = [];
  for (const p of parts) {
    const lines = p.split('\n');
    for (const line of lines) {
      if (/^¿[^?]*\?$/.test(line.trim())) questions.push(line.trim());
      else statements.push(line.trim());
    }
  }
  const q = questions.length ? [questions.at(-1)] : [];
  return [...statements, ...q].join('\n');
}

function finish(session, d, _message) {
  const m = session.memory;
  d.memory = { ...m };
  if (!d.primary_intent) d.primary_intent = d.intents[0] ?? null;
  d.intents = d.intents.filter(Boolean);
  if (d.reply && !session.greeted) {
    d.reply = /^(hola|¡hola)/i.test(d.reply) ? d.reply : `¡Hola! ${d.reply}`;
  }
  if (d.reply) session.greeted = true;
  if (d.escalate) d.escalation = { ...d.escalation, summary: handoffSummary(session, d) };
  d.labels = [...new Set([...d.labels, ...(d.line !== 'GUEST' ? [d.line] : [])])];
  session.history.push({ role: 'agent_proposal', text: d.reply });
  return d;
}

function handoffSummary(session, d) {
  const m = session.memory;
  return {
    intent: d.primary_intent,
    collected: { fechas: m.checkIn ? `${m.checkIn}→${m.checkOut}` : null, personas: m.guests ?? null, propiedad: m.property ?? null, baño: m.bath ?? null, vehiculo: m.vehicle ?? null, mascota: m.pet ?? null },
    missing: missingFor(session),
    urgency: d.escalation?.urgency ?? 'NORMAL',
    data_gaps: d.data_gaps,
  };
}

/** Rafaga de burbujas seguidas: se agrupan y se responde UNA vez (Playbook s8 regla 3). */
export async function processBurst(session, messages, deps) {
  if (messages.length === 1) return processMessage(session, messages[0], deps);
  const text = messages.map((x) => x.text ?? '').join(' ');
  const d = await processMessage(session, { type: 'text', text }, deps);
  d.flags.push(`RAFAGA_AGRUPADA:${messages.length}`);
  return d;
}
