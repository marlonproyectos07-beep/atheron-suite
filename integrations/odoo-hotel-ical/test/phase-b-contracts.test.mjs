import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalEvent, canonicalFromIcal } from '../src/canonical-event.mjs';
import { BookingAdapter, AirbnbAdapter, OdooAdapter, IcalAdapter } from '../src/adapter-contracts.mjs';
import { reconcileInventories, RECONCILIATION } from '../src/reconciliation.mjs';
import { classifySyncOutcome } from '../src/conflict-engine.mjs';
import { estimateMaxOverbookingWindow } from '../src/risk-window.mjs';
import { sanitizeIcalBatch } from '../src/continuous-sync-runner.mjs';

const now = '2027-01-01T00:00:00Z';
const event = (uid, unit = 'AHS-201') => createCanonicalEvent({
  SOURCE: 'BOOKING', PROPERTY: 'FIXTURE-PROPERTY', UNIT: unit, EXTERNAL_REF: uid,
  START: '2027-01-10', END: '2027-01-12', STATUS: 'BLOCKED', EVENT_TYPE: 'CALENDAR_BLOCK',
  BOOKED_AT: null, UPDATED_AT: null, RECEIVED_AT: now,
});
const scope = { source: 'BOOKING', unit: 'AHS-201' };
const snapshot = (events, extra = {}) => ({ ...scope, events, complete: true, captured_at: now,
  blocked_windows: [], ...extra });

test('modelo canónico conserva los 12 campos y no inventa BOOKED_AT', () => {
  const first = event('UID-1');
  const replay = event('UID-1');
  assert.deepEqual(Object.keys(first), ['SOURCE', 'PROPERTY', 'UNIT', 'EXTERNAL_REF', 'START', 'END',
    'STATUS', 'EVENT_TYPE', 'BOOKED_AT', 'UPDATED_AT', 'RECEIVED_AT', 'IDEMPOTENCY_KEY']);
  assert.equal(first.BOOKED_AT, null);
  assert.equal(first.IDEMPOTENCY_KEY, replay.IDEMPOTENCY_KEY);
  assert.throws(() => createCanonicalEvent({ ...first, START: '2027-02-30' }), /INVALID_STAY_WINDOW/);
});

test('VEVENT Booking se convierte en CALENDAR_BLOCK sin afirmar reserva comercial', () => {
  const input = { uid: 'UID-BOOK-201', dtstart: '2027-01-10', dtend: '2027-01-12' };
  const mapping = { 'AHS-201': { odoo_unit_id: 1, external_listing_id: 'FIXTURE-LISTING' } };
  const normalized = canonicalFromIcal(input, { source: 'booking', canonical_unit_id: 'AHS-201',
    mapping, received_at: now });
  assert.equal(normalized.EVENT_TYPE, 'CALENDAR_BLOCK');
  assert.equal(normalized.BOOKED_AT, null);
  assert.equal(normalized.PROPERTY, 'FIXTURE-LISTING');
});

test('journal tecnico descarta SUMMARY y DESCRIPTION del feed', () => {
  const mapping = { 'AHS-201': { odoo_unit_id: 1, external_listing_id: 'FIXTURE-LISTING' } };
  const ical = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:UID-SAFE',
    'DTSTART;VALUE=DATE:20270110', 'DTEND;VALUE=DATE:20270112',
    'SUMMARY:Nombre privado', 'DESCRIPTION:Telefono privado', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const batch = sanitizeIcalBatch(ical, { source: 'booking', unit: 'AHS-201', mapping }, now);
  assert.ok(!batch.ical.includes('Nombre privado'));
  assert.ok(!batch.ical.includes('Telefono privado'));
  assert.equal(batch.events[0].EXTERNAL_REF, 'UID-SAFE');
});

test('adapters no presumen capacidades de Booking, Airbnb, Odoo ni iCal', async () => {
  for (const Type of [BookingAdapter, AirbnbAdapter, OdooAdapter, IcalAdapter]) {
    const adapter = new Type();
    for (const method of ['fetchAvailability', 'fetchReservations', 'block', 'release', 'health', 'reconcile']) {
      await assert.rejects(adapter[method]({}), (error) => error.code === 'UNSUPPORTED_OPERATION');
    }
  }
});

test('reconciliación pura distingue MATCH, MISSING_IN_ODOO y MISSING_IN_OTA', () => {
  const matched = event('UID-MATCH');
  const missing = createCanonicalEvent({ ...event('UID-MISSING'), START: '2027-03-01', END: '2027-03-02' });
  const blocks = [
    { source: 'booking', canonical_unit_id: 'AHS-201', idempotency_key: matched.IDEMPOTENCY_KEY,
      check_in: matched.START, check_out: matched.END, status: 'blocked' },
    { source: 'booking', canonical_unit_id: 'AHS-201', idempotency_key: 'old-key',
      check_in: '2027-02-01', check_out: '2027-02-02', status: 'blocked' },
  ];
  const input = { odooBlocks: blocks, scopes: [scope], snapshots: [snapshot([matched, missing])], now };
  const one = reconcileInventories(input);
  const two = reconcileInventories(input);
  assert.deepEqual(one, two);
  assert.deepEqual(one.map((row) => row.status), [RECONCILIATION.MATCH,
    RECONCILIATION.MISSING_IN_ODOO, RECONCILIATION.MISSING_IN_OTA]);
});

test('reconciliación detecta conflicto CASA, snapshot viejo y cobertura desconocida', () => {
  const wanted = event('UID-CONFLICT');
  const casa = { source: 'airbnb', canonical_unit_id: 'AHS-CASA', idempotency_key: 'casa-key',
    check_in: wanted.START, check_out: wanted.END, status: 'blocked' };
  const conflict = reconcileInventories({ odooBlocks: [casa], scopes: [scope],
    snapshots: [snapshot([wanted])], now });
  assert.equal(conflict[0].status, RECONCILIATION.CONFLICT);
  const stale = reconcileInventories({ odooBlocks: [], scopes: [scope],
    snapshots: [snapshot([], { captured_at: '2026-12-31T00:00:00Z' })], now });
  assert.equal(stale[0].status, RECONCILIATION.STALE);
  const unknown = reconcileInventories({ odooBlocks: [], scopes: [scope], snapshots: [], now });
  assert.equal(unknown[0].status, RECONCILIATION.UNKNOWN);
});

test('reconciliación de salida exige bloqueo visible en OTA o devuelve UNKNOWN', () => {
  const desired = [{ ...scope, start: '2027-01-10', end: '2027-01-12' }];
  const args = { odooBlocks: [], scopes: [scope], expectedOutbound: desired, now };
  assert.equal(reconcileInventories({ ...args, snapshots: [snapshot([])] })[0].status,
    RECONCILIATION.MISSING_IN_OTA);
  assert.equal(reconcileInventories({ ...args, snapshots: [snapshot([], {
    blocked_windows: [{ start: '2027-01-10', end: '2027-01-12' }],
  })] })[0].status, RECONCILIATION.MATCH);
  assert.equal(reconcileInventories({ ...args, snapshots: [snapshot([], { blocked_windows: null })] })[0].status,
    RECONCILIATION.UNKNOWN);
});

test('motor de conflicto separa legacy, new, at-risk, duplicate, stale y release', () => {
  const cutoffAt = '2027-01-01T00:00:00Z';
  const old = { BOOKED_AT: '2026-12-30T00:00:00Z' };
  const recent = { BOOKED_AT: '2027-01-02T00:00:00Z' };
  assert.deepEqual(classifySyncOutcome({ status: 'CONFLICT', event: old,
    otherBookedAt: '2026-12-31T00:00:00Z', cutoffAt }),
    { code: 'LEGACY_OVERBOOKING', severity: 'P1' });
  assert.deepEqual(classifySyncOutcome({ status: 'CONFLICT', event: recent, cutoffAt }),
    { code: 'NEW_OVERBOOKING', severity: 'CRITICAL' });
  assert.deepEqual(classifySyncOutcome({ status: 'CONFLICT', event: old, cutoffAt }),
    { code: 'UNCLASSIFIED_CONFLICT', severity: 'CRITICAL' });
  assert.equal(classifySyncOutcome({ status: 'APPLIED', atRisk: true }).code, 'AT_RISK');
  for (const status of ['DUPLICATE', 'STALE_EVENT', 'CANCELLED', 'RELEASED']) {
    assert.equal(classifySyncOutcome({ status }).code, status);
  }
  assert.equal(classifySyncOutcome({ status: 'RELEASED_BY_DISAPPEARANCE' }).code, 'RELEASED');
});

test('ventana maxima solo se calcula cuando TODOS los retrasos tienen cota', () => {
  assert.deepEqual(estimateMaxOverbookingWindow({ sourcePublicationSeconds: 60,
    sourcePollingSeconds: 300, gatewayApplySeconds: 5,
    outboundPublicationSeconds: 30, destinationImportSeconds: 600, retrySeconds: 60 }),
    { status: 'BOUNDED_ASSUMPTION_ONLY', seconds: 1055 });
  assert.deepEqual(estimateMaxOverbookingWindow({ sourcePollingSeconds: 300 }),
    { status: 'UNKNOWN_OR_UNBOUNDED', seconds: null });
});
