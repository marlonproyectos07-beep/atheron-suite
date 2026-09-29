import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestServer, TEST_IDENTITIES } from './helpers.mjs';

async function post(baseUrl, path, { agentId, rawKey, body }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(agentId ? { 'x-agent-id': agentId } : {}),
      ...(rawKey ? { authorization: `Bearer ${rawKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

test('GET /health never requires auth and never leaks secrets', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const response = await fetch(`${baseUrl}/health`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(json, { status: 'ok' });
  } finally {
    await close();
  }
});

test('GET /ready reports readiness', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true });
  } finally {
    await close();
  }
});

test('unknown route -> UNKNOWN_OP 404, fail closed', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const { status, json } = await post(baseUrl, '/hotel/confirm', {
      agentId: TEST_IDENTITIES.claude.agentId,
      rawKey: TEST_IDENTITIES.claude.rawKey,
      body: {},
    });
    assert.equal(status, 404);
    assert.equal(json.error.code, 'UNKNOWN_OP');
  } finally {
    await close();
  }
});

test('missing credentials -> 401 UNAUTHORIZED', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const { status, json } = await post(baseUrl, '/hotel/availability', {
      body: { check_in: '2026-11-16', check_out: '2026-11-17', guests: 2 },
    });
    assert.equal(status, 401);
    assert.equal(json.error.code, 'UNAUTHORIZED');
  } finally {
    await close();
  }
});

test('valid request returns a success envelope with correlation_id and never a stack trace', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const { status, json } = await post(baseUrl, '/hotel/availability', {
      agentId: TEST_IDENTITIES.claude.agentId,
      rawKey: TEST_IDENTITIES.claude.rawKey,
      body: { check_in: '2026-11-16', check_out: '2026-11-17', guests: 2, correlation_id: 'corr-xyz' },
    });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.correlation_id, 'corr-xyz');
    assert.equal('stack' in json, false);
  } finally {
    await close();
  }
});

test('forbidden field injection over HTTP -> 400 FORBIDDEN_FIELD, fail closed', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const { status, json } = await post(baseUrl, '/hotel/hold', {
      agentId: TEST_IDENTITIES.claude.agentId,
      rawKey: TEST_IDENTITIES.claude.rawKey,
      body: { quote_id: 'Q-1', idempotency_key: 'idem-1', price: 999 },
    });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'FORBIDDEN_FIELD');
    assert.equal('stack' in json.error, false);
  } finally {
    await close();
  }
});

test('rate limit is enforced per identity over HTTP', async () => {
  const { baseUrl, close } = await buildTestServer({ rateLimit: 1 });
  try {
    const first = await post(baseUrl, '/hotel/availability', {
      agentId: TEST_IDENTITIES.claude.agentId,
      rawKey: TEST_IDENTITIES.claude.rawKey,
      body: { check_in: '2026-11-16', check_out: '2026-11-17', guests: 2 },
    });
    assert.equal(first.status, 200);

    const second = await post(baseUrl, '/hotel/availability', {
      agentId: TEST_IDENTITIES.claude.agentId,
      rawKey: TEST_IDENTITIES.claude.rawKey,
      body: { check_in: '2026-11-16', check_out: '2026-11-17', guests: 2 },
    });
    assert.equal(second.status, 429);
    assert.equal(second.json.error.code, 'RATE_LIMITED');
  } finally {
    await close();
  }
});
