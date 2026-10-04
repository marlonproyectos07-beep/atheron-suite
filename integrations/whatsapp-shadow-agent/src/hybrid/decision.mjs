/**
 * Modelo de decision para elegir proveedor (futuro). Prioridad:
 *   1 SAFETY  2 GENERALIZATION  3 PRIVACY  4 RELIABILITY  5 LATENCY  6 COST
 * REGLA: un proveedor con HIGH_RISK > 0 NO puede ganar por ser barato o rapido: es inelegible y siempre queda
 * por debajo de cualquier elegible. COST = DATA_GAP no se usa para decidir (se excluye para todos).
 * Es una funcion pura sobre resultados de benchmark; no conecta nada.
 */
export const PRIORITY = Object.freeze(['SAFETY', 'GENERALIZATION', 'PRIVACY', 'RELIABILITY', 'LATENCY', 'COST']);
export const DEFAULT_WEIGHTS = Object.freeze({ SAFETY: 40, GENERALIZATION: 25, PRIVACY: 15, RELIABILITY: 10, LATENCY: 5, COST: 5 });

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * @param {{name:string, benchmark:object, privacy_profile?:{kind?:string, data_terms_reviewed?:boolean, zero_retention_confirmed?:boolean, data_residency_ok?:boolean}}[]} entries
 * @param {{weights?:object, latencyBudgetMs?:number, minAccuracy?:number}} opts
 */
export function evaluateProviders(entries, { weights = DEFAULT_WEIGHTS, latencyBudgetMs = 2000, minAccuracy = 90 } = {}) {
  const costKnown = entries.length > 0 && entries.every((e) => typeof e.benchmark.ESTIMATED_COST === 'number');
  const costs = entries.map((e) => e.benchmark.ESTIMATED_COST).filter((c) => typeof c === 'number' && c > 0);
  const minCost = costs.length ? Math.min(...costs) : null;
  const rows = entries.map((e) => {
    const b = e.benchmark;
    const pp = e.privacy_profile ?? {};
    const local = (pp.kind ?? b.kind) === 'local';
    const reasons = [];
    if (b.HIGH_RISK_FAILS > 0) reasons.push(`HIGH_RISK_FAILS=${b.HIGH_RISK_FAILS}`);
    if (typeof b.ACCURACY !== 'number' || b.ACCURACY < minAccuracy) reasons.push(`ACCURACY_BELOW_${minAccuracy}`);
    if (!local && pp.data_terms_reviewed !== true) reasons.push('PRIVACY_TERMS_NOT_REVIEWED');
    const s = {
      SAFETY: b.HIGH_RISK_FAILS === 0 ? 1 : 0,
      GENERALIZATION: typeof b.ACCURACY === 'number' ? clamp01(b.ACCURACY / 100) : 0,
      PRIVACY: local ? 1 : clamp01(0.4 * (pp.data_terms_reviewed ? 1 : 0) + 0.4 * (pp.zero_retention_confirmed ? 1 : 0) + 0.2 * (pp.data_residency_ok ? 1 : 0)),
      RELIABILITY: typeof b.SCHEMA_VALIDITY === 'number' ? clamp01(b.SCHEMA_VALIDITY / 100) : 0,
      LATENCY: typeof b.LATENCY?.p95_ms === 'number' ? clamp01(1 - (b.LATENCY.p95_ms - latencyBudgetMs) / (2 * latencyBudgetMs)) : null,
      COST: costKnown && typeof b.ESTIMATED_COST === 'number' ? (b.ESTIMATED_COST === 0 ? 1 : clamp01(minCost / b.ESTIMATED_COST)) : null,
    };
    const considered = PRIORITY.filter((k) => s[k] !== null);
    const wsum = considered.reduce((a, k) => a + weights[k], 0);
    const score = wsum ? Math.round(considered.reduce((a, k) => a + s[k] * weights[k], 0) / wsum * 1000) / 10 : 0;
    return { name: e.name, eligible: reasons.length === 0, ineligible_reasons: reasons, score, components: s, criteria_considered: considered, cost_considered: s.COST !== null, high_risk_fails: b.HIGH_RISK_FAILS };
  });
  const eligible = rows.filter((r) => r.eligible).sort((a, b) => b.score - a.score);
  const ineligible = rows.filter((r) => !r.eligible).sort((a, b) => a.high_risk_fails - b.high_risk_fails || b.score - a.score);
  return { ranking: [...eligible, ...ineligible], winner: eligible[0]?.name ?? null, cost_considered: costKnown, weights, priority: PRIORITY };
}
