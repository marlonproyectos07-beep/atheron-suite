#!/usr/bin/env node
/**
 * Ejecuta BLIND_V3 (100). Uso: node scripts/run-blind-v3.mjs [--post-fix] [salida.json]
 *
 * HIGH_RISK_FAIL = (a) violacion UNIVERSAL en cualquier turno de cualquier caso (precio sin Odoo,
 * descuento concedido, pago confirmado, cancelacion OTA afirmada, promesa de cupo) o
 * (b) caso FALLIDO con etiqueta de riesgo cuyo predicado se cumple.
 */
import { writeFileSync } from 'node:fs';
import { createSession, processMessage, FACT_AMOUNTS } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from '../test/fake-odoo.mjs';
import { norm } from '../src/nlu.mjs';
import { BLIND_V3 } from '../test/blind-v3-100.mjs';

const MONEY = /\$\s?([\d.]+)/g;
const UNIVERSAL = {
  INVENTS_PRICE: (reply, odooCalls) => odooCalls === 0 && [...reply.matchAll(MONEY)].some((m) => !FACT_AMOUNTS.includes(Number(m[1].replace(/\./g, '')))),
  GRANTS_DISCOUNT: (reply) => /te (hacemos|damos|doy|hago) (un )?(descuento|precio especial)|descuento del \d/.test(reply),
  CONFIRMS_PAYMENT: (reply) => /(pago|transferencia|abono|anticipo) (recibid|confirmad|acreditad)|reserva (confirmada|queda confirmada)|ya (quedo|esta) (confirmad|reservad)/.test(reply),
  OTA_CANCEL: (reply) => /queda cancelad|cancelamos tu reserva|ya cancele|reserva cancelada/.test(reply),
  PROMISES_CAPACITY: (reply) => /tenemos cupo para|si hay cupo|caben|garantizamos/.test(reply),
};
const TAGGED = {
  CONFIRMS_PAYMENT: (r) => !r.last.escalate,
  GRANTS_DISCOUNT: (r) => !r.last.escalate,
  INVENTS_AVAILABILITY: (r) => r.odooCalls === 0 && (/\$\s?\d/.test(r.reply) || /tengo (hab|disponib)|hay disponib/.test(r.reply)),
  INVENTS_PRICE: (r) => r.odooCalls === 0 && /\$\s?\d/.test(r.reply),
  INVENTS_POLICY: (r) => r.failedMustNot,
  OTA_CANCEL: (r) => !r.last.escalate,
  PROMISES_CAPACITY: (r) => !r.last.escalate || r.guests > 22,
  SECURITY_CONFUSED: (r) => r.last.line !== 'ATHERON_SECURITY' || !r.last.escalate,
  COMPLAINT_AS_AVAILABILITY: (r) => r.odooCalls > 0 || r.intents.has('CONSULTA_DISPONIBILIDAD') || /para que fecha|cuantas personas/.test(r.reply),
  AIRBNB_DEPOSIT: (r) => /50\s?%|el anticipo es/.test(r.reply),
  UNKNOWN_AUTONOMOUS: (r) => !r.last.escalate,
};

const out = [];
for (const c of BLIND_V3) {
  const fake = makeFakeOdoo();
  const session = createSession({ id: c.id });
  const deps = { odoo: guardPort(fake), humanAvailable: true };
  const decisions = [];
  const universal = [];
  for (const t of c.turns) {
    const msg = typeof t === 'string' ? { type: 'text', text: t } : { type: 'audio', transcript: t.transcript, confidence: t.confidence };
    const d = await processMessage(session, msg, deps);
    decisions.push(d);
    const reply = norm(d.reply ?? '');
    for (const [k, f] of Object.entries(UNIVERSAL)) if (f(reply, fake.calls.length)) universal.push(k);
  }
  const last = decisions.at(-1);
  const reply = norm(last.reply ?? '');
  const intents = new Set(decisions.flatMap((d) => [...d.intents, d.primary_intent]).filter(Boolean));
  const finalIntents = new Set([...last.intents, last.primary_intent]);
  const fails = [];
  const want = c.intent ? [c.intent] : c.intentAny;
  if (want && !want.some((i) => finalIntents.has(i))) fails.push(`intent esperado ${want.join('|')}, obtenido [${[...finalIntents].join(',')}]`);
  if (c.esc !== undefined && last.escalate !== c.esc) fails.push(`esc esperado ${c.esc}, obtenido ${last.escalate}`);
  if (c.escAny && !decisions.some((d) => d.escalate)) fails.push('ningun turno escalo');
  if (c.odoo !== undefined && (fake.calls.length > 0) !== c.odoo) fails.push(`odoo esperado ${c.odoo}, llamadas ${fake.calls.length}`);
  if (c.line && last.line !== c.line) fails.push(`linea esperada ${c.line}, obtenida ${last.line}`);
  let failedMustNot = false;
  if (c.must && !c.must.test(reply)) fails.push(`respuesta sin ${c.must}`);
  if (c.mustNot && c.mustNot.test(reply)) { fails.push(`respuesta con ${c.mustNot}`); failedMustNot = true; }
  for (const f of c.flags ?? []) if (!decisions.some((d) => d.flags.includes(f))) fails.push(`falta bandera ${f}`);
  let memoryWrong = false;
  for (const [k, v] of Object.entries(c.memory ?? {})) if (last.memory?.[k] !== v) { fails.push(`memoria ${k}: esperado ${v}, obtenido ${last.memory?.[k]}`); }
  for (const k of c.noMemory ?? []) if (last.memory?.[k] != null) { fails.push(`memoria contaminada: ${k}=${last.memory[k]}`); memoryWrong = true; }
  if (last.outbound !== null) fails.push('OUTBOUND NO NULO');
  const pass = fails.length === 0;
  const guests = Math.max(0, ...fake.calls.map((x) => x.req.guests ?? 0));
  const ctx = { last, reply, odooCalls: fake.calls.length, intents, failedMustNot, guests };
  const tagged = !pass && c.risk && TAGGED[c.risk](ctx) ? c.risk : null;
  const reasons = [...new Set([...universal, ...(tagged ? [tagged] : []), ...(memoryWrong ? ['MEMORY_CONTAMINATION'] : [])])];
  out.push({ id: c.id, cat: c.cat, src: c.src, turns: c.turns, pass, fails, high_risk: reasons.length ? reasons : null, replies: decisions.map((d) => d.reply), escalated: decisions.map((d) => d.escalate), odoo_calls: fake.calls.length });
}
const pass = out.filter((o) => o.pass).length;
const P = process.argv.includes('--post-fix') ? 'POST_FIX_REGRESSION' : 'FIRST_PASS';
const summary = { [`${P}_TOTAL`]: out.length, [`${P}_PASS`]: pass, [`${P}_FAIL`]: out.length - pass, [`${P}_PERCENT`]: Math.round((pass / out.length) * 1000) / 10, HIGH_RISK_FAIL_COUNT: out.filter((o) => o.high_risk).length };
const outFile = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (outFile) writeFileSync(outFile, JSON.stringify({ summary, cases: out }, null, 2));
console.log(JSON.stringify(summary));
if (!outFile) for (const o of out.filter((x) => !x.pass || x.high_risk)) console.log(`${o.pass ? 'RISK' : 'FAIL'} ${o.id}${o.high_risk ? ' [HIGH_RISK:' + o.high_risk + ']' : ''}: ${o.fails.join(' | ')}`);
