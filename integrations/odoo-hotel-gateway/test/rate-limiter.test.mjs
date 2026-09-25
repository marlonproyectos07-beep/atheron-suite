import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../src/rate-limiter.mjs';
import { ContractError } from '../src/contract.mjs';

test('allows requests under the limit', () => {
  const limiter = new RateLimiter({ limit: 3, windowMs: 1000 });
  limiter.consume('agent-1');
  limiter.consume('agent-1');
  limiter.consume('agent-1');
});

test('blocks requests over the limit with RATE_LIMITED', () => {
  const limiter = new RateLimiter({ limit: 2, windowMs: 1000 });
  limiter.consume('agent-1');
  limiter.consume('agent-1');
  assert.throws(
    () => limiter.consume('agent-1'),
    (error) => error instanceof ContractError && error.code === 'RATE_LIMITED'
  );
});

test('does not break normal use of other identities', () => {
  const limiter = new RateLimiter({ limit: 1, windowMs: 1000 });
  limiter.consume('agent-1');
  limiter.consume('agent-2'); // identidad distinta, no comparte cupo
});

test('window resets after windowMs (using an injectable clock)', () => {
  let now = 0;
  const limiter = new RateLimiter({ limit: 1, windowMs: 1000, clock: () => now });
  limiter.consume('agent-1');
  assert.throws(() => limiter.consume('agent-1'));
  now += 1001;
  limiter.consume('agent-1'); // ya no deberia bloquear
});
