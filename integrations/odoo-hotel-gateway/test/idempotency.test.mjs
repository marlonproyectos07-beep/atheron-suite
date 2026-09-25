import test from 'node:test';
import assert from 'node:assert/strict';
import { IdempotencyStore } from '../src/idempotency-store.mjs';
import { ContractError } from '../src/contract.mjs';

test('A: same request + same key -> same result (replay)', async () => {
  const store = new IdempotencyStore();
  let calls = 0;
  const executor = async () => {
    calls += 1;
    return { hold_id: 'H-1' };
  };

  const r1 = await store.run('key-1', { quote_id: 'Q-1' }, executor);
  const r2 = await store.run('key-1', { quote_id: 'Q-1' }, executor);

  assert.deepEqual(r1, r2);
  assert.equal(calls, 1);
});

test('B: same key + different payload -> IDEMPOTENCY_KEY_REUSED', async () => {
  const store = new IdempotencyStore();
  await store.run('key-2', { quote_id: 'Q-1' }, async () => ({ hold_id: 'H-1' }));

  await assert.rejects(
    () => store.run('key-2', { quote_id: 'Q-2' }, async () => ({ hold_id: 'H-2' })),
    (error) => error instanceof ContractError && error.code === 'IDEMPOTENCY_KEY_REUSED'
  );
});

test('C: 2 concurrent HOLDs, same key -> exactly one execution, one winner', async () => {
  const store = new IdempotencyStore();
  let executions = 0;
  const executor = async () => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { hold_id: `H-${executions}` };
  };

  const [r1, r2] = await Promise.all([
    store.run('key-3', { quote_id: 'Q-1' }, executor),
    store.run('key-3', { quote_id: 'Q-1' }, executor),
  ]);

  assert.equal(executions, 1);
  assert.deepEqual(r1, r2);
});

test('D: 3 concurrent HOLDs, same key -> exactly one execution, one winner', async () => {
  const store = new IdempotencyStore();
  let executions = 0;
  const executor = async () => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { hold_id: `H-${executions}` };
  };

  const results = await Promise.all([
    store.run('key-4', { quote_id: 'Q-1' }, executor),
    store.run('key-4', { quote_id: 'Q-1' }, executor),
    store.run('key-4', { quote_id: 'Q-1' }, executor),
  ]);

  assert.equal(executions, 1);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test('a failed executor does not permanently burn the key (retry allowed)', async () => {
  const store = new IdempotencyStore();
  let attempt = 0;
  const executor = async () => {
    attempt += 1;
    if (attempt === 1) throw new ContractError('INTERNAL_ERROR', 'boom');
    return { hold_id: 'H-ok' };
  };

  await assert.rejects(() => store.run('key-5', { quote_id: 'Q-1' }, executor));
  const result = await store.run('key-5', { quote_id: 'Q-1' }, executor);
  assert.deepEqual(result, { hold_id: 'H-ok' });
});
