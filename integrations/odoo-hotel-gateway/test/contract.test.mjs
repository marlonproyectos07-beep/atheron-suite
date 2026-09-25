import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContractError,
  contract,
  validateRequest,
  errorEnvelope,
  assertSafeUpstreamPayload,
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
    (error) => error instanceof ContractError && error.code === 'IDEMPOTENCY_KEY_REQUIRED'
  );
});

test('quote requires idempotency key', () => {
  assert.throws(
    () => validateRequest('quote', {
      check_in: '2026-11-16',
      check_out: '2026-11-17',
      guests: 2,
    }),
    (error) => error instanceof ContractError && error.code === 'IDEMPOTENCY_KEY_REQUIRED'
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

test('rejects admin/sudo escalation attempts', () => {
  for (const field of ['admin', 'sudo']) {
    assert.throws(
      () => validateRequest('status', { operation_id: 'OP-1', [field]: true }),
      (error) => error instanceof ContractError && error.code === 'FORBIDDEN_FIELD'
    );
  }
});

test('rejects confirm/cancel/planning/master-data injection', () => {
  for (const field of ['confirm', 'cancel', 'planning_write', 'master_data_write', 'rate_approval', 'extra_capacity_approval']) {
    assert.throws(
      () => validateRequest('status', { operation_id: 'OP-1', [field]: true }),
      (error) => error instanceof ContractError && error.code === 'FORBIDDEN_FIELD'
    );
  }
});

test('rejects mode and allow_preview overrides', () => {
  for (const field of ['mode', 'allow_preview']) {
    assert.throws(
      () => validateRequest('availability', {
        check_in: '2026-11-16',
        check_out: '2026-11-17',
        guests: 2,
        [field]: 'anything',
      }),
      (error) => error instanceof ContractError && error.code === 'FORBIDDEN_FIELD'
    );
  }
});

test('unsupported operations (confirm/cancel) are never in the whitelist', () => {
  assert.throws(
    () => validateRequest('confirm', { operation_id: 'OP-1' }),
    (error) => error instanceof ContractError && error.code === 'OPERATION_NOT_ALLOWED'
  );
  assert.throws(
    () => validateRequest('cancel', { operation_id: 'OP-1' }),
    (error) => error instanceof ContractError && error.code === 'OPERATION_NOT_ALLOWED'
  );
});

test('assertSafeUpstreamPayload lets the gateway-forced source_channel=sofia through', () => {
  const validated = validateRequest('availability', {
    check_in: '2026-11-16',
    check_out: '2026-11-17',
    guests: 2,
  });
  assert.equal(validated.source_channel, 'sofia');
  assert.equal(assertSafeUpstreamPayload(validated), true);
});

test('assertSafeUpstreamPayload still blocks every other forbidden field from reaching Odoo', () => {
  for (const field of ['price', 'discount', 'tax', 'admin', 'sudo', 'confirm', 'cancel', 'master_data_write']) {
    assert.throws(
      () => assertSafeUpstreamPayload({ source_channel: 'sofia', [field]: true }),
      (error) => error instanceof ContractError && error.code === 'FORBIDDEN_FIELD'
    );
  }
});

test('assertSafeUpstreamPayload fails closed if source_channel was not forced to sofia', () => {
  assert.throws(
    () => assertSafeUpstreamPayload({ check_in: '2026-11-16' }), // sin source_channel
    (error) => error instanceof ContractError && error.code === 'INTERNAL_ERROR'
  );
  assert.throws(
    () => assertSafeUpstreamPayload({ source_channel: 'whatsapp' }), // valor distinto de sofia
    (error) => error instanceof ContractError && error.code === 'INTERNAL_ERROR'
  );
});

test('error envelope never returns stack trace', () => {
  const env = errorEnvelope(new ContractError('FORBIDDEN_FIELD', 'nope'));
  assert.equal(env.ok, false);
  assert.equal(env.error.code, 'FORBIDDEN_FIELD');
  assert.equal('stack' in env.error, false);
});
