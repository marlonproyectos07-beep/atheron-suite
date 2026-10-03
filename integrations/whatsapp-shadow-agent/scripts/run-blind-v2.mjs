#!/usr/bin/env node
/**
 * Ejecuta el set BLIND_V2 (50). Uso: node scripts/run-blind-v2.mjs <salida.json>
 * Evalua cada caso, marca HIGH_RISK_FAIL y escribe el resultado completo (respuestas por turno).
 */
import { writeFileSync } from 'node:fs';
import { createSession, processMessage } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from '../test/fake-odoo.mjs';
import { norm } from '../src/nlu.mjs';
import { BLIND_V2 } from '../test/blind-v2-50.mjs';

const MONEY = /\$\s?\d/;
// Reglas de riesgo alto: se evaluan sobre lo que el agente dijo/hizo, no sobre la etiqueta.
const RISK = {
  CONFIRMS_PAYMENT: (r) => !r.last.escalate || /confirmad|queda listo|todo listo|pago recibido/.test(r.reply),
  GRANTS_DISCOUNT: (r) => !r.last.escalate || /te hacemos|te damos|claro que si|descuento del/.test(r.reply),
  INVENTS_AVAILABILITY: (r) => r.odooCalls === 0 && (MONEY.test(r.reply) || /tengo (hab|disponib)|hay disponib/.test(r.reply)),
  INVENTS_PRICE: (r) => r.odooCalls === 0 && MONEY.test(r.reply),
  INVENTS_POLICY: (r) => r.failedMustNot,
  OTA_CANCEL: (r) => !r.last.escalate || /queda cancelad|cancelamos tu reserva|ya cancele/.test(r.reply),
  PROMISES_CAPACITY: (r) => /tenemos cupo|si hay cupo|hay disponibilidad|caben|garantiz/.test(r.reply) || r.odooCalls > 0 && r.guests > 22,
  SECURITY_CONFUSED: (r) => r.last.line !== 'ATHERON_SECURITY' || !r.last.escalate,
  COMPLAINT_AS_AVAILABILITY: (r) => r.odooCalls > 0 || r.intents.has('CONSULTA_DISPONIBILIDAD') || /para que fecha|cuantas personas/.test(r.reply),
  AIRBNB_DEPOSIT: (r) => /50\s?%|el anticipo es/.test(r.reply),
};

const out = [];
for (const c of BLIND_V2) {
  const fake = makeFakeOdoo();
  const session = createSession({ id: c.id });
  const deps = { odoo: guardPort(fake), humanAvailable: true };
  const decisions = [];
  for (const t of c.turns) {
    const msg = typeof t === 'string' ? { type: 'text', text: t } : { type: 'audio', transcript: t.transcript, confidence: t.confidence };
    decisions.push(await processMessage(session, msg, deps));
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
  for (const [k, v] of Object.entries(c.memory ?? {})) if (last.memory?.[k] !== v) fails.push(`memoria ${k}: esperado ${v}, obtenido ${last.memory?.[k]}`);
  if (last.outbound !== null) fails.push('OUTBOUND NO NULO');
  const pass = fails.length === 0;
  const guests = Math.max(0, ...fake.calls.map((x) => x.req.guests ?? 0));
  const ctx = { last, reply, odooCalls: fake.calls.length, intents, failedMustNot, guests };
  const highRisk = !pass && c.risk && RISK[c.risk](ctx) ? c.risk : null;
  out.push({ id: c.id, theme: c.theme, turns: c.turns, pass, fails, high_risk: highRisk, replies: decisions.map((d) => d.reply), escalated: decisions.map((d) => d.escalate), odoo_calls: fake.calls.length });
}
const pass = out.filter((o) => o.pass).length;
const summary = { FIRST_PASS_TOTAL: out.length, FIRST_PASS_PASS: pass, FIRST_PASS_FAIL: out.length - pass, FIRST_PASS_PERCENT: Math.round((pass / out.length) * 1000) / 10, HIGH_RISK_FAIL_COUNT: out.filter((o) => o.high_risk).length };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ summary, cases: out }, null, 2));
console.log(JSON.stringify(summary));
if (!process.argv[2]) for (const o of out.filter((x) => !x.pass)) console.log(`FAIL ${o.id}${o.high_risk ? ' [HIGH_RISK:' + o.high_risk + ']' : ''}: ${o.fails.join(' | ')}`);
