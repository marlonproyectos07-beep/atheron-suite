import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContractError,
  contract,
  validateRequest,
  errorEnvelope,
} from '../src/contract.mjs';

test('only exposes the four approved operations', () => {
  assert.deepEqual(contract.operations, ['availability', 'quote', 'hold', 'status']);
});

test('forces source_channel=sofia for availability', () => {
  const result = validateRequest('availability', {
    check_in: '2026-11-16',
    check_out: '2026-11-17',
    guests: 20,
    correlation_id: 'corr-1',
  });
  assert.equal(result.source_channel, 'sofia');
  assert.equal(result.guests, 20);
});

test('rejects client-controlled channel', () => {
  assert.throws(
    () => validateRequest('availability', {
      check_in: '2026-11-16',
      check_out: '2026-11-17',
      guests: 2,
      channel: 'admin',
    }),
    (error) => error instanceof ContractError && error.code === 'FORBIDDEN_FIELD'
  );
});

test('rejects price injection', () => {
  assert.throws(
    () => validateRequest('hold', {
      quote_id: 'Q-1',
      idempotency_key: 'idem-1',
      price: 1,
    }),
    (error) => error instanceof ContractError && error.code === 'FORBIDDEN_FIELD'
  );
});

test('hold requires idempotency key', () => {
  assert.throws(
    () => validateRequest('hold', { quote_id: 'Q-1' }),
    (error) => error instanceof ContractError && error.code === 'INVALID_REQUEST'
  );
});

test('quote requires idempotency key', () => {
  assert.throws(
    () => validateRequest('quote', {
      check_in: '2026-11-16',
      check_out: '2026-11-17',
      guests: 2,
    }),
    (error) => error instanceof ContractError && error.code === 'INVALID_REQUEST'
  );
});

test('rejects unknown fields', () => {
  assert.throws(
    () => validateRequest('status', {
      operation_id: 'OP-1',
      extra: true,
    }),
    (error) => error instanceof ContractError && error.code === 'UNKNOWN_FIELD'
  );
});

test('error envelope never returns stack trace', () => {
  const env = errorEnvelope(new ContractError('FORBIDDEN_FIELD', 'nope'));
  assert.equal(env.ok, false);
  assert.equal(env.error.code, 'FORBIDDEN_FIELD');
  assert.equal('stack' in env.error, false);
});
