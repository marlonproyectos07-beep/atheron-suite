import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWindow, validateWindow, isIsoDate, stayNightsInWindow, LEGACY_WINDOW, MAX_WINDOW_NIGHTS } from '../src/window.mjs';

test('regresion: sin parametros se usa EXACTAMENTE la ventana y los rangos fijos de ATH-DEV-029/033', () => {
  const w = resolveWindow({});
  assert.equal(w.legacy, true);
  assert.deepEqual(w.smoobuQuery, { from: '2026-10-26', to: '2026-10-27' });
  assert.deepEqual(w.odooSlotRange, { start: '2026-10-17 00:00:00', end: '2026-11-02 00:00:00' });
  assert.deepEqual(w.availabilityRange, { from: '2026-10-25', to: '2026-10-28' });
  assert.deepEqual(resolveWindow({ RECONCILE_FROM: '  ', RECONCILE_TO: '' }).smoobuQuery, { from: LEGACY_WINDOW.from, to: LEGACY_WINDOW.to });
});

test('ventana operativa 28-oct-2026 .. 05-ene-2027: 70 noches, mismo intervalo en Smoobu y Odoo con margen de un dia', () => {
  const w = resolveWindow({ RECONCILE_FROM: '2026-10-28', RECONCILE_TO: '2027-01-05' });
  assert.equal(w.legacy, false); assert.equal(w.nights, 70);
  assert.deepEqual(w.smoobuQuery, { from: '2026-10-27', to: '2027-01-06' });
  assert.deepEqual(w.odooSlotRange, { start: '2026-10-27 00:00:00', end: '2027-01-07 00:00:00' });
  assert.deepEqual(w.orderRange, { checkinOnOrBefore: '2027-01-05', checkoutAfter: '2026-10-28' });
});

test('validacion de fechas: formato, fechas imposibles, orden, longitud, rango y ventana incompleta', () => {
  assert.equal(isIsoDate('2026-02-30'), false); assert.equal(isIsoDate('2026-10-31'), true); assert.equal(isIsoDate('31/10/2026'), false);
  const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
  assert.equal(code(() => validateWindow({ from: '2026-02-30', to: '2026-03-02' })), 'WINDOW_INVALID_DATE');
  assert.equal(code(() => validateWindow({ from: '2026-11-02', to: '2026-11-01' })), 'WINDOW_REVERSED');
  assert.equal(code(() => validateWindow({ from: '2026-01-01', to: '2026-12-31' })), 'WINDOW_TOO_LONG');
  assert.equal(code(() => validateWindow({ from: '2207-01-01', to: '2207-01-02' })), 'WINDOW_OUT_OF_RANGE');
  assert.equal(code(() => resolveWindow({ RECONCILE_FROM: '2026-10-28' })), 'WINDOW_INCOMPLETE');
  assert.equal(code(() => resolveWindow({ RECONCILE_FROM: '2026-10-28; rm -rf /', RECONCILE_TO: '2026-10-29' })), 'WINDOW_INVALID_DATE');
  assert.equal(validateWindow({ from: '2026-10-28', to: '2026-10-28' }).nights, 1);
  assert.ok(MAX_WINDOW_NIGHTS >= 70);
});

test('noches de una estancia recortadas a la ventana (la salida no es noche)', () => {
  const w = { from: '2026-10-31', to: '2026-11-01' };
  assert.deepEqual(stayNightsInWindow({ arrival: '2026-10-31', departure: '2026-11-01' }, w), ['2026-10-31']);
  assert.deepEqual(stayNightsInWindow({ arrival: '2026-10-18', departure: '2026-11-01' }, w), ['2026-10-31']);
  assert.deepEqual(stayNightsInWindow({ arrival: '2026-11-02', departure: '2026-11-03' }, w), []);
  assert.deepEqual(stayNightsInWindow({ arrival: '2026-10-30', departure: '2026-10-31' }, w), []);
  assert.deepEqual(stayNightsInWindow({ arrival: 'x', departure: '2026-11-01' }, w), []);
});
