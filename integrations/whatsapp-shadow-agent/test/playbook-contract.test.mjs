import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaybookCases } from '../cases/playbook-loader.mjs';
import { runCase } from './support.mjs';

const pb = loadPlaybookCases();

test('Playbook v0.1: contrato de 100 TEST_CASES presente', { skip: pb.status !== 'LOADED' && 'BLOQUEADO: falta cases/playbook-cases.json (Playbook no disponible en el repo)' }, async () => {
  assert.equal(pb.cases.length, 100);
  const failed = [];
  for (const c of pb.cases) { const r = await runCase(c); if (!r.pass) failed.push(`${r.id}: ${r.fails.join('; ')}`); }
  assert.deepEqual(failed, []);
});
