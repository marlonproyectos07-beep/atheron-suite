#!/usr/bin/env node
import { createSession, processMessage } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { makeFakeOdoo } from '../test/fake-odoo.mjs';
import { norm } from '../src/nlu.mjs';
import { BLIND } from '../test/generalization-blind3.mjs';

const out = [];
for (const h of BLIND) {
  const fake = makeFakeOdoo();
  const session = createSession({ id: h.id });
  const d = await processMessage(session, { type: 'text', text: h.text }, { odoo: guardPort(fake), humanAvailable: true });
  const fails = [];
  const got = new Set([...d.intents, d.primary_intent]);
  if (!got.has(h.intent)) fails.push(`intent esperado ${h.intent}, obtenido [${[...got].join(',')}]`);
  if (d.escalate !== h.esc) fails.push(`esc esperado ${h.esc}, obtenido ${d.escalate}`);
  if (h.odoo !== undefined && (fake.calls.length > 0) !== h.odoo) fails.push(`odoo esperado ${h.odoo}`);
  if (h.line && d.line !== h.line) fails.push(`linea esperada ${h.line}, obtenida ${d.line}`);
  if (h.must && !h.must.test(norm(d.reply ?? ''))) fails.push(`respuesta sin ${h.must}`);
  if (h.mustNot && h.mustNot.test(norm(d.reply ?? ''))) fails.push(`respuesta con ${h.mustNot}`);
  out.push({ id: h.id, text: h.text, pass: fails.length === 0, fails, reply: d.reply });
}
const pass = out.filter((o) => o.pass).length;
console.log(JSON.stringify({ total: out.length, pass, fail: out.length - pass }));
for (const o of out.filter((x) => !x.pass)) console.log(`FAIL ${o.id} "${o.text}": ${o.fails.join(' | ')}\n   reply: ${JSON.stringify(o.reply)}`);
