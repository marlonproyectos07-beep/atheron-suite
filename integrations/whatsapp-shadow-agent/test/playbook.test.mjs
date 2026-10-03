import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCase } from '../src/playbook-harness.mjs';
import { SPECS } from '../specs/playbook-specs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const md = readFileSync(join(root, 'AI', 'whatsapp', 'ATHERON_WHATSAPP_PLAYBOOK_v0.1.md'), 'utf8');
const data = JSON.parse(readFileSync(join(root, 'AI', 'whatsapp', 'playbook-cases.v0.1.json'), 'utf8'));

test('Playbook versionado: el JSON de casos corresponde EXACTAMENTE al archivo .md (sha256) y conserva T01..T100', () => {
  assert.equal(createHash('sha256').update(md).digest('hex'), data.sha256);
  assert.equal(data.count, 100);
  assert.deepEqual(data.cases.map((c) => c.id), Array.from({ length: 100 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`));
  assert.ok(data.cases.every((c) => c.input && c.expected_intent && c.esc), 'ningun caso con columnas vacias');
});

test('cada caso del Playbook tiene su spec ejecutable (ninguno omitido)', () => {
  for (const c of data.cases) assert.ok(SPECS[c.id], `falta spec de ${c.id}`);
  assert.equal(Object.keys(SPECS).length, 100);
});

for (const c of data.cases) {
  test(`${c.id} ${c.section.split(' ').slice(1).join(' ')}: ${c.input.slice(0, 50)}`, async () => {
    const r = await runCase(c, SPECS[c.id]);
    assert.deepEqual(r.failures, [], `${r.id}: ${r.failures.join(' | ')}\nreply: ${r.reply}`);
  });
}

test('toda desviacion respecto al Playbook trae razon escrita', async () => {
  for (const c of data.cases) {
    const r = await runCase(c, SPECS[c.id]);
    for (const d of r.deviations) assert.ok(d.reason && d.reason.length > 20, `${c.id} ${d.field} sin razon`);
  }
});
