import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportArgs, resolveImportFeed, runImport } from '../scripts/hotel017-import.mjs';
import { runRevalidate, summarizeRevalidation } from '../scripts/hotel017-revalidate.mjs';
import { classifyEvents, summarizeClassification, revalidateFeed, casaExclusionVerdict, assertIdempotentPlan, bindingsFromAuditRows, AMBIGUOUS_BINDING } from '../src/hotel017-ops.mjs';

const PROD_ENV = { ODOO_DATABASE: 'atheron1-production' };

// Feeds de fixture (todas las habitaciones cerradas). No se toca STAGING.
const FEEDS = [
  { id: 1, x_canonical_unit_id: 'AHS-302', x_source: 'booking', x_odoo_unit_id: 5 },
  { id: 3, x_canonical_unit_id: 'AHS-201', x_source: 'booking', x_odoo_unit_id: 1 },
  { id: 4, x_canonical_unit_id: 'AHS-202', x_source: 'booking', x_odoo_unit_id: 2 },
  { id: 5, x_canonical_unit_id: 'AHS-203', x_source: 'booking', x_odoo_unit_id: 3 },
  { id: 6, x_canonical_unit_id: 'AHS-301', x_source: 'booking', x_odoo_unit_id: 4 },
];

test('importador: dry-run por defecto; apply exige --confirm-staging; unidad o feed obligatorio', () => {
  assert.deepEqual(parseImportArgs(['--unit', '203']), { apply: false, replayCheck: false, unit: '203', feedId: null, channel: 'booking' });
  assert.throws(() => parseImportArgs(['--unit', '203', '--apply']), /APPLY_REQUIRES_CONFIRM_STAGING/);
  assert.equal(parseImportArgs(['--feed-id', '6', '--apply', '--confirm-staging', '--replay-check']).replayCheck, true);
  assert.throws(() => parseImportArgs([]), /UNIT_OR_FEED_REQUIRED/);
});

test('importador: resolucion de feed por id o canonico+canal; no unico o ambiguo falla', () => {
  assert.equal(resolveImportFeed(FEEDS, { feedId: 6 }).x_canonical_unit_id, 'AHS-301');
  assert.equal(resolveImportFeed(FEEDS, { canonical: 'AHS-203', channel: 'booking' }).id, 5);
  assert.throws(() => resolveImportFeed(FEEDS, { canonical: 'AHS-201', channel: 'airbnb' }), /FEED_NOT_UNIQUE/);
  assert.throws(() => resolveImportFeed([...FEEDS, { id: 9, x_canonical_unit_id: 'AHS-203', x_source: 'booking' }], { canonical: 'AHS-203', channel: 'booking' }), /FEED_NOT_UNIQUE/);
});

test('importador: rechaza Production antes de leer credenciales y no escribe sin bandera', async () => {
  await assert.rejects(runImport(['--unit', '203'], PROD_ENV));
  await assert.rejects(runImport(['--unit', '203', '--apply'], PROD_ENV), /APPLY_REQUIRES_CONFIRM_STAGING/);
  await assert.rejects(runImport(['--unit', '203', '--apply', '--confirm-staging'], PROD_ENV));
});

test('clasificacion: CREATE, DUPLICATE, CONFLICT y ADOPTION_CANDIDATE sobre fixtures', () => {
  const events = [
    { dtstart: '2026-10-01', dtend: '2026-10-05', key: 'k1' }, // sin slot -> CREATE
    { dtstart: '2026-10-12', dtend: '2026-10-13', key: 'k2' }, // slot vinculado al mismo key -> DUPLICATE
    { dtstart: '2026-10-17', dtend: '2026-10-18', key: 'k3' }, // dos slots -> CONFLICT
    { dtstart: '2026-10-19', dtend: '2026-10-22', key: 'k4' }, // un slot sin vinculo -> ADOPTION_CANDIDATE
    { dtstart: '2026-11-21', dtend: '2026-11-22', key: 'k5' }, // slot vinculado a otro -> CONFLICT
  ];
  const slots = [
    { id: 20, start_datetime: '2026-10-12 20:00:00', end_datetime: '2026-10-13 16:00:00' },
    { id: 30, start_datetime: '2026-10-17 20:00:00', end_datetime: '2026-10-18 16:00:00' },
    { id: 31, start_datetime: '2026-10-17 20:00:00', end_datetime: '2026-10-18 16:00:00' },
    { id: 40, start_datetime: '2026-10-19 20:00:00', end_datetime: '2026-10-22 16:00:00' },
    { id: 50, start_datetime: '2026-11-21 20:00:00', end_datetime: '2026-11-22 16:00:00' },
  ];
  const bindings = { k2: 20, k5: 99 };
  const rows = classifyEvents(events, slots, bindings);
  assert.deepEqual(rows.map((r) => r.verdict), ['CREATE', 'DUPLICATE', 'CONFLICT', 'ADOPTION_CANDIDATE', 'CONFLICT']);
  assert.deepEqual(summarizeClassification(rows), { CREATE: 1, DUPLICATE: 1, CONFLICT: 2, ADOPTION_CANDIDATE: 1 });
});

test('adopcion ambigua nunca se trata como duplicado automaticamente', () => {
  const rows = classifyEvents([{ dtstart: '2026-10-19', dtend: '2026-10-22', key: 'k' }],
    [{ id: 40, start_datetime: '2026-10-19 20:00:00', end_datetime: '2026-10-22 16:00:00' }], {});
  assert.equal(rows[0].verdict, 'ADOPTION_CANDIDATE');
});

test('exclusion de Casa: habitacion ocupada exige Casa bloqueada; Casa real exige habitacion bloqueada; sin evidencia = NOT_TESTABLE', () => {
  assert.equal(casaExclusionVerdict({ roomOverlap: 1, casaOverlap: 1, casaRealWithOrder: 0 }), 'PASS_ROOM_BLOCKS_CASA');
  assert.equal(casaExclusionVerdict({ roomOverlap: 1, casaOverlap: 0, casaRealWithOrder: 0 }), 'FAIL_ROOM_OCCUPIED_CASA_FREE');
  assert.equal(casaExclusionVerdict({ roomOverlap: 0, casaOverlap: 1, casaRealWithOrder: 1 }), 'FAIL_CASA_REAL_ROOM_FREE');
  assert.equal(casaExclusionVerdict({ roomOverlap: 1, casaOverlap: 1, casaRealWithOrder: 1 }), 'PASS_CASA_REAL_ROOM_BLOCKED');
  assert.equal(casaExclusionVerdict({ roomOverlap: 0, casaOverlap: 0, casaRealWithOrder: 0 }), 'NOT_TESTABLE_NO_OCCUPANCY_EVIDENCE');
});

test('revalidador no depende de la habitacion 302: mismo comportamiento con recursos de 201, 202, 203 y 301', () => {
  for (const [resource, casaRes] of [[28, 79], [29, 79], [30, 79], [31, 79], [32, 79]]) {
    const slots = [{ id: resource * 10, resource, start_datetime: '2026-10-12 20:00:00', end_datetime: '2026-10-13 16:00:00' }];
    const events = [{ dtstart: '2026-10-12', dtend: '2026-10-13', key: `k-${resource}` }];
    const [row] = revalidateFeed({ events, slots, casaSlots: [{ id: 1, start_datetime: '2026-10-12 20:00:00', end_datetime: '2026-10-13 16:00:00', hasOrder: false }], bindings: { [`k-${resource}`]: resource * 10 } });
    assert.equal(row.classification, 'DUPLICATE', `recurso ${resource}`);
    assert.equal(row.bindingOk, true);
    assert.equal(row.casaExclusion, 'PASS_ROOM_BLOCKS_CASA');
  }
});

test('revalidador: un slot vinculado a otro evento no pasa binding', () => {
  const [row] = revalidateFeed({
    events: [{ dtstart: '2026-10-12', dtend: '2026-10-13', key: 'k' }],
    slots: [{ id: 7, start_datetime: '2026-10-12 20:00:00', end_datetime: '2026-10-13 16:00:00' }],
    casaSlots: [], bindings: { k: 8 },
  });
  assert.equal(row.bindingOk, false);
  assert.equal(row.classification, 'CONFLICT');
});

test('revalidador: --apply se rechaza (solo lectura) y exige unidad o feed', async () => {
  await assert.rejects(runRevalidate(['--unit', '203', '--apply', '--confirm-staging'], {}), /REVALIDATE_IS_READ_ONLY/);
  await assert.rejects(runRevalidate([], {}), /UNIT_OR_FEED_REQUIRED/);
  await assert.rejects(runRevalidate(['--unit', '203'], PROD_ENV));
});

// Fixture comun: un evento con un unico slot que lo solapa.
const EV = { dtstart: '2026-10-05', dtend: '2026-10-06', key: 'K' };
const SLOT = [{ id: 101, start_datetime: '2026-10-05 20:00:00', end_datetime: '2026-10-06 16:00:00' }];
const verdictFor = (adoptRows, applyRows) => classifyEvents([EV], SLOT, bindingsFromAuditRows(adoptRows, applyRows))[0].verdict;

test('vinculos: solo ota_block_adopt -> DUPLICATE', () => {
  assert.equal(verdictFor([{ x_idempotency_key: 'K', x_request: JSON.stringify({ slot_id: 101 }) }], []), 'DUPLICATE');
});

test('vinculos: solo ota_block_apply (bloque importado) -> DUPLICATE y nunca ADOPTION_CANDIDATE', () => {
  const apply = [{ x_idempotency_key: 'K', x_response: JSON.stringify({ ok: true, data: { slot_id: 101 } }) }];
  assert.equal(verdictFor([], apply), 'DUPLICATE');
});

test('vinculos: ambas fuentes con el mismo slot -> DUPLICATE', () => {
  const adopt = [{ x_idempotency_key: 'K', x_request: JSON.stringify({ slot_id: 101 }) }];
  const apply = [{ x_idempotency_key: 'K', x_response: JSON.stringify({ data: { slot_id: 101 } }) }];
  assert.equal(verdictFor(adopt, apply), 'DUPLICATE');
});

test('vinculos: evento sin binding en ninguna fuente -> ADOPTION_CANDIDATE (sin adopcion automatica)', () => {
  assert.equal(verdictFor([], []), 'ADOPTION_CANDIDATE');
  assert.equal(verdictFor([{ x_idempotency_key: 'OTRA', x_request: JSON.stringify({ slot_id: 101 }) }], []), 'ADOPTION_CANDIDATE');
});

test('vinculos: binding ambiguo (apply y adopt apuntan a slots distintos) -> CONFLICT', () => {
  const adopt = [{ x_idempotency_key: 'K', x_request: JSON.stringify({ slot_id: 202 }) }];
  const apply = [{ x_idempotency_key: 'K', x_response: JSON.stringify({ data: { slot_id: 101 } }) }];
  assert.equal(bindingsFromAuditRows(adopt, apply).K, AMBIGUOUS_BINDING);
  assert.equal(verdictFor(adopt, apply), 'CONFLICT');
});

test('vinculos: slot vinculado que ya no existe -> CONFLICT, nunca CREATE', () => {
  const apply = [{ x_idempotency_key: 'K', x_response: JSON.stringify({ data: { slot_id: 999 } }) }];
  assert.equal(classifyEvents([EV], SLOT, bindingsFromAuditRows([], apply))[0].verdict, 'CONFLICT');
});

test('vinculos: filas no legibles o sin slot se ignoran, no inventan vinculo', () => {
  const bad = [{ x_idempotency_key: 'K', x_request: '{no-json' }, { x_idempotency_key: 'K', x_response: JSON.stringify({ data: {} }) }];
  assert.deepEqual(bindingsFromAuditRows(bad, bad), {});
  assert.equal(verdictFor(bad, bad), 'ADOPTION_CANDIDATE');
});

test('apply solo escribe si todo es DUPLICATE: cualquier CREATE, CONFLICT o candidato bloquea', () => {
  assert.equal(assertIdempotentPlan([{ verdict: 'DUPLICATE' }, { verdict: 'DUPLICATE' }]), true);
  for (const bad of ['CREATE', 'CONFLICT', 'ADOPTION_CANDIDATE']) {
    assert.throws(() => assertIdempotentPlan([{ verdict: 'DUPLICATE' }, { verdict: bad }]), /APPLY_BLOCKED_NOT_IDEMPOTENT/);
  }
});

test('salida del revalidador sin URLs, UIDs ni PII', () => {
  const summary = summarizeRevalidation([{ window: '2026-10-12/2026-10-13', classification: 'DUPLICATE', bindingOk: true, casaExclusion: 'PASS_ROOM_BLOCKS_CASA' }]);
  const text = JSON.stringify(summary);
  assert.doesNotMatch(text, /https?:\/\/|@|uid/i);
  assert.equal(summary.binding_ok, 1);
});
