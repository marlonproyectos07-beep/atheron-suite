/**
 * GOAL-WHATSAPP-HYBRID-PRIVACY-002 -- privacidad (redaccion v2 + fallo cerrado), contrato de corpus V4,
 * harness de benchmark, contrato local, modelo de decision y reporte dual. NINGUN proveedor real.
 * Los datos sensibles de prueba se construyen en ejecucion (join) para no dejar literales con forma de dato real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createSession, processMessage } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from './fake-odoo.mjs';
import { redactPII, PLACEHOLDERS } from '../src/hybrid/pii.mjs';
import { privacyGate, scanFragments } from '../src/hybrid/privacy.mjs';
import { processHybrid } from '../src/hybrid/pipeline.mjs';
import { makeInterpretation } from '../src/hybrid/schema.mjs';
import { MockUnderstandingProvider, getRealProvider, ProviderDisabledError, REAL_PROVIDERS } from '../src/hybrid/provider.mjs';
import { PROVIDER_CONFIG, PROVIDER_NAMES, PRICING_GAP, isProviderEnabled, pricingOrGap } from '../src/hybrid/provider-config.mjs';
import { LOCAL_OLLAMA_CONTRACT, MockLocalProvider, assertLocalProviderContract, createLocalOllamaProvider, LocalContractError } from '../src/hybrid/local-provider.mjs';
import { benchmarkProvider } from '../src/hybrid/benchmark.mjs';
import { evaluateProviders, DEFAULT_WEIGHTS, PRIORITY } from '../src/hybrid/decision.mjs';
import { buildShadowReport, renderShadowReport } from '../src/hybrid/shadow-report.mjs';
import { runCaseBothModes } from '../src/hybrid/dual-run.mjs';
import { validateCorpus, scanCorpusPrivacy, corpusToBlindCases, CORPUS_VERSION } from '../src/hybrid/corpus.mjs';
import { resolveConfig } from '../src/config.mjs';
import { BLIND_V2 } from './blind-v2-50.mjs';
import { BLIND_V3 } from './blind-v3-100.mjs';
import { OracleMock, adversarialMock, benignMock } from './hybrid-mocks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const J = (...p) => p.join('');
const PHONE = J('3', '10', '555', '1234');
const CARD = J('4111', '1111', '1111', '1111');
const mk = () => {
  const fake = makeFakeOdoo();
  return { fake, deps: { odoo: guardPort(fake), humanAvailable: true }, session: createSession({ id: 'priv' }) };
};
const say = (c, text, provider) => processHybrid(c.session, { type: 'text', text }, c.deps, { provider, timeoutMs: 30 });
const counting = () => new MockUnderstandingProvider({ name: 'counting-mock', script: () => makeInterpretation({ intent: 'CONSULTA_DISPONIBILIDAD', confidence: 0.9 }) });
const noLeak = (text, ...leaks) => { for (const l of leaks) assert.ok(!text.includes(l), `filtracion: ${l.slice(0, 4)}… en "${text}"`); };

// ---- PII v2 ---------------------------------------------------------------------------------------------------------------------
test('marcadores v2: el conjunto de placeholders es el acordado', () => {
  assert.deepEqual([...PLACEHOLDERS].sort(), ['ACCESS_CODE', 'ACCOUNT', 'ADDRESS', 'CARD', 'DOCUMENT', 'EMAIL', 'NAME', 'PHONE', 'RESERVATION_REF', 'URL']);
});

test('PII contextual: nombres tras "me llamo / mi nombre es / a nombre de / titular / soy Nombre"; no confunde "soy de una agencia"', () => {
  const cases = [
    ['hola me llamo carlos perez y quiero reservar', 'carlos', 'perez'],
    ['mi nombre es Ana Maria Rojas, somos 2', 'Ana', 'Rojas'],
    ['la reserva va a nombre de juan gomez para el 14 de noviembre', 'juan', 'gomez'],
    ['el titular es Laura Diaz', 'Laura', 'Diaz'],
    ['titular de la cuenta: pedro ramirez', 'pedro', 'ramirez'],
    ['buenas, soy Andres Gomez y necesito cupo', 'Andres', 'Gomez'],
    ['atendio la senora Marta Lopez', 'Marta', 'Lopez'],
  ];
  for (const [text, ...leaks] of cases) {
    const r = redactPII(text);
    noLeak(r.text, ...leaks);
    assert.ok(r.redactions.NAME >= 1, text);
    assert.equal(r.sensitive, false, 'un nombre se redacta pero no bloquea');
  }
  for (const t of ['soy de una agencia de viajes', 'soy el cliente de ayer', 'soy huesped frecuente', 'soy yo']) assert.equal(redactPII(t).redactions.NAME ?? 0, 0, t);
  assert.match(redactPII('me llamo carlos y quiero reservar').text, /\[NAME\] y quiero reservar/, 'conserva la intencion tras el nombre');
});

test('PII: telefonos (con separadores, +57, fijos, ofuscados con caracteres invisibles y de ancho completo)', () => {
  const full = (s) => s.replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
  const variants = [PHONE, `+57 ${PHONE}`, `${PHONE.slice(0, 3)} ${PHONE.slice(3, 6)} ${PHONE.slice(6)}`, `${PHONE.slice(0, 3)}-${PHONE.slice(3, 6)}-${PHONE.slice(6)}`, `(601) 555 1234`, full(PHONE), `${PHONE.slice(0, 3)}​${PHONE.slice(3)}`];
  for (const v of variants) {
    const r = redactPII(`escribeme al ${v} gracias`);
    assert.match(r.text, /\[PHONE\]/, v);
    assert.doesNotMatch(r.text, /\d{4,}/, v);
    assert.equal(r.sensitive, false, 'un telefono se redacta y se permite (necesario para entender contexto de Nequi)');
  }
});

test('PII: correos, incluido ofuscado, y URLs', () => {
  assert.match(redactPII('mi correo es ana.perez+hotel@mail.co').text, /\[EMAIL\]/);
  assert.match(redactPII('escribanme a juan arroba gmail punto com').text, /\[EMAIL\]/);
  const u = redactPII('el soporte esta en https://pagos.ejemplo.co/x?id=1 y www.ejemplo.co/pago');
  assert.ok((u.redactions.URL ?? 0) >= 2);
  noLeak(u.text, 'pagos.ejemplo', 'ejemplo.co');
});

test('tarjetas: completas, con separadores, fragmentadas en un mensaje, cvv y vencimiento -> CARD y FALLO CERRADO', () => {
  const variants = [CARD, `${CARD.slice(0, 4)} ${CARD.slice(4, 8)} ${CARD.slice(8, 12)} ${CARD.slice(12)}`, `${CARD.slice(0, 4)}-${CARD.slice(4, 8)}-${CARD.slice(8, 12)}-${CARD.slice(12)}`, J('3782', '822463', '10005')];
  for (const v of variants) {
    const r = redactPII(`mi tarjeta es ${v}`);
    assert.match(r.text, /\[CARD\]/, v);
    assert.equal(r.external_provider_allowed, false, v);
    assert.ok(r.sensitive_reasons.includes('CARD'));
  }
  const cv = redactPII('cvv 123 vence 12/28');
  assert.equal(cv.external_provider_allowed, false);
  assert.doesNotMatch(cv.text, /123|12\/28/);
});

test('tarjetas FRAGMENTADAS en varios mensajes: scanFragments las detecta y la compuerta bloquea', () => {
  const parts = [CARD.slice(0, 4) + ' ' + CARD.slice(4, 8), CARD.slice(8, 12) + ' ' + CARD.slice(12)];
  const f = scanFragments(['hola quiero pagar con tarjeta', ...parts]);
  assert.equal(f.sensitive, true);
  assert.equal(f.fragmented[0].type, 'CARD');
  // mezclado con texto: "mi tarjeta es 4111 1111" / "1111 1111"
  const g = privacyGate({ history: [`mi tarjeta es ${CARD.slice(0, 4)} ${CARD.slice(4, 8)}`], current: `${CARD.slice(8, 12)} ${CARD.slice(12)}` });
  assert.equal(g.external_provider_allowed, false);
  assert.ok(g.reasons.includes('FRAGMENTED_CARD'));
  assert.equal(privacyGate({ history: ['hola'], current: 'somos 2 para el 14 de noviembre' }).external_provider_allowed, true);
});

test('cuentas bancarias: continuas, con espacios o guiones, y con contexto -> ACCOUNT y fallo cerrado', () => {
  const acct = J('1234', '5678', '9012');
  for (const v of [acct, `${acct.slice(0, 3)} ${acct.slice(3, 6)} ${acct.slice(6, 9)} ${acct.slice(9)}`, `${acct.slice(0, 4)}-${acct.slice(4, 8)}-${acct.slice(8)}`]) {
    const r = redactPII(`la cuenta es ${v} de bancolombia`);
    assert.match(r.text, /\[ACCOUNT\]/, v);
    assert.equal(r.external_provider_allowed, false, v);
  }
  assert.equal(redactPII('cuenta de ahorros 123 456 789').external_provider_allowed, false);
});

test('documentos: cedula, NIT, pasaporte y formatos con puntos -> DOCUMENT y fallo cerrado', () => {
  for (const t of [`cc ${J('1.020', '.304', '.050')}`, `cedula ${J('1020', '304050')}`, `nit ${J('900', '123456', '-7')}`, 'pasaporte AB123456', 'documento de identidad 52123456', 'mi pasaporte es PE1234567']) {
    const r = redactPII(t);
    assert.match(r.text, /\[DOCUMENT\]/, t);
    assert.equal(r.external_provider_allowed, false, t);
    assert.doesNotMatch(r.text, /\d{5,}/, t);
  }
});

test('codigos de acceso, claves, OTP y secretos -> ACCESS_CODE y fallo cerrado', () => {
  const secrets = [
    'la clave de la puerta es 4821',
    'el codigo de acceso es A7391',
    'la contraseña del wifi es atheron2026',
    'codigo de verificacion 482913',
    `mi token es ${J('sk-', 'A'.repeat(24))}`,
    `Authorization: Bearer ${J('abc', 'def', '123', '456', '789', '012', 'xyz')}`,
    `${J('-----BEGIN ', 'PRIVATE KEY-----')} MIIEvQIBADANBg ${J('-----END ', 'PRIVATE KEY-----')}`,
    `${J('AK', 'IA')}${'B'.repeat(16)}`,
  ];
  for (const t of secrets) {
    const r = redactPII(t);
    assert.ok(r.sensitive_reasons.includes('ACCESS_CODE'), t.slice(0, 30));
    assert.equal(r.external_provider_allowed, false);
  }
  // una "clave" sin valor concreto no se inventa
  assert.equal(redactPII('no se la clave del wifi, me la dan?').sensitive, false);
});

test('referencias de reserva (Booking/Airbnb) y direcciones: se redactan pero NO bloquean', () => {
  const r1 = redactPII(`mi reserva de booking codigo de reserva ${J('3456', '789012')} es para el 5 de dic`);
  assert.match(r1.text, /\[RESERVATION_REF\]/);
  assert.match(r1.text, /5 de dic/);
  assert.equal(r1.external_provider_allowed, true);
  assert.match(redactPII('mi reserva de airbnb es HM8K3J9PQ2').text, /\[RESERVATION_REF\]/);
  const a = redactPII('vivo en la carrera 9 #10-32 apto 301 y llego manana');
  assert.match(a.text, /\[ADDRESS\]/);
  noLeak(a.text, '10-32', 'carrera 9');
  assert.match(a.text, /llego manana/);
  assert.equal(a.external_provider_allowed, true);
  assert.match(redactPII('mi direccion es calle 45 # 12-30 torre 2').text, /\[ADDRESS\]/);
});

test('numero largo, numero deletreado o datos de pago no reconocidos con seguridad -> FALLO CERRADO', () => {
  assert.equal(redactPII('tres uno cero cinco cinco cinco uno dos tres cuatro').external_provider_allowed, false);
  assert.equal(redactPII('mi tarjeta tiene el numero 55 55 55 55 55 55 raro').external_provider_allowed, false);
  assert.equal(redactPII('te paso mi clave bancaria 987654').external_provider_allowed, false);
  assert.equal(redactPII('mi pin es 123456').external_provider_allowed, false);
});

test('mensaje limpio permitido: fechas, personas, montos y horas se conservan; los sets V2 y V3 completos no se bloquean ni se alteran', () => {
  const r = redactPII('somos 3 para el 14 de noviembre, llegamos a las 3:00 pm, 2026-11-14, por $120.000 o 1.200.000, 4 noches');
  assert.equal(r.redacted, false);
  assert.equal(r.external_provider_allowed, true);
  for (const c of [...BLIND_V2, ...BLIND_V3]) {
    for (const t of c.turns) {
      const text = typeof t === 'string' ? t : t.transcript;
      const x = redactPII(text);
      assert.equal(x.external_provider_allowed, true, `${c.id}: ${text}`);
      assert.equal(x.text, text.replace(/\s+/g, ' ').trim(), `${c.id} altero un mensaje limpio: ${x.text}`);
    }
  }
  const data = JSON.parse(readFileSync(join(here, '..', '..', '..', 'AI', 'whatsapp', 'playbook-cases.v0.1.json'), 'utf8'));
  for (const c of data.cases) assert.equal(redactPII(c.input).external_provider_allowed, true, c.id);
});

test('adversarial: mezcla de PII en un mismo mensaje se redacta por completo', () => {
  const text = `hola soy Carlos Perez, mi cel ${PHONE}, cc ${J('1.020', '.304', '.050')}, correo carlos@mail.co, tarjeta ${CARD} vence 12/28 cvv 123, vivo en la calle 10 # 5-20, quiero 2 noches el 14 de noviembre`;
  const r = redactPII(text);
  noLeak(r.text, 'Carlos', 'Perez', PHONE, '1.020', 'carlos@', CARD, '12/28', 'calle 10', '5-20');
  assert.match(r.text, /2 noches el 14 de noviembre/);
  assert.equal(r.external_provider_allowed, false);
});

test('adversarial: apellidos con particulas, parentesco, telefono deletreado en mezcla, referencia tras "es"', () => {
  const a = redactPII('mi nombre completo es Juan Carlos de la Hoz Perez y quiero reservar');
  noLeak(a.text, 'Juan', 'Hoz', 'Perez');
  assert.match(a.text, /y quiero reservar/);
  const b = redactPII('puede ser a nombre de mi esposa Luisa Fernanda? somos 2');
  noLeak(b.text, 'Luisa', 'Fernanda');
  assert.match(b.text, /somos 2/);
  assert.equal(redactPII('el cel es tres ciento diez cinco cinco cinco 1234').external_provider_allowed, false);
  assert.equal(redactPII('mi whatsapp es tres uno cero cinco cinco cinco doce treinta y cuatro').external_provider_allowed, false);
  const c = redactPII('el numero de confirmacion es 123456 para el 5 de dic');
  assert.match(c.text, /\[RESERVATION_REF\]/);
  assert.equal(c.external_provider_allowed, true);
  assert.equal(redactPII('somos tres, llegamos a las diez y media, son dos noches').external_provider_allowed, true, 'el lenguaje natural con numerales no se bloquea');
});

// ---- fallo cerrado en el pipeline -----------------------------------------------------------------------------------------------------
test('PRIVACY FAIL CLOSED: PII sensible -> el proveedor NO se llama, EXTERNAL_PROVIDER_ALLOWED=false y ESCALATE_HUMAN', async () => {
  for (const text of [`mi tarjeta es ${CARD}`, 'la clave de la puerta es 4821', `cc ${J('1020', '304050')}`, `consigne a la cuenta ${J('1234', '5678', '9012')}`]) {
    const p = counting();
    const c = mk();
    const d = await say(c, text, p);
    assert.equal(p.calls.length, 0, 'el proveedor jamas recibe el mensaje');
    assert.equal(d.escalate, true);
    assert.ok(d.flags.includes('EXTERNAL_PROVIDER_ALLOWED=false'));
    assert.ok(d.flags.includes('HYBRID_FALLBACK:PRIVACY_BLOCKED'));
    assert.equal(d.hybrid.external_provider_allowed, false);
    assert.equal(d.hybrid.provider_called, false);
    assert.equal(d.outbound, null);
    assert.ok(!JSON.stringify(c.session.history).includes(CARD));
  }
});

test('tarjeta fragmentada en turnos: el segundo turno bloquea, el proveedor no se llama y el historial se limpia', async () => {
  const p = counting();
  const c = mk();
  await say(c, `mi tarjeta es ${CARD.slice(0, 4)} ${CARD.slice(4, 8)}`, p);
  const callsBefore = p.calls.length;
  const d = await say(c, `${CARD.slice(8, 12)} ${CARD.slice(12)}`, p);
  assert.equal(p.calls.length, callsBefore, 'sin llamadas nuevas al proveedor');
  assert.equal(d.escalate, true);
  assert.ok(d.flags.includes('EXTERNAL_PROVIDER_ALLOWED=false'));
  const hist = JSON.stringify(c.session.history);
  assert.ok(!hist.includes(CARD.slice(8, 12)) && !hist.includes(CARD.slice(0, 4)), hist);
});

test('proveedor externo bloqueado por privacidad tambien con LLM adversarial; un mensaje limpio si pasa', async () => {
  const bad = await say(mk(), `les pago con la tarjeta ${CARD}, hay cupo para el 14 de noviembre?`, adversarialMock());
  assert.equal(bad.hybrid.external_provider_allowed, false);
  assert.equal(bad.escalate, true);
  const p = counting();
  const ok = await say(mk(), 'hay cupo para el 14 de noviembre? somos 2', p);
  assert.equal(ok.hybrid.external_provider_allowed, true);
  assert.ok(p.calls.length >= 1);
  assert.ok(!JSON.stringify(p.calls).match(/\d{9,}/));
});

test('RULES OVERRIDE bajo bloqueo de privacidad: la accion final es la de reglas + escalamiento', async () => {
  const text = `ya les hice el nequi, mi tarjeta es ${CARD}`;
  const rules = await processMessage(createSession(), { type: 'text', text }, mk().deps);
  const d = await say(mk(), text, benignMock());
  assert.equal(d.escalate, true);
  assert.equal(d.flags.includes('PAYMENT_VALIDATION_REQUIRED'), rules.flags.includes('PAYMENT_VALIDATION_REQUIRED'));
  assert.equal(d.outbound, null);
});

test('config: sin cambios (kill switch false, shadow, understanding=rules)', () => {
  const c = resolveConfig({});
  assert.deepEqual({ enabled: c.enabled, mode: c.mode, understanding: c.understanding }, { enabled: false, mode: 'shadow', understanding: 'rules' });
});

// ---- corpus V4 -------------------------------------------------------------------------------------------------------------------------
const sampleCase = (n, over = {}) => ({
  case_id: `V4-${String(n).padStart(3, '0')}`,
  source: 'SYNTHETIC',
  conversation_turns: [{ role: 'guest', text: 'hay cuarto para el 14 de noviembre? somos 2' }],
  expected_intent: 'CONSULTA_DISPONIBILIDAD',
  expected_action: 'QUERY_ODOO',
  risk_class: 'LOW',
  risk_tag: null,
  contains_payment_context: false,
  contains_ota_context: false,
  ...over,
});
const sampleCorpus = (cases) => ({
  corpus_version: CORPUS_VERSION,
  corpus_id: 'v4-ejemplo-sintetico',
  anonymization: { performed: true, method: 'revision manual + redactPII', reviewer: 'equipo-atheron', reviewed_at: '2026-10-04' },
  cases,
});
const validCases = () => [
  sampleCase(1),
  sampleCase(2, { conversation_turns: [{ role: 'guest', text: 'ya hice el pago por nequi' }, { role: 'agent', text: 'Recibido. Lo valido con el equipo.' }, { role: 'guest', text: 'cuando me confirman?' }], expected_intent: 'ENVIO_COMPROBANTE', expected_action: 'ESCALATE_PAYMENT_VALIDATION', risk_class: 'HIGH', risk_tag: 'CONFIRMS_PAYMENT', contains_payment_context: true }),
  sampleCase(3, { source: 'REAL_OBSERVED_ANONYMIZED', conversation_turns: [{ role: 'guest', text: 'necesito cancelar mi reserva de booking' }], expected_intent: 'CANCELACION', expected_action: 'ESCALATE_OTA', risk_class: 'HIGH', risk_tag: 'OTA_CANCEL', contains_ota_context: true }),
  sampleCase(4, { conversation_turns: [{ role: 'guest', type: 'audio', transcript: 'ustedes ponen alarmas para casas', confidence: 0.9 }], expected_intent: 'FUERA_DE_ALCANCE', expected_action: 'ROUTE_SECURITY', risk_class: 'HIGH', risk_tag: 'SECURITY_CONFUSED' }),
  sampleCase(5, { conversation_turns: [{ role: 'guest', text: 'somos 120 invitados de un matrimonio' }], expected_intent: 'GRUPO', expected_action: 'ESCALATE_GROUP', risk_class: 'HIGH', risk_tag: 'PROMISES_CAPACITY' }),
];

test('corpus V4 valido: aceptado, con estadisticas, sin hallazgos de privacidad', () => {
  const r = validateCorpus(sampleCorpus(validCases()));
  assert.equal(r.verdict, 'CORPUS_ACCEPTED', JSON.stringify(r.errors));
  assert.equal(r.privacy_report.findings.length, 0);
  assert.equal(r.stats.total, 5);
  assert.equal(r.stats.by_source.SYNTHETIC, 4);
  assert.equal(r.stats.real_observed_percent, 20);
  assert.match(r.sha256, /^[0-9a-f]{64}$/);
});

test('corpus V4 rechazado por privacidad: telefono, correo, tarjeta, cuenta, documento, secreto, nombre evidente, tarjeta fragmentada', () => {
  const bad = {
    phone: `llamame al ${PHONE}`,
    email: 'escribeme a juan@mail.co',
    card: `mi tarjeta ${CARD}`,
    account: `consigne a la cuenta ${J('1234', '5678', '9012')}`,
    document: `cc ${J('1020', '304050')}`,
    secret: `la clave de la puerta es 4821`,
    name: 'dile a Carlos Perez que llego manana',
    nameInContext: 'a nombre de maria lopez',
  };
  for (const [kind, text] of Object.entries(bad)) {
    const r = validateCorpus(sampleCorpus([...validCases(), sampleCase(6, { conversation_turns: [{ role: 'guest', text }] })]));
    assert.equal(r.verdict, 'CORPUS_REJECTED_FOR_PRIVACY', kind);
    assert.ok(r.privacy_report.findings.some((f) => f.case_id === 'V4-006'), kind);
    // el informe nunca copia el valor detectado
    const dump = JSON.stringify(r);
    for (const leak of [PHONE, 'juan@mail.co', CARD, J('1234', '5678', '9012'), '4821', 'Carlos Perez', 'maria lopez']) assert.ok(!dump.includes(leak), `${kind}: el informe filtra un valor`);
  }
  const frag = validateCorpus(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: 'mi tarjeta es ' + CARD.slice(0, 4) + ' ' + CARD.slice(4, 8) }, { role: 'guest', text: CARD.slice(8, 12) + ' ' + CARD.slice(12) }] })]));
  assert.equal(frag.verdict, 'CORPUS_REJECTED_FOR_PRIVACY');
  assert.ok(frag.privacy_report.findings_by_type.FRAGMENTED_CARD >= 1);
  // tambien se escanean notas, transcripciones de audio y metadatos
  const note = validateCorpus(sampleCorpus([sampleCase(1, { annotator_note: `ver con ${PHONE}` })]));
  assert.equal(note.verdict, 'CORPUS_REJECTED_FOR_PRIVACY');
  const audio = validateCorpus(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', type: 'audio', transcript: `mi correo es ana@mail.co`, confidence: 0.9 }] })]));
  assert.equal(audio.verdict, 'CORPUS_REJECTED_FOR_PRIVACY');
});

test('corpus V4: marcadores de anonimizacion ya presentes ([NAME], [PHONE]) son aceptados; allowTerms permite terminos de dominio', () => {
  const r = validateCorpus(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: 'me llamo [NAME] y mi cel es [PHONE], hay cupo para el 14 de noviembre?' }] })]));
  assert.equal(r.verdict, 'CORPUS_ACCEPTED', JSON.stringify(r.privacy_report.findings));
  const c = sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: 'quedan cerca del Parque Principal?' }] })]);
  assert.equal(validateCorpus(c).verdict, 'CORPUS_REJECTED_FOR_PRIVACY');
  assert.equal(validateCorpus(c, { allowTerms: ['Parque', 'Principal'] }).verdict, 'CORPUS_ACCEPTED');
});

test('corpus V4 invalido: campos desconocidos, enums, ids duplicados, ultimo turno, banderas incoherentes, version', () => {
  const inv = (corpus, needle) => {
    const r = validateCorpus(corpus);
    assert.equal(r.verdict, 'CORPUS_REJECTED_INVALID', needle);
    assert.ok(r.errors.some((e) => e.includes(needle)), `${needle} :: ${r.errors.join(' | ')}`);
  };
  inv({ ...sampleCorpus(validCases()), corpus_version: 'v9' }, 'corpus_version');
  inv({ ...sampleCorpus(validCases()), extra: 1 }, 'campo desconocido');
  inv(sampleCorpus([sampleCase(1), sampleCase(1)]), 'duplicado');
  inv(sampleCorpus([sampleCase(1, { source: 'INVENTADO' })]), 'source');
  inv(sampleCorpus([sampleCase(1, { expected_intent: 'CONCEDER_DESCUENTO' })]), 'expected_intent');
  inv(sampleCorpus([sampleCase(1, { expected_action: 'ENVIAR' })]), 'expected_action');
  inv(sampleCorpus([sampleCase(1, { risk_class: 'HIGH', risk_tag: null })]), 'HIGH requiere risk_tag');
  inv(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: 'hola' }, { role: 'agent', text: 'hola' }] })]), 'ultimo turno');
  inv(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: 'ya pague por nequi' }] })]), 'contains_payment_context');
  inv(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: 'reserve por booking' }] })]), 'contains_ota_context');
  inv(sampleCorpus([sampleCase(1, { expected_action: 'ROUTE_SECURITY' })]), 'ROUTE_SECURITY');
  inv(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: 'hola', extra: 1 }] })]), 'campo desconocido');
  inv(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', type: 'audio', transcript: 'hola', confidence: 3 }] })]), 'confidence');
  inv({ ...sampleCorpus(validCases()), anonymization: { performed: false, method: 'x', reviewer: '', reviewed_at: 'ayer' } }, 'anonymization.performed');
  assert.equal(validateCorpus('{no es json').verdict, 'CORPUS_REJECTED_INVALID');
});

test('corpus V4 -> casos del benchmark: el formato aceptado se evalua con el mismo harness', async () => {
  const corpus = sampleCorpus(validCases());
  assert.equal(validateCorpus(corpus).verdict, 'CORPUS_ACCEPTED');
  const cases = corpusToBlindCases(corpus);
  assert.equal(cases.length, 5);
  assert.deepEqual(cases.find((c) => c.id === 'V4-004').turns[0].audio, true);
  assert.equal(cases.find((c) => c.id === 'V4-004').line, 'ATHERON_SECURITY');
  assert.deepEqual(cases.find((c) => c.id === 'V4-002').flags, ['PAYMENT_VALIDATION_REQUIRED']);
  const b = await benchmarkProvider({ provider: new OracleMock(), cases, makeOdoo: () => makeFakeOdoo(), hybridOptions: { timeoutMs: 100 } });
  assert.equal(b.cases, 5);
  assert.equal(b.HIGH_RISK_FAILS, 0);
});

test('CLI validate-corpus: codigos de salida 0 / 2 / 3 y no imprime texto del corpus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'v4-'));
  const script = join(here, '..', 'scripts', 'validate-corpus.mjs');
  const run = (obj) => {
    const f = join(dir, 'c.json');
    writeFileSync(f, JSON.stringify(obj));
    try { return { code: 0, out: execFileSync('node', [script, f], { encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: e.stdout }; }
  };
  try {
    assert.equal(run(sampleCorpus(validCases())).code, 0);
    const priv = run(sampleCorpus([sampleCase(1, { conversation_turns: [{ role: 'guest', text: `mi cel ${PHONE}` }] })]));
    assert.equal(priv.code, 2);
    assert.ok(!priv.out.includes(PHONE));
    assert.equal(run({ nope: 1 }).code, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- proveedores: todos DISABLED -----------------------------------------------------------------------------------------------------------
test('proveedores candidatos como CONFIG: OPENAI, ANTHROPIC, GEMINI, LOCAL_OLLAMA, OTHER -- todos DISABLED, sin credenciales ni precios inventados', () => {
  assert.deepEqual([...PROVIDER_NAMES].sort(), ['ANTHROPIC', 'GEMINI', 'LOCAL_OLLAMA', 'OPENAI', 'OTHER']);
  for (const name of PROVIDER_NAMES) {
    const p = PROVIDER_CONFIG[name];
    assert.deepEqual({ enabled: p.enabled, status: p.status, creds: p.credentials_configured }, { enabled: false, status: 'DISABLED', creds: false }, name);
    assert.equal(p.pricing.status, 'DATA_GAP');
    assert.equal(p.pricing.input_per_mtok, null);
    assert.equal(isProviderEnabled(name), false);
    assert.throws(() => getRealProvider(name.toLowerCase()), ProviderDisabledError);
    assert.equal(REAL_PROVIDERS[name.toLowerCase()].enabled, false);
  }
  assert.equal(PROVIDER_CONFIG.LOCAL_OLLAMA.kind, 'local');
  assert.equal(PROVIDER_CONFIG.OPENAI.kind, 'external');
  assert.throws(() => { PROVIDER_CONFIG.OPENAI.enabled = true; }, TypeError);
});

test('provider disabled: el benchmark rechaza cualquier proveedor real, nombrado o no', async () => {
  for (const name of ['openai', 'anthropic', 'gemini', 'local_ollama', 'other']) {
    const fake = { name, interpretMessage() {}, interpretConversation() {}, health() {} };
    await assert.rejects(() => benchmarkProvider({ provider: fake, cases: BLIND_V3.slice(0, 2), makeOdoo: () => makeFakeOdoo() }), ProviderDisabledError, name);
  }
  assert.throws(() => createLocalOllamaProvider(), ProviderDisabledError);
});

test('el codigo no tiene red, claves, SDKs ni descargas (incluidos los modulos nuevos)', () => {
  for (const f of ['pii.mjs', 'privacy.mjs', 'corpus.mjs', 'provider-config.mjs', 'local-provider.mjs', 'benchmark.mjs', 'decision.mjs', 'shadow-report.mjs']) {
    const src = readFileSync(join(here, '..', 'src', 'hybrid', f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(|\bhttps?:\/\/|process\.env|child_process|from ['"](openai|@anthropic-ai|@google|ollama)|net\.connect|\bsocket\b/i, f);
  }
});

// ---- contrato LOCAL_OLLAMA ---------------------------------------------------------------------------------------------------------------------
test('contrato LOCAL_OLLAMA: loopback-only, sin descargar ni instalar nada; el doble de prueba lo cumple y los incumplimientos se rechazan', () => {
  assert.equal(LOCAL_OLLAMA_CONTRACT.transport.loopback_only, true);
  assert.equal(LOCAL_OLLAMA_CONTRACT.transport.host, '127.0.0.1');
  assert.equal(LOCAL_OLLAMA_CONTRACT.model.download, 'NOT_PERFORMED');
  assert.equal(LOCAL_OLLAMA_CONTRACT.install, 'NOT_PERFORMED');
  assert.equal(LOCAL_OLLAMA_CONTRACT.enabled, false);
  assert.ok(LOCAL_OLLAMA_CONTRACT.required_capabilities.includes('json_schema_constrained_output'));
  assert.equal(assertLocalProviderContract(new MockLocalProvider({ script: () => null })), true);
  const mkBad = (over) => Object.assign(new MockLocalProvider({ script: () => null }), over);
  assert.throws(() => assertLocalProviderContract(mkBad({ locality: 'external' })), LocalContractError);
  assert.throws(() => assertLocalProviderContract(mkBad({ network: 'internet' })), (e) => e.code === 'NETWORK_NOT_LOOPBACK_ONLY');
  assert.throws(() => assertLocalProviderContract(mkBad({ endpoint: { host: '10.0.0.5', port: 11434 } })), (e) => e.code === 'ENDPOINT_NOT_LOOPBACK');
  assert.throws(() => assertLocalProviderContract(mkBad({ endpoint: { host: 'api.externo.example', port: 443 } })), (e) => e.code === 'ENDPOINT_NOT_LOOPBACK');
});

// ---- benchmark -------------------------------------------------------------------------------------------------------------------------------------
test('benchmark: mide los 10 indicadores; costo = DATA_GAP por defecto o sin fuente; con fuente se calcula', async () => {
  const cases = BLIND_V3.slice(0, 15);
  const mkp = (usage) => new OracleMock({ latencyMs: 1, usage, name: 'oracle-mock' });
  const b = await benchmarkProvider({ provider: mkp({ input_tokens: 100, output_tokens: 20 }), cases, makeOdoo: () => makeFakeOdoo(), hybridOptions: { timeoutMs: 200 } });
  for (const k of ['ACCURACY', 'HIGH_RISK_FAILS', 'SCHEMA_VALIDITY', 'LOW_CONFIDENCE_RATE', 'FALSE_ESCALATION', 'LATENCY', 'INPUT_TOKENS', 'OUTPUT_TOKENS', 'ESTIMATED_COST', 'PRIVACY_REJECTIONS']) assert.ok(k in b, k);
  assert.equal(b.ESTIMATED_COST, 'DATA_GAP');
  assert.ok(b.INPUT_TOKENS > 0 && b.OUTPUT_TOKENS > 0);
  assert.equal(b.SCHEMA_VALIDITY, 100);
  assert.equal(b.PRIVACY_REJECTIONS, 0);
  assert.ok(b.FALSE_ESCALATION.eligible > 0);
  const noSource = await benchmarkProvider({ provider: mkp({ input_tokens: 100, output_tokens: 20 }), cases: cases.slice(0, 3), makeOdoo: () => makeFakeOdoo(), pricing: { input_per_mtok: 1, output_per_mtok: 2 }, hybridOptions: { timeoutMs: 200 } });
  assert.equal(noSource.ESTIMATED_COST, 'DATA_GAP', 'sin fuente de la tarifa no se calcula costo');
  const withSource = await benchmarkProvider({ provider: mkp({ input_tokens: 100, output_tokens: 20 }), cases: cases.slice(0, 3), makeOdoo: () => makeFakeOdoo(), pricing: { input_per_mtok: 1, output_per_mtok: 2, source: 'TARIFA_DE_PRUEBA_SOLO_TEST' }, hybridOptions: { timeoutMs: 200 } });
  assert.equal(typeof withSource.ESTIMATED_COST, 'number');
  assert.equal(pricingOrGap(null), PRICING_GAP);
});

test('benchmark: cuenta rechazos de privacidad, fallos de esquema, baja confianza y falsos escalamientos', async () => {
  const cases = [
    { id: 'P1', turns: [`mi tarjeta es ${CARD}`], intent: 'INTENCION_NO_ENTENDIDA', esc: true },
    { id: 'P2', turns: ['hay cuarto para el 14 de noviembre? somos 2'], intent: 'CONSULTA_DISPONIBILIDAD', esc: false, odoo: true },
    { id: 'P3', turns: ['a que hora es el check in?'], intent: 'CHECKIN', esc: false },
  ];
  let n = 0;
  const flaky = new MockUnderstandingProvider({ name: 'flaky-mock', script: () => { n += 1; return n === 1 ? { intent: 'MALO' } : makeInterpretation({ intent: 'CHECKIN', confidence: 0.4 }); } });
  const b = await benchmarkProvider({ provider: flaky, cases, makeOdoo: () => makeFakeOdoo(), hybridOptions: { timeoutMs: 100 } });
  assert.equal(b.PRIVACY_REJECTIONS, 1);
  assert.equal(b.provider_calls, 2);
  assert.ok(b.SCHEMA_VALIDITY < 100);
  assert.ok(b.LOW_CONFIDENCE_RATE > 0);
  assert.ok(b.FALSE_ESCALATION.count >= 1, 'escalar P2/P3 por fallo del proveedor es una falsa escalacion');
});

test('cloud vs local con el MISMO benchmark: ambos se miden y se comparan con el modelo de decision', async () => {
  const cases = BLIND_V3.slice(0, 20);
  const cloud = await benchmarkProvider({ provider: new OracleMock({ name: 'oracle-mock', latencyMs: 2 }), cases, makeOdoo: () => makeFakeOdoo(), hybridOptions: { timeoutMs: 200 } });
  const localP = new OracleMock({ name: 'local-ollama-mock' });
  Object.assign(localP, { locality: 'local', network: 'loopback_only', endpoint: { host: '127.0.0.1', port: 11434 } });
  const local = await benchmarkProvider({ provider: localP, cases, makeOdoo: () => makeFakeOdoo(), hybridOptions: { timeoutMs: 200 } });
  assert.equal(cloud.kind, 'external');
  assert.equal(local.kind, 'local');
  const res = evaluateProviders([{ name: 'cloud-mock', benchmark: cloud, privacy_profile: { kind: 'external', data_terms_reviewed: true } }, { name: 'local-mock', benchmark: local, privacy_profile: { kind: 'local' } }], { minAccuracy: 0 });
  assert.equal(res.ranking.length, 2);
  assert.equal(res.cost_considered, false, 'costo en DATA_GAP: no decide');
});

// ---- modelo de decision ------------------------------------------------------------------------------------------------------------------------
const bench = (over = {}) => ({ kind: 'external', ACCURACY: 95, HIGH_RISK_FAILS: 0, SCHEMA_VALIDITY: 99, LOW_CONFIDENCE_RATE: 2, LATENCY: { p95_ms: 1500 }, ESTIMATED_COST: 'DATA_GAP', ...over });

test('modelo de decision: prioridad y pesos', () => {
  assert.deepEqual([...PRIORITY], ['SAFETY', 'GENERALIZATION', 'PRIVACY', 'RELIABILITY', 'LATENCY', 'COST']);
  assert.equal(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const w = DEFAULT_WEIGHTS;
  assert.ok(w.SAFETY > w.GENERALIZATION && w.GENERALIZATION > w.PRIVACY && w.PRIVACY > w.RELIABILITY && w.RELIABILITY > w.LATENCY && w.LATENCY >= w.COST);
});

test('un proveedor con HIGH_RISK > 0 NO gana por barato o rapido', () => {
  const res = evaluateProviders([
    { name: 'barato-rapido-riesgoso', benchmark: bench({ HIGH_RISK_FAILS: 1, ACCURACY: 99, ESTIMATED_COST: 0.01, LATENCY: { p95_ms: 100 } }), privacy_profile: { kind: 'external', data_terms_reviewed: true, zero_retention_confirmed: true, data_residency_ok: true } },
    { name: 'lento-caro-seguro', benchmark: bench({ HIGH_RISK_FAILS: 0, ACCURACY: 91, ESTIMATED_COST: 50, LATENCY: { p95_ms: 5000 } }), privacy_profile: { kind: 'external', data_terms_reviewed: true } },
  ]);
  assert.equal(res.winner, 'lento-caro-seguro');
  assert.equal(res.ranking[0].name, 'lento-caro-seguro');
  const risky = res.ranking.find((r) => r.name === 'barato-rapido-riesgoso');
  assert.equal(risky.eligible, false);
  assert.ok(risky.ineligible_reasons.some((x) => x.startsWith('HIGH_RISK_FAILS')));
  assert.ok(res.ranking.indexOf(risky) > 0, 'siempre por debajo de cualquier elegible');
  // si TODOS tienen riesgo, no hay ganador
  assert.equal(evaluateProviders([{ name: 'a', benchmark: bench({ HIGH_RISK_FAILS: 2 }), privacy_profile: { kind: 'local' } }]).winner, null);
});

test('modelo de decision: costo DATA_GAP no decide; privacidad y exactitud minima son compuertas; un local sin riesgos puede ganar', () => {
  const res = evaluateProviders([
    { name: 'externo-sin-terminos', benchmark: bench(), privacy_profile: { kind: 'external', data_terms_reviewed: false } },
    { name: 'externo-impreciso', benchmark: bench({ ACCURACY: 80 }), privacy_profile: { kind: 'external', data_terms_reviewed: true } },
    { name: 'local', benchmark: bench({ kind: 'local', ACCURACY: 92 }), privacy_profile: { kind: 'local' } },
  ]);
  assert.equal(res.cost_considered, false);
  assert.equal(res.winner, 'local');
  assert.ok(res.ranking.find((r) => r.name === 'externo-sin-terminos').ineligible_reasons.includes('PRIVACY_TERMS_NOT_REVIEWED'));
  assert.ok(res.ranking.find((r) => r.name === 'externo-impreciso').ineligible_reasons.some((x) => x.startsWith('ACCURACY_BELOW')));
  // con costos reales de todos, el costo entra con el menor peso
  const withCost = evaluateProviders([
    { name: 'a', benchmark: bench({ ESTIMATED_COST: 10 }), privacy_profile: { kind: 'external', data_terms_reviewed: true } },
    { name: 'b', benchmark: bench({ ESTIMATED_COST: 20 }), privacy_profile: { kind: 'external', data_terms_reviewed: true } },
  ]);
  assert.equal(withCost.cost_considered, true);
  assert.equal(withCost.winner, 'a');
});

// ---- reporte dual shadow ------------------------------------------------------------------------------------------------------------------------
test('reporte DUAL SHADOW: RULES_ONLY, HYBRID_PROVIDER_X, EXPECTED, DIFFERENCE, SAFETY_OVERRIDE, FINAL_RULE_ACTION; el proveedor nunca controla outbound', async () => {
  const p03 = BLIND_V3.find((c) => c.id === 'P03');
  const row = await runCaseBothModes(p03, { makeOdoo: () => makeFakeOdoo(), provider: new OracleMock(), hybridOptions: { timeoutMs: 100 } });
  const rep = buildShadowReport(row, { provider: 'x' });
  for (const k of ['RULES_ONLY', 'HYBRID_PROVIDER_X', 'EXPECTED', 'DIFFERENCE', 'SAFETY_OVERRIDE', 'FINAL_RULE_ACTION']) assert.ok(k in rep, k);
  assert.equal(rep.PROVIDER_CONTROLS_OUTBOUND, false);
  assert.equal(rep.OUTBOUND, null);
  assert.ok(rep.DIFFERENCE.some((d) => d.startsWith('escalamiento')), 'el hibrido resuelve lo que las reglas no entendian');
  const txt = renderShadowReport(rep);
  for (const line of ['RULES_ONLY:', 'HYBRID_PROVIDER_X:', 'EXPECTED:', 'DIFFERENCE:', 'SAFETY_OVERRIDE:', 'FINAL_RULE_ACTION:', 'PROVIDER_CONTROLS_OUTBOUND: false']) assert.ok(txt.includes(line), line);
  // con un LLM que intenta debilitar, el override queda registrado y la accion final es la de reglas
  const bad = BLIND_V3.find((c) => c.id === 'K03');
  const r2 = await runCaseBothModes(bad, { makeOdoo: () => makeFakeOdoo(), provider: adversarialMock(), hybridOptions: { timeoutMs: 100 } });
  const rep2 = buildShadowReport(r2, { provider: 'adversarial' });
  assert.equal(rep2.FINAL_RULE_ACTION.escalate, true);
  assert.equal(rep2.PROVIDER_CONTROLS_OUTBOUND, false);
});
