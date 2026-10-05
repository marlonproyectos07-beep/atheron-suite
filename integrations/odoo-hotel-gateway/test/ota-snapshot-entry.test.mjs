import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unwrapSnapshotRequest,
  latestSnapshotEntry,
  snapshotMatchesEvent,
} from '../src/ota-snapshot-entry.mjs';

const KEY = 'c709db3b8be7'.padEnd(64, '0');
const EVENT = { dtstart: '2026-10-01', dtend: '2026-10-05', uid: 'uid-302-1' };
const flat = (overrides = {}) => ({
  idempotency_key: KEY, source: 'booking', canonical_unit_id: 'AHS-302',
  external_uid: EVENT.uid, check_in: EVENT.dtstart, check_out: EVENT.dtend,
  state: 'CONFLICT', ...overrides,
});
const wrapped = (overrides = {}) => ({ entry: flat(overrides), correlation_id: 'corr-1' });
const row = (id, value) => ({ id, x_request: typeof value === 'string' ? value : JSON.stringify(value) });

test('fila plana: se lee tal cual', () => {
  const out = unwrapSnapshotRequest(JSON.stringify(flat()));
  assert.equal(out.shape, 'flat');
  assert.equal(out.entry.state, 'CONFLICT');
});

test('fila envuelta en {entry, correlation_id}: se desenvuelve', () => {
  const out = unwrapSnapshotRequest(JSON.stringify(wrapped()));
  assert.equal(out.shape, 'wrapped');
  assert.equal(out.entry.state, 'CONFLICT');
  assert.equal(out.entry.check_in, EVENT.dtstart);
});

test('respuesta vacia: null, cadena vacia, texto en blanco y objeto vacio', () => {
  for (const raw of [null, undefined, '', '   ', '{}']) {
    assert.equal(unwrapSnapshotRequest(raw).shape, 'empty', `raw=${JSON.stringify(raw)}`);
  }
});

test('JSON invalido o no objeto: fallo cerrado', () => {
  for (const raw of ['{no-json', '[1,2]', '"texto"', '42', 'null']) {
    assert.equal(unwrapSnapshotRequest(raw).shape, 'invalid', `raw=${raw}`);
  }
});

test('estructura inesperada: entry no objeto o sin idempotency_key', () => {
  assert.equal(unwrapSnapshotRequest(JSON.stringify({ entry: 'texto' })).shape, 'unexpected');
  assert.equal(unwrapSnapshotRequest(JSON.stringify({ entry: null })).shape, 'unexpected');
  assert.equal(unwrapSnapshotRequest(JSON.stringify({ state: 'CONFLICT' })).shape, 'unexpected');
  assert.equal(unwrapSnapshotRequest(JSON.stringify({ idempotency_key: '' })).shape, 'unexpected');
});

test('sin filas: SNAPSHOT_MISSING', () => {
  assert.equal(latestSnapshotEntry([]).code, 'SNAPSHOT_MISSING');
  assert.equal(latestSnapshotEntry(undefined).code, 'SNAPSHOT_MISSING');
});

test('multiples filas: gana la mas reciente (ultima por id asc)', () => {
  const rows = [row(1, flat({ state: 'PRE_APPLY' })), row(2, wrapped({ state: 'CONFLICT' }))];
  const latest = latestSnapshotEntry(rows);
  assert.equal(latest.shape, 'wrapped');
  assert.equal(latest.entry.state, 'CONFLICT');
  assert.equal(latest.count, 2);
});

test('la fila mas reciente con forma inesperada falla aunque una anterior sea valida', () => {
  const rows = [row(1, wrapped()), row(2, '{no-json')];
  assert.equal(latestSnapshotEntry(rows).code, 'SNAPSHOT_SHAPE_UNEXPECTED');
});

test('snapshot valido: CONFLICT con fechas y UID exactos', () => {
  assert.equal(snapshotMatchesEvent(flat(), EVENT), true);
  assert.equal(snapshotMatchesEvent(wrapped().entry, EVENT), true);
});

test('snapshot invalido: estado, fechas o UID distintos', () => {
  assert.equal(snapshotMatchesEvent(flat({ state: 'PRE_APPLY' }), EVENT), false);
  assert.equal(snapshotMatchesEvent(flat({ state: undefined }), EVENT), false);
  assert.equal(snapshotMatchesEvent(flat({ check_out: '2026-10-06' }), EVENT), false);
  assert.equal(snapshotMatchesEvent(flat({ external_uid: 'otro' }), EVENT), false);
  assert.equal(snapshotMatchesEvent(null, EVENT), false);
});

test('la revalidacion del caso real (fila envuelta CONFLICT) pasa; el parser viejo no', () => {
  const rows = [row(452, wrapped())];
  const latest = latestSnapshotEntry(rows);
  assert.equal(snapshotMatchesEvent(latest.entry, EVENT), true);
  // Parser anterior: leia la fila como plana y no encontraba state.
  const legacy = JSON.parse(rows.at(-1).x_request);
  assert.equal(snapshotMatchesEvent(legacy, EVENT), false);
});
