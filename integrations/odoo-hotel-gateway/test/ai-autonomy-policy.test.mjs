import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTONOMY_POLICY, classify, isAutonomousAllowed } from '../src/ai-autonomy-policy.mjs';

test('acciones GREEN son autonomas', () => {
  assert.equal(classify('check_availability'), 'GREEN');
  assert.equal(isAutonomousAllowed('check_availability'), true);
});

test('acciones YELLOW no son autonomas por si solas (requieren el Gateway real para el paso sensible)', () => {
  assert.equal(classify('prepare_hold'), 'YELLOW');
  assert.equal(isAutonomousAllowed('prepare_hold'), false);
});

test('acciones RED siempre requieren humano', () => {
  for (const action of AUTONOMY_POLICY.RED) {
    assert.equal(classify(action), 'RED');
    assert.equal(isAutonomousAllowed(action), false);
  }
});

test('una accion no catalogada nunca se asume segura -- clasifica null, no autonoma', () => {
  assert.equal(classify('accion_inventada'), null);
  assert.equal(isAutonomousAllowed('accion_inventada'), false);
});

test('ninguna accion aparece en mas de un nivel', () => {
  const all = [...AUTONOMY_POLICY.GREEN, ...AUTONOMY_POLICY.YELLOW, ...AUTONOMY_POLICY.RED];
  assert.equal(new Set(all).size, all.length);
});
