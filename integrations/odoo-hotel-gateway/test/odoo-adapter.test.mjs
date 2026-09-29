import test from 'node:test';
import assert from 'node:assert/strict';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { ContractError } from '../src/contract.mjs';
import { FakeOdooTransport } from './fakes/odoo-transport.fake.mjs';

test('dry-run availability never writes and is clearly marked as fixture', async () => {
  const adapter = new OdooHotelAdapter({ dryRun: true });
  const result = await adapter.availability({ check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 });
  assert.equal(result.dry_run, true);
  assert.match(result.note, /fixture/i);
});

test('happy path: quote -> hold -> status reflects HELD', async () => {
  const adapter = new OdooHotelAdapter({ dryRun: true });
  const quote = await adapter.quote({
    check_in: '2026-12-01',
    check_out: '2026-12-02',
    guests: 2,
    idempotency_key: 'k-1',
  });

  const hold = await adapter.hold({ quote_id: quote.quote_id, idempotency_key: 'k-2' });
  assert.equal(hold.status, 'HELD');
  assert.equal(hold.dry_run, true);

  const status = await adapter.status({ operation_id: hold.hold_id });
  assert.equal(status.status, 'HELD');
  assert.equal(status.quote_id, quote.quote_id);
});

test('hold without a prior quote -> NOT_QUOTED', async () => {
  const adapter = new OdooHotelAdapter({ dryRun: true });
  await assert.rejects(
    () => adapter.hold({ quote_id: 'does-not-exist', idempotency_key: 'k-1' }),
    (error) => error instanceof ContractError && error.code === 'NOT_QUOTED'
  );
});

test('hold against an expired quote -> QUOTE_EXPIRED', async () => {
  let now = 0;
  const adapter = new OdooHotelAdapter({ dryRun: true, clock: () => now });
  const quote = await adapter.quote({
    check_in: '2026-12-01',
    check_out: '2026-12-02',
    guests: 2,
    idempotency_key: 'k-1',
  });

  now += 31 * 60_000; // pasa el vencimiento de 30 minutos del fixture
  await assert.rejects(
    () => adapter.hold({ quote_id: quote.quote_id, idempotency_key: 'k-2' }),
    (error) => error instanceof ContractError && error.code === 'QUOTE_EXPIRED'
  );
});

test('status of an unknown operation_id -> NOT_FOUND', async () => {
  const adapter = new OdooHotelAdapter({ dryRun: true });
  await assert.rejects(
    () => adapter.status({ operation_id: 'nope' }),
    (error) => error instanceof ContractError && error.code === 'NOT_FOUND'
  );
});

test('LIVE mode without real Odoo config fails closed with INTERNAL_ERROR, never crashes silently', async () => {
  const adapter = new OdooHotelAdapter({ dryRun: false, config: {} });
  await assert.rejects(
    () => adapter.availability({ check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 }),
    (error) => error instanceof ContractError && error.code === 'INTERNAL_ERROR'
  );
});

/**
 * HOTEL-008A (AI/ATH-ODOO-HOTEL-008A_LIVE.md): "ODOO_ACTION_ID debe ser
 * explicito; no usar fallback". Con el resto de la config LIVE completa y un
 * transporte real inyectado, la unica pieza que falta es actionId: si el
 * adapter cayera de vuelta a 1967 en silencio, esta llamada llegaria al
 * transporte (executeKwCalls.length seria 1). Debe fallar ANTES de tocar el
 * transporte.
 */
test('LIVE mode without an explicit actionId fails closed, no silent fallback to 1967', async () => {
  const transport = new FakeOdooTransport();
  const adapter = new OdooHotelAdapter({
    dryRun: false,
    config: {
      database: 'test-db-not-real',
      technicalUser: 'test-user-not-real',
      technicalSecret: 'test-secret-not-real',
      // actionId deliberadamente ausente
    },
    transport,
  });

  await assert.rejects(
    () => adapter.availability({ check_in: '2026-12-01', check_out: '2026-12-02', guests: 2 }),
    (error) => error instanceof ContractError && error.code === 'INTERNAL_ERROR'
  );
  assert.equal(transport.executeKwCalls.length, 0, 'sin actionId explicito, el transporte nunca debe ser invocado');
});
