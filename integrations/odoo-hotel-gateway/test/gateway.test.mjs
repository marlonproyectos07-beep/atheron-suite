import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestGateway, TEST_IDENTITIES, withIdentity } from './helpers.mjs';

test('success envelope carries data and audits the call', async () => {
  const { gateway, auditLog } = buildTestGateway();

  const { status, envelope } = await gateway.handle({
    operation: 'availability',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 },
  });

  assert.equal(status, 200);
  assert.equal(envelope.ok, true);
  assert.ok(envelope.correlation_id);

  const entries = auditLog.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].actor, 'claude');
  assert.equal(entries[0].agent_id, TEST_IDENTITIES.claude.agentId);
  assert.equal(entries[0].result, 'success');
  assert.equal(typeof entries[0].latency_ms, 'number');
});

test('error envelope never leaks a stack trace and still gets audited', async () => {
  const { gateway, auditLog } = buildTestGateway();

  const { envelope, code } = await gateway.handle({
    operation: 'hold',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { quote_id: 'Q-1', idempotency_key: 'k-1', discount: 50 },
  });

  assert.equal(envelope.ok, false);
  assert.equal(code, 'FORBIDDEN_FIELD');
  assert.equal('stack' in envelope.error, false);

  const entries = auditLog.list();
  assert.equal(entries.at(-1).result, 'error');
  assert.equal(entries.at(-1).error_code, 'FORBIDDEN_FIELD');
});

test('unauthenticated calls are audited as actor unknown, never crash the gateway', async () => {
  const { gateway, auditLog } = buildTestGateway();

  const { envelope, code } = await gateway.handle({
    operation: 'availability',
    agentId: 'nobody',
    rawKey: 'wrong',
    body: { check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 },
  });

  assert.equal(code, 'UNAUTHORIZED');
  assert.equal(auditLog.list().at(-1).actor, 'unknown');
  assert.equal(envelope.correlation_id, null || envelope.correlation_id); // siempre presente, aunque sea generado
  assert.ok(envelope.correlation_id);
});

test('correlation_id provided by the client is echoed back unchanged', async () => {
  const { gateway } = buildTestGateway();
  const { envelope } = await gateway.handle({
    operation: 'status',
    ...withIdentity(TEST_IDENTITIES.claude),
    body: { operation_id: 'does-not-exist', correlation_id: 'mine-123' },
  });
  assert.equal(envelope.correlation_id, 'mine-123');
});
