/**
 * Reporte DUAL SHADOW (formato futuro): reglas solas vs reglas + proveedor, para la misma conversacion.
 * El proveedor NUNCA controla el outbound: la decision final es la accion de reglas ya reforzada.
 */
const act = (a) => `${a.escalate ? 'ESCALATE_HUMAN' : 'NO_ESCALATION'}${a.reason ? `(${a.reason})` : ''}${a.line && a.line !== 'GUEST' ? ` line=${a.line}` : ''}`;

/** @param row fila de runCaseBothModes() */
export function buildShadowReport(row, { provider = 'X' } = {}) {
  const restored = row.overrides.some((o) => o.type === 'RESTORE_RULES_DECISION');
  const patched = row.overrides.filter((o) => o.type === 'PATCH').map((o) => o.why);
  const diffs = [];
  if (row.rules_intent !== row.hybrid_intent) diffs.push(`intent ${row.rules_intent} -> ${row.hybrid_intent}`);
  if (row.rules_action.escalate !== row.hybrid_action.escalate) diffs.push(`escalamiento ${row.rules_action.escalate} -> ${row.hybrid_action.escalate}`);
  if (row.rules_action.line !== row.hybrid_action.line) diffs.push(`linea ${row.rules_action.line} -> ${row.hybrid_action.line}`);
  const final = restored ? row.rules_action : row.hybrid_action;
  return {
    case_id: row.id,
    RULES_ONLY: { intent: row.rules_intent, action: row.rules_action },
    [`HYBRID_PROVIDER_${String(provider).toUpperCase()}`]: { intent: row.hybrid_intent, action: row.hybrid_action, fallbacks: row.fallbacks },
    EXPECTED: row.expected,
    DIFFERENCE: diffs.length ? diffs : ['NONE'],
    SAFETY_OVERRIDE: restored || patched.length ? { restored_rules_decision: restored, patches: patched, why: row.overrides.map((o) => o.why) } : 'NONE',
    FINAL_RULE_ACTION: final,
    PROVIDER_CONTROLS_OUTBOUND: false,
    OUTBOUND: null,
  };
}

/** Texto plano para revision humana. */
export function renderShadowReport(report) {
  const hybridKey = Object.keys(report).find((k) => k.startsWith('HYBRID_PROVIDER_'));
  return [
    `CASE: ${report.case_id}`,
    `RULES_ONLY: intent=${report.RULES_ONLY.intent} action=${act(report.RULES_ONLY.action)}`,
    `${hybridKey}: intent=${report[hybridKey].intent} action=${act(report[hybridKey].action)}${report[hybridKey].fallbacks.length ? ` fallbacks=${report[hybridKey].fallbacks.join(',')}` : ''}`,
    `EXPECTED: intent=${[].concat(report.EXPECTED.intent ?? 'n/a').join('|')} escalate=${report.EXPECTED.esc ?? 'n/a'}`,
    `DIFFERENCE: ${report.DIFFERENCE.join('; ')}`,
    `SAFETY_OVERRIDE: ${report.SAFETY_OVERRIDE === 'NONE' ? 'NONE' : report.SAFETY_OVERRIDE.why.join(', ')}`,
    `FINAL_RULE_ACTION: ${act(report.FINAL_RULE_ACTION)}`,
    'PROVIDER_CONTROLS_OUTBOUND: false',
  ].join('\n');
}
