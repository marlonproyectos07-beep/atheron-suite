#!/usr/bin/env node
/**
 * Comparador RULES_ONLY vs HYBRID_MOCK sobre los sets congelados V2-50 y V3-100.
 * OJO: los mocks NO son un LLM. Esto valida ARQUITECTURA y SEGURIDAD, no mide mejora real de un LLM.
 * Uso: node scripts/compare-rules-vs-hybrid.mjs [salida.json]
 */
import { writeFileSync } from 'node:fs';
import { makeFakeOdoo } from '../test/fake-odoo.mjs';
import { BLIND_V2 } from '../test/blind-v2-50.mjs';
import { BLIND_V3 } from '../test/blind-v3-100.mjs';
import { OracleMock, adversarialMock, benignMock, chaosMock } from '../test/hybrid-mocks.mjs';
import { runCaseBothModes } from '../src/hybrid/dual-run.mjs';

const sets = { 'V2-50': BLIND_V2, 'V3-100': BLIND_V3 };
const providers = { oracle: () => new OracleMock(), adversarial: adversarialMock, benign: benignMock, chaos: chaosMock };
const out = {};
for (const [pname, mk] of Object.entries(providers)) {
  out[pname] = {};
  for (const [sname, cases] of Object.entries(sets)) {
    const provider = mk();
    const rows = [];
    for (const c of cases) rows.push(await runCaseBothModes(c, { makeOdoo: () => makeFakeOdoo(), provider, hybridOptions: { timeoutMs: 20 } }));
    const n = rows.length;
    out[pname][sname] = {
      total: n,
      rules_pass: rows.filter((r) => r.rules_pass).length,
      hybrid_pass: rows.filter((r) => r.hybrid_pass).length,
      rules_high_risk: rows.filter((r) => r.risk.rules).length,
      hybrid_high_risk: rows.filter((r) => r.risk.hybrid).length,
      escalation_floor_violations: rows.filter((r) => r.escalation_floor_violation).length,
      fallbacks: rows.reduce((a, r) => a + r.fallbacks.length, 0),
      overrides: rows.reduce((a, r) => a + r.overrides.length, 0),
      rows,
    };
  }
}
const summary = Object.fromEntries(Object.entries(out).map(([p, s]) => [p, Object.fromEntries(Object.entries(s).map(([k, v]) => { const { rows, ...rest } = v; return [k, rest]; }))]));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ note: 'MOCKS: valida arquitectura y safety, NO mide un LLM real', summary, detail: out }, null, 2));
console.log(JSON.stringify(summary, null, 1));
