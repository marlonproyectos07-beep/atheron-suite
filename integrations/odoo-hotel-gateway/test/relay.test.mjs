import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestServer, TEST_IDENTITIES } from './helpers.mjs';
import { ClaudeHotelClient } from '../clients/claude-client.mjs';
import { GenericHotelClient } from '../clients/generic-client.mjs';

/**
 * Prueba de relevo multiagente (Fase 14 / criterio de aceptacion #18-19):
 * dos clientes distintos, mismo contrato, ningun cambio de codigo por
 * agente. El estado (quote/hold) vive en el gateway/adapter compartido, no
 * en el cliente: por eso el cliente B puede consultar y operar sobre algo
 * que creo el cliente A, igual que pasaria contra el Odoo real compartido.
 */
test('relay: A cotiza y B consulta/crea HOLD/estado sobre el mismo backend', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const clientA = new ClaudeHotelClient({ baseUrl, rawKey: TEST_IDENTITIES.claude.rawKey });
    const clientB = new GenericHotelClient({
      baseUrl,
      rawKey: TEST_IDENTITIES.chatgpt.rawKey,
      agentId: TEST_IDENTITIES.chatgpt.agentId,
    });

    // 1. A consulta disponibilidad
    const availability = await clientA.availability({
      check_in: '2026-12-01',
      check_out: '2026-12-03',
      guests: 2,
    });
    assert.equal(availability.ok, true);

    // 2. A genera cotizacion
    const quoteA = await clientA.quote({
      check_in: '2026-12-01',
      check_out: '2026-12-03',
      guests: 2,
      idempotency_key: 'relay-quote-a-1',
    });
    assert.equal(quoteA.ok, true);
    const quoteId = quoteA.data.quote_id;
    assert.ok(quoteId);

    // 3. B consulta el estado de la cotizacion creada por A
    const statusOfA = await clientB.status({ operation_id: quoteId });
    assert.equal(statusOfA.ok, true);
    assert.equal(statusOfA.data.quote_id, quoteId);
    assert.equal(statusOfA.data.status, 'QUOTED');

    // 4. B genera su propia cotizacion
    const quoteB = await clientB.quote({
      check_in: '2026-12-05',
      check_out: '2026-12-06',
      guests: 1,
      idempotency_key: 'relay-quote-b-1',
    });
    assert.equal(quoteB.ok, true);
    assert.notEqual(quoteB.data.quote_id, quoteId);

    // 5. Uno (A) crea el HOLD sobre la cotizacion de A
    const hold = await clientA.hold({ quote_id: quoteId, unit_id: 'unit-301', idempotency_key: 'relay-hold-1' });
    assert.equal(hold.ok, true);
    const holdId = hold.data.hold_id;
    assert.ok(holdId);

    // 6. El otro (B) consulta el estado del HOLD creado por A
    const statusOfHold = await clientB.status({ operation_id: holdId });
    assert.equal(statusOfHold.ok, true);
    assert.equal(statusOfHold.data.hold_id, holdId);
    assert.equal(statusOfHold.data.status, 'HELD');
  } finally {
    await close();
  }
});

test('relay: ningun cliente puede escalar privilegios sobre el otro', async () => {
  const { baseUrl, close } = await buildTestServer();
  try {
    const clientB = new GenericHotelClient({
      baseUrl,
      rawKey: TEST_IDENTITIES.chatgpt.rawKey,
      agentId: TEST_IDENTITIES.chatgpt.agentId,
    });

    const attempt = await clientB.hold({
      quote_id: 'Q-does-not-matter',
      idempotency_key: 'relay-escalation-1',
      admin: true,
    });

    assert.equal(attempt.ok, false);
    assert.equal(attempt.error.code, 'FORBIDDEN_FIELD');
  } finally {
    await close();
  }
});
