#!/usr/bin/env node
/**
 * Ejecuta los 100 TEST_CASES del Playbook v0.1 (T01..T100) contra el agente
 * SHADOW y escribe un reporte reproducible en AI/whatsapp/PLAYBOOK_RESULTS.*
 *   node scripts/run-playbook.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAll } from '../src/playbook-harness.mjs';
import { SPECS } from '../specs/playbook-specs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const data = JSON.parse(readFileSync(join(root, 'AI', 'whatsapp', 'playbook-cases.v0.1.json'), 'utf8'));
const results = await runAll(data.cases, SPECS);

const pass = results.filter((r) => r.pass).length;
const deviations = results.flatMap((r) => r.deviations.map((d) => ({ id: r.id, ...d })));
const summary = { playbook_sha256: data.sha256, total: results.length, pass, fail: results.length - pass, deviations_from_playbook: deviations.length };

writeFileSync(join(root, 'AI', 'whatsapp', 'PLAYBOOK_RESULTS.json'), JSON.stringify({ summary, deviations, results }, null, 2) + '\n');
const md = [
  '# Resultados Playbook v0.1 — agente SHADOW',
  '',
  `Playbook sha256: \`${data.sha256}\``,
  `Casos: ${summary.total} · PASS: ${pass} · FAIL: ${summary.fail} · desviaciones documentadas respecto al Playbook: ${deviations.length}`,
  '',
  '## Desviaciones (spec distinta de lo que dice el Playbook, con razón)',
  '',
  ...(deviations.length ? deviations.map((d) => `- **${d.id}** · ${d.field}: Playbook «${d.playbook}» → aplicado «${d.applied}». ${d.reason}`) : ['_ninguna_']),
  '',
  '## Resultado por caso',
  '',
  '| ID | Resultado | Intención | Escaló | Odoo | Respuesta propuesta |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.pass ? 'PASS' : '**FAIL**'} | ${r.intent ?? '—'} | ${r.escalated ? 'sí' : 'no'} | ${r.odoo_called ? 'sí' : 'no'} | ${(r.reply ?? '(silencio)').replace(/\n/g, ' ⏎ ').replace(/\|/g, '/')} |`),
  '',
  ...(results.some((r) => !r.pass) ? ['## Fallos', '', ...results.filter((r) => !r.pass).map((r) => `- **${r.id}**: ${r.failures.join(' · ')}`)] : []),
].join('\n');
writeFileSync(join(root, 'AI', 'whatsapp', 'PLAYBOOK_RESULTS.md'), md + '\n');
console.log(JSON.stringify(summary));
if (summary.fail) {
  for (const r of results.filter((x) => !x.pass)) console.log(`FAIL ${r.id}: ${r.failures.join(' | ')}\n   reply: ${JSON.stringify(r.reply)}`);
  process.exit(1);
}
