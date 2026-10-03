/**
 * Pipeline HYBRID_SHADOW:
 *   INBOUND -> normalizacion/redaccion PII -> comprension (LLM) -> validacion de esquema ->
 *   reglas deterministas -> guardarrailes de politica -> validacion de memoria -> SHADOW_RESPONSE -> escalamiento humano.
 * Jamas hay outbound. El LLM propone una interpretacion; el motor de reglas es la autoridad final y solo
 * puede RESTRINGIR/ESCALAR: si el resultado hibrido es menos restrictivo que el de reglas en un asunto
 * de seguridad/politica, se restaura la decision de reglas (RULES_OVERRIDE).
 */
import { processMessage, FACT_AMOUNTS } from '../agent.mjs';
import { norm } from '../nlu.mjs';
import { groupFlowFor } from '../groups.mjs';
import { lintReply } from '../lint.mjs';
import { redactPII } from './pii.mjs';
import { SCHEMA_VERSION, validateInterpretation } from './schema.mjs';
import { assertProvider } from './provider.mjs';

export const DEFAULTS = Object.freeze({ timeoutMs: 2000, minConfidence: 0.6, resolveConfidence: 0.75 });
/** Escalamientos por "no entendi": el unico tipo que el LLM puede resolver. Todos los demas son piso duro. */
export const SOFT_REASONS = Object.freeze(['INTENCION_NO_ENTENDIDA', 'CONFIANZA_INSUFICIENTE']);
export const SAFETY_FLAGS = Object.freeze(['PAYMENT_VALIDATION_REQUIRED', 'GUARDARRAIL_OTA', 'DEPOSIT_REQUIRED_POLICY_PENDING_CHANNEL_VALIDATION', 'DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS', 'GROUP_PRICING_APPROVAL', 'STRATEGIC_GROUP_LEAD', 'LARGE_GROUP_FLOW', 'GROUP_SALES_FLOW', 'HUMAN_ALERT_LARGE_GROUP']);

/** Intenciones que, si el LLM las propone, siempre terminan con una persona. */
export const ALWAYS_HUMAN = Object.freeze(['ENVIO_COMPROBANTE', 'DESCUENTO', 'FUERA_DE_ALCANCE', 'ALIADO_CONSULTA', 'ALIADO_LIQUIDACION', 'RECLAMO', 'INCIDENCIA', 'REEMBOLSO', 'HABLAR_CON_HUMANO', 'LLEGADA_INMINENTE', 'GRUPO', 'NO_SHOW']);
const PAYMENT_REPLY = 'Recibido. Lo valido con el equipo y te confirmo.';
const OTA_REPLY = 'Entiendo. Tu reserva por plataforma se rige primero por las condiciones de esa plataforma; paso tu caso con una persona del equipo.';

class ProviderFailure extends Error { constructor(code) { super(code); this.code = code; } }

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => { t = setTimeout(() => rej(new ProviderFailure('PROVIDER_TIMEOUT')), ms); }),
  ]).finally(() => clearTimeout(t));
}

/** Copia el contenido de `src` sobre `target` (la sesion real adopta el estado de la decision elegida). */
function adopt(target, src) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, src);
}

/** Resumen de contexto SIN datos personales para el proveedor. */
export function safeContext(session) {
  const m = session.memory ?? {};
  return { guests: m.guests ?? null, check_in: m.checkIn ?? null, nights: m.nights ?? null, property: m.property ?? null, has_reservation: Boolean(session.reservation), channel: session.reservation?.source ?? null, payment_claimed: Boolean(session.paymentClaimed) };
}

function escalateInPlace(d, reason, note, urgency = 'ALTA') {
  if (!d.escalate) d.escalation = { reason, urgency, note };
  d.escalate = true;
}

function fallbackDecision(rulesD, code) {
  const d = structuredClone(rulesD);
  if (!d.escalate) d.escalation = { reason: `HYBRID_FALLBACK:${code}`, urgency: 'NORMAL', note: 'La comprension por LLM no fue utilizable; el caso pasa a una persona.' };
  d.escalate = true;
  d.flags.push(`HYBRID_FALLBACK:${code}`);
  d.hybrid = { mode: 'hybrid_shadow', used_llm: false, fallback: code, overrides: [] };
  return d;
}

/** Aplica los overrides de seguridad (independientes de lo que diga el LLM). Devuelve { restore, patches }. */
function enforce({ rulesD, hybridD, hybridClone, interp, textNorm }) {
  const restore = [];
  const patches = [];
  // 1. Piso duro de reglas
  if (rulesD.escalate && !SOFT_REASONS.includes(rulesD.escalation?.reason) && !hybridD.escalate) restore.push('RULES_ESCALATION_FLOOR');
  for (const f of SAFETY_FLAGS) if (rulesD.flags.includes(f) && !hybridD.flags.includes(f)) restore.push(`RULES_FLAG_LOST:${f}`);
  if (rulesD.line !== 'GUEST' && hybridD.line !== rulesD.line) restore.push(`RULES_LINE_LOST:${rulesD.line}`);

  // 2. Overrides de seguridad por señal del LLM o del texto
  const otaChannel = /airbnb/.test(textNorm) ? 'AIRBNB' : /booking/.test(textNorm) ? 'BOOKING' : interp.entities.channel;
  const isOta = otaChannel === 'BOOKING' || otaChannel === 'AIRBNB';
  if ((interp.payment_claim || interp.payment_state === 'CLAIMED_PAID' || interp.intent === 'ENVIO_COMPROBANTE') && !hybridD.flags.includes('PAYMENT_VALIDATION_REQUIRED')) {
    hybridD.flags.push('PAYMENT_VALIDATION_REQUIRED');
    hybridD.primary_intent = 'ENVIO_COMPROBANTE';
    escalateInPlace(hybridD, 'VALIDAR_COMPROBANTE', 'Pago declarado: validacion humana obligatoria.');
    hybridD.reply = PAYMENT_REPLY;
    hybridClone.paymentClaimed = true;
    patches.push('PAYMENT_VALIDATION');
  }
  if (interp.intent === 'DESCUENTO' && !hybridD.escalate) {
    escalateInPlace(hybridD, 'DESCUENTO_O_IGUALAR_PRECIO', 'Todo descuento lo decide una persona.');
    hybridD.reply = 'Lo consulto con el equipo para ver qué podemos hacer.';
    patches.push('DISCOUNT_HUMAN');
  }
  if (isOta && ['CANCEL', 'CHANGE', 'NO_SHOW'].includes(interp.reservation_action) && !hybridD.escalate) {
    escalateInPlace(hybridD, 'RESERVA_OTA_REVISION_HUMANA', 'OTA: cancelaciones/cambios/no-show los revisa una persona.');
    hybridD.flags.push('GUARDARRAIL_OTA');
    hybridD.reply = OTA_REPLY;
    patches.push('OTA_CHANGE_HUMAN');
  }
  if (otaChannel === 'AIRBNB' && /50\s?%|el anticipo es/.test(norm(hybridD.reply ?? ''))) {
    hybridD.reply = 'Para reservas por Airbnb, el cobro lo gestiona la plataforma; nosotros no pedimos un anticipo adicional.';
    hybridD.flags.push('DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS');
    patches.push('AIRBNB_NO_EXTRA_DEPOSIT');
  }
  if (interp.intent === 'FUERA_DE_ALCANCE' && hybridD.line !== 'ATHERON_SECURITY' && hybridD.line !== 'ALLY_B2B') {
    hybridD.line = 'ATHERON_SECURITY';
    hybridD.labels.push('ATHERON_SECURITY');
    escalateInPlace(hybridD, 'OTRA_LINEA_DE_NEGOCIO_SECURITY', 'Ruteo a Atheron Security.');
    hybridD.reply = 'Este canal es de reservas de hospedaje. Tu consulta de seguridad la derivamos al equipo de Atheron Security.';
    patches.push('SECURITY_ROUTING');
  }
  const guests = hybridClone.memory?.guests;
  if (guests >= 11 && !hybridD.group_flow) {
    const flow = groupFlowFor(guests);
    hybridD.group_flow = flow;
    hybridD.flags.push(flow, 'GROUP_PRICING_APPROVAL');
    escalateInPlace(hybridD, 'COTIZACION_DE_GRUPO', 'Politica determinista de grupos.');
    patches.push('GROUP_POLICY');
  }
  if (ALWAYS_HUMAN.includes(interp.intent) && !hybridD.escalate) {
    escalateInPlace(hybridD, `LLM_INTENT_${interp.intent}_REQUIERE_PERSONA`, 'La intencion interpretada siempre la atiende una persona.');
    hybridD.reply = 'Paso tu caso con una persona del equipo para revisarlo.';
    patches.push(`ALWAYS_HUMAN:${interp.intent}`);
  }
  if (interp.requires_human && !hybridD.escalate) {
    escalateInPlace(hybridD, 'LLM_REQUIRES_HUMAN', 'La interpretacion pidio revision humana.', 'NORMAL');
    patches.push('REQUIRES_HUMAN');
  }
  // 3. Higiene de la respuesta: ningun monto que no venga de Odoo/politica
  const allowed = [...FACT_AMOUNTS, ...hybridD.odoo.results.flatMap((r) => r.options.flatMap((o) => [o.total, Math.round(o.total * 50) / 100])), ...(hybridClone.lastQuote?.total ? [hybridClone.lastQuote.total, hybridClone.lastQuote.total / 2] : [])];
  if (hybridD.reply && lintReply(hybridD.reply, { allowedAmounts: allowed }).some((v) => v.startsWith('MONTO'))) restore.push('REPLY_AMOUNT_NOT_FROM_ODOO');
  return { restore, patches };
}

/**
 * @param {object} session
 * @param {object} message   { type:'text'|'audio'|..., text|transcript }
 * @param {object} deps      { odoo (guardPort), humanAvailable }
 * @param {{provider:object, timeoutMs?:number, minConfidence?:number, resolveConfidence?:number}} opts
 */
export async function processHybrid(session, message, deps, opts) {
  const { provider } = opts;
  assertProvider(provider);
  const cfg = { ...DEFAULTS, ...opts };
  const started = Date.now();

  const rulesClone = structuredClone(session);
  const rulesD = await processMessage(rulesClone, message, deps);
  const text = message.text ?? message.transcript ?? null;
  const type = message.type ?? 'text';
  if (!(type === 'text' || (type === 'audio' && message.transcript)) || !text) {
    adopt(session, rulesClone);
    rulesD.hybrid = { mode: 'hybrid_shadow', used_llm: false, fallback: null, reason: 'NON_TEXT_MESSAGE', overrides: [] };
    return rulesD;
  }
  const finish = (d, clone, extra) => { adopt(session, clone); d.hybrid = { mode: 'hybrid_shadow', schema_version: SCHEMA_VERSION, latency_ms: Date.now() - started, ...extra }; d.outbound = null; return d; };

  const red = redactPII(text);
  const guestTurns = session.history.filter((h) => h.role === 'guest' && h.text).slice(-5).map((h) => h.text);
  let raw;
  try {
    const payload = { text: red.text, context: safeContext(session), schema_version: SCHEMA_VERSION };
    raw = guestTurns.length >= 1
      ? await withTimeout(provider.interpretConversation({ ...payload, turns: [...guestTurns, red.text] }), cfg.timeoutMs)
      : await withTimeout(provider.interpretMessage(payload), cfg.timeoutMs);
  } catch (e) {
    const code = e instanceof ProviderFailure ? e.code : 'PROVIDER_ERROR';
    return finish(fallbackDecision(rulesD, code), rulesClone, { used_llm: false, fallback: code, overrides: [], redactions: red.redactions });
  }
  if (typeof raw === 'string' || raw == null) return finish(fallbackDecision(rulesD, 'MALFORMED_RESPONSE'), rulesClone, { used_llm: false, fallback: 'MALFORMED_RESPONSE', overrides: [], redactions: red.redactions });
  const v = validateInterpretation(raw);
  if (!v.ok) return finish(fallbackDecision(rulesD, 'SCHEMA_INVALID'), rulesClone, { used_llm: false, fallback: 'SCHEMA_INVALID', schema_errors: v.errors, overrides: [], redactions: red.redactions });
  const interp = v.value;
  if (interp.confidence < cfg.minConfidence) return finish(fallbackDecision(rulesD, 'LOW_CONFIDENCE'), rulesClone, { used_llm: false, fallback: 'LOW_CONFIDENCE', confidence: interp.confidence, overrides: [], redactions: red.redactions });

  const hybridClone = structuredClone(session);
  const hybridD = await processMessage(hybridClone, message, deps, { interpretation: interp, resolveConfidence: session.lastEscalated ? Infinity : cfg.resolveConfidence });
  const { restore, patches } = enforce({ rulesD, hybridD, hybridClone, interp, textNorm: norm(text) });
  const info = { used_llm: true, fallback: null, interpretation: { intent: interp.intent, confidence: interp.confidence }, understanding: hybridD.understanding ?? null, redactions: red.redactions };
  if (restore.length) {
    const d = rulesD;
    d.flags.push('RULES_OVERRIDE');
    return finish(d, rulesClone, { ...info, overrides: restore.map((r) => ({ type: 'RESTORE_RULES_DECISION', why: r })) });
  }
  return finish(hybridD, hybridClone, { ...info, overrides: patches.map((p) => ({ type: 'PATCH', why: p })) });
}

/** Rafaga de burbujas: se agrupan y se responde una vez, igual que processBurst. */
export async function processHybridBurst(session, messages, deps, opts) {
  if (messages.length === 1) return processHybrid(session, messages[0], deps, opts);
  const d = await processHybrid(session, { type: 'text', text: messages.map((x) => x.text ?? '').join(' ') }, deps, opts);
  d.flags.push(`RAFAGA_AGRUPADA:${messages.length}`);
  return d;
}
