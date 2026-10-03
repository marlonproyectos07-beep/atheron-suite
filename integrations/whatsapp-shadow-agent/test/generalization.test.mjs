/**
 * Regresion de generalizacion. Tasas de la PRIMERA corrida (antes de
 * corregir): HELD_OUT 23/30 (77 %), BLIND 8/15 (53 %), BLIND2 10/15 (67 %).
 * Tras corregir las causas generales, estos tres conjuntos pasan completos,
 * pero ya NO son ciegos: la medida independiente es la de la primera corrida.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, processMessage } from '../src/agent.mjs';
import { guardPort } from '../src/odoo-port.mjs';
import { lintReply } from '../src/lint.mjs';
import { makeFakeOdoo } from './fake-odoo.mjs';
import { norm } from '../src/nlu.mjs';
import { HELD_OUT } from './generalization.mjs';
import { BLIND } from './generalization-blind.mjs';
import { BLIND as BLIND2 } from './generalization-blind2.mjs';

async function run(h) {
  const fake = makeFakeOdoo();
  const d = await processMessage(createSession({ id: h.id }), { type: 'text', text: h.text }, { odoo: guardPort(fake), humanAvailable: true });
  return { d, fake };
}

for (const h of [...HELD_OUT, ...BLIND, ...BLIND2]) {
  test(`generalizacion ${h.id}: ${h.text}`, async () => {
    const { d, fake } = await run(h);
    assert.ok(new Set([...d.intents, d.primary_intent]).has(h.intent), `intent ${h.intent} vs [${d.intents}]`);
    assert.equal(d.escalate, h.esc);
    if (h.odoo !== undefined) assert.equal(fake.calls.length > 0, h.odoo);
    if (h.line) assert.equal(d.line, h.line);
    if (h.must) assert.match(norm(d.reply ?? ''), h.must);
    if (h.mustNot) assert.doesNotMatch(norm(d.reply ?? ''), h.mustNot);
    assert.deepEqual(lintReply(d.reply, { allowedAmounts: d.odoo.results.flatMap((r) => r.options.map((o) => o.total)).concat([15000, 20000, 10000]) }).filter((v) => !v.startsWith('MONTO')), []);
    assert.equal(d.outbound, null);
  });
}

test('seguridad: un mensaje que no se entiende NUNCA se trata como consulta de disponibilidad; pasa a un humano', async () => {
  for (const text of ['asdf qwerty', 'Me cobraron de más en mi reserva', '👍', 'ok', 'jajaja', 'el jueves en la tarde nos vemos en la plaza']) {
    const { d, fake } = await run({ id: 'x', text });
    assert.equal(fake.calls.length, 0, text);
    assert.ok(!/para qu[eé] fecha/i.test(d.reply ?? ''), `${text}: ${d.reply}`);
  }
  const { d } = await run({ id: 'x', text: 'asdf qwerty' });
  assert.equal(d.escalate, true);
  assert.equal(d.primary_intent, 'INTENCION_NO_ENTENDIDA');
});
