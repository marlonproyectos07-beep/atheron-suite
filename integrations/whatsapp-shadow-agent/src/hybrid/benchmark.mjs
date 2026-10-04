/**
 * Harness de benchmark de proveedores (sin conectar ninguno). Mide por proveedor:
 *   ACCURACY, HIGH_RISK_FAILS, SCHEMA_VALIDITY, LOW_CONFIDENCE_RATE, FALSE_ESCALATION, LATENCY,
 *   INPUT_TOKENS, OUTPUT_TOKENS, ESTIMATED_COST, PRIVACY_REJECTIONS.
 * Candidatos: OPENAI, ANTHROPIC, GEMINI, LOCAL_OLLAMA, OTHER -- todos DISABLED (ver provider-config.mjs).
 * Solo corre con mocks. ESTIMATED_COST = 'DATA_GAP' salvo que Control Maestro aporte una tarifa real con su fuente.
 */
import { REAL_PROVIDERS, ProviderDisabledError, assertProvider } from './provider.mjs';
import { pricingOrGap } from './provider-config.mjs';
import { assertLocalProviderContract } from './local-provider.mjs';
import { runCaseBothModes } from './dual-run.mjs';

const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)] : null);
const round1 = (x) => Math.round(x * 1000) / 10;

export async function benchmarkProvider({ provider, cases, makeOdoo, pricing = null, privacyMode = 'redacted', hybridOptions = {} }) {
  assertProvider(provider);
  const name = provider.name ?? 'unknown';
  if (!provider.isMock && REAL_PROVIDERS[String(name).toLowerCase()]?.enabled !== true) throw new ProviderDisabledError(name);
  if (provider.locality === 'local') assertLocalProviderContract(provider);

  const latencies = [];
  let inTok = 0;
  let outTok = 0;
  const timed = new Proxy(provider, {
    get(t, prop) {
      const v = t[prop];
      if (!['interpretMessage', 'interpretConversation'].includes(prop)) return typeof v === 'function' ? v.bind(t) : v;
      return async (...a) => {
        const s = Date.now();
        try { return await v.apply(t, a); } finally {
          latencies.push(Date.now() - s);
          const u = t.lastUsage?.();
          inTok += u?.input_tokens ?? 0;
          outTok += u?.output_tokens ?? 0;
        }
      };
    },
  });

  let pass = 0;
  let high = 0;
  let calls = 0;
  let schemaFailures = 0;
  let lowConf = 0;
  let privacyRejections = 0;
  let falseEsc = 0;
  let falseEscEligible = 0;
  for (const c of cases) {
    const r = await runCaseBothModes(c, { makeOdoo, provider: timed, hybridOptions });
    if (r.hybrid_pass) pass += 1;
    if (r.risk.hybrid) high += 1;
    for (const m of r.hybrid_meta) {
      if (!m) continue;
      if (m.provider_called) calls += 1;
      if (m.fallback === 'SCHEMA_INVALID' || m.fallback === 'MALFORMED_RESPONSE') schemaFailures += 1;
      if (m.fallback === 'LOW_CONFIDENCE') lowConf += 1;
      if (m.fallback === 'PRIVACY_BLOCKED') privacyRejections += 1;
    }
    if (c.esc === false) { falseEscEligible += 1; if (r.hybrid_last_escalate) falseEsc += 1; }
  }
  const price = pricingOrGap(pricing);
  const cost = price.status === 'DATA_GAP' ? 'DATA_GAP' : (inTok / 1e6) * price.input_per_mtok + (outTok / 1e6) * price.output_per_mtok;
  return {
    provider: name,
    kind: provider.locality === 'local' ? 'local' : 'external',
    cases: cases.length,
    provider_calls: calls,
    ACCURACY: cases.length ? round1(pass / cases.length) : null,
    HIGH_RISK_FAILS: high,
    SCHEMA_VALIDITY: calls ? round1((calls - schemaFailures) / calls) : null,
    LOW_CONFIDENCE_RATE: calls ? round1(lowConf / calls) : null,
    FALSE_ESCALATION: { count: falseEsc, eligible: falseEscEligible, rate: falseEscEligible ? round1(falseEsc / falseEscEligible) : null },
    LATENCY: { calls: latencies.length, mean_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null, p50_ms: pct(latencies, 50), p95_ms: pct(latencies, 95) },
    INPUT_TOKENS: inTok,
    OUTPUT_TOKENS: outTok,
    ESTIMATED_COST: cost,
    PRIVACY_REJECTIONS: privacyRejections,
    PRIVACY_MODE: privacyMode,
  };
}
