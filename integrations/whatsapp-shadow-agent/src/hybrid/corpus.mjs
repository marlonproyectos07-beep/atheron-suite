/**
 * Contrato de ingestion del corpus V4 (mensajes reales ANONIMIZADOS) + validador + escaneo de privacidad.
 * Formato y reglas: AI/whatsapp/V4_CORPUS_SCHEMA.md. No contiene casos: solo el cargador/validador.
 *
 * Veredictos: CORPUS_ACCEPTED | CORPUS_REJECTED_FOR_PRIVACY | CORPUS_REJECTED_INVALID.
 * El informe de privacidad NUNCA copia el texto detectado: solo caso, campo, tipo y severidad.
 * Si hay cualquier hallazgo de privacidad el corpus se rechaza (mejor re-anonimizar que arriesgar).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { INTENTS } from './schema.mjs';
import { redactPII } from './pii.mjs';
import { scanFragments } from './privacy.mjs';

export const CORPUS_VERSION = 'v4.0';
export const SOURCES = Object.freeze(['REAL_OBSERVED_ANONYMIZED', 'REAL_VARIANT', 'SYNTHETIC']);
export const EXPECTED_ACTIONS = Object.freeze(['REPLY_INFO', 'REPLY_ASK_MISSING', 'QUERY_ODOO', 'ESCALATE_HUMAN', 'ESCALATE_PAYMENT_VALIDATION', 'ESCALATE_OTA', 'ROUTE_SECURITY', 'ROUTE_B2B', 'ESCALATE_GROUP']);
export const RISK_CLASSES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
export const RISK_TAGS = Object.freeze(['CONFIRMS_PAYMENT', 'GRANTS_DISCOUNT', 'INVENTS_AVAILABILITY', 'INVENTS_PRICE', 'INVENTS_POLICY', 'OTA_CANCEL', 'PROMISES_CAPACITY', 'SECURITY_CONFUSED', 'COMPLAINT_AS_AVAILABILITY', 'AIRBNB_DEPOSIT', 'UNKNOWN_AUTONOMOUS']);
export const ROLES = Object.freeze(['guest', 'agent', 'staff']);

const CORPUS_KEYS = ['corpus_version', 'corpus_id', 'anonymization', 'cases'];
const ANON_KEYS = ['performed', 'method', 'reviewer', 'reviewed_at'];
const CASE_KEYS = ['case_id', 'source', 'conversation_turns', 'expected_intent', 'expected_action', 'risk_class', 'risk_tag', 'contains_payment_context', 'contains_ota_context', 'expected_memory', 'expected_odoo', 'annotator_note'];
const TURN_KEYS = ['role', 'text', 'type', 'transcript', 'confidence'];
const MEMORY_KEYS = ['guests', 'check_in'];
const PAYMENT_WORDS = /\b(nequi|daviplata|transfer\w*|consign\w*|pago|pagu\w*|pagar|comprobante|abono|abonar|anticipo|tarjeta|deposit\w*|pantallazo|captura)\b/;
const OTA_WORDS = /\b(booking|airbnb|plataforma)\b/;
const ID_RE = /^V4-\d{3,4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Terminos con mayuscula que NO son nombres de personas (lugares, marcas, saludos, dias, meses). */
export const NAME_ALLOWLIST = Object.freeze(new Set(['hola', 'buenas', 'buenos', 'buen', 'gracias', 'dias', 'tardes', 'noches', 'dia', 'hotel', 'hoteles', 'atheron', 'suite', 'security', 'zipaquira', 'zipa', 'catedral', 'sal', 'salinas', 'booking', 'airbnb', 'nequi', 'daviplata', 'bancolombia', 'davivienda', 'colombia', 'bogota', 'medellin', 'cali', 'barranquilla', 'cartagena', 'cundinamarca', 'casa', 'apartamentos', 'algarra', 'neusa', 'colonial', 'confort', 'margarita', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre', 'semana', 'santa', 'navidad', 'pascua', 'ok', 'wifi', 'whatsapp', 'pse', 'qr', 'tv', 'eps', 'iva', 'si', 'no', 'ya', 'el', 'la', 'los', 'las', 'un', 'una', 'por', 'para', 'que', 'como', 'cuando', 'donde', 'quiero', 'queria', 'necesito', 'tienen', 'tiene', 'hay', 'es', 'son', 'me', 'mi', 'se', 'te', 'le', 'lo', 'al', 'del', 'de', 'en', 'con', 'y', 'o', 'a', 'estimados', 'senores', 'sres', 'favor', 'perdon', 'disculpe', 'disculpa', 'listo', 'claro', 'perfecto', 'bueno', 'entonces', 'feliz', 'cumple', 'saludos']));

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const unknownKeys = (o, allowed, path, errors) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${path}: campo desconocido "${k}"`); };

/** Nombres "evidentes": palabra capitalizada a mitad de frase que no es lugar/marca/saludo, o par capitalizado. */
export function nameHeuristic(text, allowTerms = []) {
  const allow = new Set([...NAME_ALLOWLIST, ...allowTerms.map(fold)]);
  const hits = [];
  const sentences = String(text).split(/(?<=[.!?¿¡])\s+|\n+/);
  for (const sent of sentences) {
    const toks = sent.split(/\s+/).map((t) => t.replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ[\]]+|[^A-Za-zÁÉÍÓÚÑáéíóúñ\]]+$/g, '')).filter(Boolean);
    toks.forEach((t, i) => {
      if (!/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}$/.test(t)) return;
      if (allow.has(fold(t))) return;
      const next = toks[i + 1];
      const pair = next && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}$/.test(next) && !allow.has(fold(next));
      if (i > 0 || pair) hits.push(i);
    });
  }
  return hits.length;
}

function fieldsOf(c) {
  const out = [{ path: 'case_id', text: String(c.case_id ?? '') }];
  (c.conversation_turns ?? []).forEach((t, i) => {
    if (typeof t?.text === 'string') out.push({ path: `conversation_turns[${i}].text`, text: t.text });
    if (typeof t?.transcript === 'string') out.push({ path: `conversation_turns[${i}].transcript`, text: t.transcript });
  });
  if (typeof c.annotator_note === 'string') out.push({ path: 'annotator_note', text: c.annotator_note });
  return out;
}

/** Escaneo de privacidad: devuelve el informe sin ningun valor sensible. */
export function scanCorpusPrivacy(corpus, { allowTerms = [] } = {}) {
  const findings = [];
  let scannedFields = 0;
  const bump = (case_id, field, type, severity = 'BLOCKER') => findings.push({ case_id, field, type, severity });
  const metaFields = [['corpus_id', corpus?.corpus_id], ['anonymization.method', corpus?.anonymization?.method], ['anonymization.reviewer', corpus?.anonymization?.reviewer]];
  for (const [path, v] of metaFields) {
    if (typeof v !== 'string') continue;
    scannedFields += 1;
    const r = redactPII(v);
    for (const type of Object.keys(r.redactions)) bump('(corpus)', path, type);
  }
  for (const c of Array.isArray(corpus?.cases) ? corpus.cases : []) {
    const id = String(c?.case_id ?? '(sin id)');
    for (const f of fieldsOf(c)) {
      scannedFields += 1;
      const r = redactPII(f.text);
      for (const type of Object.keys(r.redactions)) bump(id, f.path, type);
      for (const reason of r.sensitive_reasons) if (!(reason in r.redactions)) bump(id, f.path, reason);
      if (!f.path.startsWith('case_id') && nameHeuristic(f.text, allowTerms) > 0) bump(id, f.path, 'NAME_HEURISTIC', 'REVIEW');
    }
    const turnTexts = (c?.conversation_turns ?? []).filter((t) => t?.role === 'guest').map((t) => t.text ?? t.transcript ?? '');
    for (const fr of scanFragments(turnTexts).fragmented) if (fr.type === 'CARD' || fr.type === 'ACCOUNT') bump(id, 'conversation_turns[*]', `FRAGMENTED_${fr.type}`);
  }
  const by = {};
  for (const f of findings) by[f.type] = (by[f.type] ?? 0) + 1;
  return {
    verdict: findings.length ? 'CORPUS_REJECTED_FOR_PRIVACY' : 'CORPUS_ACCEPTED',
    scanned_cases: Array.isArray(corpus?.cases) ? corpus.cases.length : 0,
    scanned_fields: scannedFields,
    findings_by_type: by,
    findings,
    note: 'El informe no contiene los valores detectados.',
  };
}

/** Validacion estructural (esquema, enumeraciones, consistencia). No incluye texto de los mensajes en los errores. */
export function validateCorpusStructure(corpus) {
  const errors = [];
  if (!isObj(corpus)) return ['corpus: no es un objeto'];
  unknownKeys(corpus, CORPUS_KEYS, 'corpus', errors);
  if (corpus.corpus_version !== CORPUS_VERSION) errors.push(`corpus_version debe ser "${CORPUS_VERSION}"`);
  if (typeof corpus.corpus_id !== 'string' || corpus.corpus_id.length < 3) errors.push('corpus_id requerido');
  const a = corpus.anonymization;
  if (!isObj(a)) errors.push('anonymization requerido');
  else {
    unknownKeys(a, ANON_KEYS, 'anonymization', errors);
    if (a.performed !== true) errors.push('anonymization.performed debe ser true (atestacion de anonimizacion)');
    if (typeof a.method !== 'string' || a.method.trim().length < 10) errors.push('anonymization.method requerido (>=10 caracteres)');
    if (typeof a.reviewer !== 'string' || a.reviewer.trim().length < 2) errors.push('anonymization.reviewer requerido');
    if (typeof a.reviewed_at !== 'string' || !DATE_RE.test(a.reviewed_at)) errors.push('anonymization.reviewed_at debe ser YYYY-MM-DD');
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) { errors.push('cases debe ser una lista no vacia'); return errors; }
  const seen = new Set();
  corpus.cases.forEach((c, idx) => {
    const id = isObj(c) && typeof c.case_id === 'string' ? c.case_id : `cases[${idx}]`;
    const at = (m) => errors.push(`${id}: ${m}`);
    if (!isObj(c)) return at('no es un objeto');
    unknownKeys(c, CASE_KEYS, id, errors);
    if (!ID_RE.test(c.case_id ?? '')) at('case_id debe tener la forma V4-001');
    if (seen.has(c.case_id)) at('case_id duplicado');
    seen.add(c.case_id);
    if (!SOURCES.includes(c.source)) at(`source debe ser ${SOURCES.join('|')}`);
    const intents = [].concat(c.expected_intent ?? []);
    if (!intents.length || intents.some((i) => !INTENTS.includes(i))) at('expected_intent fuera del catalogo (string o lista)');
    if (!EXPECTED_ACTIONS.includes(c.expected_action)) at(`expected_action debe ser ${EXPECTED_ACTIONS.join('|')}`);
    if (!RISK_CLASSES.includes(c.risk_class)) at('risk_class debe ser LOW|MEDIUM|HIGH');
    if (c.risk_tag != null && !RISK_TAGS.includes(c.risk_tag)) at('risk_tag fuera del catalogo');
    if (c.risk_class === 'HIGH' && c.risk_tag == null) at('risk_class HIGH requiere risk_tag');
    if (typeof c.contains_payment_context !== 'boolean') at('contains_payment_context debe ser booleano');
    if (typeof c.contains_ota_context !== 'boolean') at('contains_ota_context debe ser booleano');
    if (c.expected_odoo != null && typeof c.expected_odoo !== 'boolean') at('expected_odoo debe ser booleano');
    if (c.annotator_note != null && (typeof c.annotator_note !== 'string' || c.annotator_note.length > 200)) at('annotator_note debe ser texto de hasta 200 caracteres');
    if (c.expected_memory != null) {
      if (!isObj(c.expected_memory)) at('expected_memory debe ser objeto');
      else {
        unknownKeys(c.expected_memory, MEMORY_KEYS, `${id}.expected_memory`, errors);
        if (c.expected_memory.guests != null && !(Number.isInteger(c.expected_memory.guests) && c.expected_memory.guests >= 1 && c.expected_memory.guests <= 500)) at('expected_memory.guests invalido');
        if (c.expected_memory.check_in != null && !DATE_RE.test(c.expected_memory.check_in)) at('expected_memory.check_in debe ser YYYY-MM-DD');
      }
    }
    const turns = c.conversation_turns;
    if (!Array.isArray(turns) || turns.length < 1 || turns.length > 12) { at('conversation_turns debe tener entre 1 y 12 turnos'); return; }
    let guestTexts = '';
    turns.forEach((t, i) => {
      const tid = `${id}.conversation_turns[${i}]`;
      if (!isObj(t)) { errors.push(`${tid}: no es un objeto`); return; }
      unknownKeys(t, TURN_KEYS, tid, errors);
      if (!ROLES.includes(t.role)) errors.push(`${tid}: role debe ser guest|agent|staff`);
      if (t.type === 'audio') {
        if (t.role !== 'guest') errors.push(`${tid}: solo el huesped envia audio`);
        if (typeof t.transcript !== 'string' || !t.transcript.trim() || t.transcript.length > 2000) errors.push(`${tid}: audio requiere transcript (1-2000)`);
        if (typeof t.confidence !== 'number' || t.confidence < 0 || t.confidence > 1) errors.push(`${tid}: confidence debe estar en [0,1]`);
        if (t.text != null) errors.push(`${tid}: audio no lleva text`);
      } else {
        if (t.type != null && t.type !== 'text') errors.push(`${tid}: type solo puede ser text|audio`);
        if (typeof t.text !== 'string' || !t.text.trim() || t.text.length > 2000) errors.push(`${tid}: text requerido (1-2000)`);
        if (t.transcript != null || t.confidence != null) errors.push(`${tid}: transcript/confidence solo en audio`);
      }
      if (t.role === 'guest') guestTexts += ` ${t.text ?? t.transcript ?? ''}`;
    });
    if (turns.at(-1)?.role !== 'guest') at('el ultimo turno debe ser del huesped');
    const g = fold(guestTexts);
    if (PAYMENT_WORDS.test(g) && c.contains_payment_context === false) at('contains_payment_context=false pero el texto menciona pago');
    if (OTA_WORDS.test(g) && c.contains_ota_context === false) at('contains_ota_context=false pero el texto menciona Booking/Airbnb');
    if (c.expected_action === 'ROUTE_SECURITY' && !intents.includes('FUERA_DE_ALCANCE')) at('ROUTE_SECURITY requiere expected_intent FUERA_DE_ALCANCE');
    if (c.expected_action === 'ROUTE_B2B' && !intents.some((i) => i.startsWith('ALIADO_'))) at('ROUTE_B2B requiere expected_intent ALIADO_*');
    if (c.expected_action === 'ESCALATE_PAYMENT_VALIDATION' && c.contains_payment_context !== true) at('ESCALATE_PAYMENT_VALIDATION requiere contains_payment_context=true');
    if (c.expected_action === 'ESCALATE_OTA' && c.contains_ota_context !== true) at('ESCALATE_OTA requiere contains_ota_context=true');
  });
  return errors;
}

/** Valida un corpus completo. @returns {{verdict:string, errors:string[], privacy_report:object, stats:object, sha256:string}} */
export function validateCorpus(input, opts = {}) {
  let corpus = input;
  let raw = typeof input === 'string' ? input : JSON.stringify(input ?? null);
  if (typeof input === 'string') {
    try { corpus = JSON.parse(input); } catch { return { verdict: 'CORPUS_REJECTED_INVALID', errors: ['JSON invalido'], privacy_report: null, stats: null, sha256: createHash('sha256').update(raw).digest('hex') }; }
  }
  const errors = validateCorpusStructure(corpus);
  const privacy_report = scanCorpusPrivacy(corpus, opts);
  const cases = Array.isArray(corpus?.cases) ? corpus.cases : [];
  const count = (key) => cases.reduce((m, c) => ({ ...m, [c?.[key]]: (m[c?.[key]] ?? 0) + 1 }), {});
  const real = cases.filter((c) => c?.source === 'REAL_OBSERVED_ANONYMIZED').length;
  const stats = { total: cases.length, by_source: count('source'), by_risk_class: count('risk_class'), by_action: count('expected_action'), real_observed_percent: cases.length ? Math.round((real / cases.length) * 1000) / 10 : 0 };
  const verdict = privacy_report.verdict === 'CORPUS_REJECTED_FOR_PRIVACY' ? 'CORPUS_REJECTED_FOR_PRIVACY' : errors.length ? 'CORPUS_REJECTED_INVALID' : 'CORPUS_ACCEPTED';
  return { verdict, errors, privacy_report, stats, sha256: createHash('sha256').update(raw).digest('hex') };
}

/** Lee un archivo de corpus; la lectura es local y no envia nada. */
export function loadCorpusFile(path, opts = {}) {
  return validateCorpus(readFileSync(path, 'utf8'), opts);
}

const ACTION_EXPECT = {
  REPLY_INFO: { esc: false },
  REPLY_ASK_MISSING: { esc: false, odoo: false },
  QUERY_ODOO: { esc: false, odoo: true },
  ESCALATE_HUMAN: { esc: true },
  ESCALATE_PAYMENT_VALIDATION: { esc: true, flags: ['PAYMENT_VALIDATION_REQUIRED'] },
  ESCALATE_OTA: { esc: true },
  ROUTE_SECURITY: { esc: true, line: 'ATHERON_SECURITY' },
  ROUTE_B2B: { esc: true, line: 'ALLY_B2B' },
  ESCALATE_GROUP: { esc: true },
};

/** Convierte un corpus ACEPTADO al formato de casos del evaluador/benchmark (mismo de BLIND_V2/V3). */
export function corpusToBlindCases(corpus) {
  return corpus.cases.map((c) => {
    const intents = [].concat(c.expected_intent);
    const exp = ACTION_EXPECT[c.expected_action];
    return {
      id: c.case_id,
      cat: c.source,
      src: c.source,
      turns: c.conversation_turns.filter((t) => t.role === 'guest').map((t) => (t.type === 'audio' ? { audio: true, transcript: t.transcript, confidence: t.confidence } : t.text)),
      ...(intents.length === 1 ? { intent: intents[0] } : { intentAny: intents }),
      ...exp,
      ...(c.expected_odoo != null ? { odoo: c.expected_odoo } : {}),
      ...(c.expected_memory ? { memory: { ...(c.expected_memory.guests != null ? { guests: c.expected_memory.guests } : {}), ...(c.expected_memory.check_in ? { checkIn: c.expected_memory.check_in } : {}) } } : {}),
      ...(c.risk_tag ? { risk: c.risk_tag } : {}),
    };
  });
}
