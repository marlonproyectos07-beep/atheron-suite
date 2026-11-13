import { createHash } from 'node:crypto';

export const EXPECTED_SCOPE = Object.freeze({
  batchId: 'ATH-FIN-015-LOTE-A',
  bankAccountCode: '111007',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-12',
  movementCount: 21,
  movementIds: Object.freeze(['B1-NOV-001', 'B1-NOV-009', 'B1-NOV-010', 'B1-NOV-023', 'B1-NOV-027', 'B1-NOV-033', 'B1-NOV-037', 'B1-NOV-042', 'B1-NOV-046', 'B1-NOV-051', 'B1-NOV-054', 'B1-NOV-074', 'B1-NOV-076', 'B1-NOV-085', 'B1-NOV-090', 'B1-NOV-094', 'B1-NOV-104', 'B1-NOV-107', 'B1-NOV-108', 'B1-NOV-116', 'B1-NOV-117']),
  categoryCounts: Object.freeze({ GMF: 10, BANK_FEE: 1, INTEREST: 10 }),
  sha256: null
});

const CATEGORY_RULES = Object.freeze({
  GMF: { direction: 'debit', description: 'IMPTO GOBIERNO 4X1000' },
  BANK_FEE: { direction: 'debit', description: 'CUOTA MANEJO TRJ DEB' },
  INTEREST: { direction: 'credit', description: 'ABONO INTERESES AHORROS' }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^B1-NOV-\d{3}$/;
const REQUIRED_KEYS = ['amount_cents', 'category', 'date', 'description', 'direction', 'id', 'source_page'];

export function canonicalMovementRows(movements) {
  return [...movements]
    .map((m) => ({
      amount_cents: m.amount_cents,
      category: m.category,
      date: m.date,
      description: m.description,
      direction: m.direction,
      id: m.id,
      source_page: m.source_page
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function manifestDigest(movements) {
  const canonical = JSON.stringify(canonicalMovementRows(movements));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function validateManifest(input, { expectedDigest = EXPECTED_SCOPE.sha256 } = {}) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error('MANIFEST_DIGEST_NOT_CONFIGURED');
  }
  const manifest = typeof input === 'string' ? JSON.parse(input) : input;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('MANIFEST_INVALID');
  if (manifest.batch_id !== EXPECTED_SCOPE.batchId) throw new Error('SCOPE_BATCH_MISMATCH');
  if (manifest.bank_account_code !== EXPECTED_SCOPE.bankAccountCode) throw new Error('SCOPE_BANK_ACCOUNT_MISMATCH');
  if (manifest.period_start !== EXPECTED_SCOPE.periodStart || manifest.period_end !== EXPECTED_SCOPE.periodEnd) {
    throw new Error('SCOPE_DATE_WINDOW_MISMATCH');
  }
  if (!Array.isArray(manifest.movements) || manifest.movements.length !== EXPECTED_SCOPE.movementCount) {
    throw new Error('SCOPE_MOVEMENT_COUNT_MISMATCH');
  }

  const seen = new Set();
  const counts = { GMF: 0, BANK_FEE: 0, INTEREST: 0 };
  for (const movement of manifest.movements) {
    if (!movement || typeof movement !== 'object' || Array.isArray(movement)) throw new Error('MOVEMENT_INVALID');
    const keys = Object.keys(movement).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...REQUIRED_KEYS].sort())) throw new Error('MOVEMENT_FIELDS_INVALID');
    if (typeof movement.id !== 'string' || !ID_RE.test(movement.id) || seen.has(movement.id)) throw new Error('MOVEMENT_ID_INVALID');
    seen.add(movement.id);
    if (typeof movement.date !== 'string' || !DATE_RE.test(movement.date) ||
        movement.date < EXPECTED_SCOPE.periodStart || movement.date > EXPECTED_SCOPE.periodEnd) {
      throw new Error('MOVEMENT_DATE_OUT_OF_SCOPE');
    }
    const rule = CATEGORY_RULES[movement.category];
    if (!rule || movement.direction !== rule.direction || movement.description !== rule.description) {
      throw new Error('MOVEMENT_CLASSIFICATION_INVALID');
    }
    if (!Number.isSafeInteger(movement.amount_cents) || movement.amount_cents <= 0) throw new Error('MOVEMENT_AMOUNT_INVALID');
    if (!Number.isInteger(movement.source_page) || movement.source_page < 1 || movement.source_page > 9) {
      throw new Error('MOVEMENT_SOURCE_PAGE_INVALID');
    }
    counts[movement.category] += 1;
  }
  for (const [category, expected] of Object.entries(EXPECTED_SCOPE.categoryCounts)) {
    if (counts[category] !== expected) throw new Error('SCOPE_CATEGORY_COUNTS_MISMATCH');
  }
  const actualIds = [...seen].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify([...EXPECTED_SCOPE.movementIds].sort())) {
    throw new Error('SCOPE_ID_SET_MISMATCH');
  }
  const digest = manifestDigest(manifest.movements);
  if (digest !== expectedDigest) throw new Error('SCOPE_MANIFEST_DIGEST_MISMATCH');

  const totals = manifest.movements.reduce((acc, movement) => {
    acc[movement.category] += movement.amount_cents;
    acc.net += movement.direction === 'credit' ? movement.amount_cents : -movement.amount_cents;
    return acc;
  }, { GMF: 0, BANK_FEE: 0, INTEREST: 0, net: 0 });

  return Object.freeze({
    batch_id: manifest.batch_id,
    bank_account_code: manifest.bank_account_code,
    period_start: manifest.period_start,
    period_end: manifest.period_end,
    movements: Object.freeze([...manifest.movements]),
    counts: Object.freeze(counts),
    totals: Object.freeze(totals),
    digest
  });
}
