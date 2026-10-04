/**
 * GOAL-WHATSAPP-HYBRID-001 -- pruebas de arquitectura y seguridad del piloto HIBRIDO en SHADOW.
 * Los mocks NO son un LLM: validan el esquema, el pipeline, el piso de reglas y la privacidad.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSession, processMessage } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from './fake-odoo.mjs';
import { SCHEMA_VERSION, validateInterpretation, makeInterpretation } from '../src/hybrid/schema.mjs';
import { MockUnderstandingProvider, assertProvider, getRealProvider, REAL_PROVIDERS, ProviderDisabledError } from '../src/hybrid/provider.mjs';
import { processHybrid, processHybridBurst } from '../src/hybrid/pipeline.mjs';
import { validateMemoryUpdate } from '../src/hybrid/memory.mjs';
import { redactPII } from '../src/hybrid/pii.mjs';
import { benchmarkProvider } from '../src/hybrid/benchmark.mjs';
import { resolveConfig, ConfigError } from '../src/config.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { runCase, parseInput } from '../src/playbook-harness.mjs';
import { BLIND_V2 } from './blind-v2-50.mjs';
import { BLIND_V3 } from './blind-v3-100.mjs';
import { OracleMock, adversarialMock, benignMock, chaosMock } from './hybrid-mocks.mjs';
import { norm } from '../src/nlu.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
// telefonos ficticios construidos en ejecucion para no dejar literales con forma de telefono en el repo
const PHONE = ['310', '555', '1234'].join('');
const PHONE_57 = `+57 ${['300', '123', '4567'].join('')}`;
const mk = () => {
  const fake = makeFakeOdoo();
  return { fake, deps: { odoo: guardPort(fake), humanAvailable: true }, session: createSession({ id: 'hyb' }) };
};
const prov = (script, extra = {}) => new MockUnderstandingProvider({ script, ...extra });
const say = (c, text, provider, opts = {}) => processHybrid(c.session, { type: 'text', text }, c.deps, { provider, timeoutMs: 30, ...opts });
const interp = (o) => prov(() => makeInterpretation(o));

// ---- esquema ---------------------------------------------------------------------------------------------------------
test('esquema: una interpretacion valida pasa y queda congelada', () => {
  const r = validateInterpretation(makeInterpretation({ intent: 'CHECKIN', entities: { dates: ['2026-11-14'], pax: 2 } }));
  assert.equal(r.ok, true);
  assert.equal(r.value.schema_version, SCHEMA_VERSION);
  assert.ok(Object.isFrozen(r.value));
});

test('esquema: rechaza campos desconocidos, intents fuera del catalogo, tipos y rangos invalidos, texto libre', () => {
  const bad = [
    null, 'texto libre', [], {},
    { ...makeInterpretation(), extra: 1 },
    makeInterpretation({ intent: 'CONCEDER_DESCUENTO' }),
    makeInterpretation({ confidence: 1.5 }),
    makeInterpretation({ confidence: '0.9' }),
    makeInterpretation({ schema_version: '9.9' }),
    makeInterpretation({ payment_claim: 'si' }),
    makeInterpretation({ ambiguities: ['el cliente parece confundido'] }), // texto libre
    makeInterpretation({ entities: { pax: 0 } }),
    makeInterpretation({ entities: { pax: 1000 } }),
    makeInterpretation({ entities: { pax: 2.5 } }),
    makeInterpretation({ entities: { dates: ['14/11/2026'] } }),
    makeInterpretation({ entities: { dates: ['2026-11-14', '2026-11-10'] } }),
    makeInterpretation({ entities: { property: 'HOTEL_INVENTADO' } }),
    makeInterpretation({ entities: { channel: 'EXPEDIA' } }),
    makeInterpretation({ entities: { precio_final: 100 } }),
    makeInterpretation({ reservation_action: 'CONFIRM_PAYMENT' }),
  ];
  for (const b of bad) assert.equal(validateInterpretation(b).ok, false, JSON.stringify(b));
});

// ---- proveedor -----------------------------------------------------------------------------------------------------------
test('proveedor: la interfaz exige interpretMessage/interpretConversation/health y todos los reales estan DISABLED', async () => {
  assert.equal(assertProvider(new MockUnderstandingProvider({ script: () => null })), true);
  assert.throws(() => assertProvider({ interpretMessage() {} }), /MISSING_METHOD/);
  assert.deepEqual(await new MockUnderstandingProvider({ script: () => null }).health(), { ok: true, provider: 'mock', mock: true });
  for (const name of ['openai', 'anthropic', 'gemini', 'other']) {
    assert.equal(REAL_PROVIDERS[name].enabled, false);
    assert.throws(() => getRealProvider(name), ProviderDisabledError);
  }
});

test('el codigo hibrido no tiene red, claves ni SDKs de proveedores', () => {
  for (const f of readdirSync(join(here, '..', 'src', 'hybrid'))) {
    const src = readFileSync(join(here, '..', 'src', 'hybrid', f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(|\bhttps?:\/\/|api[_-]?key|process\.env|from ['"](openai|@anthropic-ai|@google)/i, f);
  }
});

// ---- fallos del proveedor -> ESCALATE_HUMAN ------------------------------------------------------------------------------
test('esquema invalido, respuesta malformada, error y timeout -> ESCALATE_HUMAN con HYBRID_FALLBACK', async () => {
  const cases = [
    ['SCHEMA_INVALID', prov(() => ({ intent: 'CONSULTA_DISPONIBILIDAD', confidence: 9 }))],
    ['MALFORMED_RESPONSE', prov(() => 'Creo que quiere reservar')],
    ['MALFORMED_RESPONSE', prov(() => null)],
    ['PROVIDER_ERROR', prov(() => { throw new Error('503'); })],
    ['PROVIDER_TIMEOUT', prov(() => new Promise(() => {}))],
  ];
  for (const [code, p] of cases) {
    const c = mk();
    const d = await say(c, 'a que hora es el check in?', p);
    assert.equal(d.escalate, true, code);
    assert.ok(d.flags.includes(`HYBRID_FALLBACK:${code}`), `${code}: ${d.flags}`);
    assert.equal(d.hybrid.used_llm, false);
    assert.equal(d.outbound, null);
  }
});

test('baja confianza (< 0.6) -> ESCALATE_HUMAN', async () => {
  const d = await say(mk(), 'a que hora es el check in?', interp({ intent: 'CHECKIN', confidence: 0.59 }));
  assert.equal(d.escalate, true);
  assert.ok(d.flags.includes('HYBRID_FALLBACK:LOW_CONFIDENCE'));
});

// ---- el LLM resuelve lo que las reglas no entienden (cuando es verificable) ---------------------------------------------
test('gap-fill: LLM con alta confianza y evidencia textual resuelve "precios?" que las reglas dejaban en humano', async () => {
  const c = mk();
  const rules = await processMessage(createSession(), { type: 'text', text: 'precios?' }, c.deps);
  assert.equal(rules.escalate, true);
  const d = await say(c, 'precios?', interp({ intent: 'CONSULTA_PRECIO', confidence: 0.9 }));
  assert.equal(d.escalate, false);
  assert.equal(d.hybrid.used_llm, true);
  assert.ok(d.understanding.accepted.some((a) => a.why === 'GAP_FILL'));
});

test('gap-fill: no se acepta con confianza < 0.75, sin evidencia textual ni con vocabulario sensible', async () => {
  const lowish = await say(mk(), 'precios?', interp({ intent: 'CONSULTA_PRECIO', confidence: 0.7 }));
  assert.equal(lowish.escalate, true);
  const noEvidence = await say(mk(), 'feliz cumple jefe, que lo disfrute', interp({ intent: 'CONSULTA_DISPONIBILIDAD', confidence: 0.99 }));
  assert.equal(noEvidence.escalate, true);
  const sensitive = await say(mk(), 'la habitacion estaba sucia, que desastre', interp({ intent: 'CONSULTA_DISPONIBILIDAD', confidence: 0.99 }));
  assert.equal(sensitive.escalate, true);
  assert.doesNotMatch(norm(sensitive.reply ?? ''), /cuantas personas|para que fecha/);
});

test('un caso ya en manos humanas no se re-automatiza por un LLM (traspaso pegajoso)', async () => {
  const c = mk();
  const first = await say(c, 'jajaja eso fue lo que dijo mi mama', interp({ intent: 'INTENCION_NO_ENTENDIDA', confidence: 0.9 }));
  assert.equal(first.escalate, true);
  const second = await say(c, 'precios?', interp({ intent: 'CONSULTA_PRECIO', confidence: 0.99 }));
  assert.equal(second.escalate, true);
});

// ---- las reglas anulan al LLM ---------------------------------------------------------------------------------------------------
test('pago: aunque el LLM diga disponibilidad y payment_claim=false, "ya hice el nequi" -> PAYMENT_VALIDATION_REQUIRED', async () => {
  const d = await say(mk(), 'ya les hice el nequi, quedo listo?', adversarialMock());
  assert.ok(d.flags.includes('PAYMENT_VALIDATION_REQUIRED'));
  assert.equal(d.escalate, true);
  assert.doesNotMatch(norm(d.reply), /confirmad/);
});

test('pago: si las reglas no ven el pago pero el LLM si (payment_claim) -> PAYMENT_VALIDATION_REQUIRED', async () => {
  const d = await say(mk(), 'ahi te mande la platica de la pieza', interp({ intent: 'ENVIO_COMPROBANTE', payment_claim: true, payment_state: 'CLAIMED_PAID' }));
  assert.ok(d.flags.includes('PAYMENT_VALIDATION_REQUIRED'));
  assert.equal(d.escalate, true);
});

test('descuento: siempre humano, diga lo que diga el LLM', async () => {
  for (const p of [adversarialMock(), benignMock(), interp({ intent: 'DESCUENTO', confidence: 0.99 })]) {
    const d = await say(mk(), 'hacen precio especial si me quedo una semana?', p);
    assert.equal(d.escalate, true);
    assert.doesNotMatch(norm(d.reply), /te hacemos|te damos|descuento del/);
  }
  const viaLlm = await say(mk(), 'ay pues usted sabra si me da una ayudita con el precio', interp({ intent: 'DESCUENTO', confidence: 0.9 }));
  assert.equal(viaLlm.escalate, true);
});

test('OTA: cambio/cancelacion/no-show de Booking o Airbnb -> humano, aunque el LLM diga DIRECT o disponibilidad', async () => {
  for (const text of ['puedo mover mi reserva de airbnb para el 22 de noviembre?', 'quiero cancelar mi reserva de booking', 'no pude viajar el sabado, tenia reserva por airbnb']) {
    const d = await say(mk(), text, adversarialMock());
    assert.equal(d.escalate, true, text);
    assert.doesNotMatch(norm(d.reply), /queda cancelad|cancelamos tu reserva/);
  }
  const viaLlm = await say(mk(), 'bueno ya no me sirve la que tengo en esa pagina', interp({ intent: 'CANCELACION', reservation_action: 'CANCEL', entities: { channel: 'BOOKING' }, reservation_state: 'EXISTING_OTA' }));
  assert.equal(viaLlm.escalate, true);
});

test('Airbnb: nunca se pide anticipo adicional (ni siquiera si el LLM dice DIRECT)', async () => {
  const d = await say(mk(), 'tengo reserva por airbnb, tengo que pagar anticipo con ustedes?', interp({ intent: 'ANTICIPO', entities: { channel: 'DIRECT' } }));
  assert.doesNotMatch(d.reply, /50\s?%|el anticipo es/);
  assert.ok(d.flags.includes('DEPOSIT_NOT_REQUESTED_AIRBNB_COLLECTS'));
});

test('Security: se enruta a Atheron Security aunque el LLM diga otra cosa; y por el LLM si las reglas no lo ven', async () => {
  const a = await say(mk(), 'ustedes ponen alarmas para casas?', benignMock());
  assert.equal(a.line, 'ATHERON_SECURITY');
  const b = await say(mk(), 'necesito proteger mi bodega de ladrones con sensores', interp({ intent: 'FUERA_DE_ALCANCE', confidence: 0.95 }));
  assert.equal(b.line, 'ATHERON_SECURITY');
  assert.equal(b.escalate, true);
});

test('grupo de 150: politica determinista (STRATEGIC_GROUP_LEAD), sin cupo ni descuento, aunque el LLM diga pax=2', async () => {
  const c = mk();
  const d = await say(c, 'somos 150 personas, 3 noches desde el 12 de diciembre', interp({ intent: 'CONSULTA_DISPONIBILIDAD', entities: { pax: 2, dates: ['2026-12-12'] } }));
  assert.equal(d.group_flow, 'STRATEGIC_GROUP_LEAD');
  assert.equal(d.escalate, true);
  assert.equal(d.hold, null);
  assert.doesNotMatch(norm(d.reply), /descuento|caben|garantiz|tenemos cupo/);
  for (const call of c.fake.calls) assert.ok(call.req.guests <= 22);
  // y si solo el LLM sabe el tamano ("ciento cincuenta"), la politica de grupos igualmente se aplica
  const e = await say(mk(), 'seremos como ciento cincuenta invitados el 12 de diciembre', interp({ intent: 'GRUPO', entities: { pax: 150, dates: ['2026-12-12'] } }));
  assert.equal(e.escalate, true);
});

test('regla fundamental: el LLM nunca debilita al motor de reglas (piso de escalamiento) sobre V2 y V3 con LLM adversarial y benigno', async () => {
  for (const mkProvider of [adversarialMock, benignMock]) {
    for (const cse of [...BLIND_V2, ...BLIND_V3]) {
      const fake = makeFakeOdoo();
      const deps = { odoo: guardPort(fake), humanAvailable: true };
      const rs = createSession();
      const hs = createSession();
      const p = mkProvider();
      for (const t of cse.turns) {
        const m = typeof t === 'string' ? { type: 'text', text: t } : { type: 'audio', transcript: t.transcript, confidence: t.confidence };
        const r = await processMessage(rs, m, deps);
        const h = await processHybrid(hs, m, deps, { provider: p, timeoutMs: 30 });
        if (r.escalate && !['INTENCION_NO_ENTENDIDA', 'CONFIANZA_INSUFICIENTE'].includes(r.escalation?.reason)) assert.equal(h.escalate, true, `${cse.id}: ${t}`);
        if (r.line !== 'GUEST') assert.equal(h.line, r.line, cse.id);
        for (const f of r.flags.filter((x) => /^(PAYMENT_VALIDATION|GUARDARRAIL|DEPOSIT_|GROUP_|STRATEGIC|LARGE_GROUP)/.test(x))) assert.ok(h.flags.includes(f), `${cse.id}: perdio ${f}`);
        assert.equal(h.outbound, null);
      }
    }
  }
});

test('Playbook T01-T100 en modo hibrido con LLM adversarial: sin outbound y sin debilitar escalamientos duros', async () => {
  const data = JSON.parse(readFileSync(join(root, 'AI', 'whatsapp', 'playbook-cases.v0.1.json'), 'utf8'));
  assert.equal(data.cases.length, 100);
  for (const c of data.cases) {
    const fake = makeFakeOdoo();
    const deps = { odoo: guardPort(fake), humanAvailable: true };
    const rs = createSession();
    const hs = createSession();
    const p = adversarialMock();
    for (const m of parseInput(c.input)) {
      const r = await processMessage(rs, m, deps);
      const h = await processHybrid(hs, m, deps, { provider: p, timeoutMs: 30 });
      if (r.escalate && !['INTENCION_NO_ENTENDIDA', 'CONFIANZA_INSUFICIENTE'].includes(r.escalation?.reason)) assert.equal(h.escalate, true, `${c.id}`);
      assert.equal(h.outbound, null);
    }
  }
});

test('CEO_CASES en modo hibrido (LLM adversarial y benigno): descuento, abono 50 %, cancelacion, pago, grupo y desconocido se mantienen', async () => {
  for (const mkProvider of [adversarialMock, benignMock]) {
    for (const t of ['¿Me haces un descuento?', 'Hazme una rebaja', 'Necesito un mejor precio']) {
      const d = await say(mk(), t, mkProvider());
      assert.equal(d.escalate, true, t);
    }
    const q = mk();
    q.session.lastQuote = { property: 'AS', checkIn: '2026-10-10', checkOut: '2026-10-13', nights: 3, guests: 2, unit: '302', total: 360000 };
    const ab = await say(q, '¿Cuánto debo abonar?', mkProvider());
    assert.match(ab.reply, /50%/);
    assert.match(ab.reply, /\$180\.000/);
    const cx = mk();
    cx.session.reservation = { property: 'AS', source: 'DIRECT', has_payment: true, checkIn: '2026-10-20', checkOut: '2026-10-21', nights: 1, guests: 2 };
    const pol = await say(cx, 'Quiero cancelar mi reserva', mkProvider());
    assert.equal(pol.escalate, false);
    assert.match(pol.reply, /6 meses/);
    assert.equal((await say(mk(), 'les envié el pago por Nequi, ya me confirman?', mkProvider())).escalate, true);
    assert.equal((await say(mk(), 'el jueves nos vemos en la plaza', mkProvider())).escalate, true);
  }
});

// ---- memoria ---------------------------------------------------------------------------------------------------------------------------
test('contaminacion de memoria: un comentario casual no se vuelve reserva aunque el LLM extraiga fecha, pax y propiedad', async () => {
  const c = mk();
  const d = await say(c, 'el viernes jugamos micro en la cancha del colegio', adversarialMock());
  assert.equal(d.escalate, true);
  assert.equal(c.session.memory.checkIn, undefined);
  assert.equal(c.session.memory.guests, undefined);
  assert.equal(c.session.memory.property, undefined);
  assert.equal(c.fake.calls.length, 0);
});

test('validateMemoryUpdate: rechaza pax no fundamentado, reemplazo dudoso, propiedad inventada, monto y fecha incoherente', () => {
  const ctx = (o = {}) => ({ text: 'quiero una habitacion para 14 de noviembre', intents: ['CONSULTA_DISPONIBILIDAD'], llmIntent: 'CONSULTA_DISPONIBILIDAD', memory: {}, today: '2026-10-03', ambiguities: [], ...o });
  assert.deepEqual(validateMemoryUpdate({ pax: 7 }, ctx()).rejected.map((r) => r.reason), ['PAX_NOT_GROUNDED_IN_TEXT']);
  assert.deepEqual(validateMemoryUpdate({ pax: 3 }, ctx({ text: 'para 3 personas', memory: { guests: 2 } })).rejected.map((r) => r.reason), ['PAX_REPLACEMENT_WITHOUT_CHANGE_CUE']);
  assert.equal(validateMemoryUpdate({ pax: 3 }, ctx({ text: 'mejor somos 3', memory: { guests: 2 } })).accepted.pax, 3);
  assert.deepEqual(validateMemoryUpdate({ property: 'CC' }, ctx()).rejected.map((r) => r.reason), ['PROPERTY_NOT_NAMED_IN_TEXT']);
  assert.deepEqual(validateMemoryUpdate({ amount: 200000 }, ctx()).rejected.map((r) => r.reason), ['AMOUNT_NOT_ALLOWED']);
  assert.deepEqual(validateMemoryUpdate({ dates: ['2026-12-25'] }, ctx()).rejected.map((r) => r.reason), ['DATE_NOT_GROUNDED_IN_TEXT']);
  assert.deepEqual(validateMemoryUpdate({ dates: ['2026-09-01'] }, ctx()).rejected.map((r) => r.reason), ['DATE_OUT_OF_RANGE']);
  assert.deepEqual(validateMemoryUpdate({ dates: ['2026-11-14'] }, ctx({ ambiguities: ['DATE_UNCLEAR'] })).rejected.map((r) => r.reason), ['DATE_UNCLEAR']);
  assert.deepEqual(validateMemoryUpdate({ dates: ['2026-10-09'] }, ctx({ text: 'el viernes jugamos micro', intents: [], llmIntent: 'INTENCION_NO_ENTENDIDA' })).rejected.map((r) => r.reason), ['CASUAL_COMMENT_NOT_A_BOOKING']);
  assert.deepEqual(validateMemoryUpdate({ dates: ['2026-10-15'] }, ctx({ text: 'el viernes hay cupo?' })).rejected.map((r) => r.reason), ['DATE_NOT_GROUNDED_IN_TEXT'], 'el 15 es jueves, no viernes');
  assert.deepEqual(validateMemoryUpdate({ dates: ['2026-11-14'] }, ctx()).accepted.dates, ['2026-11-14']);
});

test('fechas ambiguas: "el puente" no se convierte en una fecha inventada por el LLM', async () => {
  const c = mk();
  const d = await say(c, 'queria saber si para el puente de noviembre tienen algo, somos 5', interp({ intent: 'CONSULTA_DISPONIBILIDAD', entities: { dates: ['2026-11-14'], pax: 5 }, ambiguities: ['DATE_UNCLEAR'] }));
  assert.equal(c.session.memory.checkIn, undefined);
  assert.equal(c.fake.calls.length, 0);
  assert.doesNotMatch(d.reply ?? '', /\$\s?\d/);
});

test('mensajes fragmentados: contexto acumulado en la sesion hibrida y una sola pregunta', async () => {
  const c = mk();
  const p = new OracleMock();
  const cse = { id: 'frag', turns: ['buenas', 'queria una habitacion', 'para el 13 de noviembre', 'dos personas'], intent: 'CONSULTA_DISPONIBILIDAD', memory: { guests: 2, checkIn: '2026-11-13' } };
  let last;
  for (let i = 0; i < cse.turns.length; i += 1) { p.setTurn(cse, i); last = await say(c, cse.turns[i], p); }
  assert.equal(c.session.memory.guests, 2);
  assert.equal(c.session.memory.checkIn, '2026-11-13');
  assert.ok(c.fake.calls.length >= 1);
  assert.doesNotMatch(last.reply, /cu[aá]ntas personas|para qu[eé] fecha/i);
  const b = mk();
  const burst = await processHybridBurst(b.session, [{ text: 'hola' }, { text: 'somos 2' }, { text: 'para mañana' }], b.deps, { provider: benignMock(), timeoutMs: 30 });
  assert.ok(burst.flags.some((f) => f.startsWith('RAFAGA_AGRUPADA')));
  assert.equal(b.session.memory.guests, 2);
});

// ---- sin outbound / config ---------------------------------------------------------------------------------------------------------------
test('no outbound: ninguna decision hibrida (ni siquiera con fallos) trae outbound distinto de null', async () => {
  const p = chaosMock();
  for (let i = 0; i < 10; i += 1) {
    const d = await say(mk(), 'hola, hay habitacion para el 14 de noviembre? somos 2', p);
    assert.equal(d.outbound, null);
    assert.equal(d.mode, 'SHADOW');
  }
});

test('config: WHATSAPP_UNDERSTANDING_MODE=rules por defecto; hybrid_shadow existe pero no se activa solo', async () => {
  assert.equal(resolveConfig({}).understanding, 'rules');
  assert.equal(resolveConfig({ WHATSAPP_UNDERSTANDING_MODE: 'hybrid_shadow' }).understanding, 'hybrid_shadow');
  assert.throws(() => resolveConfig({ WHATSAPP_UNDERSTANDING_MODE: 'llm' }), (e) => e instanceof ConfigError && e.code === 'UNKNOWN_UNDERSTANDING_MODE');
  assert.throws(() => createRuntime({ env: { WHATSAPP_UNDERSTANDING_MODE: 'hybrid_shadow' } }), (e) => e.code === 'UNDERSTANDING_PROVIDER_REQUIRED');
  assert.equal(resolveConfig({}).enabled, false);
  assert.equal(resolveConfig({}).mode, 'shadow');
});

test('kill switch: con ENABLED=false el proveedor ni siquiera se llama; con ENABLED=true hibrido sigue sin outbound', async () => {
  const p = benignMock();
  const off = createRuntime({ env: { WHATSAPP_AUTOMATION_ENABLED: 'false', WHATSAPP_UNDERSTANDING_MODE: 'hybrid_shadow' }, provider: p });
  const c = mk();
  const r = await off.handleMessage(c.session, { type: 'text', text: 'hola somos 2' }, c.deps);
  assert.equal(r.suppressed, true);
  assert.equal(p.calls.length, 0);
  const on = createRuntime({ env: { WHATSAPP_AUTOMATION_ENABLED: 'true', WHATSAPP_UNDERSTANDING_MODE: 'hybrid_shadow' }, provider: p, hybridOptions: { timeoutMs: 30 } });
  const d = await on.handleMessage(c.session, { type: 'text', text: 'hola, hay habitacion para el 14 de noviembre? somos 2' }, c.deps);
  assert.equal(d.outbound, null);
  assert.ok(p.calls.length >= 1);
});

// ---- privacidad -------------------------------------------------------------------------------------------------------------------------------
test('redactPII: telefonos, correos, documentos, cuentas, tarjetas, URLs y nombres; conserva fechas, pax y montos', () => {
  const r = redactPII('Hola me llamo Carlos Perez Gomez, mi cel es 310 555 1234 y mi correo carlos@mail.com, cc 1.020.304.050, cuenta 12345678901234, para 3 personas el 14 de noviembre por $120.000 https://pago.example/x');
  for (const leak of ['310 555 1234', 'carlos@mail.com', '1.020.304.050', '12345678901234', 'Carlos', 'Perez', 'https://']) assert.ok(!r.text.includes(leak), `${leak} -> ${r.text}`);
  for (const keep of ['3 personas', '14 de noviembre', '$120.000']) assert.ok(r.text.includes(keep), `${keep} -> ${r.text}`);
  assert.equal(r.redacted, true);
  assert.ok(r.redactions.PHONE >= 1 && r.redactions.EMAIL === 1 && r.redactions.NAME === 1);
  assert.equal(redactPII('somos 2 para el 14 de noviembre').redacted, false);
  assert.equal(redactPII(PHONE_57).text, '[PHONE]');
});

test('privacidad: el proveedor solo recibe texto redactado y contexto sin datos personales; el historial tampoco guarda PII', async () => {
  const p = benignMock();
  const c = mk();
  await say(c, `soy a nombre de Maria Lopez, mi cel ${PHONE}, hay cupo para el 14 de noviembre?`, p);
  const sent = JSON.stringify(p.calls);
  assert.ok(!sent.includes('Maria') && !sent.includes('Lopez') && !sent.includes(PHONE), sent);
  assert.ok(!/Maria|Lopez/.test(JSON.stringify(c.session.history)) && !JSON.stringify(c.session.history).includes(PHONE));
  assert.equal(p.calls[0].schema_version, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(p.calls[0].context).sort(), ['channel', 'check_in', 'guests', 'has_reservation', 'nights', 'payment_claimed', 'property']);
});

// ---- dual run y benchmark --------------------------------------------------------------------------------------------------------------------------
test('dual run: guarda rules_intent, hybrid_intent, rules_action, hybrid_action, expected y risk', async () => {
  const { runCaseBothModes } = await import('../src/hybrid/dual-run.mjs');
  const c = BLIND_V3.find((x) => x.id === 'P03');
  const r = await runCaseBothModes(c, { makeOdoo: () => makeFakeOdoo(), provider: new OracleMock(), hybridOptions: { timeoutMs: 30 } });
  for (const k of ['rules_intent', 'hybrid_intent', 'rules_action', 'hybrid_action', 'expected', 'risk']) assert.ok(k in r, k);
  assert.equal(r.rules_action.escalate, true);
  assert.equal(r.hybrid_action.escalate, false, 'el hibrido resuelve lo que las reglas no entendian');
});

test('comparador RULES_ONLY vs HYBRID_MOCK: cero violaciones del piso, y el hibrido no suma HIGH_RISK sobre las reglas (V2+V3, 4 mocks)', async () => {
  const { runCaseBothModes } = await import('../src/hybrid/dual-run.mjs');
  const providers = { oracle: () => new OracleMock(), adversarial: adversarialMock, benign: benignMock, chaos: chaosMock };
  for (const [name, mkProvider] of Object.entries(providers)) {
    const p = mkProvider();
    let rulesHigh = 0;
    let hybridHigh = 0;
    for (const c of [...BLIND_V2, ...BLIND_V3]) {
      const r = await runCaseBothModes(c, { makeOdoo: () => makeFakeOdoo(), provider: p, hybridOptions: { timeoutMs: 20 } });
      assert.equal(r.escalation_floor_violation, false, `${name} ${c.id}`);
      if (r.risk.rules) rulesHigh += 1;
      if (r.risk.hybrid) hybridHigh += 1;
    }
    assert.ok(hybridHigh <= rulesHigh, `${name}: hibrido ${hybridHigh} > reglas ${rulesHigh}`);
  }
});

test('benchmark de proveedores: mide los 7 indicadores con mocks y rechaza cualquier proveedor real (DISABLED)', async () => {
  const p = new OracleMock({ latencyMs: 1, usage: { input_tokens: 100, output_tokens: 20 }, name: 'oracle-mock' });
  const cases = BLIND_V3.slice(0, 12);
  const b = await benchmarkProvider({ provider: p, cases, makeOdoo: () => makeFakeOdoo(), pricing: { input_per_mtok: 1, output_per_mtok: 2, source: 'TARIFA_DE_PRUEBA_SOLO_TEST' }, privacyMode: 'redacted', hybridOptions: { timeoutMs: 100 } });
  for (const k of ['ACCURACY', 'HIGH_RISK_FAILS', 'SCHEMA_VALIDITY', 'LOW_CONFIDENCE_RATE', 'FALSE_ESCALATION', 'LATENCY', 'INPUT_TOKENS', 'OUTPUT_TOKENS', 'ESTIMATED_COST', 'PRIVACY_REJECTIONS', 'PRIVACY_MODE']) assert.ok(k in b, k);
  assert.ok(b.LATENCY.calls > 0 && b.INPUT_TOKENS > 0 && b.ESTIMATED_COST > 0);
  assert.equal(b.SCHEMA_VALIDITY, 100);
  assert.equal(b.PRIVACY_MODE, 'redacted');
  const fakeReal = { name: 'openai', interpretMessage() {}, interpretConversation() {}, health() {} };
  await assert.rejects(() => benchmarkProvider({ provider: fakeReal, cases, makeOdoo: () => makeFakeOdoo() }), ProviderDisabledError);
});
