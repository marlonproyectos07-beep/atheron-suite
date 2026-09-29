import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIcal,
  normalizeEvent,
  IcalImportStore,
  reconcileImport,
  importWithRetry,
} from '../src/ical-import.mjs';

const FIXTURE_ICS_V1 = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:booking-evt-1@booking.com',
  'DTSTART;VALUE=DATE:20260810',
  'DTEND;VALUE=DATE:20260817',
  'SUMMARY:Reserved',
  'DESCRIPTION:Not available',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('parseIcal extrae UID, DTSTART, DTEND, SUMMARY, DESCRIPTION', () => {
  const events = parseIcal(FIXTURE_ICS_V1);
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, 'booking-evt-1@booking.com');
  assert.equal(events[0].dtstart, '2026-08-10');
  assert.equal(events[0].dtend, '2026-08-17');
  assert.equal(events[0].summary, 'Reserved');
});

test('normalizeEvent nunca trae precio/comision/payout/telefono/email: solo CALENDAR BLOCK', () => {
  const events = parseIcal(FIXTURE_ICS_V1);
  const block = normalizeEvent(events[0], { source: 'booking', unit: 'CASA_COMPLETA' });
  const keys = Object.keys(block);
  for (const forbidden of ['price', 'gross_sale', 'commission', 'payout', 'phone', 'email']) {
    assert.equal(keys.includes(forbidden), false, `no deberia traer ${forbidden}`);
  }
  assert.equal(block.uid, 'booking-evt-1@booking.com');
  assert.equal(block.source, 'booking');
  assert.equal(block.unit, 'CASA_COMPLETA');
});

test('normalizeEvent sin UID falla explicito (no se inventa)', () => {
  assert.throws(() => normalizeEvent({ dtstart: '2026-08-10', dtend: '2026-08-11' }, { source: 'booking', unit: '201' }), /EVENT_WITHOUT_UID/);
});

test('idempotencia: importar el mismo evento dos veces no duplica', () => {
  const store = new IcalImportStore();
  const events = parseIcal(FIXTURE_ICS_V1);
  const block = normalizeEvent(events[0], { source: 'booking', unit: 'CASA_COMPLETA' });
  const r1 = store.upsert(block);
  const r2 = store.upsert(block);
  assert.equal(r1, 'created');
  assert.equal(r2, 'unchanged');
  assert.equal(store.getActive('booking', 'CASA_COMPLETA').length, 1);
});

test('actualizacion de fechas: mismo UID, fechas distintas -> updated, no duplicado', () => {
  const store = new IcalImportStore();
  const events = parseIcal(FIXTURE_ICS_V1);
  const block = normalizeEvent(events[0], { source: 'booking', unit: 'CASA_COMPLETA' });
  store.upsert(block);

  const changed = { ...block, end: '2026-08-20' };
  const result = store.upsert(changed);
  assert.equal(result, 'updated');
  assert.equal(store.getActive('booking', 'CASA_COMPLETA').length, 1);
  assert.equal(store.getActive('booking', 'CASA_COMPLETA')[0].end, '2026-08-20');
});

test('cancelacion explicita (STATUS:CANCELLED) tombstona sin borrar el historial', () => {
  const store = new IcalImportStore();
  const events = parseIcal(FIXTURE_ICS_V1);
  const block = normalizeEvent(events[0], { source: 'booking', unit: 'CASA_COMPLETA' });
  store.upsert(block);

  const cancelled = { ...block, cancelled: true };
  const result = store.upsert(cancelled);
  assert.equal(result, 'tombstoned');
  assert.equal(store.getActive('booking', 'CASA_COMPLETA').length, 0);
  assert.equal(store.blocks.size, 1); // sigue en el store, solo marcado cancelado
});

test('reconcileImport: un evento que desaparece del feed se tombstona implicitamente', () => {
  const store = new IcalImportStore();
  const v1 = parseIcal(FIXTURE_ICS_V1);
  reconcileImport(store, 'booking', 'CASA_COMPLETA', v1);
  assert.equal(store.getActive('booking', 'CASA_COMPLETA').length, 1);

  reconcileImport(store, 'booking', 'CASA_COMPLETA', []); // feed nuevo, sin el evento
  assert.equal(store.getActive('booking', 'CASA_COMPLETA').length, 0);
});

test('importWithRetry: PASS con fetcher exitoso, registra last_sync', async () => {
  const store = new IcalImportStore();
  const fetcher = async () => FIXTURE_ICS_V1;
  const result = await importWithRetry(fetcher, { source: 'booking', unit: 'CASA_COMPLETA', store });
  assert.equal(result.status, 'PASS');
  assert.equal(result.imported, 1);
  assert.notEqual(store.getSyncState('booking', 'CASA_COMPLETA').lastSyncAt, null);
});

test('importWithRetry: reintenta y termina en FAIL con estado de error si el fetcher siempre falla', async () => {
  const store = new IcalImportStore();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    throw new Error('feed inaccesible');
  };
  const result = await importWithRetry(fetcher, { source: 'airbnb', unit: '301', store, maxRetries: 2 });
  assert.equal(result.status, 'FAIL');
  assert.equal(calls, 3); // 1 intento + 2 reintentos
  assert.match(store.getSyncState('airbnb', '301').error.message, /feed inaccesible/);
});

test('importWithRetry: se recupera si falla una vez y la siguiente funciona', async () => {
  const store = new IcalImportStore();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 1) throw new Error('timeout');
    return FIXTURE_ICS_V1;
  };
  const result = await importWithRetry(fetcher, { source: 'booking', unit: '201', store, maxRetries: 2 });
  assert.equal(result.status, 'PASS');
  assert.equal(calls, 2);
});
