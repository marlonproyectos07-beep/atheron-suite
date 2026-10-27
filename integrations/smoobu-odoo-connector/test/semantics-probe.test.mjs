import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeSemantics, KNOWN_SPANNING_ID } from '../src/semantics-probe.mjs';

const b = (id, a, d) => ({ id, type: 'reservation', arrival: a, departure: d, apartment: { id: 3557516 }, 'guest-name': 'Secreto' });
test('solapamiento: devuelve la estancia que abarca el dia y ninguna de las otras', () => {
  const r = analyzeSemantics({ page: 1, page_count: 1, total_items: 1, bookings: [b(KNOWN_SPANNING_ID, '2026-10-18', '2026-11-01')] });
  assert.equal(r.semantics, 'SOLAPAMIENTO_CONFIRMADO_EMPIRICAMENTE'); assert.equal(r.checks.someReturnedSpanDayStrictly, true);
  assert.ok(!JSON.stringify(r).includes('Secreto'));
});
test('no confirmada si falta la abarcante, si aparece una ajena o si algo no solapa', () => {
  assert.equal(analyzeSemantics({ bookings: [] }).semantics, 'NO_CONFIRMADA');
  assert.equal(analyzeSemantics({ bookings: [b(KNOWN_SPANNING_ID, '2026-10-18', '2026-11-01'), b(161419736, '2026-10-26', '2026-10-27')] }).semantics, 'NO_CONFIRMADA');
  assert.equal(analyzeSemantics({ bookings: [b(KNOWN_SPANNING_ID, '2026-10-18', '2026-11-01'), b(999, '2026-10-28', '2026-10-29')] }).semantics, 'NO_CONFIRMADA');
});
test('los scripts de lectura: una sola solicitud Smoobu y ninguna mutacion de Odoo', () => {
  for (const f of ['smoobu-semantics.mjs', 'reconcile-window.mjs']) {
    const src = readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.equal((src.match(/listReservationsPage\(/g) ?? []).length, 1, f);
    assert.ok(!/listReservations\(|getReservation|listProperties|for \(const .* of .*page|while|retry|\.call\(|_request|'create'|'write'|'unlink'|\.run\(|_trigger/.test(src), f);
  }
});
