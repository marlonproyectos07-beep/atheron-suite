/**
 * Arnes de pruebas del Playbook v0.1. Cada caso T01..T100 se toma del JSON
 * extraido del propio archivo (INPUT, EXPECTED_INTENT, ODOO, ESC...) y se
 * ejecuta contra el agente SHADOW. Las expectativas por defecto salen del
 * Playbook; cualquier desviacion (spec distinta de lo que dice el Playbook)
 * EXIGE una razon escrita y queda listada en el reporte: nada se oculta.
 */
import { createSession, processBurst, processMessage, FACT_AMOUNTS } from './agent.mjs';
import { guardPort } from './odoo-port.mjs';
import { lintReply } from './lint.mjs';
import { norm } from './nlu.mjs';
import { makeFakeOdoo } from '../test/fake-odoo.mjs';

const stripAcc = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Tokens de intencion del Playbook (MAYUSCULAS, sin acentos). */
export function intentTokens(expected) {
  const toks = expected.split(/[\s/+]+/).filter((t) => /^[A-ZÁÉÍÓÚÑ0-9_]+$/.test(t)).map((t) => stripAcc(t));
  return toks;
}

const ALIAS = {
  CONSULTA: ['CONSULTA_DISPONIBILIDAD', 'CONSULTA_PRECIO'], // etiqueta generica del Playbook (T44, T66)
  PRECIO: ['CONSULTA_PRECIO', 'DESCUENTO', 'OBJECION_PRECIO'], // T45: precio por varias noches
  PRESUPUESTO: ['PRESUPUESTO_LIMITADO'],
  ACLARACION: ['ACLARACION_PRECIO'],
  UBICACION_PARQ: ['UBICACION_PARQ', 'PARQUEADERO'],
  SELECCION: ['SELECCION'],
  NOCHES: ['NOCHES', 'CAMBIO_FECHAS'],
};

export function defaultExpectations(c) {
  const esc = /^S[ií]( \(.*\))?$/.test(c.esc) || /^S[ií] hasta definir regla$/.test(c.esc) ? 'yes' : /^No$/.test(c.esc) ? 'no' : 'any';
  const odoo = /^S[ií]/.test(c.odoo) ? 'must' : /^No/.test(c.odoo) ? 'mustNot' : 'any';
  return { esc, odoo, intents: intentTokens(c.expected_intent) };
}

/** INPUT del Playbook -> mensajes (texto entre comillas, audio, llamada). */
export function parseInput(raw) {
  const quotes = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (/^\[Llamada/i.test(raw)) return [{ type: 'call', direction: 'missed' }];
  if (/^\[Audio/i.test(raw)) {
    const dur = raw.match(/(\d+) s/);
    return [{ type: 'audio', transcript: quotes[0] ?? null, confidence: quotes[0] ? 0.9 : 0.2, duration_s: dur ? Number(dur[1]) : null }];
  }
  if (quotes.length > 1) return quotes.map((q) => ({ type: 'text', text: q }));
  if (quotes.length === 1) return [{ type: 'text', text: quotes[0] }];
  return [{ type: 'text', text: raw }];
}

async function say(session, input, deps) {
  if (typeof input === 'string') return processMessage(session, { type: 'text', text: input }, deps);
  if (Array.isArray(input)) return processBurst(session, input.map((x) => (typeof x === 'string' ? { type: 'text', text: x } : x)), deps);
  return processMessage(session, input, deps);
}

function collectAmounts(odooCalls, session, seedAmounts) {
  const set = new Set(FACT_AMOUNTS);
  const add = (v) => {
    if (typeof v === 'number') {
      set.add(v);
      set.add(Math.round(v * 50) / 100);
    }
  };
  seedAmounts.forEach(add);
  for (const c of odooCalls) for (const r of c.results ?? []) for (const o of r.options ?? []) add(o.total);
  if (session.lastQuote?.total) add(session.lastQuote.total);
  for (const o of session.lastOptions) add(o.total);
  return [...set];
}

export async function runCase(c, spec = {}) {
  const defaults = defaultExpectations(c);
  const expect = { esc: spec.expect?.esc ?? defaults.esc, odoo: spec.expect?.odoo ?? defaults.odoo };
  const deviations = [];
  const asBool = (v) => (v === true ? 'yes' : v === false ? 'no' : v);
  const escExpect = asBool(expect.esc);
  if (defaults.esc !== 'any' && escExpect !== defaults.esc) deviations.push({ field: 'ESC', playbook: c.esc, applied: escExpect, reason: spec.adjust ?? null });
  if (defaults.odoo !== 'any' && expect.odoo !== defaults.odoo) deviations.push({ field: 'ODOO', playbook: c.odoo, applied: expect.odoo, reason: spec.adjust ?? null });

  const fake = makeFakeOdoo(spec.odoo ?? {});
  const session = createSession({ id: c.id });
  // Conversacion ya empezada (el CONTEXT del Playbook describe turnos previos): el agente ya saludo
  const NEW_CHAT = /^(Chat nuevo|—|Sin reserva|Sin propiedad|Sin m[aá]s datos|Sin a[nñ]o ni mes|L[ií]nea de aliados|L[ií]nea Security|Click-to-WhatsApp|Plantilla enviada|Cualquier|Sin humano)/i;
  session.greeted = !NEW_CHAT.test(c.context);
  spec.seed?.(session);
  const greetedBefore = session.greeted || (spec.before?.length ?? 0) > 0;
  const port = guardPort(fake);
  const deps = { odoo: port, humanAvailable: spec.humanAvailable ?? true };

  for (const prev of spec.before ?? []) await say(session, prev, deps);
  const callsBefore = fake.calls.length;
  session.lastSeedOptions = undefined;

  const parsed = spec.input ?? parseInput(c.input);
  const d = await say(session, parsed, deps);
  const newCalls = fake.calls.slice(callsBefore);

  const failures = [];
  if (spec.missingSpec) failures.push('SIN_SPEC');
  // 1. SHADOW: nunca se envia nada ni se crea HOLD
  if (d.outbound !== null) failures.push('OUTBOUND_NO_NULL');
  if (d.hold !== null) failures.push('HOLD_CREADO');
  if (d.mode !== 'SHADOW') failures.push('MODO_NO_SHADOW');
  // 2. Intencion
  const tokens = defaults.intents.flatMap((t) => ALIAS[t] ?? [t]);
  const got = new Set([...d.intents, d.primary_intent].filter(Boolean));
  const intentOk = tokens.length === 0 || tokens.some((t) => got.has(t));
  if (!intentOk) failures.push(`INTENT: esperado alguno de [${tokens.join(', ')}], obtenido [${[...got].join(', ')}]`);
  // 3. Escalacion
  if (escExpect === 'yes' && !d.escalate) failures.push('ESC: debia escalar');
  if (escExpect === 'no' && d.escalate) failures.push(`ESC: no debia escalar (${d.escalation?.reason})`);
  // 4. Odoo
  const called = newCalls.length > 0;
  if (expect.odoo === 'must' && !called) failures.push('ODOO: debia consultarse');
  if (expect.odoo === 'mustNot' && called) failures.push('ODOO: no debia consultarse');
  // 5. Respuesta
  const reply = d.reply;
  if (reply === null && !spec.silent) failures.push('REPLY: respuesta vacia');
  if (reply !== null && spec.silent) failures.push('REPLY: debia callar (B2B)');
  const nr = reply ? norm(reply) : '';
  for (const re of spec.must ?? []) if (!re.test(nr)) failures.push(`REPLY must ${re}`);
  for (const re of spec.mustNot ?? []) if (re.test(nr)) failures.push(`REPLY mustNot ${re}`);
  if (spec.maxLines && reply && reply.split('\n').filter(Boolean).length > spec.maxLines) failures.push(`REPLY lineas > ${spec.maxLines}`);
  if (spec.maxChars && reply && reply.length > spec.maxChars) failures.push(`REPLY largo > ${spec.maxChars}`);
  for (const f of spec.flags ?? []) if (!d.flags.some((x) => x.startsWith(f))) failures.push(`FLAG ${f}`);
  for (const l of spec.labels ?? []) if (!d.labels.includes(l)) failures.push(`LABEL ${l}`);
  if (greetedBefore && reply && /^¡?hola/i.test(reply)) failures.push('SALUDO_REPETIDO');
  // 6. Lint de estilo/seguridad
  const userEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
  const lint = lintReply(reply, { userUsedEmoji: userEmoji, allowedAmounts: collectAmounts(newCalls.map((x, i) => ({ results: d.odoo.results })), session, spec.seedAmounts ?? []) });
  for (const l of lint) failures.push(`LINT ${l}`);
  // 7. Desviaciones sin razon = falla
  for (const dv of deviations) if (!dv.reason) failures.push(`DESVIACION_SIN_RAZON ${dv.field}`);

  return {
    id: c.id,
    section: c.section,
    pass: failures.length === 0,
    failures,
    deviations,
    intent: d.primary_intent,
    escalated: d.escalate,
    escalation_reason: d.escalation?.reason ?? null,
    odoo_called: called,
    reply,
  };
}

export async function runAll(cases, specs) {
  const results = [];
  for (const c of cases) results.push(await runCase(c, specs[c.id] ?? { missingSpec: true }));
  return results;
}
