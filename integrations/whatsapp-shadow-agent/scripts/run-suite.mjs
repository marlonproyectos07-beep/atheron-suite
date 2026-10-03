/**
 * Ejecuta TODOS los casos y deja evidencia reproducible:
 *   node scripts/run-suite.mjs            -> evidence/shadow-run.jsonl + evidence/summary.json
 * Casos: cases/ceo-extra.mjs (11 CEO + suplementarios) y, si existe,
 * cases/playbook-cases.json (los 100 TEST_CASES del Playbook, mismo formato JSON-serializable).
 */
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCase } from '../test/support.mjs';
import { CEO_CORE, CEO_SUPPLEMENT } from '../cases/ceo-extra.mjs';
import { JsonlEvidenceSink } from '../src/evidence.mjs';
import { loadPlaybookCases } from '../cases/playbook-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evPath = join(root, 'evidence', 'shadow-run.jsonl');
mkdirSync(join(root, 'evidence'), { recursive: true });
rmSync(evPath, { force: true });
const sink = new JsonlEvidenceSink(evPath);

const run = async (cases) => {
  const out = [];
  for (const c of cases) {
    const r = await runCase(c);
    for (const rec of r.records) sink.write({ ...rec, test_id: r.id, pass_fail: r.pass ? 'PASS' : 'FAIL' });
    out.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.title}${r.pass ? '' : `\n      - ${r.fails.join('\n      - ')}`}`);
  }
  return out;
};

const playbook = loadPlaybookCases();
const core = await run(CEO_CORE);
const sup = await run(CEO_SUPPLEMENT);
const pb = playbook.status === 'LOADED' ? await run(playbook.cases) : [];

const count = (a) => ({ total: a.length, pass: a.filter((x) => x.pass).length });
const summary = {
  generated_by: 'integrations/whatsapp-shadow-agent/scripts/run-suite.mjs',
  mode: 'shadow', gateway: 'FAKE (fixture contractual; no Odoo real)',
  playbook: { status: playbook.status, version: playbook.version ?? null, reason: playbook.reason ?? null, ...count(pb) },
  ceo_core: count(core),
  ceo_supplement: count(sup),
  all_pass: [...core, ...sup, ...pb].every((x) => x.pass) && playbook.status === 'LOADED',
  failing: [...core, ...sup, ...pb].filter((x) => !x.pass).map((x) => x.id),
};
writeFileSync(join(root, 'evidence', 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = [...core, ...sup, ...pb].every((x) => x.pass) ? 0 : 1;
