/**
 * ShadowAgent -- Hoteles Atero concierge, MODO SHADOW.
 *
 * Recibe mensajes, recupera contexto, consulta Gateway/Odoo STAGING (solo
 * availability + quote, via puerto), y produce el SHADOW_RESPONSE que habria
 * enviado. NO existe ninguna ruta de salida: este modulo no importa red, no
 * tiene metodo `send`, y toda respuesta lleva `send:false`.
 *
 * Flujo: mensaje -> clasificar -> intenciones -> contexto -> (esperar
 * fragmentos) -> entidades -> datos faltantes -> Gateway/Odoo -> opciones ->
 * cotizar + anticipo 50% -> escalar si corresponde -> SHADOW_RESPONSE -> evidencia.
 */
import { performance } from 'node:perf_hooks';
import { assertGatewayPort } from './gateway-port.mjs';
import { classify, GUEST_CLASSES } from './classifier.mjs';
import { addDays, bogotaToday, detectIntents, extractEntities, normalize } from './nlu.mjs';
import { computeMissing, createContext, mergeEntities } from './context.mjs';
import { cancellationDecision, computeDeposit } from './policies.mjs';
import { groupTier, planDistribution, planTotals } from './groups.mjs';
import { estanciaLabel, fmtCOP, numWord, personas, saludo, TEXTS } from './copy.mjs';
import { buildRecord, scrub } from './evidence.mjs';
import { audioToText, NullTranscription } from './audio.mjs';
import { handleCallEvent } from './calls.mjs';

const OTA_RESERVATION = /\b(reserva|reserve|reservamos|reservado)\b.*\b(booking|airbnb)\b|\b(booking|airbnb)\b.*\b(reserva|reservamos)\b|\bpor (booking|airbnb)\b/;

function otaChannel(t) {
  if (!OTA_RESERVATION.test(t)) return null;
  return /booking/.test(t) ? 'booking' : 'airbnb';
}

export class ShadowAgent {
  #contexts = new Map();
  #buffers = new Map();
  #seen = new Set();

  /**
   * @param {{config:{mode:string,enabled:boolean}, gateway:object, clock?:()=>Date, evidence?:{write:Function},
   *          contacts?:Record<string,{role?:string,hasReservation?:boolean}>, transcription?:object,
   *          catalog?:object, debounceMs?:number}} deps
   */
  constructor({ config, gateway, clock = () => new Date(), evidence = null, contacts = {}, transcription = new NullTranscription(), catalog = null, debounceMs = 4000 }) {
    if (config?.mode !== 'shadow') throw new Error('SHADOW_ONLY: este agente solo corre en modo shadow');
    assertGatewayPort(gateway);
    this.config = config;
    this.gateway = gateway;
    this.clock = clock;
    this.evidence = evidence;
    this.contacts = contacts;
    this.transcription = transcription;
    this.catalog = catalog;
    this.debounceMs = debounceMs;
  }

  getContext(conversationId) {
    return this.#contexts.get(conversationId) ?? createContext();
  }

  /** Acepta un mensaje en el buffer de fragmentos. Un id repetido (reintento de Meta) se ignora. */
  ingest(conversationId, message) {
    const key = `${conversationId}:${message.id ?? `${message.ts}:${message.text}`}`;
    if (this.#seen.has(key)) return { buffered: false, duplicate: true };
    this.#seen.add(key);
    const buf = this.#buffers.get(conversationId) ?? { messages: [], lastTs: 0 };
    buf.messages.push(message);
    buf.lastTs = message.ts ?? this.clock().getTime();
    this.#buffers.set(conversationId, buf);
    return { buffered: true, duplicate: false };
  }

  /** Conversaciones cuyo ultimo fragmento ya espero `debounceMs` sin nuevos mensajes. */
  dueConversations(nowTs = this.clock().getTime()) {
    return [...this.#buffers].filter(([, b]) => b.messages.length && nowTs - b.lastTs >= this.debounceMs).map(([id]) => id);
  }

  /** Ingesta + flush en un paso (un turno ya agrupado). */
  async handle(conversationId, messages, opts = {}) {
    for (const m of messages) this.ingest(conversationId, typeof m === 'string' ? { text: m, ts: this.clock().getTime() } : m);
    return this.flush(conversationId, opts);
  }

  async handleCall(conversationId, event) {
    const ctx = this.getContext(conversationId);
    return handleCallEvent(event, { context: ctx, classification: ctx.classification ?? 'UNKNOWN', now: this.clock() });
  }

  async flush(conversationId, { testId = null } = {}) {
    const buf = this.#buffers.get(conversationId);
    if (!buf?.messages.length) return null;
    const messages = buf.messages;
    this.#buffers.delete(conversationId);
    const t0 = performance.now();
    const before = structuredClone(this.getContext(conversationId));
    const response = await this.#process(conversationId, messages, before);
    const frozen = Object.freeze(response);
    this.#contexts.set(conversationId, structuredClone(response.context));
    this.evidence?.write(buildRecord({ conversationId, response: frozen, contextBefore: before, latencyMs: Math.round((performance.now() - t0) * 100) / 100, testId }));
    return frozen;
  }

  // ------------------------------------------------------------------ nucleo

  async #process(conversationId, messages, before) {
    const now = this.clock();
    const today = bogotaToday(now);
    const base = {
      type: 'SHADOW_RESPONSE', mode: 'shadow', send: false, outbound: 'BLOCKED_SHADOW', ts: now.toISOString(),
      conversation_id: conversationId, classification: before.classification, classification_reason: null,
      intents: [], entities: {}, text: null, escalation: null, context: before, odoo: { called: false, calls: 0, result: null },
    };
    if (!this.config.enabled) {
      return { ...base, status: 'DISABLED_KILL_SWITCH', classification: before.classification ?? 'UNKNOWN', classification_reason: 'KILL_SWITCH' };
    }

    // texto del turno (audio -> transcripcion si existe)
    const texts = [];
    let audioFailed = false;
    for (const m of messages) {
      if (m.type === 'audio') {
        const r = await audioToText(m, this.transcription);
        if (r.ok) texts.push(r.text); else audioFailed = true;
      } else if (m.text) texts.push(m.text);
    }
    const combined = texts.join('\n');
    const norm = normalize(combined);
    const intents = detectIntents(combined);

    const registry = this.contacts[conversationId] ?? null;
    const cls = classify(combined, { prior: before.classification, registry });
    const ctx0 = { ...before, classification: cls.classification };
    const common = { ...base, classification: cls.classification, classification_reason: cls.reason, intents };

    if (audioFailed && !texts.length) {
      return { ...common, status: 'AUDIO_PENDING_TRANSCRIPTION', text: TEXTS.audioPending, context: ctx0 };
    }

    if (!GUEST_CLASSES.includes(cls.classification)) return this.#nonGuest(common, ctx0, combined, intents, now);

    // ---- entidades (mensaje a mensaje: lo ultimo que diga el huesped manda)
    let ctx = ctx0;
    let changes = [];
    let invalidates = false;
    const entities = {};
    for (const text of texts) {
      const ents = extractEntities(text, { today, catalog: this.catalog });
      Object.assign(entities, ents);
      const merged = mergeEntities(ctx, ents);
      ctx = merged.context;
      changes = changes.concat(merged.changes);
      invalidates ||= merged.invalidates;
    }
    if (invalidates) {
      ctx.unidad = null;
      if (ctx.propiedad_source === 'agent') { ctx.propiedad = null; ctx.propiedad_source = null; }
      ctx.noches_assumed = false;
    }
    const channel = otaChannel(norm);
    if (channel) ctx.reserva_existente = { channel };
    ctx.ultima_intencion = intents.find((i) => !['GREETING', 'THANKS'].includes(i)) ?? ctx.ultima_intencion;
    ctx.datos_faltantes = computeMissing(ctx);
    ctx.group_tier = groupTier(ctx.total_personas);

    const first = !before.greeted;
    ctx.greeted = true;
    const parts = first ? [saludo((now.getUTCHours() + 19) % 24)] : [];
    const out = { ...common, entities, context: ctx };
    const done = (extra) => ({ ...out, ...extra, text: [...parts, ...(extra.parts ?? [])].filter(Boolean).join('\n') || null, parts: undefined });
    const escalate = (reason, text, actions = ['ESCALATE_HUMAN'], extra = {}) => done({
      parts: text ? [text] : [],
      escalation: { required: true, reason, actions, summary: this.#summary(ctx, reason, combined, extra) },
    });

    if (intents.includes('BOT_QUESTION')) parts.push(TEXTS.botDisclosure);

    if (intents.includes('HUMAN_REQUEST')) return escalate('HUMAN_REQUESTED', TEXTS.human);
    if (intents.includes('PAYMENT_CLAIM')) return escalate('PAYMENT_VALIDATION', TEXTS.payment);
    if (intents.includes('OTA_PRICE_COMPARISON')) return escalate('OTA_PRICE_COMPARISON', TEXTS.otaComparison, ['ESCALATE_HUMAN', 'ALERTA_HUMANO']);
    if (intents.includes('DISCOUNT')) return escalate('DISCOUNT_REQUEST', TEXTS.discount, ['ESCALATE_HUMAN', 'ALERTA_HUMANO']);
    if (intents.includes('CALL_REQUEST')) return escalate('CALL_REQUEST', TEXTS.human, ['ESCALATE_HUMAN', 'CALLBACK_HUMANO']);

    if (intents.includes('CANCEL') || intents.includes('CHANGE_DATES')) {
      const d = cancellationDecision({ checkIn: ctx.fecha_in, now, channel: ctx.reserva_existente?.channel ?? null });
      if (d.kind === 'NEED_DATE') return done({ parts: [TEXTS.cancelNeedDate] });
      if (d.kind === 'OTA') return escalate('OTA_RESERVATION_CHANGE', TEXTS.cancelOta, ['ESCALATE_HUMAN'], { no_auto_change: true });
      if (d.kind === 'EXCEPTION') return escalate('CANCELLATION_EXCEPTION', TEXTS.cancelException, ['ESCALATE_HUMAN', 'ALERTA_HUMANO'], { horas_aviso: d.hours });
      return escalate('CANCELLATION_TO_PROCESS', TEXTS.cancelWithin, ['ESCALATE_HUMAN'], { horas_aviso: d.hours, politica: '48h / saldo a favor 6 meses' });
    }

    if (ctx.group_tier) return this.#groupFlow(out, ctx, parts, combined, today, escalate, done);
    return this.#standardFlow(out, ctx, parts, intents, changes, entities, today, combined, escalate, done);
  }

  // ------------------------------------------------------------------ no huesped

  #nonGuest(out, ctx, combined, intents, now) {
    const cls = out.classification;
    const summary = { clasificacion: cls, ultimo_mensaje: scrub(combined).slice(0, 300), accion_sugerida: 'TOMAR_CONVERSACION' };
    if (cls === 'SPAM_OTHER') return { ...out, status: 'IGNORED', context: ctx };
    if (cls === 'UNKNOWN') {
      const first = !ctx.greeted;
      const hello = first ? saludo((now.getUTCHours() + 19) % 24) : null;
      const gctx = { ...ctx, greeted: true };
      if (intents.includes('HUMAN_REQUEST')) {
        return { ...out, context: gctx, text: [hello, TEXTS.human].filter(Boolean).join('\n'), escalation: { required: true, reason: 'HUMAN_REQUESTED', actions: ['ESCALATE_HUMAN'], summary } };
      }
      if (intents.includes('BOT_QUESTION')) {
        return { ...out, context: gctx, text: [hello, TEXTS.botDisclosure].filter(Boolean).join('\n') };
      }
      const greetingOnly = intents.length > 0 && intents.every((i) => i === 'GREETING');
      if (greetingOnly) {
        const first = !ctx.greeted;
        return { ...out, context: { ...ctx, greeted: true }, text: [first ? saludo((now.getUTCHours() + 19) % 24) : null, TEXTS.unknownOpener].filter(Boolean).join('\n') };
      }
      return { ...out, context: ctx, text: TEXTS.unknownConservative, escalation: { required: true, reason: 'UNKNOWN_SENDER', actions: ['ESCALATE_HUMAN'], summary } };
    }
    // ALLY_B2B / ATHERON_SECURITY / SUPPLIER / STAFF: nunca se contesta como huesped.
    return { ...out, context: ctx, text: null, status: 'ROUTED_TO_HUMAN', escalation: { required: true, reason: cls, actions: ['ESCALATE_HUMAN'], summary } };
  }

  #summary(ctx, reason, lastMessage, extra = {}) {
    return {
      motivo: reason,
      clasificacion: ctx.classification,
      fechas: ctx.fecha_in ? { checkin: ctx.fecha_in, checkout: ctx.fecha_out } : null,
      noches: ctx.noches,
      personas: ctx.total_personas,
      propiedad: ctx.propiedad,
      precio_cotizado: ctx.precio_cotizado,
      anticipo: ctx.anticipo,
      canal: ctx.canal,
      ultimo_mensaje: scrub(lastMessage).slice(0, 300),
      accion_sugerida: 'TOMAR_CONVERSACION',
      ...extra,
    };
  }

  // ------------------------------------------------------------------ Odoo

  async #search(out, checkIn, checkOut, guests) {
    const res = await this.gateway.searchOptions({ checkIn, checkOut, guests });
    out.odoo.called = true;
    out.odoo.calls += 1;
    out.odoo.result = { op: 'availability', ok: res.ok !== false, options: res.options?.length ?? 0, error_code: res.error_code ?? null };
    return res;
  }

  // ------------------------------------------------------------------ flujo estandar

  async #standardFlow(out, ctx, parts, intents, changes, entities, today, combined, escalate, done) {
    const done2 = (extra) => done({ ...extra, context: ctx });
    const missing = ctx.datos_faltantes;
    const gaveInfo = Boolean(entities.fecha_in || entities.total_personas || entities.noches);

    if (intents.includes('THANKS') && !gaveInfo && intents.length === 1) return done2({ parts: ['Con gusto, aquí estamos para lo que necesites.'] });

    if (missing.length) {
      const ack = [];
      if (ctx.total_personas) ack.push(personas(ctx.total_personas));
      if (ctx.fecha_in) ack.push(estanciaLabel(ctx.fecha_in, ctx.fecha_out, today));
      const lead = ack.length ? `Perfecto, ${ack.join(' para ')}.` : null;
      const ask = missing.length === 2 ? '¿Para qué fechas y cuántas personas serían?' : missing[0] === 'fecha_in' ? '¿Para qué fecha te gustaría?' : '¿Cuántas personas serían?';
      const deposit = intents.includes('DEPOSIT') ? TEXTS.depositGeneric : null;
      return done2({ parts: [deposit, lead, ask].filter(Boolean) });
    }

    const checkIn = ctx.fecha_in;
    const assumed = !ctx.fecha_out;
    const checkOut = ctx.fecha_out ?? addDays(checkIn, 1);
    const nights = ctx.noches ?? 1;
    ctx.noches_assumed = assumed;
    const guests = ctx.total_personas;

    let main;
    let alt = null;
    let note = null;
    const preselected = ctx.unidad?.length ? ctx.unidad : null;

    if (preselected) {
      main = { units: preselected, label: ctx.seleccion_label, property_name: ctx.seleccion_property_name };
    } else {
      const res = await this.#search(out, checkIn, checkOut, guests);
      if (res.ok === false) return escalate('GATEWAY_ERROR', TEXTS.gatewayError, ['ESCALATE_HUMAN'], { error_code: res.error_code });
      let options = res.options;
      if (ctx.propiedad && ctx.propiedad_source !== 'agent') {
        const mine = options.filter((o) => o.property_id === ctx.propiedad);
        if (mine.length) options = mine; else note = 'En esa propiedad no tengo disponibilidad para esas fechas, pero revisé las demás.';
      }
      const plan = planDistribution(options, guests);
      if (!plan.assignments.length) return done2({ parts: [TEXTS.noAvailability] });
      if (!plan.covered) {
        return escalate('CAPACITY_SHORTFALL', `Para esas fechas puedo acomodar a ${plan.assignments.reduce((s, a) => s + a.guests_assigned, 0)} de las ${guests} personas. Le paso tu caso al equipo para buscar la mejor opción.`, ['ESCALATE_HUMAN'], { capacidad_encontrada: plan.total_capacity, faltan: plan.shortfall });
      }
      const m = plan.assignments;
      main = { units: m.flatMap((a) => a.units.map((u) => u.unit_id)), label: describePlan(m), property_name: m[0].property_name, multi: m.length > 1, property_id: m.length === 1 ? m[0].property_id : null };
      const altPlan = plan.alternatives[0];
      if (altPlan) alt = { label: describePlan([altPlan]), total: altPlan.base_total };
      ctx.unidad = main.units;
      ctx.seleccion_label = main.label;
      ctx.seleccion_property_name = main.property_name;
      if (main.property_id && !ctx.propiedad) { ctx.propiedad = main.property_id; ctx.propiedad_source = 'agent'; }
    }

    const q = await this.gateway.quote({ checkIn, checkOut, guests, unit_ids: main.units });
    out.odoo.called = true;
    out.odoo.calls += 1;
    out.odoo.result = { ...(out.odoo.result ?? {}), op_quote: 'quote', quote_ok: q.ok !== false, quote_total: q.total ?? null, requires_manual_confirmation: q.requires_manual_confirmation ?? false, error_code: q.error_code ?? null };
    if (q.ok === false) return escalate('GATEWAY_ERROR', TEXTS.gatewayError, ['ESCALATE_HUMAN'], { error_code: q.error_code });
    if (q.total == null) return escalate('QUOTE_UNAVAILABLE', 'El valor exacto de esa opción lo confirmo con el equipo y te respondo por aquí.', ['ESCALATE_HUMAN']);

    const dep = computeDeposit(q.total);
    ctx.precio_cotizado = q.total;
    ctx.anticipo = dep.anticipo;
    ctx.saldo = dep.saldo;

    const when = estanciaLabel(checkIn, ctx.fecha_out, today);
    const stay = assumed ? 'por una noche' : `por ${numWord(nights)} ${nights === 1 ? 'noche' : 'noches'}`;
    const depositLine = `Para confirmar la reserva se abona el 50% (${fmtCOP(dep.anticipo)}) y el saldo restante (${fmtCOP(dep.saldo)}) queda pendiente.`;
    const onlyDeposit = intents.includes('DEPOSIT') && !intents.includes('AVAILABILITY') && !intents.includes('PRICE') && !gaveInfo;

    if (changes.length) {
      const g = changes.find((c) => c.field === 'total_personas');
      const d = changes.find((c) => c.field === 'fecha_in' || c.field === 'fecha_out' || c.field === 'noches');
      if (g) parts.push(`Listo, ahora son ${personas(g.to)}.`);
      else if (d) parts.push('Listo, actualizo las fechas.');
    } else if (gaveInfo && !onlyDeposit) {
      parts.push(`Perfecto, ${personas(guests)} para ${when}.`);
    }

    const manual = q.requires_manual_confirmation === true;
    if (onlyDeposit) {
      parts.push(`El anticipo es el 50% del total vigente: ${fmtCOP(dep.anticipo)}, sobre un total de ${fmtCOP(q.total)} (${main.label}, ${when}, ${stay}).`);
    } else {
      if (note) parts.push(note);
      parts.push(`${assumed ? `Para ${when}` : 'Para esas fechas'} te puedo ofrecer ${main.label}: ${fmtCOP(q.total)} en total ${stay}.`);
      if (alt) parts.push(alt.total != null ? `Como alternativa tengo ${alt.label} por ${fmtCOP(alt.total)}.` : `Como alternativa tengo ${alt.label}; el valor te lo confirmo enseguida.`);
      parts.push(depositLine);
      parts.push(assumed ? '¿Serían más noches? Así te ajusto el valor.' : '¿Te gustaría avanzar con esta opción?');
    }
    if (manual) {
      return escalate('MANUAL_CONFIRMATION_REQUIRED', null, ['ESCALATE_HUMAN'], { quote_total: q.total });
    }
    return done2({ parts: [], quote: { total: q.total, anticipo: dep.anticipo, saldo: dep.saldo, pct: 50, source: 'odoo_staging' } });
  }

  // ------------------------------------------------------------------ grupos

  async #groupFlow(out, ctx, parts, combined, today, escalate, done) {
    const tier = ctx.group_tier;
    const people = ctx.total_personas;
    const hasDates = ctx.fecha_in && ctx.fecha_out;
    const strategic = tier === 'STRATEGIC_GROUP_LEAD';
    const large = tier === 'LARGE_GROUP_FLOW' || strategic;
    const label = strategic ? 'STRATEGIC_GROUP_LEAD' : large ? 'LARGE_GROUP_COMMERCIAL_ALERT' : 'GROUP_SALES_FLOW';

    if (!hasDates) {
      const asks = ['fecha de entrada y de salida (o cuántas noches)'];
      if (!ctx.group_requirements_asked) asks.push('si necesitan habitaciones separadas, cuántos vehículos llegan y algún requerimiento especial');
      ctx.group_requirements_asked = true;
      const text = `Qué bueno, ${personas(people)}. Para armarte la propuesta necesito saber: ${asks.join('; y ')}.`;
      const base = { ...out, context: ctx, parts: [text], group: { tier } };
      if (large) {
        return escalate(label, text, ['ALERTA_HUMANO', 'ESCALATE_HUMAN'], { tier, personas: people, datos_faltantes: ['fecha_in', 'fecha_out_o_noches'] });
      }
      return done({ ...base, group: { tier } });
    }

    const res = await this.#search(out, ctx.fecha_in, ctx.fecha_out, null);
    if (res.ok === false) return escalate('GATEWAY_ERROR', TEXTS.gatewayError, ['ESCALATE_HUMAN'], { error_code: res.error_code, tier });
    const plan = planDistribution(res.options, people);
    const totals = planTotals(plan);
    const lines = plan.assignments.slice(0, 6).map((a) => `• ${a.property_name}: ${a.units.length} ${a.units.length === 1 ? 'unidad' : 'unidades'}, ${a.guests_assigned} personas`);
    if (plan.assignments.length > 6) lines.push(`• y ${plan.assignments.length - 6} propiedades más`);
    const group = {
      tier, personas: people, noches: ctx.noches,
      capacidad_encontrada: plan.total_capacity, cubierto: plan.covered, faltan: plan.shortfall,
      distribucion: plan.assignments.map((a) => ({ propiedad: a.property_name, unidades: a.units.length, capacidad_usada: a.capacity_used, huespedes: a.guests_assigned, capacidad_restante: a.capacity_remaining, base_total: a.base_total })),
      tarifa_base_odoo: totals.base_total, descuento_aplicado: 0,
    };
    out.odoo.result = { ...out.odoo.result, group_capacity: plan.total_capacity };
    if (totals.base_total != null) { ctx.precio_cotizado = totals.base_total; }

    const reasons = [];
    if (!plan.covered) reasons.push('GROUP_CAPACITY_SHORTFALL');
    if (large || plan.covered) reasons.push(label);
    const summary = {
      resumen_ejecutivo: strategic ? {
        fechas: { checkin: ctx.fecha_in, checkout: ctx.fecha_out }, noches: ctx.noches, personas: people,
        capacidad_encontrada: plan.total_capacity, propiedades_propuestas: group.distribucion.map((d) => d.propiedad),
        tarifa_base_odoo: totals.base_total, valor_total_preliminar: totals.base_total,
        requerimientos: { vehiculo: ctx.vehiculo, bano_preferencia: ctx.bano_preferencia }, datos_faltantes: plan.covered ? [] : [`alojamiento para ${plan.shortfall} personas`],
      } : null,
      grupo: group,
    };
    let text;
    if (plan.covered) {
      text = [`Para ${personas(people)}, ${estanciaLabel(ctx.fecha_in, ctx.fecha_out, today)} (${ctx.noches} ${ctx.noches === 1 ? 'noche' : 'noches'}), esta sería la distribución que veo:`, ...lines,
        totals.base_total != null ? `El valor base de referencia es ${fmtCOP(totals.base_total)} en total, sin descuentos.` : 'El valor lo confirmo con el equipo comercial.',
        TEXTS.groupPricing].join('\n');
    } else {
      text = [`Para esas fechas tengo capacidad para ${totals.guests_assigned} de las ${people} personas:`, ...lines,
        'Para el resto, el equipo comercial busca alternativas con aliados; te escriben por aquí.'].join('\n');
    }
    const actions = ['ALERTA_HUMANO', 'ESCALATE_HUMAN', 'GROUP_PRICING_APPROVAL'];
    if (!plan.covered) actions.push('ALLY_SEARCH');
    return {
      ...out, context: ctx, text: [...parts, text].join('\n'), group,
      group_pricing_approval: { required: true, base_total_odoo: totals.base_total, discount_applied: 0, discount_authorized: false },
      escalation: { required: true, reason: reasons[0] ?? label, reasons, actions, summary: this.#summary(ctx, reasons[0] ?? label, combined, summary) },
    };
  }
}

function describePlan(assignments) {
  return assignments.map((a) => (a.units.length === 1 ? `${a.property_name}, ${a.units[0].unit_label}` : `${a.property_name} (${a.units.length} habitaciones)`)).join(' + ');
}
