/**
 * Dual run: el MISMO caso ejecutado en RULES_ONLY y en HYBRID_SHADOW, con comparacion lado a lado.
 * Guarda: rules_intent, hybrid_intent, rules_action, hybrid_action, expected, risk.
 */
import { createSession, processMessage } from '../agent.mjs';
import { guardPort } from '../odoo-port.mjs';
import { processHybrid } from './pipeline.mjs';
import { evaluateCase } from './evaluate.mjs';

const toMessage = (t) => (typeof t === 'string' ? { type: 'text', text: t } : { type: 'audio', transcript: t.transcript, confidence: t.confidence });
const action = (d) => ({ escalate: d.escalate, reason: d.escalation?.reason ?? null, line: d.line, flags: d.flags.filter((f) => /^(PAYMENT|GUARDARRAIL|DEPOSIT|GROUP|STRATEGIC|LARGE|HYBRID|RULES_OVERRIDE)/.test(f)) });

/** @param makeOdoo () => fake de Odoo; @param provider proveedor de comprension (mock) o null para solo reglas */
export async function runCaseBothModes(c, { makeOdoo, provider, hybridOptions = {} }) {
  const run = async (mode) => {
    const fake = makeOdoo();
    const deps = { odoo: guardPort(fake), humanAvailable: true };
    const session = createSession({ id: `${c.id}-${mode}` });
    const decisions = [];
    for (let i = 0; i < c.turns.length; i += 1) {
      provider?.setTurn?.(c, i);
      const msg = toMessage(c.turns[i]);
      decisions.push(mode === 'rules' ? await processMessage(session, msg, deps) : await processHybrid(session, msg, deps, { provider, ...hybridOptions }));
    }
    const guestsQueried = Math.max(0, ...fake.calls.map((x) => x.req.guests ?? 0));
    return { decisions, evaluation: evaluateCase(c, decisions, { odooCalls: fake.calls.length, guestsQueried }), odoo_calls: fake.calls.length };
  };
  const rules = await run('rules');
  const hybrid = await run('hybrid');
  const lastR = rules.decisions.at(-1);
  const lastH = hybrid.decisions.at(-1);
  return {
    id: c.id,
    rules_intent: lastR.primary_intent,
    hybrid_intent: lastH.primary_intent,
    rules_action: action(lastR),
    hybrid_action: action(lastH),
    expected: { intent: c.intent ?? c.intentAny ?? null, esc: c.esc ?? (c.escAny ? true : null) },
    rules_pass: rules.evaluation.pass,
    hybrid_pass: hybrid.evaluation.pass,
    risk: { rules: rules.evaluation.high_risk, hybrid: hybrid.evaluation.high_risk },
    overrides: hybrid.decisions.flatMap((d) => d.hybrid?.overrides ?? []),
    fallbacks: hybrid.decisions.map((d) => d.hybrid?.fallback).filter(Boolean),
    escalation_floor_violation: rules.decisions.some((rd, i) => rd.escalate && !['INTENCION_NO_ENTENDIDA', 'CONFIANZA_INSUFICIENTE'].includes(rd.escalation?.reason) && !hybrid.decisions[i].escalate),
    hybrid_replies: hybrid.decisions.map((d) => d.reply),
    hybrid_meta: hybrid.decisions.map((d) => d.hybrid ?? null),
    hybrid_last_escalate: lastH.escalate,
  };
}
