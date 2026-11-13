import test from 'node:test';
import assert from 'node:assert/strict';
import { manifestDigest, validateManifest, EXPECTED_SCOPE } from '../src/manifest.mjs';

function fixture() {
  const categories = [
    ...Array(10).fill('GMF'),
    'BANK_FEE',
    ...Array(10).fill('INTEREST')
  ];
  const descriptions = {
    GMF: 'IMPTO GOBIERNO 4X1000',
    BANK_FEE: 'CUOTA MANEJO TRJ DEB',
    INTEREST: 'ABONO INTERESES AHORROS'
  };
  const directions = { GMF: 'debit', BANK_FEE: 'debit', INTEREST: 'credit' };
  const movements = categories.map((category, index) => ({
    id: EXPECTED_SCOPE.movementIds[index],
    date: '2026-11-' + String((index % 12) + 1).padStart(2, '0'),
    description: descriptions[category],
    category,
    direction: directions[category],
    amount_cents: 125 + index,
    source_page: (index % 9) + 1
  }));
  return {
    batch_id: EXPECTED_SCOPE.batchId,
    bank_account_code: EXPECTED_SCOPE.bankAccountCode,
    period_start: EXPECTED_SCOPE.periodStart,
    period_end: EXPECTED_SCOPE.periodEnd,
    movements
  };
}

test('manifest validates exact schema, counts and injected digest in unit fixture', () => {
  const manifest = fixture();
  const validated = validateManifest(manifest, { expectedDigest: manifestDigest(manifest.movements) });
  assert.equal(validated.movements.length, 21);
  assert.equal(validated.counts.GMF, 10);
  assert.equal(validated.counts.BANK_FEE, 1);
  assert.equal(validated.counts.INTEREST, 10);
});

test('production digest remains unconfigured until exact source manifest is reconstructed', () => {
  assert.equal(EXPECTED_SCOPE.sha256, null);
  assert.throws(() => validateManifest(fixture()), /MANIFEST_DIGEST_NOT_CONFIGURED/);
});

test('manifest rejects extra movement', () => {
  const manifest = fixture();
  manifest.movements.push({ ...manifest.movements[0], id: 'B1-NOV-999' });
  assert.throws(() => validateManifest(manifest, { expectedDigest: 'x' }), /SCOPE_MOVEMENT_COUNT_MISMATCH/);
});

test('manifest rejects a changed batch or bank account', () => {
  const manifest = fixture();
  manifest.batch_id = 'OTHER';
  assert.throws(() => validateManifest(manifest, { expectedDigest: manifestDigest(fixture().movements) }), /SCOPE_BATCH_MISMATCH/);
  const second = fixture();
  second.bank_account_code = '111002';
  assert.throws(() => validateManifest(second, { expectedDigest: manifestDigest(second.movements) }), /SCOPE_BANK_ACCOUNT_MISMATCH/);
});

test('manifest rejects altered row even if row count remains 21', () => {
  const manifest = fixture();
  manifest.movements[0].amount_cents += 1;
  assert.throws(() => validateManifest(manifest, { expectedDigest: '0'.repeat(64) }), /SCOPE_MANIFEST_DIGEST_MISMATCH/);
});

test('manifest rejects direction/category mismatch and out-of-period dates', () => {
  const manifest = fixture();
  manifest.movements[0].direction = 'credit';
  assert.throws(() => validateManifest(manifest, { expectedDigest: manifestDigest(manifest.movements) }), /MOVEMENT_CLASSIFICATION_INVALID/);
  const second = fixture();
  second.movements[0].date = '2026-10-31';
  assert.throws(() => validateManifest(second, { expectedDigest: manifestDigest(second.movements) }), /MOVEMENT_DATE_OUT_OF_SCOPE/);
});

test('manifest rejects a replacement ID even if count remains 21', () => {
  const manifest = fixture();
  manifest.movements[0].id = 'B1-NOV-999';
  assert.throws(() => validateManifest(manifest, { expectedDigest: manifestDigest(manifest.movements) }), /MOVEMENT_ID_INVALID|SCOPE_ID_SET_MISMATCH/);
});
