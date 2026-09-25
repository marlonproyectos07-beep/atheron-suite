import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportUnitCalendar } from '../src/exporter.mjs';
import { parseIcal } from '../src/ical-parser.mjs';

const fixedNow = new Date('2026-09-25T12:00:00.000Z');

test('exporta un VEVENT por bloqueo con los campos mínimos exigidos', () => {
  const ics = exportUnitCalendar('hotel-atheron-suite:201', [
    { externalEventId: 'booking:x:1', startDate: '2026-10-10', endDate: '2026-10-13', status: 'CONFIRMED', lastModifiedIso: '2026-09-01T09:00:00Z' },
  ], { now: fixedNow });

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /UID:booking:x:1/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261010/);
  assert.match(ics, /DTEND;VALUE=DATE:20261013/);
  assert.match(ics, /STATUS:CONFIRMED/);
  assert.match(ics, /LAST-MODIFIED:20260901T090000Z/);
  assert.match(ics, /END:VEVENT/);
  assert.match(ics, /END:VCALENDAR/);
});

test('el resultado exportado es parseable por nuestro propio parser (round-trip)', () => {
  const ics = exportUnitCalendar('hotel-atheron-suite:201', [
    { externalEventId: 'booking:x:1', startDate: '2026-10-10', endDate: '2026-10-13', status: 'CONFIRMED' },
  ], { now: fixedNow });

  const [event] = parseIcal(ics);
  assert.equal(event.uid, 'booking:x:1');
  assert.equal(event.dtstart.isoDate, '2026-10-10');
  assert.equal(event.dtend.isoDate, '2026-10-13');
});

test('nunca incluye datos privados del huésped aunque el llamador los pase por error', () => {
  assert.throws(
    () => exportUnitCalendar('hotel-atheron-suite:201', [
      { externalEventId: 'x', startDate: '2026-10-10', endDate: '2026-10-13', telefono: '+57 300 0000000' },
    ], { now: fixedNow }),
    (err) => err.code === 'EXPORT_FORBIDDEN_FIELD',
  );
});

test('rechaza bloqueos sin fechas', () => {
  assert.throws(
    () => exportUnitCalendar('hotel-atheron-suite:201', [{ externalEventId: 'x' }], { now: fixedNow }),
    (err) => err.code === 'EXPORT_INVALID_BLOCK',
  );
});

test('exporta un calendario vacío como VCALENDAR válido sin VEVENT', () => {
  const ics = exportUnitCalendar('hotel-atheron-suite:302', [], { now: fixedNow });
  assert.match(ics, /BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/);
  assert.ok(!ics.includes('BEGIN:VEVENT'));
});
