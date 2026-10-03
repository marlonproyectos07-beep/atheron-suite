/**
 * POST_FIX_REGRESSION de BLIND_V3_100. NO es generalizacion ciega: se corrigio despues de ver los fallos.
 * La medida ciega es la primera pasada (AI/whatsapp/BLIND_V3_FIRST_PASS.md: 71/100, 4 HIGH_RISK).
 * Es un mantenimiento de piso (ratchet): no puede bajar de 81 aciertos y el unico HIGH_RISK tolerado es A07,
 * falso positivo conocido del detector (la respuesta escalo y no prometio nada).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FROZEN_SHA256 = 'd13f26499b96925c13f733232d7a84eb7aca8b8c700ac5fe59cbb6d3e7c2a919';

test('BLIND_V3_100: el set congelado no se ha modificado (sha256)', () => {
  assert.equal(createHash('sha256').update(readFileSync(join(here, 'blind-v3-100.mjs'))).digest('hex'), FROZEN_SHA256);
});

test('POST_FIX_REGRESSION BLIND_V3_100: piso de 81/100 y sin HIGH_RISK real', () => {
  const tmp = join(here, '..', '..', '..', 'node_modules', '.cache-blind-v3.json');
  execFileSync('node', [join(here, '..', 'scripts', 'run-blind-v3.mjs'), '--post-fix', tmp]);
  const r = JSON.parse(readFileSync(tmp, 'utf8'));
  assert.ok(r.summary.POST_FIX_REGRESSION_PASS >= 81, JSON.stringify(r.summary));
  const risky = r.cases.filter((c) => c.high_risk).map((c) => c.id);
  assert.deepEqual(risky, ['A07']);
});
