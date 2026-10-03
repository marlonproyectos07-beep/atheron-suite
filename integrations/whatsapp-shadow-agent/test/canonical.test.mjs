/**
 * GOAL-WHATSAPP-CANONICAL-002 -- pruebas de consolidacion de la linea canonica.
 * BRAND-001, kill switch, shadow-only, call events, audio port, canales de
 * anticipo, memoria multi-turno, grupos, seguridad de intencion y los 20
 * mensajes C01-C20.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSession, processMessage, processBurst } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from './fake-odoo.mjs';
import { resolveConfig, outboundGate, ConfigError } from '../src/config.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { processCallEvent, CALL_EVENTS } from '../src/calls.mjs';
import { NullTranscription, audioToText, processAudioMessage, AUDIO_MIN_CONFIDENCE } from '../src/audio.mjs';
import { runCase } from '../src/playbook-harness.mjs';
import { SPECS } from '../specs/playbook-specs.mjs';
import { norm } from '../src/nlu.mjs';
import { CANONICAL } from './generalization-canonical.mjs';
import { BLIND } from './generalization-blind.mjs';
import { BLIND as BLIND2 } from './generalization-blind2.mjs';
import { BLIND as BLIND3 } from './generalization-blind3.mjs';
import { HELD_OUT } from './generalization.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const mk = () => {
  const fake = makeFakeOdoo();
  return { fake, deps: { odoo: guardPort(fake), humanAvailable: true }, session: createSession({ id: 'canon' }) };
};
const say = (c, text) => processMessage(c.session, { type: 'text', text }, c.deps);
const all = [...HELD_OUT, ...BLIND, ...BLIND2, ...BLIND3, ...CANONICAL];

// ---- marca --------------------------------------------------------------------------------------------------------
test('BRAND-001: ninguna respuesta customer-facing dice "Hoteles Atero"', async () => {
  const replies = [];
  for (const h of all) replies.push((await say(mk(), h.text)).reply);
  const data = JSON.parse(readFileSync(join(root, 'AI', 'whatsapp', 'playbook-cases.v0.1.json'), 'utf8'));
  for (const c of data.cases) replies.push((await runCase(c, SPECS[c.id])).reply);
  for (const t of ['¿Cuál es la política de cancelación?', '¿Cuánto debo abonar?', 'Quiero cancelar mi reserva directa']) replies.push((await say(mk(), t)).reply);
  replies.push(processCallEvent(createSession(), { type: 'MISSED_CALL' }, { classification: 'GUEST_LEAD' }).reply);
  const spoken = replies.filter(Boolean);
  assert.ok(spoken.length > 150);
  for (const r of spoken) assert.doesNotMatch(r, /\bAtero\b/i, r);
  assert.ok(spoken.some((r) => /Hoteles Atheron/.test(r)), 'la marca oficial aparece en las respuestas');
});

test('BRAND-001: el codigo fuente no contiene "Atero" y la propiedad conserva "Hotel Atheron Suite"', () => {
  for (const f of readdirSync(join(here, '..', 'src'))) assert.doesNotMatch(readFileSync(join(here, '..', 'src', f), 'utf8'), /\bAtero\b/, f);
  assert.match(readFileSync(join(here, '..', 'src', 'policy.mjs'), 'utf8'), /name: 'Hotel Atheron Suite'/);
});

// ---- kill switch / shadow -----------------------------------------------------------------------------------------------
test('kill switch: por defecto WHATSAPP_AUTOMATION_ENABLED=false y modo shadow', () => {
  const cfg = resolveConfig({});
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.mode, 'shadow');
  assert.equal(resolveConfig({ WHATSAPP_AUTOMATION_ENABLED: 'true' }).enabled, true);
});

test('kill switch: con ENABLED=false ningun outbound sale y el agente no analiza (mensaje, llamada ni audio)', async () => {
  const rt = createRuntime({ env: { WHATSAPP_AUTOMATION_ENABLED: 'false' } });
  const c = mk();
  const msg = await rt.handleMessage(c.session, { type: 'text', text: 'Hola, ¿hay habitación para mañana, somos 2?' }, c.deps);
  const call = await rt.handleCallEvent(c.session, { type: 'MISSED_CALL' }, c.deps);
  const audio = await rt.handleAudio(c.session, { type: 'audio', media_id: 'm1' }, c.deps, new NullTranscription());
  for (const r of [msg, call, audio]) {
    assert.equal(r.suppressed, true);
    assert.equal(r.outbound, null);
    assert.equal(r.reply, null);
  }
  assert.equal(c.fake.calls.length, 0, 'ni siquiera consulta Odoo');
  assert.equal(c.session.history.length, 0, 'no analiza');
  assert.equal(outboundGate({ enabled: false, mode: 'shadow' }).allowed, false);
});

test('shadow-only: aun con ENABLED=true el outbound sigue siendo null; supervised/auto no estan autorizados', async () => {
  const rt = createRuntime({ env: { WHATSAPP_AUTOMATION_ENABLED: 'true' } });
  const c = mk();
  const d = await rt.handleMessage(c.session, { type: 'text', text: 'Hola, ¿hay habitación para mañana, somos 2?' }, c.deps);
  assert.equal(d.mode, 'SHADOW');
  assert.equal(d.outbound, null);
  assert.ok(d.reply);
  assert.equal(outboundGate({ enabled: true, mode: 'shadow' }).allowed, false);
  for (const mode of ['supervised', 'auto_offhours', 'auto']) {
    assert.throws(() => resolveConfig({ WHATSAPP_AUTOMATION_MODE: mode, WHATSAPP_AUTOMATION_ENABLED: 'true' }), (e) => e instanceof ConfigError && e.code === 'MODE_NOT_ENABLED');
  }
  assert.throws(() => resolveConfig({ WHATSAPP_AUTOMATION_MODE: 'turbo' }), (e) => e.code === 'UNKNOWN_MODE');
  const gw = c.deps.odoo;
  for (const op of ['hold', 'createHold', 'cancel', 'registerPayment', 'send']) assert.throws(() => gw[op](), /SHADOW_MODE_FORBIDS/);
});

// ---- call events ------------------------------------------------------------------------------------------------------------
test('call events: MISSED_CALL y CALL_REQUEST -> propuesta SHADOW + CALLBACK_HUMAN, sin llamada real', () => {
  assert.deepEqual([...CALL_EVENTS], ['MISSED_CALL', 'CALL_REQUEST']);
  for (const type of CALL_EVENTS) {
    const s = createSession();
    s.lastQuote = { total: 120000 };
    const r = processCallEvent(s, { type });
    assert.equal(r.classification, 'GUEST_LEAD');
    assert.equal(r.callback.task, 'CALLBACK_HUMAN');
    assert.equal(r.escalation.reason, 'CALLBACK_HUMAN');
    assert.equal(r.call_placed, false);
    assert.equal(r.outbound, null);
    assert.equal(r.mode, 'SHADOW');
    assert.match(r.reply, /Hoteles Atheron/);
  }
  const res = createSession();
  res.reservation = { property: 'AS', source: 'DIRECT', checkIn: '2026-10-04' };
  assert.equal(processCallEvent(res, { type: 'MISSED_CALL' }).priority, 'P1');
  const sec = processCallEvent(createSession(), { type: 'CALL_REQUEST' }, { classification: 'ATHERON_SECURITY' });
  assert.equal(sec.reply, null);
  assert.throws(() => processCallEvent(createSession(), { type: 'VIDEO_CALL' }), /CALL_EVENT_UNKNOWN/);
});

// ---- audio port ----------------------------------------------------------------------------------------------------------------------
test('audio port: confianza < 0.6 o sin transcripcion -> ESCALATE_HUMAN; sin proveedor ni outbound', async () => {
  assert.equal(AUDIO_MIN_CONFIDENCE, 0.6);
  const none = await processAudioMessage(mk().session, { media_id: 'a1' }, mk().deps, new NullTranscription());
  assert.equal(none.escalate, true);
  assert.equal(none.audio.transcribed, false);
  assert.equal(none.outbound, null);
  const low = { async transcribe() { return { ok: true, text: 'hola quiero reservar', confidence: 0.59 }; } };
  const d1 = await processAudioMessage(mk().session, { media_id: 'a2' }, mk().deps, low);
  assert.equal(d1.escalate, true);
  assert.equal((await audioToText({ media_id: 'a2' }, low)).ok, false);
});

test('audio port: confianza >= 0.6 -> transcripcion -> intencion -> SHADOW_RESPONSE textual', async () => {
  const good = { async transcribe() { return { ok: true, text: 'hola somos dos para el 20 de noviembre', confidence: 0.85 }; } };
  const c = mk();
  const d = await processAudioMessage(c.session, { media_id: 'a3' }, c.deps, good);
  assert.equal(d.audio.transcribed, true);
  assert.equal(d.mode, 'SHADOW');
  assert.equal(d.outbound, null);
  assert.ok(d.reply && c.fake.calls.length > 0);
  await assert.rejects(() => audioToText({}, {}), /TRANSCRIPTION_PORT_MISSING_METHOD/);
});

// ---- politicas de anticipo por canal ---------------------------------------------------------------------------------
test('anticipo DIRECTO: 50 %', async () => {
  const c = mk();
  c.session.lastQuote = { property: 'AS', checkIn: '2026-10-10', checkOut: '2026-10-13', nights: 3, guests: 2, unit: '302', total: 360000 };
  const d = await say(c, '¿Cuánto debo abonar?');
  assert.match(d.reply, /50%/);
  assert.match(d.reply, /\$180\.000/);
});

test('anticipo BOOKING: DEPOSIT_REQUIRED_POLICY_PENDING_CHANNEL_VALIDATION; no afirma 50 %, no confirma pago, no cancela', async () => {
  const d = await say(mk(), 'reservé en booking, ustedes me piden abono?');
  assert.ok(d.flags.includes('DEPOSIT_REQUIRED_POLICY_PENDING_CHANNEL_VALIDATION'));
  assert.equal(d.escalate, true);
  assert.doesNotMatch(d.reply, /50\s?%/);
  assert.doesNotMatch(norm(d.reply), /(cancel|pago (recibido|confirmado))/);
  assert.equal(d.outbound, null);
});

test('anticipo AIRBNB: no se solicita anticipo adicional', async () => {
  const d = await say(mk(), 'tengo una reserva por airbnb, tengo que pagarles algún adelanto?');
  assert.ok(d.flags.includes('DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS'));
  assert.doesNotMatch(d.reply, /50\s?%/);
  assert.match(norm(d.reply), /no pedimos un anticipo adicional/);
  assert.equal(d.escalate, false);
});

// ---- seguridad de intencion y pagos ------------------------------------------------------------------------------------
test('intencion desconocida: "el jueves nos vemos en la plaza" no es disponibilidad y no contamina la memoria', async () => {
  const c = mk();
  const d = await say(c, 'el jueves nos vemos en la plaza');
  assert.equal(d.primary_intent, 'INTENCION_NO_ENTENDIDA');
  assert.equal(d.escalate, true);
  assert.equal(c.fake.calls.length, 0);
  assert.equal(c.session.memory.checkIn, undefined, 'el jueves no queda como fecha de reserva');
  const d2 = await say(c, 'somos dos');
  assert.equal(c.fake.calls.length, 0, 'sin fecha real no se consulta Odoo');
  assert.match(d2.reply, /fecha/i);
});

test('pago: "les envié el pago por Nequi, ya me confirman?" -> PAYMENT_VALIDATION_REQUIRED -> humano', async () => {
  const d = await say(mk(), 'les envié el pago por Nequi, ya me confirman?');
  assert.ok(d.flags.includes('PAYMENT_VALIDATION_REQUIRED'));
  assert.equal(d.escalate, true);
  assert.doesNotMatch(norm(d.reply), /confirmad[ao]|queda confirmada/);
});

test('descuento: siempre humano', async () => {
  const d = await say(mk(), 'me puede rebajar un poquito si me quedo tres noches?');
  assert.equal(d.escalate, true);
});

// ---- memoria multi-turno ---------------------------------------------------------------------------------------------------
test('memoria: "Hola" / "somos dos" / "para mañana" -> un solo contexto sin repetir preguntas', async () => {
  const c = mk();
  const a = await say(c, 'Hola');
  const b = await say(c, 'somos dos');
  const d = await say(c, 'para mañana');
  assert.equal(c.session.memory.guests, 2);
  assert.equal(c.session.memory.checkIn, '2026-10-04');
  assert.match(a.reply ?? '', /\?/);
  assert.doesNotMatch(d.reply, /cu[aá]ntas personas|para qu[eé] fecha/i);
  assert.ok(c.fake.calls.length >= 1);
  assert.doesNotMatch(b.reply ?? '', /cu[aá]ntas personas/i, 'no vuelve a preguntar pax');
});

test('memoria: cambio de pax, cambio de fecha y rafaga fragmentada', async () => {
  const c = mk();
  await say(c, 'Hola'); await say(c, 'somos dos'); await say(c, 'para mañana');
  await say(c, 'mejor somos 3');
  assert.equal(c.session.memory.guests, 3);
  await say(c, 'mejor el sábado 10');
  assert.equal(c.session.memory.checkIn, '2026-10-10');
  assert.equal(c.session.memory.guests, 3);
  const b = mk();
  const d = await processBurst(b.session, [{ text: 'Hola' }, { text: 'somos dos' }, { text: 'para mañana' }], b.deps);
  assert.equal(b.session.memory.guests, 2);
  assert.equal(b.session.memory.checkIn, '2026-10-04');
  assert.ok(d.flags.some((f) => f.startsWith('RAFAGA_AGRUPADA')));
});

test('memoria: la propiedad se mantiene entre turnos', async () => {
  const c = mk();
  await say(c, 'Hola, me interesa Casa Neusa');
  await say(c, 'somos 4');
  assert.equal(c.session.memory.property, 'CN');
});

test('huesped vs aliado y Hoteles Atheron vs Atheron Security', async () => {
  const ally = await say(mk(), 'somos una agencia de viajes y queremos una tarifa para nuestros clientes');
  assert.equal(ally.line, 'ALLY_B2B');
  assert.equal(ally.reply, null);
  const sec = await say(mk(), 'queremos instalar alarmas y cámaras en nuestro negocio, quién nos asesora?');
  assert.equal(sec.line, 'ATHERON_SECURITY');
  assert.equal(sec.escalate, true);
  const guest = await say(mk(), 'Hola, ¿hay habitación para el 20 de noviembre, somos 2?');
  assert.equal(guest.line, 'GUEST');
});

// ---- grupos -----------------------------------------------------------------------------------------------------------------------------
test('grupos: >=11 GROUP_SALES_FLOW; >=30 LARGE_GROUP_FLOW con alerta humana; >=100 STRATEGIC_GROUP_LEAD', async () => {
  const g11 = await say(mk(), 'somos 11 personas para el 20 de noviembre');
  assert.equal(g11.group_flow, 'GROUP_SALES_FLOW');
  assert.equal(g11.escalate, true);
  assert.ok(!g11.flags.includes('HUMAN_ALERT_LARGE_GROUP'));
  const g35 = await say(mk(), 'somos 35 personas para el 20 de noviembre');
  assert.equal(g35.group_flow, 'LARGE_GROUP_FLOW');
  assert.ok(g35.flags.includes('HUMAN_ALERT_LARGE_GROUP'));
  const g100 = await say(mk(), 'somos 100 personas para el 20 de noviembre');
  assert.equal(g100.group_flow, 'STRATEGIC_GROUP_LEAD');
  assert.ok(g100.labels.includes('STRATEGIC_GROUP_LEAD'));
});

test('150 pax: nunca promete capacidad, ni descuento, ni HOLD; GROUP_PRICING_APPROVAL; humano', async () => {
  const c = mk();
  const d = await say(c, 'somos 150 personas, 3 noches desde el 12 de diciembre');
  assert.equal(d.group_flow, 'STRATEGIC_GROUP_LEAD');
  assert.ok(d.flags.includes('GROUP_PRICING_APPROVAL'));
  assert.equal(d.escalate, true);
  assert.equal(d.group.can_promise_capacity, false);
  assert.equal(d.group.hold_allowed, false);
  assert.equal(d.hold, null);
  assert.doesNotMatch(norm(d.reply), /descuento|caben|garantiz|confirmad/);
  assert.ok(!/\d{2,3}\.\d{3}/.test(d.reply), 'sin precios inventados');
  for (const call of c.fake.calls) assert.ok(call.req.guests <= 22, 'solo capacidad verificada (22), nunca 150');
});

// ---- horarios, cancelacion y datos faltantes ---------------------------------------------------------------------------------
test('horarios: Atheron Suite 15:00/11:00, nunca 00:00; propiedad sin dato verificado -> DATA_GAP + humano', async () => {
  const d = await say(mk(), '¿A qué hora es el check in y el check out en Hotel Atheron Suite?');
  assert.match(d.reply, /15:00/);
  assert.match(d.reply, /11:00/);
  assert.doesNotMatch(d.reply, /00:00/);
  const gap = await say(mk(), '¿A qué hora es el check in en Casa Algarra?');
  assert.equal(gap.escalate, true);
  assert.ok(gap.data_gaps.some((x) => x.startsWith('DATA_GAP')));
});

test('cancelacion directa: >=48 h explica (sin efectivo, saldo 6 meses); OTA y no-show -> humano', async () => {
  const c = mk();
  c.session.reservation = { property: 'AS', source: 'DIRECT', has_payment: true, checkIn: '2026-10-20', checkOut: '2026-10-21', nights: 1, guests: 2 };
  const d = await say(c, 'Quiero cancelar mi reserva');
  assert.equal(d.escalate, false);
  assert.match(d.reply, /no hay devoluci[oó]n en efectivo/);
  assert.match(d.reply, /6 meses/);
  assert.match(d.reply, /Hoteles Atheron/);
  const ota = mk();
  ota.session.reservation = { property: 'AS', source: 'BOOKING', has_payment: true, checkIn: '2026-10-20', checkOut: '2026-10-21', nights: 1, guests: 2 };
  assert.equal((await say(ota, 'Quiero cancelar mi reserva')).escalate, true);
  const ns = await say(mk(), 'no llegamos ayer, qué pasó con mi reserva?');
  assert.equal(ns.escalate, true);
});

test('Odoo: sigue PENDING_EXTERNAL_AUTHENTICATED_TEST y UNIT_ID_MAP parcial (solo Atheron Suite mapeada)', async () => {
  const { POLICY, PROPERTIES } = await import('../src/policy.mjs');
  assert.equal(POLICY.odoo_staging_live_validation, 'PENDING_EXTERNAL_AUTHENTICATED_TEST');
  assert.deepEqual(Object.values(PROPERTIES).filter((p) => p.odoo_mapped).map((p) => p.key), ['AS']);
});

// ---- 20 mensajes nuevos --------------------------------------------------------------------------------------------------------------
for (const h of CANONICAL) {
  test(`canonico ${h.id}: ${h.text}`, async () => {
    const c = mk();
    const d = await say(c, h.text);
    assert.ok(new Set([...d.intents, d.primary_intent]).has(h.intent), `intent ${h.intent} vs [${d.intents}]`);
    assert.equal(d.escalate, h.esc);
    if (h.odoo !== undefined) assert.equal(c.fake.calls.length > 0, h.odoo);
    if (h.line) assert.equal(d.line, h.line);
    if (h.must) assert.match(norm(d.reply ?? ''), h.must);
    if (h.mustNot) assert.doesNotMatch(norm(d.reply ?? ''), h.mustNot);
    assert.equal(d.outbound, null);
  });
}
