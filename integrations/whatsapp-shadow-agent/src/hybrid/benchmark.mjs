/**
 * Contrato de benchmark de proveedores (sin conectar ninguno). Mide por proveedor:
 *   FIRST_PASS_ACCURACY, HIGH_RISK_FAILS, LATENCY, TOKENS, ESTIMATED_COST, SCHEMA_FAILURES, PRIVACY_MODE.
 * Los proveedores reales estan DISABLED: benchmarkProvider() los rechaza. Solo corre con mocks.
 * `pricing` lo aporta Control Maestro (USD por millon de tokens); aqui no se inventan precios.
 */
import { REAL_PROVIDERS, ProviderDisabledError, assertProvider } from './provider.mjs';
import { runCaseBothModes } from './dual-run.mjs';

const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)] : null);

export async function benchmarkProvider({ provider, cases, makeOdoo, pricing = null, privacyMode = 'redacted', hybridOptions = {} }) {
  assertProvider(provider);
  const name = provider.name ?? 'unknown';
  if (!provider.isMock && REAL_PROVIDERS[name]?.enabled !== true) throw new ProviderDisabledError(name);
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
  let schemaFailures = 0;
  for (const c of cases) {
    const r = await runCaseBothModes(c, { makeOdoo, provider: timed, hybridOptions });
    if (r.hybrid_pass) pass += 1;
    if (r.risk.hybrid) high += 1;
    schemaFailures += r.fallbacks.filter((f) => f === 'SCHEMA_INVALID' || f === 'MALFORMED_RESPONSE').length;
  }
  const cost = pricing ? (inTok / 1e6) * pricing.input_per_mtok + (outTok / 1e6) * pricing.output_per_mtok : null;
  return {
    provider: name,
    FIRST_PASS_ACCURACY: cases.length ? Math.round((pass / cases.length) * 1000) / 10 : null,
    HIGH_RISK_FAILS: high,
    LATENCY: { calls: latencies.length, mean_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null, p50_ms: pct(latencies, 50), p95_ms: pct(latencies, 95) },
    TOKENS: { input: inTok, output: outTok },
    ESTIMATED_COST_USD: cost,
    SCHEMA_FAILURES: schemaFailures,
    PRIVACY_MODE: privacyMode,
  };
}
