import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseIcal } from '../src/ical-parser.mjs';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function loadFixture(name) {
  return readFileSync(path.join(fixturesDir, name), 'utf8');
}

test('parsea un VEVENT de día completo de Booking', () => {
  const events = parseIcal(loadFixture('booking-room.ics'));
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.uid, 'bdc-9f21a7@booking.com');
  assert.equal(event.dtstart.isAllDay, true);
  assert.equal(event.dtstart.isoDate, '2026-10-10');
  assert.equal(event.dtend.isoDate, '2026-10-13');
  assert.equal(event.status, 'CONFIRMED');
});

test('parsea STATUS:CANCELLED', () => {
  const events = parseIcal(loadFixture('cancelled.ics'));
  assert.equal(events[0].status, 'CANCELLED');
});

test('rechaza un feed vacío', () => {
  assert.throws(() => parseIcal(''), (err) => err.code === 'ICAL_EMPTY');
});

test('rechaza VEVENT sin UID', () => {
  const broken = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261010',
    'DTEND;VALUE=DATE:20261013',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  assert.throws(() => parseIcal(broken), (err) => err.code === 'ICAL_MISSING_UID');
});

test('rechaza VEVENT sin DTSTART', () => {
  const broken = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:sin-fecha@example.com',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  assert.throws(() => parseIcal(broken), (err) => err.code === 'ICAL_MISSING_DTSTART');
});

test('desdobla (unfold) líneas largas con continuación', () => {
  const folded = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:linea-larga@example.com',
    'DTSTART;VALUE=DATE:20261010',
    'DTEND;VALUE=DATE:20261011',
    'SUMMARY:Esto es un resumen muy largo que en un feed real vendría',
    ' partido en varias líneas con un espacio inicial de continuación',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const [event] = parseIcal(folded);
  assert.match(event.summary, /partido en varias líneas/);
});

test('parsea DTSTART/DTEND con hora y Z (no solo DATE)', () => {
  const withTime = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:con-hora@example.com',
    'DTSTART:20261010T140000Z',
    'DTEND:20261013T110000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const [event] = parseIcal(withTime);
  assert.equal(event.dtstart.isAllDay, false);
  assert.equal(event.dtstart.isoDate, '2026-10-10T14:00:00Z');
});
