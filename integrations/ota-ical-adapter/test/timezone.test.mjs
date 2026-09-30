import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, rangesOverlap } from '../src/normalize.mjs';

test('un VEVENT de un solo día (DTSTART sin DTEND) se normaliza a un rango de una noche', () => {
  const event = normalizeEvent(
    { uid: 'una-noche@example.com', dtstart: { isAllDay: true, isoDate: '2026-12-24' }, dtend: null, status: 'CONFIRMED' },
    { source: 'airbnb', listingId: 'x' },
  );
  assert.equal(event.startDate, '2026-12-24');
  assert.equal(event.endDate, '2026-12-25');
});

test('respeta el cruce de fin de mes al sumar un día', () => {
  const event = normalizeEvent(
    { uid: 'fin-de-mes@example.com', dtstart: { isAllDay: true, isoDate: '2026-11-30' }, dtend: null, status: 'CONFIRMED' },
    { source: 'airbnb', listingId: 'x' },
  );
  assert.equal(event.endDate, '2026-12-01');
});

test('respeta el cruce de fin de año (bisiesto no aplica en 2027, control simple)', () => {
  const event = normalizeEvent(
    { uid: 'fin-de-anio@example.com', dtstart: { isAllDay: true, isoDate: '2026-12-31' }, dtend: null, status: 'CONFIRMED' },
    { source: 'airbnb', listingId: 'x' },
  );
  assert.equal(event.endDate, '2027-01-01');
});

test('rechaza un rango donde DTEND no es posterior a DTSTART', () => {
  assert.throws(
    () =>
      normalizeEvent(
        { uid: 'rango-invalido@example.com', dtstart: { isAllDay: true, isoDate: '2026-10-10' }, dtend: { isAllDay: true, isoDate: '2026-10-10' }, status: 'CONFIRMED' },
        { source: 'booking', listingId: 'x' },
      ),
    (err) => err.code === 'ICAL_INVALID_RANGE',
  );
});

test('rangesOverlap: rangos [start, end) adyacentes NO se solapan (checkout = checkin válido)', () => {
  // 10->13 y 13->15: la unidad se libera el 13 y se vuelve a ocupar el mismo día.
  assert.equal(rangesOverlap('2026-10-10', '2026-10-13', '2026-10-13', '2026-10-15'), false);
});

test('rangesOverlap: solapamiento de un solo día sí se detecta', () => {
  assert.equal(rangesOverlap('2026-10-10', '2026-10-13', '2026-10-12', '2026-10-16'), true);
});

test('rangesOverlap: un rango contenido dentro de otro se detecta', () => {
  assert.equal(rangesOverlap('2026-10-01', '2026-10-31', '2026-10-10', '2026-10-13'), true);
});
