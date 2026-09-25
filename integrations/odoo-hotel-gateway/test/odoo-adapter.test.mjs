import test from 'node:test';
import assert from 'node:assert/strict';
import { OdooHotelAdapter } from '../src/odoo-adapter.mjs';
import { ContractError } from '../src/contract.mjs';

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
