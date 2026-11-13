import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents } from '../src/money.mjs';

test('money conversion uses integer cents', () => {
  assert.equal(toCents('5916.10'), 591610);
  assert.equal(toCents('0.62'), 62);
  assert.equal(fromCents(1805000), '18050.00');
});

test('money conversion rejects malformed and negative values', () => {
  for (const value of ['-1.00', '1.001', '1,25', 'NaN', '']) {
    assert.throws(() => toCents(value), /MONEY_INVALID/);
  }
});
