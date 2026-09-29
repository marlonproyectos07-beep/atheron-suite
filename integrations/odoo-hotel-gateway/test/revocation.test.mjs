import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestServer, TEST_IDENTITIES } from './helpers.mjs';
import { ClaudeHotelClient } from '../clients/claude-client.mjs';

/**
 * Fase 15: revocar una identidad tecnica debe bastar (sin tocar codigo) para
 * que cualquier llamada posterior de ese agente devuelva UNAUTHORIZED.
 */
test('revoking an identity blocks all further calls without any code change', async () => {
  const { baseUrl, identityStore, close } = await buildTestServer();
  try {
    const client = new ClaudeHotelClient({ baseUrl, rawKey: TEST_IDENTITIES.claude.rawKey });

    const before = await client.availability({ check_in: '2026-12-01', check_out: '2026-12-02', guests: 1 });
    assert.equal(before.ok, true);

    const revoked = identityStore.revoke(TEST_IDENTITIES.claude.agentId);
    assert.equal(revoked, true);

    const after = await client.availability({ check_in: '2026-12-01', check_out: '2026-12-02', guests: 1 });
    assert.equal(after.ok, false);
    assert.equal(after.error.code, 'UNAUTHORIZED');

    // Tambien bloquea operaciones de escritura (hold), no solo lectura.
    const holdAttempt = await client.hold({ quote_id: 'Q-anything', idempotency_key: 'revoked-1' });
    assert.equal(holdAttempt.ok, false);
    assert.equal(holdAttempt.error.code, 'UNAUTHORIZED');
  } finally {
    await close();
  }
});
