import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog } from '../src/audit-log.mjs';

test('records only the allowed fields', () => {
  const log = new AuditLog();
  const recorded = log.record({
    request_id: 'r-1',
    correlation_id: 'c-1',
    actor: 'claude',
    agent_id: 'claude-hotel-007',
    operation: 'quote',
    timestamp: '2026-09-25T00:00:00.000Z',
    source_channel: 'sofia',
    idempotency_key: 'idem-1',
    quote_id: 'Q-1',
    result: 'success',
    latency_ms: 12,
  });

  assert.deepEqual(Object.keys(recorded).sort(), [
    'actor',
    'agent_id',
    'correlation_id',
    'idempotency_key',
    'latency_ms',
    'operation',
    'quote_id',
    'request_id',
    'result',
    'source_channel',
    'timestamp',
  ].sort());
});

test('never persists secrets even if a caller passes them by mistake', () => {
  const log = new AuditLog();
  const recorded = log.record({
    request_id: 'r-1',
    operation: 'hold',
    result: 'error',
    password: 'should-never-appear',
    token: 'should-never-appear',
    cookie: 'should-never-appear',
    prompt: 'entire prompt should never appear',
  });

  for (const field of ['password', 'token', 'cookie', 'prompt']) {
    assert.equal(field in recorded, false);
  }
});

test('list() returns an independent snapshot', () => {
  const log = new AuditLog();
  log.record({ request_id: 'r-1', operation: 'status', result: 'success' });
  const snapshot = log.list();
  snapshot.push({ request_id: 'fake' });
  assert.equal(log.list().length, 1);
});
