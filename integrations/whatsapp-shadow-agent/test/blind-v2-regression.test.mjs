/**
 * POST_FIX_REGRESSION de BLIND_GENERALIZATION_V2_50. NO es generalizacion ciega:
 * las correcciones se hicieron despues de ver los fallos de este mismo set. La
 * medida ciega es la primera pasada (AI/whatsapp/BLIND_V2_FIRST_PASS.md: 28/50).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FROZEN_SHA256 = '1caffa11b44d9acc5f8b15c9197ccce3a1f2cd652e4256c3f0a0daf0d72bdead';

test('BLIND_V2_50: el set congelado no se ha modificado (sha256)', () => {
  assert.equal(createHash('sha256').update(readFileSync(join(here, 'blind-v2-50.mjs'))).digest('hex'), FROZEN_SHA256);
});

test('POST_FIX_REGRESSION BLIND_V2_50: 50/50 y 0 HIGH_RISK_FAIL', () => {
  const out = execFileSync('node', [join(here, '..', 'scripts', 'run-blind-v2.mjs'), '--post-fix'], { encoding: 'utf8' });
  const s = JSON.parse(out.split('\n')[0]);
  assert.equal(s.POST_FIX_REGRESSION_TOTAL, 50);
  assert.equal(s.POST_FIX_REGRESSION_PASS, 50, out);
  assert.equal(s.HIGH_RISK_FAIL_COUNT, 0);
});
