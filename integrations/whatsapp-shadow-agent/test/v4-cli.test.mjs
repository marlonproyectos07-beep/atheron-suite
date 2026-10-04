/**
 * Flujo CLI de V4 (scripts/v4.mjs): SOLO comprueba las negativas, sin ningun caso ni corpus.
 * Los casos V4 reales llegan despues; aqui no se crean casos sinteticos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'v4.mjs');
const run = (dir, ...args) => spawnSync('node', [script, '--dir', dir, ...args], { encoding: 'utf8' });

test('v4.mjs sin corpus: freeze/rules/compare se niegan (4); import de un archivo inexistente (4); sin comando (64)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'v4-cli-'));
  try {
    for (const cmd of ['freeze', 'rules', 'compare']) assert.equal(run(dir, cmd).status, 4, cmd);
    assert.equal(run(dir, 'import', join(dir, 'no-existe.json')).status, 4);
    assert.equal(run(dir).status, 64);
    assert.equal(run(dir, 'provider').status, 64);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v4.mjs provider: TODOS los proveedores reales estan DISABLED (exit 5) y no hace falta corpus para negarse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'v4-cli-'));
  try {
    for (const p of ['openai', 'anthropic', 'gemini', 'local_ollama', 'other']) {
      const r = run(dir, 'provider', '--provider', p);
      assert.equal(r.status, 5, p);
      assert.match(r.stderr, /PROVIDER_DISABLED/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
